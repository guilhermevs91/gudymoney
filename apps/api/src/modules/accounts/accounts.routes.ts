import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import { createAccountSchema, updateAccountSchema, listAccountsQuerySchema } from './accounts.schemas';
import * as controller from './accounts.controller';

const router: Router = Router();

const auth = [authenticateUser, requireTenantAccess];

// GET /accounts
router.get(
  '/',
  ...auth,
  validateQuery(listAccountsQuerySchema),
  controller.list,
);

// POST /accounts
router.post(
  '/',
  ...auth,
  validateBody(createAccountSchema),
  controller.create,
);

// GET /accounts/:id/balance  — must be declared before /:id to avoid conflicts
router.get(
  '/:id/balance',
  ...auth,
  controller.getBalance,
);

// GET /accounts/:id
router.get(
  '/:id',
  ...auth,
  controller.getOne,
);

// PATCH /accounts/:id
router.patch(
  '/:id',
  ...auth,
  validateBody(updateAccountSchema),
  controller.update,
);

// DELETE /accounts/:id
router.delete(
  '/:id',
  ...auth,
  controller.remove,
);

export default router;
