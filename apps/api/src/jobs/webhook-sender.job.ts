import cron from 'node-cron';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the HMAC-SHA256 signature header value for a webhook payload.
 */
function buildHmacSignature(secret: string, payload: string): string {
  return (
    'sha256=' +
    crypto.createHmac('sha256', secret).update(payload).digest('hex')
  );
}

/**
 * Calculate the next retry timestamp based on the current attempt number.
 * attempt 1 → now + 30 seconds
 * attempt 2 → now + 5 minutes
 * attempt 3 → now + 30 minutes
 */
function nextRetryAt(attempt: number): Date {
  const now = new Date();
  switch (attempt) {
    case 1:
      now.setSeconds(now.getSeconds() + 30);
      break;
    case 2:
      now.setMinutes(now.getMinutes() + 5);
      break;
    default:
      now.setMinutes(now.getMinutes() + 30);
      break;
  }
  return now;
}

// ---------------------------------------------------------------------------
// Core sender logic
// ---------------------------------------------------------------------------

async function processWebhookEvents(): Promise<void> {
  const now = new Date();

  // Find all PENDING or FAILED events that are due for retry and haven't
  // exhausted their attempts.
  const events = await prisma.webhookEvent.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      next_retry_at: { lte: now },
      attempts: { lt: 3 },
      deleted_at: null,
    },
    include: {
      webhook: {
        select: { id: true, url: true, secret: true, is_active: true },
      },
    },
    take: 100, // process at most 100 events per run to avoid overload
  });

  if (events.length === 0) return;

  console.log(`[CRON][WebhookSender] Processing ${events.length} event(s)...`);

  await Promise.allSettled(
    events.map(async (event) => {
      const { webhook } = event;

      // Skip if the webhook has been deactivated since the event was queued
      if (!webhook.is_active) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'FAILED',
            last_attempt_at: new Date(),
          },
        });
        return;
      }

      const payloadStr = JSON.stringify(event.payload);
      const signature = buildHmacSignature(webhook.secret, payloadStr);

      let responseStatus: number | null = null;
      let success = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gudy-Signature': signature,
            },
            body: payloadStr,
            signal: controller.signal,
          });

          responseStatus = response.status;
          success = response.ok; // 2xx
        } finally {
          clearTimeout(timeout);
        }
      } catch (fetchErr) {
        // Network error or timeout — treat as failure
        console.error(
          `[CRON][WebhookSender] Network error for event ${event.id}:`,
          fetchErr,
        );
      }

      const newAttempts = event.attempts + 1;

      if (success) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: 'SUCCESS',
            attempts: newAttempts,
            last_attempt_at: new Date(),
            response_status_code: responseStatus,
            next_retry_at: null,
          },
        });
      } else {
        const exhausted = newAttempts >= 3;

        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: exhausted ? 'FAILED' : 'PENDING',
            attempts: newAttempts,
            last_attempt_at: new Date(),
            response_status_code: responseStatus,
            next_retry_at: exhausted ? null : nextRetryAt(newAttempts),
          },
        });
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Job starter
// ---------------------------------------------------------------------------

/**
 * Webhook Sender — runs every 5 minutes.
 *
 * Finds all PENDING/FAILED webhook_events where `next_retry_at <= NOW()` and
 * `attempts < 3`, sends the payload with HMAC-SHA256 signature, and updates
 * the event status accordingly with exponential backoff on failure.
 */
export function startWebhookSenderJob(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processWebhookEvents();
    } catch (err) {
      console.error('[CRON][WebhookSender] Job failed:', err);
    }
  });

  console.log('[CRON] Webhook sender job scheduled (every 5 minutes).');
}
