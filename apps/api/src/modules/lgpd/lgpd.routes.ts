import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { lgpdController } from './lgpd.controller';
import {
  recordConsentSchema,
  revokeConsentSchema,
  deleteAccountSchema,
} from './lgpd.schemas';

const router: Router = Router();

// GET /lgpd/my-data
router.get(
  '/my-data',
  authenticateUser,
  requireTenantAccess,
  lgpdController.getMyData,
);

// GET /lgpd/export
router.get(
  '/export',
  authenticateUser,
  requireTenantAccess,
  lgpdController.exportData,
);

// GET /lgpd/consents
router.get(
  '/consents',
  authenticateUser,
  requireTenantAccess,
  lgpdController.getConsents,
);

// POST /lgpd/consents
router.post(
  '/consents',
  authenticateUser,
  requireTenantAccess,
  validateBody(recordConsentSchema),
  lgpdController.recordConsent,
);

// DELETE /lgpd/consents
router.delete(
  '/consents',
  authenticateUser,
  requireTenantAccess,
  validateBody(revokeConsentSchema),
  lgpdController.revokeConsent,
);

// DELETE /lgpd/account
router.delete(
  '/account',
  authenticateUser,
  requireTenantAccess,
  validateBody(deleteAccountSchema),
  lgpdController.deleteAccount,
);

export default router;
