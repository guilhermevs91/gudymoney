import crypto from 'node:crypto';
import type { Webhook, WebhookEvent, WebhookEventStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookWithEvents = Webhook & {
  events: WebhookEvent[];
};

export type PendingWebhookEvent = WebhookEvent & {
  webhook: Webhook;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const webhooksRepository = {
  /**
   * List all webhooks for a tenant (active and inactive).
   */
  async findAll(tenantId: string): Promise<Webhook[]> {
    return prisma.webhook.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
  },

  /**
   * Find a single webhook with its recent events.
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<WebhookWithEvents | null> {
    const webhook = await prisma.webhook.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
      include: {
        webhook_events: {
          orderBy: { created_at: 'desc' },
          take: 20,
        },
      },
    });
    return webhook as WebhookWithEvents | null;
  },

  /**
   * Create a new webhook.
   */
  async create(data: {
    tenant_id: string;
    url: string;
    secret: string;
    events: string[];
    is_active: boolean;
    created_by?: string | null;
  }): Promise<Webhook> {
    return prisma.webhook.create({
      data: {
        tenant_id: data.tenant_id,
        url: data.url,
        secret: data.secret,
        events: data.events,
        is_active: data.is_active,
        created_by: data.created_by ?? null,
      },
    });
  },

  /**
   * Update a webhook's mutable fields.
   */
  async update(
    id: string,
    tenantId: string,
    data: {
      url?: string;
      events?: string[];
      is_active?: boolean;
    },
  ): Promise<Webhook> {
    return prisma.webhook.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  /**
   * Soft-delete a webhook.
   */
  async softDelete(id: string, tenantId: string): Promise<void> {
    await prisma.webhook.update({
      where: { id },
      data: { deleted_at: new Date(), tenant_id: tenantId },
    });
  },

  /**
   * Regenerate the webhook secret and return the updated record.
   */
  async regenerateSecret(id: string, tenantId: string): Promise<Webhook> {
    const newSecret = crypto.randomBytes(32).toString('hex');
    return prisma.webhook.update({
      where: { id },
      data: { secret: newSecret, tenant_id: tenantId },
    });
  },

  /**
   * Find all active webhooks for a tenant that listen to a specific event type.
   */
  async findActiveByEvent(
    tenantId: string,
    eventType: string,
  ): Promise<Webhook[]> {
    return prisma.webhook.findMany({
      where: {
        tenant_id: tenantId,
        is_active: true,
        deleted_at: null,
        events: { has: eventType },
      },
    });
  },

  /**
   * Find pending webhook events eligible for dispatch or retry.
   * Includes the webhook relation for url and secret.
   */
  async findPendingEvents(limit = 50): Promise<PendingWebhookEvent[]> {
    const now = new Date();
    const events = await prisma.webhookEvent.findMany({
      where: {
        status: { in: ['PENDING', 'FAILED'] },
        next_retry_at: { lte: now },
        attempts: { lt: 3 },
      },
      take: limit,
      orderBy: { next_retry_at: 'asc' },
      include: { webhook: true },
    });
    return events as PendingWebhookEvent[];
  },

  /**
   * Create a new webhook event record.
   */
  async createWebhookEvent(data: {
    tenant_id: string;
    webhook_id: string;
    event_type: string;
    payload: object;
    next_retry_at?: Date | null;
  }): Promise<WebhookEvent> {
    return prisma.webhookEvent.create({
      data: {
        tenant_id: data.tenant_id,
        webhook_id: data.webhook_id,
        event_type: data.event_type,
        payload: data.payload,
        status: 'PENDING',
        attempts: 0,
        next_retry_at: data.next_retry_at ?? new Date(),
      },
    });
  },

  /**
   * Update a webhook event after a delivery attempt.
   */
  async updateWebhookEvent(
    id: string,
    data: {
      status: string;
      attempts: number;
      last_attempt_at: Date;
      response_status_code?: number | null;
      next_retry_at?: Date | null;
    },
  ): Promise<WebhookEvent> {
    return prisma.webhookEvent.update({
      where: { id },
      data: {
        status: data.status as WebhookEventStatus,
        attempts: data.attempts,
        last_attempt_at: data.last_attempt_at,
        response_status_code: data.response_status_code ?? null,
        next_retry_at: data.next_retry_at ?? null,
      },
    });
  },

  /**
   * Find recent events for a specific webhook.
   */
  async findRecentEvents(
    webhookId: string,
    tenantId: string,
    limit = 20,
  ): Promise<WebhookEvent[]> {
    return prisma.webhookEvent.findMany({
      where: { webhook_id: webhookId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  },
};
