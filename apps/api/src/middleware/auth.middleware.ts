import type { Request, Response, NextFunction } from 'express';
import {
  verifyAccessToken,
  verifySuperAdminToken,
} from '../lib/jwt';

const UNAUTHORIZED = { error: 'Unauthorized', code: 'UNAUTHORIZED' } as const;

function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the Bearer JWT in the Authorization header and attaches the
 * decoded payload to `req.user`. Returns 401 if the token is missing or
 * invalid.
 */
export function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (token === null) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.role !== 'ADMIN' && payload.role !== 'MEMBER') {
      res.status(401).json(UNAUTHORIZED);
      return;
    }
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role as 'ADMIN' | 'MEMBER',
    };
    next();
  } catch {
    res.status(401).json(UNAUTHORIZED);
  }
}

/**
 * Verifies the SuperAdmin Bearer JWT in the Authorization header and attaches
 * the decoded payload to `req.superadmin`. Returns 401 if the token is
 * missing or invalid.
 */
export function authenticateSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (token === null) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }

  try {
    const payload = verifySuperAdminToken(token);
    req.superadmin = { superadminId: payload.superadminId };
    next();
  } catch {
    res.status(401).json(UNAUTHORIZED);
  }
}

/**
 * Like `authenticateUser` but does not fail when no token is provided.
 * Useful for public routes that behave differently when authenticated.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const token = extractBearerToken(req);
  if (token === null) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.role === 'ADMIN' || payload.role === 'MEMBER') {
      req.user = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role as 'ADMIN' | 'MEMBER',
      };
    }
  } catch {
    // Silently ignore invalid tokens in optional auth
  }

  next();
}
