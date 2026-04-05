import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { ledgerController } from './ledger.controller';

const router: Router = Router();

// GET /ledger/accounts/:accountId/balance
router.get(
  '/accounts/:accountId/balance',
  authenticateUser,
  requireTenantAccess,
  ledgerController.getAccountBalance,
);

// GET /ledger/summary
router.get(
  '/summary',
  authenticateUser,
  requireTenantAccess,
  ledgerController.getTenantSummary,
);

export default router;
