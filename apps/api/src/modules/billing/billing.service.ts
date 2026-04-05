import { prisma } from '../../lib/prisma';
import { asaas } from '../../lib/asaas';
import { createAuditLog } from '../../lib/audit';
import {
  NotFoundError,
  AppError,
  ForbiddenError,
} from '../../lib/errors';
import type { CreateSubscriptionInput } from './billing.schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the next due date as YYYY-MM-DD (tomorrow). */
function nextDueDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0]!;
}

/** Returns the date N months/years from now. */
function addPeriod(plan: 'monthly' | 'annual'): Date {
  const d = new Date();
  if (plan === 'annual') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Get plans
// ---------------------------------------------------------------------------

export async function getPlans() {
  const features = await prisma.planFeature.findMany({
    where: { deleted_at: null },
    orderBy: [{ plan: 'asc' }, { feature_key: 'asc' }],
  });

  const byPlan: Record<string, Record<string, string>> = {};
  for (const f of features) {
    if (!byPlan[f.plan]) byPlan[f.plan] = {};
    byPlan[f.plan]![f.feature_key] = f.feature_value;
  }

  const paidFeatures = byPlan['PAID'] ?? {};
  const freeFeatures = byPlan['FREE'] ?? {};

  return {
    FREE: {
      features: Object.entries(freeFeatures)
        .filter(([k]) => !['monthly_price', 'annual_price'].includes(k))
        .map(([key, value]) => ({ key, value })),
    },
    PAID: {
      monthly_price: paidFeatures['monthly_price']
        ? parseFloat(paidFeatures['monthly_price'])
        : null,
      annual_price: paidFeatures['annual_price']
        ? parseFloat(paidFeatures['annual_price'])
        : null,
      features: Object.entries(paidFeatures)
        .filter(([k]) => !['monthly_price', 'annual_price'].includes(k))
        .map(([key, value]) => ({ key, value })),
    },
  };
}

// ---------------------------------------------------------------------------
// Create subscription
// ---------------------------------------------------------------------------

export async function createSubscription(
  tenantId: string,
  userId: string,
  data: CreateSubscriptionInput,
) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null, blocked_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  if (tenant.plan === 'PAID' && tenant.plan_expires_at && tenant.plan_expires_at > new Date()) {
    throw new AppError(
      'Tenant already has an active PAID subscription',
      409,
      'CONFLICT',
    );
  }

  // Get pricing
  const pricingFeatures = await prisma.planFeature.findMany({
    where: {
      plan: 'PAID',
      feature_key: { in: ['monthly_price', 'annual_price'] },
      deleted_at: null,
    },
  });

  const priceMap: Record<string, number> = {};
  for (const f of pricingFeatures) {
    priceMap[f.feature_key] = parseFloat(f.feature_value);
  }

  const price =
    data.plan === 'annual'
      ? (priceMap['annual_price'] ?? 0)
      : (priceMap['monthly_price'] ?? 0);

  if (price <= 0) {
    throw new AppError(
      'Pricing not configured for this plan. Please contact support.',
      422,
      'PRICING_NOT_CONFIGURED',
    );
  }

  // Fetch user for customer info
  const user = await prisma.user.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get or create Asaas customer
  let asaasCustomerId = tenant.asaas_customer_id;

  if (!asaasCustomerId) {
    // Try to find existing customer by email
    const existingList = await asaas.findCustomerByEmail(user.email);
    if (existingList.data.length > 0 && existingList.data[0]) {
      asaasCustomerId = existingList.data[0].id;
    } else {
      // Create new customer
      const newCustomer = await asaas.createCustomer({
        name: user.name,
        email: user.email,
      });
      asaasCustomerId = newCustomer.id;
    }
  }

  // Build subscription payload
  const billingTypeMap: Record<string, 'PIX' | 'BOLETO' | 'CREDIT_CARD'> = {
    PIX: 'PIX',
    BOLETO: 'BOLETO',
    CREDIT_CARD: 'CREDIT_CARD',
  };

  const subscriptionPayload = {
    customer: asaasCustomerId,
    billingType: billingTypeMap[data.payment_method]!,
    value: price,
    nextDueDate: nextDueDateString(),
    cycle: data.plan === 'annual' ? ('YEARLY' as const) : ('MONTHLY' as const),
    description: `Gudy Money — Plano PAID (${data.plan})`,
    ...(data.payment_method === 'CREDIT_CARD' && data.credit_card_data
      ? {
          creditCard: {
            holderName: data.credit_card_data.holder_name,
            number: data.credit_card_data.number,
            expiryMonth: data.credit_card_data.expiry_month,
            expiryYear: data.credit_card_data.expiry_year,
            ccv: data.credit_card_data.cvv,
          },
        }
      : {}),
    ...(data.payment_method === 'CREDIT_CARD' && data.credit_card_holder_info
      ? {
          creditCardHolderInfo: {
            name: data.credit_card_holder_info.name,
            email: data.credit_card_holder_info.email,
            cpfCnpj: data.credit_card_holder_info.cpf_cnpj,
            postalCode: data.credit_card_holder_info.postal_code,
            addressNumber: data.credit_card_holder_info.address_number,
            phone: data.credit_card_holder_info.phone,
          },
        }
      : {}),
  };

  const subscription = await asaas.createSubscription(subscriptionPayload);

  // Update tenant with subscription info
  const planExpiresAt = addPeriod(data.plan);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      asaas_customer_id: asaasCustomerId,
      plan: 'PAID',
      plan_expires_at: planExpiresAt,
    },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    beforeData: { plan: tenant.plan, plan_expires_at: tenant.plan_expires_at },
    afterData: {
      plan: 'PAID',
      plan_expires_at: planExpiresAt.toISOString(),
      asaas_subscription_id: subscription.id,
    },
  });

  return {
    subscription_id: subscription.id,
    payment_url: subscription.invoiceUrl ?? subscription.paymentLink ?? null,
    plan_expires_at: planExpiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Handle Asaas webhook
// ---------------------------------------------------------------------------

interface AsaasWebhookPayload {
  event: string;
  payment?: {
    id: string;
    customer: string;
    subscription?: string;
    status: string;
    dueDate?: string;
  };
  subscription?: {
    id: string;
    customer: string;
    status: string;
  };
}

export async function handleAsaasWebhook(
  payload: AsaasWebhookPayload,
  token: string,
) {
  // Asaas sends the access_token in the header — validate it matches our key
  const { env } = await import('../../config/env.js');
  if (token !== env.ASAAS_API_KEY && env.ASAAS_API_KEY !== '') {
    throw new ForbiddenError('Invalid webhook token');
  }

  const event = payload.event;

  if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
    // Find tenant by asaas_customer_id
    const customerId =
      payload.payment?.customer ?? payload.subscription?.customer;
    if (!customerId) return;

    const tenant = await prisma.tenant.findFirst({
      where: { asaas_customer_id: customerId, deleted_at: null },
    });

    if (!tenant) return;

    // Extend plan by 1 month/year from now (simplified: add 30 days)
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { plan: 'PAID', plan_expires_at: newExpiry },
    });

    await createAuditLog({
      prisma,
      tenantId: tenant.id,
      userId: null,
      entityType: 'tenant',
      entityId: tenant.id,
      action: 'UPDATE',
      afterData: {
        plan: 'PAID',
        plan_expires_at: newExpiry.toISOString(),
        asaas_event: event,
      },
    });
  } else if (event === 'PAYMENT_OVERDUE') {
    // After grace period (7 days), downgrade to FREE
    // We check if the due date + 7 days < now
    const customerId = payload.payment?.customer;
    if (!customerId) return;

    const tenant = await prisma.tenant.findFirst({
      where: { asaas_customer_id: customerId, deleted_at: null },
    });

    if (!tenant) return;

    const dueDate = payload.payment?.dueDate
      ? new Date(payload.payment.dueDate)
      : null;

    const gracePeriodExpired =
      dueDate
        ? new Date() > new Date(dueDate.getTime() + 7 * 24 * 60 * 60 * 1000)
        : false;

    if (gracePeriodExpired && tenant.plan === 'PAID') {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { plan: 'FREE', plan_expires_at: null },
      });

      await createAuditLog({
        prisma,
        tenantId: tenant.id,
        userId: null,
        entityType: 'tenant',
        entityId: tenant.id,
        action: 'UPDATE',
        beforeData: { plan: 'PAID' },
        afterData: { plan: 'FREE', reason: 'PAYMENT_OVERDUE', asaas_event: event },
      });
    }
  } else if (event === 'SUBSCRIPTION_DELETED') {
    const customerId = payload.subscription?.customer ?? payload.payment?.customer;
    if (!customerId) return;

    const tenant = await prisma.tenant.findFirst({
      where: { asaas_customer_id: customerId, deleted_at: null },
    });

    if (!tenant) return;

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { plan: 'FREE', plan_expires_at: null },
    });

    await createAuditLog({
      prisma,
      tenantId: tenant.id,
      userId: null,
      entityType: 'tenant',
      entityId: tenant.id,
      action: 'UPDATE',
      beforeData: { plan: tenant.plan },
      afterData: { plan: 'FREE', reason: 'SUBSCRIPTION_DELETED', asaas_event: event },
    });
  }
}

