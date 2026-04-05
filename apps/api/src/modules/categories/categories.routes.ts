import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody, validateQuery } from '../../middleware/validate.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  listCategoriesQuerySchema,
} from './categories.schemas';
import * as controller from './categories.controller';

const router: Router = Router();

const auth = [authenticateUser, requireTenantAccess];

// GET /categories
router.get(
  '/',
  ...auth,
  validateQuery(listCategoriesQuerySchema),
  controller.list,
);

// POST /categories
router.post(
  '/',
  ...auth,
  validateBody(createCategorySchema),
  controller.create,
);

// GET /categories/:id
router.get('/:id', ...auth, controller.getOne);

// PATCH /categories/:id
router.patch(
  '/:id',
  ...auth,
  validateBody(updateCategorySchema),
  controller.update,
);

// DELETE /categories/:id
router.delete('/:id', ...auth, controller.remove);

export default router;
