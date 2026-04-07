import { Router } from 'express';
import { authenticateSuperAdmin } from '../../middleware/auth.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import {
  superadminLoginSchema,
  tenantBlockSchema,
  updateTenantSchema,
  featureFlagSchema,
  tenantListQuerySchema,
  userListQuerySchema,
} from './superadmin.schemas';
import * as controller from './superadmin.controller';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Public (no auth required)
// ---------------------------------------------------------------------------

/** POST /superadmin/auth/login */
router.post(
  '/auth/login',
  validateBody(superadminLoginSchema),
  controller.login,
);

// ---------------------------------------------------------------------------
// Protected — requires SuperAdmin JWT
// ---------------------------------------------------------------------------

/** GET /superadmin/metrics */
router.get('/metrics', authenticateSuperAdmin, controller.getDashboardMetrics);

/** GET /superadmin/platform-metrics */
router.get('/platform-metrics', authenticateSuperAdmin, controller.getPlatformMetrics);

/** GET /superadmin/security-logs */
router.get('/security-logs', authenticateSuperAdmin, controller.getSecurityLogs);

// ---------------------------------------------------------------------------
// Tenant management
// ---------------------------------------------------------------------------

/** GET /superadmin/tenants */
router.get(
  '/tenants',
  authenticateSuperAdmin,
  validateQuery(tenantListQuerySchema),
  controller.getTenants,
);

/** GET /superadmin/tenants/:id */
router.get('/tenants/:id', authenticateSuperAdmin, controller.getTenantById);

/** PATCH /superadmin/tenants/:id */
router.patch(
  '/tenants/:id',
  authenticateSuperAdmin,
  validateBody(updateTenantSchema),
  controller.updateTenant,
);

/** POST /superadmin/tenants/:id/block */
router.post(
  '/tenants/:id/block',
  authenticateSuperAdmin,
  validateBody(tenantBlockSchema),
  controller.blockTenant,
);

/** POST /superadmin/tenants/:id/unblock */
router.post('/tenants/:id/unblock', authenticateSuperAdmin, controller.unblockTenant);

/** DELETE /superadmin/tenants/:id */
router.delete('/tenants/:id', authenticateSuperAdmin, controller.deleteTenant);

/** POST /superadmin/tenants/:id/impersonate */
router.post(
  '/tenants/:id/impersonate',
  authenticateSuperAdmin,
  controller.impersonateTenant,
);

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

/** GET /superadmin/users */
router.get(
  '/users',
  authenticateSuperAdmin,
  validateQuery(userListQuerySchema),
  controller.getUsers,
);

/** POST /superadmin/users/:id/block */
router.post('/users/:id/block', authenticateSuperAdmin, controller.blockUser);

/** DELETE /superadmin/users/:id */
router.delete('/users/:id', authenticateSuperAdmin, controller.deleteUser);

// ---------------------------------------------------------------------------
// Plan features
// ---------------------------------------------------------------------------

/** GET /superadmin/plan-features */
router.get('/plan-features', authenticateSuperAdmin, controller.getPlanFeatures);

/** PUT /superadmin/plan-features */
router.put(
  '/plan-features',
  authenticateSuperAdmin,
  validateBody(featureFlagSchema),
  controller.upsertPlanFeature,
);

/** PATCH /superadmin/plan-features/:id */
router.patch('/plan-features/:id', authenticateSuperAdmin, controller.updatePlanFeatureById);

/** DELETE /superadmin/plan-features/:id */
router.delete('/plan-features/:id', authenticateSuperAdmin, controller.deletePlanFeature);

export default router;
