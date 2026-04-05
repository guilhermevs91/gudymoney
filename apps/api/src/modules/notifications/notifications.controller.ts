import type { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service';
import type { ListNotificationsQuery } from './notifications.service';

export const notificationsController = {
  /**
   * GET /notifications
   * Query params: read (boolean), page, pageSize
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;

      const rawRead = req.query['read'];
      let read: boolean | undefined;
      if (rawRead === 'true') read = true;
      else if (rawRead === 'false') read = false;

      const page = Math.max(1, Number(req.query['page'] ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query['pageSize'] ?? 20)));

      const query: ListNotificationsQuery = { read, page, pageSize };
      const result = await notificationsService.listNotifications(tenantId, userId, query);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /notifications/:id/read
   */
  async markAsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;

      await notificationsService.markAsRead(id, tenantId, userId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /notifications/read-all
   */
  async markAllAsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;

      await notificationsService.markAllAsRead(tenantId, userId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /notifications/:id
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;

      await notificationsService.deleteNotification(id, tenantId, userId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /notifications/count
   */
  async getUnreadCount(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;

      const count = await notificationsService.getUnreadCount(tenantId, userId);

      res.status(200).json({ data: { count } });
    } catch (err) {
      next(err);
    }
  },
};
