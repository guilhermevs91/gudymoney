import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import {
  validateBody,
  validateQuery,
} from '../../middleware/validate.middleware';
import { transactionsController } from './transactions.controller';
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsQuerySchema,
} from './transactions.schemas';

const router: Router = Router();

// GET /transactions
router.get(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateQuery(listTransactionsQuerySchema),
  transactionsController.list,
);

// POST /transactions
router.post(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateBody(createTransactionSchema),
  transactionsController.create,
);

// GET /transactions/projection?year=&month=
router.get(
  '/projection',
  authenticateUser,
  requireTenantAccess,
  transactionsController.projection,
);

// GET /transactions/:id
router.get(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  transactionsController.getOne,
);

// PATCH /transactions/:id
router.patch(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateTransactionSchema),
  transactionsController.update,
);

// PATCH /transactions/:id/categorize — set category + optionally save rule + apply to similar
router.patch(
  '/:id/categorize',
  authenticateUser,
  requireTenantAccess,
  transactionsController.categorize,
);

// DELETE /transactions/:id
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  transactionsController.remove,
);

export default router;
