import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import * as service from './superadmin.service';
import type {
  SuperadminLoginInput,
  TenantBlockInput,
  UpdateTenantInput,
  TenantListQuery,
  UserListQuery,
  FeatureFlagInput,
} from './superadmin.schemas';

// ---------------------------------------------------------------------------
// Error handler helper
// ---------------------------------------------------------------------------

function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * POST /superadmin/auth/login
 * Authenticates a superadmin and returns a JWT token.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body as SuperadminLoginInput;
    const result = await service.superadminLogin(email, password);
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * GET /superadmin/metrics
 */
export async function getDashboardMetrics(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await service.getDashboardMetrics();
    res.status(200).json({ data: metrics });
  } catch (err) {
    handleError(err, res, next);
  }
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

/**
 * GET /superadmin/tenants
 */
export async function getTenants(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getTenants(req.query as unknown as TenantListQuery);
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * GET /superadmin/tenants/:id
 */
export async function getTenantById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenant = await service.getTenantById(req.params['id'] as string);
    res.status(200).json({ data: tenant });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * PATCH /superadmin/tenants/:id
 */
export async function updateTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    const updated = await service.updateTenant(
      req.params['id'] as string,
      req.body as UpdateTenantInput,
      superadminId,
    );
    res.status(200).json({ data: updated });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /superadmin/tenants/:id/block
 */
export async function blockTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { reason } = req.body as TenantBlockInput;
    const superadminId = req.superadmin!.superadminId;
    await service.blockTenant(req.params['id'] as string, reason, superadminId);
    res.status(200).json({ data: { message: 'Tenant blocked successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /superadmin/tenants/:id/unblock
 */
export async function unblockTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    await service.unblockTenant(req.params['id'] as string, superadminId);
    res.status(200).json({ data: { message: 'Tenant unblocked successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * DELETE /superadmin/tenants/:id
 */
export async function deleteTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    await service.deleteTenant(req.params['id'] as string, superadminId);
    res.status(200).json({ data: { message: 'Tenant deleted successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /superadmin/tenants/:id/impersonate
 */
export async function impersonateTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    const result = await service.impersonateTenant(req.params['id'] as string, superadminId);
    res.status(200).json({ data: result });
  } catch (err) {
    handleError(err, res, next);
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * GET /superadmin/users
 */
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getUsers(req.query as unknown as UserListQuery);
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * POST /superadmin/users/:id/block
 */
export async function blockUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    await service.blockUser(req.params['id'] as string, superadminId);
    res.status(200).json({ data: { message: 'User blocked successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * DELETE /superadmin/users/:id
 */
export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const superadminId = req.superadmin!.superadminId;
    await service.deleteUser(req.params['id'] as string, superadminId);
    res.status(200).json({ data: { message: 'User deleted successfully.' } });
  } catch (err) {
    handleError(err, res, next);
  }
}

// ---------------------------------------------------------------------------
// Plan features
// ---------------------------------------------------------------------------

/**
 * GET /superadmin/plan-features
 */
export async function getPlanFeatures(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const features = await service.getPlanFeatures();
    res.status(200).json({ data: features });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * PUT /superadmin/plan-features
 */
export async function upsertPlanFeature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const feature = await service.upsertPlanFeature(req.body as FeatureFlagInput);
    res.status(200).json({ data: feature });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * PATCH /superadmin/plan-features/:id
 */
export async function updatePlanFeatureById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { feature_value } = req.body as { feature_value: string };
    const feature = await service.updatePlanFeatureById(req.params.id as string, feature_value);
    if (feature === null) {
      res.status(404).json({ error: 'Feature não encontrada.', code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json({ data: feature });
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * DELETE /superadmin/plan-features/:id
 */
export async function deletePlanFeature(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deleted = await service.deletePlanFeature(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Feature não encontrada.', code: 'NOT_FOUND' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * GET /superadmin/security-logs
 */
export async function getSecurityLogs(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit, action, ip_address, hours } = req.query as Record<string, string>;
    const result = await service.getSecurityLogs({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      action,
      ip_address,
      hours: hours ? parseInt(hours) : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res, next);
  }
}

/**
 * GET /superadmin/platform-metrics
 */
export async function getPlatformMetrics(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const metrics = await service.getPlatformMetrics();
    res.status(200).json({ data: metrics });
  } catch (err) {
    handleError(err, res, next);
  }
}
