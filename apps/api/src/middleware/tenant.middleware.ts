import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

const FORBIDDEN = { error: 'Forbidden', code: 'FORBIDDEN' } as const;

/**
 * Verifies that the authenticated user's `tenantId` maps to an active,
 * unblocked tenant in the database and attaches the tenant context to
 * `req.tenant`.
 *
 * Must be used after `authenticateUser` so that `req.user` is already set.
 *
 * All subsequent handlers can trust:
 *   - `req.user.tenantId` is the correct scope
 *   - `req.tenant` carries the tenant's `id`, `plan`, and `budget_scope`
 */
export async function requireTenantAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.user === undefined) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  const { tenantId } = req.user;

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        id: tenantId,
        deleted_at: null,
      },
      select: {
        id: true,
        plan: true,
        budget_scope: true,
        blocked_at: true,
      },
    });

    if (tenant === null) {
      res.status(403).json(FORBIDDEN);
      return;
    }

    if (tenant.blocked_at !== null) {
      res.status(403).json({
        error: 'Tenant is blocked.',
        code: 'TENANT_BLOCKED',
      });
      return;
    }

    req.tenant = {
      id: tenant.id,
      plan: tenant.plan,
      budget_scope: tenant.budget_scope,
    };

    next();
  } catch (err) {
    next(err);
  }
}
