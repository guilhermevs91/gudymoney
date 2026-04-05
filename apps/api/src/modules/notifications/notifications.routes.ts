import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { notificationsController } from './notifications.controller';

const router: Router = Router();

// GET /notifications/count — must be registered before /:id routes
router.get(
  '/count',
  authenticateUser,
  requireTenantAccess,
  notificationsController.getUnreadCount,
);

// PATCH /notifications/read-all — must be registered before /:id routes
router.patch(
  '/read-all',
  authenticateUser,
  requireTenantAccess,
  notificationsController.markAllAsRead,
);

// GET /notifications
router.get('/', authenticateUser, requireTenantAccess, notificationsController.list);

// PATCH /notifications/:id/read
router.patch(
  '/:id/read',
  authenticateUser,
  requireTenantAccess,
  notificationsController.markAsRead,
);

// DELETE /notifications/:id
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  notificationsController.remove,
);

export default router;