// ---------------------------------------------------------------------------
// Cancel subscription
// ---------------------------------------------------------------------------

export async function cancelSubscription(tenantId: string, userId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  if (tenant.plan !== 'PAID') {
    throw new AppError('No active PAID subscription found', 409, 'CONFLICT');
  }

  // Retrieve the Asaas subscription ID from the most recent audit log
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      tenant_id: tenantId,
      entity_type: 'tenant',
      action: 'UPDATE',
    },
    orderBy: { created_at: 'desc' },
  });

  const afterData = auditLog?.after_data as Record<string, unknown> | null;
  const asaasSubscriptionId =
    typeof afterData?.['asaas_subscription_id'] === 'string'
      ? afterData['asaas_subscription_id']
      : null;

  if (asaasSubscriptionId) {
    try {
      await asaas.cancelSubscription(asaasSubscriptionId);
    } catch (err) {
      console.error('[Billing] Failed to cancel Asaas subscription:', err);
    }
  }

  // Keep plan active until plan_expires_at — just record a cancellation flag in audit log
  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'tenant',
    entityId: tenantId,
    action: 'UPDATE',
    beforeData: { plan: tenant.plan, plan_expires_at: tenant.plan_expires_at },
    afterData: {
      subscription_cancelled: true,
      cancelled_at: new Date().toISOString(),
      plan_active_until: tenant.plan_expires_at?.toISOString() ?? null,
    },
  });

  return {
    message: 'Subscription cancelled. Plan remains active until expiry date.',
    plan_expires_at: tenant.plan_expires_at?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Get billing info
// ---------------------------------------------------------------------------

export async function getBillingInfo(tenantId: string) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deleted_at: null },
    select: {
      id: true,
      plan: true,
      plan_expires_at: true,
      asaas_customer_id: true,
    },
  });

  if (!tenant) {
    throw new NotFoundError('Tenant not found');
  }

  // Try to get next billing date from Asaas if we have a subscription
  let next_billing_date: string | null = null;

  if (tenant.asaas_customer_id) {
    try {
      // Look up subscription ID from audit logs
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type: 'tenant',
          action: 'UPDATE',
        },
        orderBy: { created_at: 'desc' },
      });

      const afterData = auditLog?.after_data as Record<string, unknown> | null;
      const asaasSubscriptionId =
        typeof afterData?.['asaas_subscription_id'] === 'string'
          ? afterData['asaas_subscription_id']
          : null;

      if (asaasSubscriptionId) {
        const sub = await asaas.getSubscription(asaasSubscriptionId);
        next_billing_date = sub.nextDueDate ?? null;
      }
    } catch {
      // Non-critical — silently ignore Asaas fetch errors
    }
  }

  return {
    plan: tenant.plan,
    plan_expires_at: tenant.plan_expires_at?.toISOString() ?? null,
    next_billing_date,
    is_active:
      tenant.plan === 'PAID' &&
      tenant.plan_expires_at !== null &&
      tenant.plan_expires_at > new Date(),
  };
}
