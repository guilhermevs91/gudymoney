import type { Request, Response, NextFunction } from 'express';
import { webhooksService } from './webhooks.service';
import type { CreateWebhookInput, UpdateWebhookInput } from './webhooks.schemas';

export const webhooksController = {
  /**
   * GET /webhooks
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const webhooks = await webhooksService.listWebhooks(tenantId);
      res.status(200).json({ data: webhooks });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /webhooks/:id
   */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      const webhook = await webhooksService.getWebhookWithEvents(id, tenantId);
      res.status(200).json({ data: webhook });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /webhooks
   * PAID plan only.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const plan = req.tenant!.plan;
      const data = req.body as CreateWebhookInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const webhook = await webhooksService.createWebhook(
        tenantId,
        userId,
        plan,
        data,
        ipAddress,
        userAgent,
      );

      res.status(201).json({ data: webhook });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /webhooks/:id
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const data = req.body as UpdateWebhookInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const webhook = await webhooksService.updateWebhook(
        id,
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );

      res.status(200).json({ data: webhook });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /webhooks/:id
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      await webhooksService.deleteWebhook(id, tenantId, userId, ipAddress, userAgent);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /webhooks/:id/regenerate-secret
   */
  async regenerateSecret(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await webhooksService.regenerateSecret(
        id,
        tenantId,
        userId,
        ipAddress,
        userAgent,
      );

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
};
