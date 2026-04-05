import crypto from 'crypto';
import type { Tenant, TenantMember } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { hashPassword, comparePassword } from '../../lib/bcrypt';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import { createAuditLog } from '../../lib/audit';
import { seedDefaultCategories } from '../../lib/seed';
import { verifyGoogleIdToken } from '../../lib/google';
import type { RegisterInput, LoginInput } from './auth.schemas';
import * as repo from './auth.repository';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public override message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Invalid credentials') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

// ---------------------------------------------------------------------------
// In-memory password reset token store (v1 — no email service)
// ---------------------------------------------------------------------------

interface PasswordResetEntry {
  userId: string;
  expiresAt: Date;
}

const passwordResetTokens = new Map<string, PasswordResetEntry>();

// Periodically sweep expired tokens so the map doesn't grow unbounded.
setInterval(
  () => {
    const now = new Date();
    for (const [token, entry] of passwordResetTokens.entries()) {
      if (entry.expiresAt <= now) {
        passwordResetTokens.delete(token);
      }
    }
  },
  5 * 60 * 1000, // every 5 minutes
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a raw token string to its SHA-256 hex hash. */
function sha256(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Generate a cryptographically random URL-safe hex string (used for password reset only). */
function generateRawHexToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Issue a signed refresh JWT and return it together with its SHA-256 hash.
 * The JWT embeds the userId so it can be verified without a DB lookup first.
 * The hash is what gets persisted (never store the raw token).
 */
function issueRefreshJwt(userId: string): { rawToken: string; tokenHash: string } {
  const rawToken = signRefreshToken({ userId });
  const tokenHash = sha256(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Derive a tenant slug from the user's name.
 * Converts to lowercase, replaces whitespace with hyphens, strips
 * non-alphanumeric characters (except hyphens), and appends 4 random hex
 * chars to ensure uniqueness.
 */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = crypto.randomBytes(2).toString('hex'); // 4 hex chars
  return `${base}-${suffix}`;
}

/** Build the standard auth response shape. */
function buildAuthResponse(
  user: { id: string; name: string; email: string },
  tenantMember: TenantMember & { tenant: Tenant },
  accessToken: string,
  refreshToken: string,
) {
  return {
    user: { id: user.id, name: user.name, email: user.email },
    tenant: {
      id: tenantMember.tenant.id,
      name: tenantMember.tenant.name,
      plan: tenantMember.tenant.plan,
    },
    member: { role: tenantMember.role },
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Register a new user, create their personal tenant, seed default categories,
 * record LGPD consent, and return auth tokens.
 */
export async function register(
  input: RegisterInput,
  ip?: string,
): Promise<ReturnType<typeof buildAuthResponse>> {
  // 1. Check for duplicate email
  const existing = await repo.findUserByEmail(input.email);
  if (existing !== null) {
    throw new ConflictError('Email already registered.');
  }

  // 2. Hash the password
  const password_hash = await hashPassword(input.password);

  // 3. Generate tenant slug
  const slug = slugify(input.name);
  const tenantName = `${input.name} Finanças`;

  // 4. Transactional creation
  const { user, tenant, tenantMember } = await prisma.$transaction(async (tx) => {
    // a. Create user
    const newUser = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        password_hash,
      },
    });

    // b. Create tenant
    const newTenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug,
        created_by: newUser.id,
      },
    });

    // c. Create tenant member (ADMIN)
    const newMember = await tx.tenantMember.create({
      data: {
        tenant_id: newTenant.id,
        user_id: newUser.id,
        role: 'ADMIN',
      },
    });

    // d. Seed 8 default categories
    // seedDefaultCategories expects a PrismaClient — the transaction client
    // satisfies the same model API surface.
    await seedDefaultCategories(
      tx as unknown as Parameters<typeof seedDefaultCategories>[0],
      newTenant.id,
      newUser.id,
    );

    // e. Record LGPD consent
    await tx.lgpdConsent.create({
      data: {
        user_id: newUser.id,
        tenant_id: newTenant.id,
        purpose: 'service_processing',
        policy_version: '1.0',
        ip_address: ip ?? null,
      },
    });

    // f. Audit log
    await tx.auditLog.create({
      data: {
        tenant_id: newTenant.id,
        user_id: newUser.id,
        entity_type: 'users',
        entity_id: newUser.id,
        action: 'CREATE',
        ip_address: ip ?? null,
      },
    });

    return { user: newUser, tenant: newTenant, tenantMember: newMember };
  });

  // 5. Generate tokens
  const accessToken = signAccessToken({
    userId: user.id,
    tenantId: tenant.id,
    role: tenantMember.role,
  });
  const { rawToken: rawRefresh, tokenHash: refreshTokenHash } = issueRefreshJwt(user.id);

  // 6. Persist refresh token hash
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await repo.createRefreshToken({
    user_id: user.id,
    token_hash: refreshTokenHash,
    expires_at: expiresAt,
  });

  // 7. Return response
  const tenantMemberWithTenant = { ...tenantMember, tenant };
  return buildAuthResponse(user, tenantMemberWithTenant, accessToken, rawRefresh);
}

