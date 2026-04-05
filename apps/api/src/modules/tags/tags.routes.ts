import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { createTagSchema, updateTagSchema } from './tags.schemas';
import * as controller from './tags.controller';

const router: Router = Router();

const auth = [authenticateUser, requireTenantAccess];

// GET /tags
router.get('/', ...auth, controller.list);

// POST /tags
router.post('/', ...auth, validateBody(createTagSchema), controller.create);

// GET /tags/:id
router.get('/:id', ...auth, controller.getOne);

// PATCH /tags/:id
router.patch('/:id', ...auth, validateBody(updateTagSchema), controller.update);

// DELETE /tags/:id
router.delete('/:id', ...auth, controller.remove);

export default router;
