import {
  Prisma,
  type CreditCard,
  type CreditCardInvoice,
  type InvoicePayment,
  type PrismaClient,
  type InvoiceStatus,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

export interface CreateInvoicePaymentData {
  tenant_id: string;
  invoice_id: string;
  amount: Prisma.Decimal;
  paid_at: Date;
  account_id: string;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Invoice period calculation helper
// ---------------------------------------------------------------------------

/**
 * Calculate the invoice period dates from the card's closing_day and due_day
 * and a given purchase date.
 *
 * Rules (São Paulo timezone — caller must ensure purchaseDate is local):
 *   - If purchaseDate.day <= closing_day → current month's invoice
 *   - Otherwise → next month's invoice
 */
/** Create a UTC midnight Date from year/month(0-indexed)/day components. */
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function calculateInvoicePeriod(
  card: { closing_day: number; due_day: number },
  purchaseDate: Date,
): { period_start: Date; period_end: Date; due_date: Date } {
  // Use UTC components so the result is timezone-independent
  const purchaseDay = purchaseDate.getUTCDate();
  const purchaseMonth = purchaseDate.getUTCMonth(); // 0-indexed
  const purchaseYear = purchaseDate.getUTCFullYear();

  let periodEnd: Date;

  if (purchaseDay <= card.closing_day) {
    // Purchase is on or before closing day of current month → current invoice
    periodEnd = utcDate(purchaseYear, purchaseMonth, card.closing_day);
  } else {
    // Purchase is after closing day → next month's invoice
    periodEnd = utcDate(purchaseYear, purchaseMonth + 1, card.closing_day);
  }

  // period_start = day after previous period_end  (closing_day+1 of previous month)
  const periodStart = utcDate(
    periodEnd.getUTCFullYear(),
    periodEnd.getUTCMonth() - 1,
    card.closing_day + 1,
  );

  // due_date = due_day of the month after period_end
  const dueDate = utcDate(
    periodEnd.getUTCFullYear(),
    periodEnd.getUTCMonth() + 1,
    card.due_day,
  );

  return { period_start: periodStart, period_end: periodEnd, due_date: dueDate };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const creditCardsRepository = {
  // -------------------------------------------------------------------------
  // Credit Card CRUD
  // -------------------------------------------------------------------------

  async findAll(tenantId: string, includeInactive = false): Promise<CreditCard[]> {
    return prisma.creditCard.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: { created_at: 'asc' },
    });
  },

  async findById(id: string, tenantId: string): Promise<CreditCard | null> {
    return prisma.creditCard.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });
  },

  async findPrincipalCards(tenantId: string): Promise<CreditCard[]> {
    return prisma.creditCard.findMany({
      where: { tenant_id: tenantId, parent_card_id: null, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
  },

  async countPrincipalCards(tenantId: string): Promise<number> {
    return prisma.creditCard.count({
      where: { tenant_id: tenantId, parent_card_id: null, deleted_at: null },
    });
  },

  async create(
    tx: PrismaTransactionClient,
    data: Prisma.CreditCardUncheckedCreateInput,
  ): Promise<CreditCard> {
    return tx.creditCard.create({ data });
  },

  async update(
    id: string,
    tenantId: string,
    data: Prisma.CreditCardUncheckedUpdateInput,
  ): Promise<CreditCard> {
    return prisma.creditCard.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  async softDelete(id: string, tenantId: string): Promise<CreditCard> {
    return prisma.creditCard.update({
      where: { id },
      data: { deleted_at: new Date(), tenant_id: tenantId },
    });
  },

  async updateLimit(
    id: string,
    tenantId: string,
    limitUsed: Prisma.Decimal,
    limitAvailable: Prisma.Decimal,
  ): Promise<CreditCard> {
    return prisma.creditCard.update({
      where: { id },
      data: { limit_used: limitUsed, limit_available: limitAvailable, tenant_id: tenantId },
    });
  },

  /**
   * Increase limit_used and decrease limit_available on a principal card.
   * Uses atomic Prisma increment/decrement to avoid race conditions.
   */
  async blockLimit(
    principalCardId: string,
    tenantId: string,
    amount: Prisma.Decimal,
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const client = tx ?? prisma;
    await client.creditCard.update({
      where: { id: principalCardId, tenant_id: tenantId },
      data: {
        limit_used: { increment: amount },
        limit_available: { decrement: amount },
      },
    });
  },

  /**
   * Decrease limit_used and increase limit_available on a principal card.
   * Uses atomic Prisma increment/decrement to avoid race conditions.
   */
  async releaseLimit(
    principalCardId: string,
    tenantId: string,
    amount: Prisma.Decimal,
    tx?: PrismaTransactionClient,
  ): Promise<void> {
    const client = tx ?? prisma;
    await client.creditCard.update({
      where: { id: principalCardId, tenant_id: tenantId },
      data: {
        limit_used: { decrement: amount },
        limit_available: { increment: amount },
      },
    });
  },

  // -------------------------------------------------------------------------
  // Invoice queries
  // -------------------------------------------------------------------------

  async findCurrentInvoice(
    creditCardId: string,
    tenantId: string,
    purchaseDate: Date,
  ): Promise<CreditCardInvoice | null> {
    return prisma.creditCardInvoice.findFirst({
      where: {
        credit_card_id: creditCardId,
        tenant_id: tenantId,
        status: 'OPEN',
        period_start: { lte: purchaseDate },
        period_end: { gte: purchaseDate },
        deleted_at: null,
      },
    });
  },

  /**
   * Find an existing OPEN invoice covering the purchaseDate, or create a new one.
   * Must be called inside a Prisma $transaction.
   */
  async findOrCreateInvoice(
    creditCardId: string,
    tenantId: string,
    purchaseDate: Date,
    tx: PrismaTransactionClient,
  ): Promise<CreditCardInvoice> {
    // Fetch card to determine closing/due days and whether it is an additional card
    const card = await tx.creditCard.findFirst({
      where: { id: creditCardId, tenant_id: tenantId, deleted_at: null },
      select: { closing_day: true, due_day: true, parent_card_id: true },
    });

    if (card === null) {
      throw new Error('Cartão de crédito não encontrado ao resolver fatura.');
    }

    // 1. Check if purchaseDate already falls inside an existing invoice for this card
    const covering = await tx.creditCardInvoice.findFirst({
      where: {
        credit_card_id: creditCardId,
        tenant_id: tenantId,
        deleted_at: null,
        period_start: { lte: purchaseDate },
        period_end:   { gte: purchaseDate },
      },
      orderBy: { period_end: 'desc' },
    });
    if (covering !== null) {
      return covering;
    }

    const DAY = 24 * 60 * 60 * 1000;

    // 2. ADDITIONAL CARD — mirror the parent card's invoice dates exactly.
    //    Find the parent invoice that covers purchaseDate (or create it first),
    //    then create the child invoice with the same period_start/period_end/due_date.
    if (card.parent_card_id !== null) {
      // Resolve the parent's invoice for this date (recursive — will create if needed)
      const parentInvoice = await this.findOrCreateInvoice(
        card.parent_card_id,
        tenantId,
        purchaseDate,
        tx,
      );

      // Use upsert on the unique key (credit_card_id, period_start) to handle:
      // - concurrent inserts (race condition)
      // - soft-deleted invoices from a previous import that was deleted and re-imported
      return tx.creditCardInvoice.upsert({
        where: {
          credit_card_id_period_start: {
            credit_card_id: creditCardId,
            period_start: parentInvoice.period_start,
          },
        },
        create: {
          tenant_id: tenantId,
          credit_card_id: creditCardId,
          period_start: parentInvoice.period_start,
          period_end:   parentInvoice.period_end,
          due_date:     parentInvoice.due_date,
          status: 'OPEN',
          total_amount: new Prisma.Decimal(0),
          total_paid:   new Prisma.Decimal(0),
        },
        update: {
          // Restore a soft-deleted invoice and reset its dates to match the parent
          deleted_at:  null,
          period_end:  parentInvoice.period_end,
          due_date:    parentInvoice.due_date,
          status:      'OPEN',
        },
      });
    }

    // 3. PRINCIPAL CARD — calculate period_end from closing_day
    const { period_end, due_date } = calculateInvoicePeriod(card, purchaseDate);

    // period_start = day after the most recent non-deleted previous invoice's period_end.
    // Falls back to closing_day-based calculation for the very first invoice.
    const previousInvoice = await tx.creditCardInvoice.findFirst({
      where: {
        credit_card_id: creditCardId,
        tenant_id: tenantId,
        deleted_at: null,
        period_end: { lt: period_end },
      },
      orderBy: { period_end: 'desc' },
    });

    let period_start: Date;
    if (previousInvoice !== null) {
      period_start = new Date(previousInvoice.period_end.getTime() + DAY);
    } else {
      const { period_start: calcStart } = calculateInvoicePeriod(card, purchaseDate);
      period_start = calcStart;
    }

    // Use upsert on the unique key to survive re-imports over soft-deleted invoices
    return tx.creditCardInvoice.upsert({
      where: {
        credit_card_id_period_start: {
          credit_card_id: creditCardId,
          period_start,
        },
      },
      create: {
        tenant_id: tenantId,
        credit_card_id: creditCardId,
        period_start,
        period_end,
        due_date,
        status: 'OPEN',
        total_amount: new Prisma.Decimal(0),
        total_paid:   new Prisma.Decimal(0),
      },
      update: {
        // Restore a soft-deleted invoice and reset its dates
        deleted_at: null,
        period_end,
        due_date,
        status: 'OPEN',
      },
    });
  },

  async findInvoiceById(
    id: string,
    tenantId: string,
  ): Promise<CreditCardInvoice | null> {
    return prisma.creditCardInvoice.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });
  },

  async findInvoicesByCard(
    cardId: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ invoices: CreditCardInvoice[]; total: number }> {
    const where = {
      credit_card_id: cardId,
      tenant_id: tenantId,
      deleted_at: null,
    };

    const skip = (page - 1) * pageSize;

    const [invoices, total] = await prisma.$transaction([
      prisma.creditCardInvoice.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { period_start: 'desc' },
        include: {
          transactions: {
            where: { deleted_at: null, status: { not: 'CANCELADO' } },
            select: { amount: true },
          },
        },
      }),
      prisma.creditCardInvoice.count({ where }),
    ]);

    // Recalcula total_amount a partir das transações ativas (ignora valor desatualizado do banco)
    const invoicesWithTotal = invoices.map((inv) => {
      const realTotal = (inv.transactions as { amount: Prisma.Decimal }[]).reduce(
        (sum, t) => sum.add(t.amount),
        new Prisma.Decimal(0),
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { transactions: _txns, ...invoiceData } = inv as typeof inv & { transactions: unknown[] };
      return { ...invoiceData, total_amount: realTotal };
    });

    return { invoices: invoicesWithTotal as unknown as CreditCardInvoice[], total };
  },

  /**
   * Recalculate invoice.total_amount from active transactions.
   * Must be called inside a Prisma $transaction.
   */
  async recalcInvoiceTotal(
    invoiceId: string,
    tenantId: string,
    tx: PrismaTransactionClient,
  ): Promise<void> {
    const agg = await tx.transaction.aggregate({
      where: {
        credit_card_invoice_id: invoiceId,
        tenant_id: tenantId,
        deleted_at: null,
        status: { not: 'CANCELADO' },
      },
      _sum: { amount: true },
    });
    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: { total_amount: agg._sum.amount ?? new Prisma.Decimal(0) },
    });
  },

  /**
   * Atomically add additionalAmount to invoice.total_amount.
   * Must be called inside a Prisma $transaction.
   */
  async updateInvoiceAmount(
    invoiceId: string,
    tenantId: string,
    additionalAmount: Prisma.Decimal,
    tx: PrismaTransactionClient,
  ): Promise<void> {
    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        total_amount: { increment: additionalAmount },
        tenant_id: tenantId,
      },
    });
  },

  /**
   * Create an InvoicePayment record inside a transaction.
   */
  async createInvoicePayment(
    data: CreateInvoicePaymentData,
    tx: PrismaTransactionClient,
  ): Promise<InvoicePayment> {
    return tx.invoicePayment.create({ data });
  },

  /**
   * Add paidAmount to invoice.total_paid and recalculate status.
   * Returns the updated invoice.
   * Must be called inside a Prisma $transaction.
   */
  async updateInvoicePaidAmount(
    invoiceId: string,
    tenantId: string,
    paidAmount: Prisma.Decimal,
    tx: PrismaTransactionClient,
  ): Promise<CreditCardInvoice> {
    // First increment the total_paid
    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: { total_paid: { increment: paidAmount }, tenant_id: tenantId },
    });

    // Re-read to get current values for status determination
    const updated = await tx.creditCardInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    // Determine new status
    let newStatus: InvoiceStatus;
    if (updated.total_paid.gte(updated.total_amount)) {
      newStatus = 'PAID';
    } else if (updated.total_paid.gt(new Prisma.Decimal(0))) {
      newStatus = 'PARTIAL';
    } else {
      newStatus = updated.status;
    }

    if (newStatus !== updated.status) {
      return tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: { status: newStatus },
      });
    }

    return updated;
  },

  /**
   * Check whether a card has any non-cancelled transactions (used before delete).
   * Empty auto-created OPEN invoices do NOT block deletion.
   */
  async hasTransactions(creditCardId: string, tenantId: string): Promise<boolean> {
    const count = await prisma.transaction.count({
      where: {
        credit_card_id: creditCardId,
        tenant_id: tenantId,
        status: { not: 'CANCELADO' },
        deleted_at: null,
      },
    });
    return count > 0;
  },

  /**
   * Soft-delete all invoices for a card (used when deleting the card).
   */
  async softDeleteInvoicesByCard(
    creditCardId: string,
    tenantId: string,
    tx: PrismaTransactionClient,
  ): Promise<void> {
    await tx.creditCardInvoice.updateMany({
      where: { credit_card_id: creditCardId, tenant_id: tenantId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  },
};
