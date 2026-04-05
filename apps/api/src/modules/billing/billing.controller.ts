import type { Request, Response, NextFunction } from 'express';
import * as billingService from './billing.service';
import type { CreateSubscriptionInput } from './billing.schemas';

export const billingController = {
  /**
   * GET /billing/plans
   * Returns plan features and prices from plan_features table.
   */
  async getPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await billingService.getPlans();
      res.status(200).json(plans);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /billing/info
   * Returns the current tenant's billing info and subscription status.
   */
  async getBillingInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const info = await billingService.getBillingInfo(tenantId);
      res.status(200).json(info);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /billing/subscribe
   * Creates a subscription via Asaas for the current tenant.
   */
  async subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const body = req.body as CreateSubscriptionInput;
      const result = await billingService.createSubscription(tenantId, userId, body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /billing/subscribe
   * Cancels the current tenant's subscription.
   */
  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      await billingService.cancelSubscription(tenantId, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /billing/webhook
   * Handles Asaas payment webhook events.
   * Public endpoint — no auth required (verified via Asaas token header).
   */
  async asaasWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const asaasToken = (req.headers['asaas-access-token'] as string | undefined) ?? '';
      await billingService.handleAsaasWebhook(req.body as Parameters<typeof billingService.handleAsaasWebhook>[0], asaasToken);
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  },
};
