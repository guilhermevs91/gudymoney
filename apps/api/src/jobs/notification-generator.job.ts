import cron from 'node-cron';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a Date representing the start of a given day in UTC. */
function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Returns a Date representing the end of a given day in UTC. */
function endOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

// ---------------------------------------------------------------------------
// Notification generators
// ---------------------------------------------------------------------------

/**
 * Generate INVOICE_DUE notifications for credit card invoices due exactly
 * 3 days from today, for all ADMIN members of the owning tenant.
 */
async function generateInvoiceDueNotifications(today: Date): Promise<number> {
  const targetDay = new Date(today);
  targetDay.setDate(targetDay.getDate() + 3);

  const invoices = await prisma.creditCardInvoice.findMany({
    where: {
      due_date: {
        gte: startOfDayUtc(targetDay),
        lte: endOfDayUtc(targetDay),
      },
      status: { in: ['OPEN', 'CLOSED', 'PARTIAL'] },
      deleted_at: null,
    },
    include: {
      credit_card: { select: { name: true } },
    },
  });

  let count = 0;

  for (const invoice of invoices) {
    // Find all ADMIN members of this tenant
    const admins = await prisma.tenantMember.findMany({
      where: {
        tenant_id: invoice.tenant_id,
        role: 'ADMIN',
        deleted_at: null,
      },
      select: { user_id: true },
    });

    for (const admin of admins) {
      // Avoid duplicate notifications for the same invoice + user + day
      const existing = await prisma.notification.findFirst({
        where: {
          tenant_id: invoice.tenant_id,
          user_id: admin.user_id,
          type: 'INVOICE_DUE',
          created_at: {
            gte: startOfDayUtc(today),
            lte: endOfDayUtc(today),
          },
          metadata: {
            path: ['invoice_id'],
            equals: invoice.id,
          },
          deleted_at: null,
        },
      });

      if (existing !== null) continue;

      await prisma.notification.create({
        data: {
          tenant_id: invoice.tenant_id,
          user_id: admin.user_id,
          type: 'INVOICE_DUE',
          title: 'Fatura próxima do vencimento',
          body: `A fatura do cartão "${invoice.credit_card.name}" vence em 3 dias (${targetDay.toISOString().slice(0, 10)}).`,
          metadata: {
            invoice_id: invoice.id,
            due_date: invoice.due_date.toISOString(),
            credit_card_id: invoice.credit_card_id,
          },
        },
      });

      count++;
    }
  }

  return count;
}

/**
 * Generate BUDGET_WARNING and BUDGET_EXCEEDED notifications for the current
 * month's budgets where actual spend is >= 80% or >= 100% of planned_amount.
 */
async function generateBudgetNotifications(today: Date): Promise<number> {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1; // 1-based

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  // Fetch all budget items for the current month
  const budgetItems = await prisma.budgetItem.findMany({
    where: {
      deleted_at: null,
      budget: {
        year,
        month,
        deleted_at: null,
      },
    },
    include: {
      budget: { select: { id: true, tenant_id: true } },
      category: { select: { id: true, name: true } },
    },
  });

  let count = 0;

  for (const item of budgetItems) {
    const tenantId = item.budget.tenant_id;

    // Aggregate actual spend for this category in the current month
    const aggregate = await prisma.transaction.aggregate({
      where: {
        tenant_id: tenantId,
        category_id: item.category_id,
        type: 'EXPENSE',
        status: 'REALIZADO',
        date: { gte: monthStart, lte: monthEnd },
        deleted_at: null,
      },
      _sum: { amount: true },
    });

    const actualSpend = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const planned = item.planned_amount;

    if (planned.lte(0)) continue;

    const ratio = actualSpend.div(planned).toNumber();

    let notificationType: 'BUDGET_WARNING' | 'BUDGET_EXCEEDED' | null = null;
    let title = '';
    let body = '';

    if (ratio >= 1.0) {
      notificationType = 'BUDGET_EXCEEDED';
      title = 'Orçamento excedido';
      body = `O orçamento da categoria "${item.category.name}" foi excedido (${(ratio * 100).toFixed(0)}% utilizado).`;
    } else if (ratio >= 0.8) {
      notificationType = 'BUDGET_WARNING';
      title = 'Alerta de orçamento';
      body = `O orçamento da categoria "${item.category.name}" atingiu ${(ratio * 100).toFixed(0)}% do limite.`;
    }

    if (notificationType === null) continue;

    // Find all ADMIN members of this tenant
    const admins = await prisma.tenantMember.findMany({
      where: {
        tenant_id: tenantId,
        role: 'ADMIN',
        deleted_at: null,
      },
      select: { user_id: true },
    });

    for (const admin of admins) {
      // Avoid duplicates: only one notification per type + category + user + day
      const existing = await prisma.notification.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: admin.user_id,
          type: notificationType,
          created_at: {
            gte: startOfDayUtc(today),
            lte: endOfDayUtc(today),
          },
          metadata: {
            path: ['budget_item_id'],
            equals: item.id,
          },
          deleted_at: null,
        },
      });

      if (existing !== null) continue;

      await prisma.notification.create({
        data: {
          tenant_id: tenantId,
          user_id: admin.user_id,
          type: notificationType,
          title,
          body,
          metadata: {
            budget_id: item.budget_id,
            budget_item_id: item.id,
            category_id: item.category_id,
            category_name: item.category.name,
            planned_amount: planned.toString(),
            actual_spend: actualSpend.toString(),
            ratio: ratio.toFixed(4),
          },
        },
      });

      count++;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

async function runNotificationGenerator(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  console.log('[CRON][NotificationGenerator] Starting notification generation...');

  const [invoiceCount, budgetCount] = await Promise.all([
    generateInvoiceDueNotifications(today).catch((err) => {
      console.error('[CRON][NotificationGenerator] INVOICE_DUE generation failed:', err);
      return 0;
    }),
    generateBudgetNotifications(today).catch((err) => {
      console.error('[CRON][NotificationGenerator] Budget notification generation failed:', err);
      return 0;
    }),
  ]);

  console.log(
    `[CRON][NotificationGenerator] Done. Created ${invoiceCount} INVOICE_DUE, ${budgetCount} BUDGET notifications.`,
  );
}

// ---------------------------------------------------------------------------
// Job starter
// ---------------------------------------------------------------------------

/**
 * Notification Generator — runs daily at 08:00 America/Sao_Paulo.
 *
 * Generates:
 * - INVOICE_DUE notifications for invoices due in 3 days
 * - BUDGET_WARNING notifications when actual spend >= 80% of planned amount
 * - BUDGET_EXCEEDED notifications when actual spend >= 100% of planned amount
 */
export function startNotificationGeneratorJob(): void {
  cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        await runNotificationGenerator();
      } catch (err) {
        console.error('[CRON][NotificationGenerator] Job failed:', err);
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );

  console.log(
    '[CRON] Notification generator job scheduled (daily at 08:00 BRT).',
  );
}
