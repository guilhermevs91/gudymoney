import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

export interface AccessTokenPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

export interface SuperAdminTokenPayload {
  superadminId: string;
}

// ---------------------------------------------------------------------------
// Sign helpers
// ---------------------------------------------------------------------------

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '2h' });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign({ ...payload, jti: crypto.randomBytes(16).toString('hex') }, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function signSuperAdminToken(payload: SuperAdminTokenPayload): string {
  const secret = env.SUPERADMIN_JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}

// ---------------------------------------------------------------------------
// Verify helpers
// ---------------------------------------------------------------------------

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>)['userId'] !== 'string' ||
    typeof (decoded as Record<string, unknown>)['tenantId'] !== 'string' ||
    typeof (decoded as Record<string, unknown>)['role'] !== 'string'
  ) {
    throw new Error('Invalid access token payload');
  }
  const p = decoded as Record<string, unknown>;
  return {
    userId: p['userId'] as string,
    tenantId: p['tenantId'] as string,
    role: p['role'] as string,
  };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>)['userId'] !== 'string'
  ) {
    throw new Error('Invalid refresh token payload');
  }
  return { userId: (decoded as Record<string, unknown>)['userId'] as string };
}

export function verifySuperAdminToken(token: string): SuperAdminTokenPayload {
  const secret = env.SUPERADMIN_JWT_SECRET;
  const decoded = jwt.verify(token, secret);
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>)['superadminId'] !== 'string'
  ) {
    throw new Error('Invalid superadmin token payload');
  }
  return {
    superadminId: (decoded as Record<string, unknown>)[
      'superadminId'
    ] as string,
  };
}
