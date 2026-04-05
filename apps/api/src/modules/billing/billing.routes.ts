import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { billingController } from './billing.controller';
import { createSubscriptionSchema } from './billing.schemas';

const router: Router = Router();

// GET /billing/plans — public, no auth required
router.get('/plans', billingController.getPlans);

// POST /billing/webhook — public, Asaas webhook (auth via asaas-access-token header)
router.post('/webhook', billingController.asaasWebhook);

// GET /billing/info
router.get(
  '/info',
  authenticateUser,
  requireTenantAccess,
  billingController.getBillingInfo,
);

// POST /billing/subscribe
router.post(
  '/subscribe',
  authenticateUser,
  requireTenantAccess,
  validateBody(createSubscriptionSchema),
  billingController.subscribe,
);

// DELETE /billing/subscribe
router.delete(
  '/subscribe',
  authenticateUser,
  requireTenantAccess,
  billingController.cancelSubscription,
);

export default router;