/**
 * Authenticate a user with email + password and return new auth tokens.
 */
export async function login(
  input: LoginInput,
  ip?: string,
): Promise<ReturnType<typeof buildAuthResponse>> {
  // 1. Find user — use generic error to prevent user enumeration
  const user = await repo.findUserByEmail(input.email);
  if (user === null) {
    throw new UnauthorizedError('Invalid credentials.');
  }

  // 2. Compare password
  if (user.password_hash === null) {
    // Google-only account — no password set
    throw new UnauthorizedError('Invalid credentials.');
  }
  const valid = await comparePassword(input.password, user.password_hash);
  if (!valid) {
    throw new UnauthorizedError('Invalid credentials.');
  }

  // 3. Get tenant member + tenant
  const tenantMember = await repo.getUserTenantMember(user.id);
  if (tenantMember === null) {
    throw new ForbiddenError('No tenant associated with this account.');
  }

  // 4. Check tenant is not blocked
  if (tenantMember.tenant.blocked_at !== null) {
    throw new ForbiddenError('Tenant is blocked.');
  }

  // 5. Generate tokens
  const accessToken = signAccessToken({
    userId: user.id,
    tenantId: tenantMember.tenant.id,
    role: tenantMember.role,
  });
  const { rawToken: rawRefresh, tokenHash: refreshTokenHash } = issueRefreshJwt(user.id);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await repo.createRefreshToken({
    user_id: user.id,
    token_hash: refreshTokenHash,
    expires_at: expiresAt,
  });

  // 6. Audit log (best-effort — do not fail the login if audit write fails)
  await createAuditLog({
    prisma,
    tenantId: tenantMember.tenant.id,
    userId: user.id,
    entityType: 'users',
    entityId: user.id,
    action: 'LOGIN',
    ipAddress: ip ?? null,
  });

  // 7. Return response
  return buildAuthResponse(user, tenantMember, accessToken, rawRefresh);
}

/**
 * Rotate a refresh token pair.
 * Detects reuse attacks: if the presented token is already revoked,
 * all tokens for the user are revoked immediately.
 */
export async function refreshTokens(
  rawRefreshToken: string,
): Promise<{ access_token: string; refresh_token: string }> {
  // 1. Verify JWT signature
  let userId: string;
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    userId = payload.userId;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token.');
  }

  // 2. Find the token record by its hash
  const tokenHash = sha256(rawRefreshToken);
  const tokenRecord = await repo.findRefreshToken(tokenHash);

  if (tokenRecord === null) {
    // Token not found at all — possible reuse attack, revoke everything
    await repo.revokeAllUserRefreshTokens(userId);
    throw new UnauthorizedError('Refresh token not found. All sessions revoked.');
  }

  if (tokenRecord.revoked_at !== null) {
    // Already revoked — definitive reuse attack signal
    await repo.revokeAllUserRefreshTokens(userId);
    throw new UnauthorizedError('Refresh token already used. All sessions revoked.');
  }

  if (tokenRecord.expires_at <= new Date()) {
    // Expired but not revoked yet — clean up
    await repo.revokeRefreshToken(tokenRecord.id);
    throw new UnauthorizedError('Refresh token expired.');
  }

  // 3. Revoke the old token (rotation)
  await repo.revokeRefreshToken(tokenRecord.id);

  // 4. Get current tenant member for fresh claim data
  const tenantMember = await repo.getUserTenantMember(userId);
  if (tenantMember === null) {
    throw new ForbiddenError('No tenant associated with this account.');
  }

  if (tenantMember.tenant.blocked_at !== null) {
    throw new ForbiddenError('Tenant is blocked.');
  }

  // 5. Issue new token pair
  const newAccessToken = signAccessToken({
    userId,
    tenantId: tenantMember.tenant.id,
    role: tenantMember.role,
  });
  const { rawToken: newRawRefresh, tokenHash: newRefreshHash } = issueRefreshJwt(userId);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await repo.createRefreshToken({
    user_id: userId,
    token_hash: newRefreshHash,
    expires_at: expiresAt,
  });

  return { access_token: newAccessToken, refresh_token: newRawRefresh };
}

/**
 * Revoke a specific refresh token (logout from current session).
 */
export async function logout(
  userId: string,
  rawRefreshToken: string,
): Promise<void> {
  const tokenHash = sha256(rawRefreshToken);
  const tokenRecord = await repo.findRefreshToken(tokenHash);

  // Only revoke if the token belongs to the requesting user and is active
  if (
    tokenRecord !== null &&
    tokenRecord.user_id === userId &&
    tokenRecord.revoked_at === null
  ) {
    await repo.revokeRefreshToken(tokenRecord.id);
  }
}

