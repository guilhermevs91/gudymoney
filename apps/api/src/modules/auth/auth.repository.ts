import type { User, Tenant, TenantMember, RefreshToken } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// User queries
// ---------------------------------------------------------------------------

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { email, deleted_at: null },
  });
}

export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { google_id: googleId, deleted_at: null },
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findFirst({
    where: { id, deleted_at: null },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  password_hash?: string;
  google_id?: string;
}): Promise<User> {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password_hash: data.password_hash ?? null,
      google_id: data.google_id ?? null,
    },
  });
}

export async function updateUserPassword(
  user_id: string,
  password_hash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: user_id },
    data: { password_hash },
  });
}

// ---------------------------------------------------------------------------
// Tenant queries
// ---------------------------------------------------------------------------

export async function createTenant(data: {
  name: string;
  slug: string;
  created_by: string;
}): Promise<Tenant> {
  return prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      created_by: data.created_by,
    },
  });
}

// ---------------------------------------------------------------------------
// TenantMember queries
// ---------------------------------------------------------------------------

export async function createTenantMember(data: {
  tenant_id: string;
  user_id: string;
  role: 'ADMIN' | 'MEMBER';
}): Promise<TenantMember> {
  return prisma.tenantMember.create({
    data: {
      tenant_id: data.tenant_id,
      user_id: data.user_id,
      role: data.role,
    },
  });
}

export async function getUserTenantMember(
  user_id: string,
): Promise<(TenantMember & { tenant: Tenant }) | null> {
  return prisma.tenantMember.findFirst({
    where: {
      user_id,
      deleted_at: null,
      tenant: { deleted_at: null },
    },
    include: { tenant: true },
  });
}

export async function getUserWithTenant(user_id: string): Promise<
  | (User & {
      tenant_members: (TenantMember & { tenant: Tenant })[];
    })
  | null
> {
  return prisma.user.findFirst({
    where: { id: user_id, deleted_at: null },
    include: {
      tenant_members: {
        where: { deleted_at: null, tenant: { deleted_at: null } },
        include: { tenant: true },
        take: 1,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// RefreshToken queries
// ---------------------------------------------------------------------------

export async function createRefreshToken(data: {
  user_id: string;
  token_hash: string;
  expires_at: Date;
}): Promise<RefreshToken> {
  return prisma.refreshToken.create({
    data: {
      user_id: data.user_id,
      token_hash: data.token_hash,
      expires_at: data.expires_at,
    },
  });
}

export async function findRefreshToken(
  token_hash: string,
): Promise<RefreshToken | null> {
  return prisma.refreshToken.findFirst({
    where: { token_hash, deleted_at: null },
  });
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await prisma.refreshToken.update({
    where: { id },
    data: { revoked_at: new Date() },
  });
}

export async function revokeAllUserRefreshTokens(user_id: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { user_id, revoked_at: null, deleted_at: null },
    data: { revoked_at: new Date() },
  });
}

// ---------------------------------------------------------------------------
// LGPD Consent
// ---------------------------------------------------------------------------

export async function recordLgpdConsent(data: {
  user_id: string;
  tenant_id?: string;
  purpose: string;
  policy_version: string;
  ip_address?: string;
}): Promise<void> {
  await prisma.lgpdConsent.create({
    data: {
      user_id: data.user_id,
      tenant_id: data.tenant_id ?? null,
      purpose: data.purpose,
      policy_version: data.policy_version,
      ip_address: data.ip_address ?? null,
    },
  });
}
