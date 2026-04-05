import crypto from 'node:crypto';
import type { Webhook } from '@prisma/client';
import { createAuditLog } from '../../lib/audit';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { webhooksRepository } from './webhooks.repository';
import type { WebhookWithEvents } from './webhooks.repository';
import type { CreateWebhookInput, UpdateWebhookInput, ValidEvent } from './webhooks.schemas';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const webhooksService = {
  /**
   * List all webhooks for a tenant.
   */
  async listWebhooks(tenantId: string): Promise<Webhook[]> {
    return webhooksRepository.findAll(tenantId);
  },

  /**
   * Get a single webhook with recent events or throw NotFoundError.
   */
  async getWebhookWithEvents(
    id: string,
    tenantId: string,
  ): Promise<WebhookWithEvents> {
    const webhook = await webhooksRepository.findById(id, tenantId);
    if (webhook === null) {
      throw new NotFoundError('Webhook não encontrado.');
    }
    return webhook;
  },

  /**
   * Create a webhook — only available on PAID plan.
   * Returns the webhook with the secret (only time it is shown).
   */
  async createWebhook(
    tenantId: string,
    userId: string,
    plan: string,
    data: CreateWebhookInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Webhook & { secret: string }> {
    if (plan !== 'PAID' && plan !== 'DEV') {
      throw new ForbiddenError(
        'Webhooks estão disponíveis apenas no plano PAID.',
      );
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await webhooksRepository.create({
      tenant_id: tenantId,
      url: data.url,
      secret,
      events: data.events as string[],
      is_active: data.is_active,
      created_by: userId,
    });

    await createAuditLog({
      prisma: (await import('../../lib/prisma.js')).prisma,
      tenantId,
      userId,
      entityType: 'Webhook',
      entityId: webhook.id,
      action: 'CREATE',
      afterData: { url: data.url, events: data.events, is_active: data.is_active },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    // Return with secret — only time it is exposed
    return { ...webhook, secret };
  },

  /**
   * Update a webhook's mutable fields.
   */
  async updateWebhook(
    id: string,
    tenantId: string,
    userId: string,
    data: UpdateWebhookInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Webhook> {
    const existing = await webhooksRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Webhook não encontrado.');
    }

    const updated = await webhooksRepository.update(id, tenantId, {
      url: data.url,
      events: data.events as string[] | undefined,
      is_active: data.is_active,
    });

    await createAuditLog({
      prisma: (await import('../../lib/prisma.js')).prisma,
      tenantId,
      userId,
      entityType: 'Webhook',
      entityId: id,
      action: 'UPDATE',
      beforeData: {
        url: existing.url,
        events: existing.events,
        is_active: existing.is_active,
      },
      afterData: data as Record<string, unknown>,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return updated;
  },

  /**
   * Soft-delete a webhook.
   */
  async deleteWebhook(
    id: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const existing = await webhooksRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Webhook não encontrado.');
    }

    await webhooksRepository.softDelete(id, tenantId);

    await createAuditLog({
      prisma: (await import('../../lib/prisma.js')).prisma,
      tenantId,
      userId,
      entityType: 'Webhook',
      entityId: id,
      action: 'DELETE',
      beforeData: { url: existing.url, events: existing.events },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  },

  /**
   * Regenerate the webhook secret.
   * Returns the new secret — only time it is exposed.
   */
  async regenerateSecret(
    id: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ secret: string }> {
    const existing = await webhooksRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Webhook não encontrado.');
    }

    const updated = await webhooksRepository.regenerateSecret(id, tenantId);

    await createAuditLog({
      prisma: (await import('../../lib/prisma.js')).prisma,
      tenantId,
      userId,
      entityType: 'Webhook',
      entityId: id,
      action: 'UPDATE',
      afterData: { action: 'secret_regenerated' },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return { secret: updated.secret };
  },

  /**
   * Dispatch a webhook event to all active webhooks for the tenant that
   * subscribe to the given event type.
   * This is called from other services (transactions, invoices, etc.).
   */
  async dispatchWebhookEvent(
    tenantId: string,
    eventType: ValidEvent,
    payload: object,
  ): Promise<void> {
    const activeWebhooks = await webhooksRepository.findActiveByEvent(
      tenantId,
      eventType,
    );

    const now = new Date();

    for (const webhook of activeWebhooks) {
      await webhooksRepository.createWebhookEvent({
        tenant_id: tenantId,
        webhook_id: webhook.id,
        event_type: eventType,
        payload,
        next_retry_at: now,
      });
    }
  },
};