/**
 * Request a password reset.
 * In v1 (no email service): stores the raw token in-memory and returns it
 * directly in the response. Always returns success to prevent user enumeration.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ token: string }> {
  const user = await repo.findUserByEmail(email);

  // Always return a token shape to avoid timing-based enumeration.
  // If user doesn't exist, return a dummy token that will never work.
  if (user === null) {
    return { token: generateRawHexToken() };
  }

  const rawToken = generateRawHexToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  passwordResetTokens.set(rawToken, { userId: user.id, expiresAt });

  return { token: rawToken };
}

/**
 * Authenticate (or register) a user via Google ID token.
 * Flow:
 *  1. Verify the token with Google.
 *  2. Look up user by google_id; if not found, try by email.
 *  3. If found by email (existing password account), link the google_id.
 *  4. If not found at all, create user + tenant + seed (like register).
 *  5. Return auth tokens.
 */
export async function googleAuth(
  idToken: string,
  ip?: string,
): Promise<ReturnType<typeof buildAuthResponse>> {
  // 1. Verify token
  let payload: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    payload = await verifyGoogleIdToken(idToken);
  } catch {
    throw new UnauthorizedError('Invalid Google ID token.');
  }

  const { sub: googleId, email, name } = payload;

  // 2. Find or create user
  let user = await repo.findUserByGoogleId(googleId);

  if (user === null) {
    // Try by email (may already have a password account)
    const existingByEmail = await repo.findUserByEmail(email);

    if (existingByEmail !== null) {
      // Link google_id to existing account
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { google_id: googleId },
      });
    } else {
      // Create new user + tenant via transaction
      const slug = slugify(name);
      const tenantName = `${name} Finanças`;

      const result = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { name, email, google_id: googleId },
        });

        const newTenant = await tx.tenant.create({
          data: { name: tenantName, slug, created_by: newUser.id },
        });

        const newMember = await tx.tenantMember.create({
          data: { tenant_id: newTenant.id, user_id: newUser.id, role: 'ADMIN' },
        });

        await seedDefaultCategories(
          tx as unknown as Parameters<typeof seedDefaultCategories>[0],
          newTenant.id,
          newUser.id,
        );

        await tx.lgpdConsent.create({
          data: {
            user_id: newUser.id,
            tenant_id: newTenant.id,
            purpose: 'service_processing',
            policy_version: '1.0',
            ip_address: ip ?? null,
          },
        });

        return { user: newUser, tenant: newTenant, tenantMember: newMember };
      });

      const accessToken = signAccessToken({
        userId: result.user.id,
        tenantId: result.tenant.id,
        role: result.tenantMember.role,
      });
      const { rawToken: rawRefresh, tokenHash: refreshTokenHash } = issueRefreshJwt(result.user.id);
      await repo.createRefreshToken({
        user_id: result.user.id,
        token_hash: refreshTokenHash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const tenantMemberWithTenant = { ...result.tenantMember, tenant: result.tenant };
      return buildAuthResponse(result.user, tenantMemberWithTenant, accessToken, rawRefresh);
    }
  }

  // 3. Existing user — issue tokens
  const tenantMember = await repo.getUserTenantMember(user.id);
  if (tenantMember === null) {
    throw new ForbiddenError('No tenant associated with this account.');
  }
  if (tenantMember.tenant.blocked_at !== null) {
    throw new ForbiddenError('Tenant is blocked.');
  }

  const accessToken = signAccessToken({
    userId: user.id,
    tenantId: tenantMember.tenant.id,
    role: tenantMember.role,
  });
  const { rawToken: rawRefresh, tokenHash: refreshTokenHash } = issueRefreshJwt(user.id);
  await repo.createRefreshToken({
    user_id: user.id,
    token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return buildAuthResponse(user, tenantMember, accessToken, rawRefresh);
}

/**
 * Validate a password reset token, update the password, and revoke all
 * existing refresh tokens for the user.
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  const entry = passwordResetTokens.get(token);

  if (entry === undefined || entry.expiresAt <= new Date()) {
    // Remove expired entry if present
    if (entry !== undefined) {
      passwordResetTokens.delete(token);
    }
    throw new UnauthorizedError('Invalid or expired password reset token.');
  }

  // Consume the token immediately (single-use)
  passwordResetTokens.delete(token);

  const newHash = await hashPassword(newPassword);
  await repo.updateUserPassword(entry.userId, newHash);

  // Revoke all active refresh tokens (force re-login everywhere)
  await repo.revokeAllUserRefreshTokens(entry.userId);
}

export async function updateProfile(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; email: string }> {
  const user = await repo.findUserById(userId);
  if (user === null) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, name: true, email: true },
  });
  return updated;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await repo.findUserById(userId);
  if (user === null) {
    throw new NotFoundError('Usuário não encontrado.');
  }
  if (user.password_hash === null) {
    throw new ForbiddenError('Usuário não possui senha configurada (login via Google).');
  }
  const isValid = await comparePassword(currentPassword, user.password_hash);
  if (!isValid) {
    throw new UnauthorizedError('Senha atual incorreta.');
  }
  const newHash = await hashPassword(newPassword);
  await repo.updateUserPassword(userId, newHash);
}
