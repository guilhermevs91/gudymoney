import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import * as service from './auth.service';
import type { RegisterInput, LoginInput } from './auth.schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the caller's IP address from Express request headers. */
function getIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim();
  }
  return req.socket.remoteAddress ?? undefined;
}

/**
 * Narrow an unknown thrown value to an AppError and respond, or pass through
 * to Express error handler.
 */
function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof service.AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

/**
 * POST /auth/register
 * Creates a new user + personal tenant and returns auth tokens.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as RegisterInput;
    const result = await service.register(input, getIp(req));
    res.status(201).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/login
 * Authenticates an existing user and returns auth tokens.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = req.body as LoginInput;
    const result = await service.login(input, getIp(req));
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/refresh
 * Rotates a refresh token pair.
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refresh_token } = req.body as { refresh_token: string };
    const result = await service.refreshTokens(refresh_token);
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/logout
 * Revokes the presented refresh token (requires authentication).
 */
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // req.user is guaranteed by authenticateUser middleware
    const userId = req.user!.userId;
    const { refresh_token } = req.body as { refresh_token?: string };

    if (typeof refresh_token === 'string' && refresh_token.length > 0) {
      await service.logout(userId, refresh_token);
    }

    res.status(204).send();
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * GET /auth/me
 * Returns the current authenticated user and their tenant context.
 */
export async function me(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Both req.user and req.tenant are guaranteed by middleware chain
    const { userId } = req.user!;
    const tenantCtx = req.tenant!;

    // Fetch user + tenant name + role in a single query
    const userWithTenant = await prisma.user.findFirst({
      where: { id: userId, deleted_at: null },
      select: {
        id: true,
        name: true,
        email: true,
        tenant_members: {
          where: {
            tenant_id: tenantCtx.id,
            deleted_at: null,
          },
          select: {
            role: true,
            tenant: {
              select: { id: true, name: true },
            },
          },
          take: 1,
        },
      },
    });

    if (userWithTenant === null) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }

    const memberRecord = userWithTenant.tenant_members[0];
    const role = memberRecord?.role ?? 'MEMBER';
    const tenantName = memberRecord?.tenant.name ?? '';

    res.status(200).json({
      data: {
        id: userWithTenant.id,
        name: userWithTenant.name,
        email: userWithTenant.email,
        tenant: {
          id: tenantCtx.id,
          name: tenantName,
          plan: tenantCtx.plan,
          budget_scope: tenantCtx.budget_scope,
        },
        role,
      },
    });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/google/verify
 * Authenticates (or registers) a user via a Google ID token obtained client-side.
 */
export async function googleAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_token } = req.body as { id_token: string };
    const result = await service.googleAuth(id_token, getIp(req));
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/password-reset/request
 * Initiates a password reset (v1: returns token directly in response).
 */
export async function requestPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    const result = await service.requestPasswordReset(email);
    // In v1 always respond 200 (no email service — token returned directly)
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/password-reset/confirm
 * Validates the reset token and updates the user's password.
 */
export async function confirmPasswordReset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token, password } = req.body as { token: string; password: string };
    await service.confirmPasswordReset(token, password);
    res.status(200).json({ data: { message: 'Password updated successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * PATCH /auth/me
 * Updates the authenticated user's display name.
 */
export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.user!;
    const { name } = req.body as { name: string };
    const user = await service.updateProfile(userId, name);
    res.status(200).json({ data: user });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /auth/change-password
 * Changes the authenticated user's password.
 */
export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req.user!;
    const { current_password, new_password } = req.body as {
      current_password: string;
      new_password: string;
    };
    await service.changePassword(userId, current_password, new_password);
    res.status(204).send();
  } catch (err) {
    handleError(err, res, next);
  }
}
