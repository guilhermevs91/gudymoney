import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { webhooksController } from './webhooks.controller';
import { createWebhookSchema, updateWebhookSchema } from './webhooks.schemas';

const router: Router = Router();

// GET /webhooks
router.get('/', authenticateUser, requireTenantAccess, webhooksController.list);

// POST /webhooks — PAID plan only
router.post(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateBody(createWebhookSchema),
  webhooksController.create,
);

// GET /webhooks/:id
router.get('/:id', authenticateUser, requireTenantAccess, webhooksController.getOne);

// PATCH /webhooks/:id
router.patch(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateWebhookSchema),
  webhooksController.update,
);

// DELETE /webhooks/:id
router.delete('/:id', authenticateUser, requireTenantAccess, webhooksController.remove);

// POST /webhooks/:id/regenerate-secret
router.post(
  '/:id/regenerate-secret',
  authenticateUser,
  requireTenantAccess,
  webhooksController.regenerateSecret,
);

export default router;
