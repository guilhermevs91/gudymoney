import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import {
  validateBody,
  validateQuery,
} from '../../middleware/validate.middleware';
import { recurrencesController } from './recurrences.controller';
import {
  createRecurrenceSchema,
  updateRecurrenceSchema,
  cancelRecurrenceSchema,
  listRecurrencesQuerySchema,
} from './recurrences.schemas';

const router: Router = Router();

// GET /recurrences
router.get(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateQuery(listRecurrencesQuerySchema),
  recurrencesController.list,
);

// POST /recurrences
router.post(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateBody(createRecurrenceSchema),
  recurrencesController.create,
);

// GET /recurrences/:id
router.get(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  recurrencesController.getOne,
);

// PUT /recurrences/:id (full update)
router.put(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateRecurrenceSchema),
  recurrencesController.update,
);

// PATCH /recurrences/:id (partial update)
router.patch(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateRecurrenceSchema),
  recurrencesController.update,
);

// DELETE /recurrences/:id
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(cancelRecurrenceSchema),
  recurrencesController.cancel,
);

// GET /recurrences/:id/transactions
router.get(
  '/:id/transactions',
  authenticateUser,
  requireTenantAccess,
  recurrencesController.listTransactions,
);

export default router;
