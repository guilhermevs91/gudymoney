import { Prisma, type PrismaClient, type CreditCardInvoice } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import {
  NotFoundError,
  PlanLimitError,
  ValidationError,
} from '../../lib/errors';
import { checkPlanLimit, FEATURE_KEYS } from '../../lib/plan-limits';
import { creditCardsRepository } from './credit-cards.repository';
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
  PayInvoiceInput,
  CreateInstallmentInput,
  UpdateInvoiceInput,
} from './credit-cards.schemas';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

/** Return the "now" date in São Paulo local time, stripped to midnight so JS
 *  date arithmetic uses local calendar days rather than UTC. */
/** Return today as a UTC midnight Date in São Paulo calendar day. */
function nowInSaoPaulo(): Date {
  const spStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  // spStr is YYYY-MM-DD in SP timezone
  const [y, m, d] = spStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Convert a YYYY-MM-DD string to a UTC midnight Date. */
function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// ---------------------------------------------------------------------------
// Credit Card service
// ---------------------------------------------------------------------------

export const creditCardsService = {
  // -------------------------------------------------------------------------
  // List cards
  // -------------------------------------------------------------------------

  async listCards(tenantId: string, includeInactive = false) {
    const cards = await creditCardsRepository.findAll(tenantId, includeInactive);
    if (cards.length === 0) return { data: [], total: 0 };

    const cardIds = cards.map((c) => c.id);

    // Fetch all OPEN/PARTIAL invoices with transactions to recalculate totals
    const openInvoices = await prisma.creditCardInvoice.findMany({
      where: {
        credit_card_id: { in: cardIds },
        tenant_id: tenantId,
        status: { in: ['OPEN', 'PARTIAL'] },
        deleted_at: null,
      },
      orderBy: { due_date: 'asc' },
      include: {
        transactions: {
          where: { deleted_at: null, status: { not: 'CANCELADO' } },
          select: { amount: true },
        },
      },
    });

    // Per invoice: real total from transactions
    const invoiceRealTotal = new Map<string, number>();
    for (const inv of openInvoices) {
      const total = (inv.transactions as { amount: { toNumber(): number } }[])
        .reduce((s, t) => s + t.amount.toNumber(), 0);
      invoiceRealTotal.set(inv.id, total);
    }

    // Per card: earliest due_date OPEN invoice (most current unpaid)
    const currentInvoiceByCardId = new Map<string, typeof openInvoices[0] & { real_total: number }>();
    for (const inv of openInvoices) {
      if (!currentInvoiceByCardId.has(inv.credit_card_id)) {
        currentInvoiceByCardId.set(inv.credit_card_id, {
          ...inv,
          real_total: invoiceRealTotal.get(inv.id) ?? 0,
        });
      }
    }

    // Per card: limit_used = sum of all open invoice totals (principal only, children add to parent)
    const limitUsedByCardId = new Map<string, number>();
    for (const inv of openInvoices) {
      const prev = limitUsedByCardId.get(inv.credit_card_id) ?? 0;
      limitUsedByCardId.set(inv.credit_card_id, prev + (invoiceRealTotal.get(inv.id) ?? 0));
    }

    // For principal cards, also sum child card usage into their limit_used
    const childCards = cards.filter((c) => c.parent_card_id !== null);
    for (const child of childCards) {
      const parentId = child.parent_card_id!;
      const childUsed = limitUsedByCardId.get(child.id) ?? 0;
      limitUsedByCardId.set(parentId, (limitUsedByCardId.get(parentId) ?? 0) + childUsed);
    }

    const data = cards.map((card) => {
      const limitUsed = limitUsedByCardId.get(card.id) ?? 0;
      const limitTotal = Number(card.limit_total);
      const currentInv = currentInvoiceByCardId.get(card.id) ?? null;
      return {
        ...card,
        limit_used: limitUsed,
        limit_available: Math.max(0, limitTotal - limitUsed),
        current_invoice: currentInv
          ? { ...currentInv, total_amount: currentInv.real_total }
          : null,
      };
    });

    return { data, total: data.length };
  },

  // -------------------------------------------------------------------------
  // Get single card
  // -------------------------------------------------------------------------

  async getCard(id: string, tenantId: string) {
    const card = await creditCardsRepository.findById(id, tenantId);
    if (card === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    // Attach child cards if this is a principal card
    const childCards = card.parent_card_id === null
      ? await prisma.creditCard.findMany({
          where: { parent_card_id: id, tenant_id: tenantId, deleted_at: null },
          orderBy: { created_at: 'asc' },
        })
      : [];

    // Recalculate limit_used from open invoices (avoids stale increment/decrement drift)
    // limit_used = sum of total_amount of all OPEN invoices across principal + child cards
    const principalId = card.parent_card_id ?? id;
    const allCardIds = [principalId, ...childCards.map((c) => c.id)];
    const openInvoices = await prisma.creditCardInvoice.findMany({
      where: {
        credit_card_id: { in: allCardIds },
        tenant_id: tenantId,
        status: { in: ['OPEN', 'PARTIAL'] },
        deleted_at: null,
      },
      include: {
        transactions: {
          where: { deleted_at: null, status: { not: 'CANCELADO' } },
          select: { amount: true },
        },
      },
    });

    const limitTotal = Number(card.parent_card_id
      ? (await prisma.creditCard.findFirst({ where: { id: principalId }, select: { limit_total: true } }))?.limit_total ?? 0
      : card.limit_total);

    const limitUsed = openInvoices.reduce((sum, inv) =>
      sum + (inv.transactions as { amount: { toNumber(): number } }[]).reduce((s, t) => s + t.amount.toNumber(), 0),
      0,
    );
    const limitAvailable = Math.max(0, limitTotal - limitUsed);

    // Also recalc limit_used per child card (their individual usage)
    const childCardsWithUsage = await Promise.all(childCards.map(async (child) => {
      const childInvoices = openInvoices.filter((inv) => inv.credit_card_id === child.id);
      const childUsed = childInvoices.reduce((sum, inv) =>
        sum + (inv.transactions as { amount: { toNumber(): number } }[]).reduce((s, t) => s + t.amount.toNumber(), 0),
        0,
      );
      return { ...child, limit_used: childUsed };
    }));

    return {
      data: {
        ...card,
        limit_used: limitUsed,
        limit_available: limitAvailable,
        child_cards: childCardsWithUsage,
      },
    };
  },

  // -------------------------------------------------------------------------
  // Create credit card
  // -------------------------------------------------------------------------

  async createCard(
    tenantId: string,
    userId: string,
    plan: string,
    data: CreateCreditCardInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Plan limit check (only for principal cards)
    if (data.parent_card_id == null) {
      const currentCount = await creditCardsRepository.countPrincipalCards(tenantId);
      const check = await checkPlanLimit(
        prisma as PrismaClient,
        plan as 'FREE' | 'PAID' | 'DEV',
        FEATURE_KEYS.MAX_CREDIT_CARDS,
        currentCount,
      );
      if (!check.allowed) {
        throw new PlanLimitError(
          `Limite do plano atingido: máximo de ${check.limit} cartão(ões) de crédito (atual: ${check.current}).`,
        );
      }
    }

    // 2. Validate parent card (if additional card)
    let parentCard: Awaited<ReturnType<typeof creditCardsRepository.findById>> | null = null;
    if (data.parent_card_id != null) {
      parentCard = await creditCardsRepository.findById(data.parent_card_id, tenantId);
      if (parentCard === null) {
        throw new NotFoundError('Cartão principal não encontrado.');
      }
      if (parentCard.parent_card_id !== null) {
        throw new ValidationError(
          'Não é possível criar um cartão adicional de outro cartão adicional.',
        );
      }
    }

    const today = nowInSaoPaulo();

    let createdCard: Awaited<ReturnType<typeof creditCardsRepository.findById>>;

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 3a. Create INTERNAL account
      const internalAccount = await tx.account.create({
        data: {
          tenant_id: tenantId,
          name: `Cartão ${data.name}`,
          type: 'INTERNAL',
          initial_balance: new Prisma.Decimal(0),
          is_active: true,
        },
      });

      // 3b. Create the credit card
      const limitTotal = new Prisma.Decimal(data.limit_total);

      const card = await creditCardsRepository.create(tx, {
        tenant_id: tenantId,
        name: data.name,
        brand: data.brand ?? null,
        last_four: data.last_four ?? null,
        limit_total: data.parent_card_id != null ? new Prisma.Decimal(0) : limitTotal,
        limit_used: new Prisma.Decimal(0),
        limit_available: data.parent_card_id != null ? new Prisma.Decimal(0) : limitTotal,
        closing_day: data.parent_card_id != null
          ? (parentCard!.closing_day)
          : data.closing_day,
        due_day: data.parent_card_id != null
          ? (parentCard!.due_day)
          : data.due_day,
        color: data.color ?? null,
        parent_card_id: data.parent_card_id ?? null,
        internal_account_id: internalAccount.id,
        is_active: true,
      });

      // 3c. Update the internal account to link back to this card
      await tx.account.update({
        where: { id: internalAccount.id },
        data: { credit_card_id: card.id },
      });

      // 3d. Generate first OPEN invoice for today's date
      await creditCardsRepository.findOrCreateInvoice(
        card.id,
        tenantId,
        today,
        tx,
      );

      // 3e. Audit log
      await createAuditLog({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        userId,
        entityType: 'CreditCard',
        entityId: card.id,
        action: 'CREATE',
        afterData: {
          name: card.name,
          limit_total: card.limit_total.toString(),
          parent_card_id: card.parent_card_id,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      createdCard = card;
    });

    return { data: createdCard! };
  },

  // -------------------------------------------------------------------------
  // Update credit card
  // -------------------------------------------------------------------------

  async updateCard(
    id: string,
    tenantId: string,
    userId: string,
    data: UpdateCreditCardInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existing = await creditCardsRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    const updated = await creditCardsRepository.update(id, tenantId, {
      name: data.name,
      brand: data.brand,
      last_four: data.last_four,
      color: data.color,
      is_active: data.is_active,
    });

    await createAuditLog({
      prisma: prisma as PrismaClient,
      tenantId,
      userId,
      entityType: 'CreditCard',
      entityId: id,
      action: 'UPDATE',
      beforeData: {
        name: existing.name,
        brand: existing.brand,
        last_four: existing.last_four,
        color: existing.color,
        is_active: existing.is_active,
      },
      afterData: data as unknown as Record<string, unknown>,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    return { data: updated };
  },

  // -------------------------------------------------------------------------
  // Delete credit card
  // -------------------------------------------------------------------------

  async deleteCard(
    id: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const existing = await creditCardsRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    const hasTxns = await creditCardsRepository.hasTransactions(id, tenantId);
    if (hasTxns) {
      throw new ValidationError(
        'Não é possível excluir um cartão que possui transações. Cancele ou exclua as transações primeiro.',
      );
    }

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // Soft-delete all invoices
      await creditCardsRepository.softDeleteInvoicesByCard(id, tenantId, tx);

      // Soft-delete the card
      await tx.creditCard.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      // Soft-delete the internal account
      await tx.account.updateMany({
        where: { credit_card_id: id, tenant_id: tenantId, deleted_at: null },
        data: { deleted_at: new Date() },
      });

      await createAuditLog({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        userId,
        entityType: 'CreditCard',
        entityId: id,
        action: 'DELETE',
        beforeData: { name: existing.name },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });
  },

  // -------------------------------------------------------------------------
  // List invoices for a card
  // -------------------------------------------------------------------------

  async listInvoices(
    cardId: string,
    tenantId: string,
    page = 1,
    pageSize = 20,
  ) {
    const card = await creditCardsRepository.findById(cardId, tenantId);
    if (card === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    // For principal cards, also collect child card ids so their invoices appear grouped
    const childCardIds: string[] = [];
    if (card.parent_card_id === null) {
      const children = await prisma.creditCard.findMany({
        where: { parent_card_id: cardId, tenant_id: tenantId, deleted_at: null },
        select: { id: true },
      });
      childCardIds.push(...children.map((c) => c.id));
    }

    const allCardIds = [cardId, ...childCardIds];

    if (allCardIds.length === 1) {
      const { invoices, total } = await creditCardsRepository.findInvoicesByCard(
        cardId, tenantId, page, pageSize,
      );
      return { data: invoices, total };
    }

    // Merge invoices by period: group child invoices into the parent invoice of the same period
    const skip = (page - 1) * pageSize;
    const parentInvoices = await prisma.creditCardInvoice.findMany({
      where: { credit_card_id: cardId, tenant_id: tenantId, deleted_at: null },
      orderBy: { period_start: 'desc' },
      skip,
      take: pageSize,
      include: {
        transactions: {
          where: { deleted_at: null, status: { not: 'CANCELADO' } },
          select: { amount: true },
        },
      },
    });
    const total = await prisma.creditCardInvoice.count({
      where: { credit_card_id: cardId, tenant_id: tenantId, deleted_at: null },
    });

    // Fetch child invoices for the same periods and aggregate totals (recalculated from transactions)
    const childInvoices = await prisma.creditCardInvoice.findMany({
      where: { credit_card_id: { in: childCardIds }, tenant_id: tenantId, deleted_at: null },
      include: {
        transactions: {
          where: { deleted_at: null, status: { not: 'CANCELADO' } },
          select: { amount: true },
        },
      },
    });

    // Build merged view: for each parent invoice, sum from transactions (not stale total_amount)
    const mergedInvoices = parentInvoices.map((inv) => {
      const periodStart = inv.period_start.toISOString().slice(0, 10);
      const parentTotal = (inv.transactions as { amount: { toNumber(): number } }[])
        .reduce((s, t) => s + t.amount.toNumber(), 0);
      const matching = childInvoices.filter(
        (ci) => ci.period_start.toISOString().slice(0, 10) === periodStart,
      );
      const childTotal = matching.reduce(
        (s, ci) => s + (ci.transactions as { amount: { toNumber(): number } }[]).reduce((ss, t) => ss + t.amount.toNumber(), 0),
        0,
      );
      const childPaid = matching.reduce((s, ci) => s + Number(ci.total_paid), 0);
      const childIds = matching.map((ci) => ci.id);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { transactions: _txns, ...invData } = inv as typeof inv & { transactions: unknown[] };
      return {
        ...invData,
        total_amount: parentTotal + childTotal,
        total_paid: Number(inv.total_paid) + childPaid,
        child_invoice_ids: childIds,
      };
    });

    return { data: mergedInvoices, total };
  },

  // -------------------------------------------------------------------------
  // List transactions for an invoice
  // Finds by credit_card_invoice_id OR by card+date within the invoice period
  // -------------------------------------------------------------------------

  async listInvoiceTransactions(cardId: string, invoiceId: string, tenantId: string) {
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }

    // Collect child card ids if this is a principal card
    const children = await prisma.creditCard.findMany({
      where: { parent_card_id: cardId, tenant_id: tenantId, deleted_at: null },
      select: { id: true },
    });
    const childCardIds = children.map((c) => c.id);
    const allCardIds = [cardId, ...childCardIds];

    // Find all invoice ids covering this period (parent + child invoices)
    const periodInvoices = await prisma.creditCardInvoice.findMany({
      where: {
        credit_card_id: { in: allCardIds },
        tenant_id: tenantId,
        deleted_at: null,
        period_start: {
          gte: new Date(invoice.period_start.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(invoice.period_start.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
    });
    const allInvoiceIds = periodInvoices.map((i) => i.id);

    // Fetch all transactions for this period across all cards in the group
    const transactions = await prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        credit_card_id: { in: allCardIds },
        OR: [
          { credit_card_invoice_id: { in: allInvoiceIds } },
          {
            credit_card_invoice_id: null,
            date: {
              gte: invoice.period_start,
              lte: new Date(invoice.period_end.getTime() + 24 * 60 * 60 * 1000 - 1),
            },
          },
        ],
      },
      orderBy: [{ date: 'asc' }, { created_at: 'asc' }],
      include: {
        category: { select: { id: true, name: true } },
        credit_card: { select: { id: true, name: true, last_four: true, brand: true, parent_card_id: true } },
        installment: { select: { id: true, total_installments: true } },
      },
    });

    return { data: transactions };
  },

  // -------------------------------------------------------------------------
  // Get single invoice
  // -------------------------------------------------------------------------

  async getInvoice(cardId: string, invoiceId: string, tenantId: string) {
    // Verify card belongs to tenant
    const card = await creditCardsRepository.findById(cardId, tenantId);
    if (card === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }

    return { data: invoice };
  },

  // -------------------------------------------------------------------------
  // Delete invoice and all its records
  // -------------------------------------------------------------------------

  async deleteInvoice(
    cardId: string,
    invoiceId: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }

    const card = await creditCardsRepository.findById(cardId, tenantId);
    if (card === null) throw new NotFoundError('Cartão não encontrado.');
    const principalCardId = card.parent_card_id ?? card.id;

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. Fetch all transactions belonging to this invoice
      const txns = await tx.transaction.findMany({
        where: { credit_card_invoice_id: invoiceId, tenant_id: tenantId, deleted_at: null },
        select: { id: true, amount: true, status: true },
      });

      if (txns.length > 0) {
        const txnIds = txns.map((t) => t.id);

        // 2. Soft-delete installment_items
        await tx.installmentItem.updateMany({
          where: { credit_card_invoice_id: invoiceId, tenant_id: tenantId },
          data: { deleted_at: new Date() },
        });

        // 3. Soft-delete ledger_entries
        await tx.ledgerEntry.updateMany({
          where: { transaction_id: { in: txnIds }, tenant_id: tenantId },
          data: { deleted_at: new Date() },
        });

        // 4. Soft-delete transaction_tags
        await tx.transactionTag.updateMany({
          where: { transaction_id: { in: txnIds }, tenant_id: tenantId },
          data: { deleted_at: new Date() },
        });

        // 5. Soft-delete transactions and release limit for non-cancelled ones
        const activeAmount = txns
          .filter((t) => t.status !== 'CANCELADO')
          .reduce((s, t) => s.add(t.amount), new Prisma.Decimal(0));

        await tx.transaction.updateMany({
          where: { id: { in: txnIds }, tenant_id: tenantId },
          data: { deleted_at: new Date() },
        });

        if (activeAmount.gt(0)) {
          await creditCardsRepository.releaseLimit(principalCardId, tenantId, activeAmount, tx);
        }
      }

      // 6. Soft-delete invoice_payments
      await tx.invoicePayment.updateMany({
        where: { invoice_id: invoiceId, tenant_id: tenantId },
        data: { deleted_at: new Date() },
      });

      // 7. Soft-delete the invoice itself
      await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: { deleted_at: new Date() },
      });

      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'CreditCardInvoice',
        entityId: invoiceId,
        action: 'DELETE',
        beforeData: { period_start: invoice.period_start, period_end: invoice.period_end },
        afterData: null,
        ipAddress,
        userAgent,
      });
    });
  },

  // -------------------------------------------------------------------------
  // Update invoice period/due_date and reassign transactions
  // -------------------------------------------------------------------------

  async updateInvoice(
    cardId: string,
    invoiceId: string,
    tenantId: string,
    userId: string,
    data: UpdateInvoiceInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }

    // Block date changes on child card invoices — dates are controlled by the parent card
    const card = await prisma.creditCard.findFirst({
      where: { id: cardId, tenant_id: tenantId, deleted_at: null },
      select: { parent_card_id: true },
    });
    if (card?.parent_card_id !== null && card?.parent_card_id !== undefined) {
      throw new ValidationError('Faturas de cartões adicionais não podem ter datas alteradas. Edite a fatura no cartão principal.');
    }

    const newPeriodStart = new Date(`${data.period_start}T00:00:00Z`);
    const newPeriodEnd   = new Date(`${data.period_end}T00:00:00Z`);
    const newDueDate     = new Date(`${data.due_date}T00:00:00Z`);

    if (newPeriodEnd <= newPeriodStart) {
      throw new ValidationError('Data de encerramento deve ser posterior ao início.');
    }

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 1. Update the invoice dates
      await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: {
          period_start: newPeriodStart,
          period_end:   newPeriodEnd,
          due_date:     newDueDate,
          updated_at:   new Date(),
        },
      });

      // 2. Re-bind all transactions that fall inside the new period to this invoice.
      //    Also clear the invoice link for transactions previously bound to this
      //    invoice but whose date is now outside the new period.
      await tx.transaction.updateMany({
        where: {
          credit_card_id: cardId,
          tenant_id: tenantId,
          deleted_at: null,
          date: { gte: newPeriodStart, lte: newPeriodEnd },
          // Only reassign transactions that have no invoice or belong to this one
          OR: [
            { credit_card_invoice_id: null },
            { credit_card_invoice_id: invoiceId },
          ],
        },
        data: { credit_card_invoice_id: invoiceId },
      });

      // 3. Detach transactions that were in this invoice but are now outside the period
      await tx.transaction.updateMany({
        where: {
          credit_card_invoice_id: invoiceId,
          tenant_id: tenantId,
          deleted_at: null,
          OR: [
            { date: { lt: newPeriodStart } },
            { date: { gt: newPeriodEnd } },
          ],
        },
        data: { credit_card_invoice_id: null },
      });

      // 4. Recalculate total_amount from what remains
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

      // 5. If period_end changed, adjust the next invoice's period_start to period_end + 1 day
      if (invoice.period_end.getTime() !== newPeriodEnd.getTime()) {
        const nextInvoice = await tx.creditCardInvoice.findFirst({
          where: {
            credit_card_id: cardId,
            tenant_id: tenantId,
            deleted_at: null,
            period_start: { gt: invoice.period_end },
          },
          orderBy: { period_start: 'asc' },
        });
        if (nextInvoice !== null) {
          const nextStart = new Date(newPeriodEnd.getTime() + 24 * 60 * 60 * 1000);
          // Só ajusta se não houver outra fatura com esse period_start (evita unique constraint)
          const collision = await tx.creditCardInvoice.findFirst({
            where: {
              credit_card_id: cardId,
              tenant_id: tenantId,
              deleted_at: null,
              period_start: nextStart,
              id: { not: nextInvoice.id },
            },
            select: { id: true },
          });
          if (collision === null) {
            await tx.creditCardInvoice.update({
              where: { id: nextInvoice.id },
              data: { period_start: nextStart },
            });
          }
        }
      }

      // 6. Propagate new dates to child card invoices that share this same period
      //    Match by overlap with the OLD period (any child invoice whose period overlaps the old range)
      const childCards = await tx.creditCard.findMany({
        where: { parent_card_id: cardId, tenant_id: tenantId, deleted_at: null },
        select: { id: true },
      });
      for (const child of childCards) {
        // Find child invoices whose period overlapped with the old parent period
        const childInvoices = await tx.creditCardInvoice.findMany({
          where: {
            credit_card_id: child.id,
            tenant_id: tenantId,
            deleted_at: null,
            period_start: { lte: invoice.period_end },
            period_end:   { gte: invoice.period_start },
          },
          select: { id: true },
        });
        for (const childInv of childInvoices) {
          const childCollision = await tx.creditCardInvoice.findFirst({
            where: {
              credit_card_id: child.id,
              tenant_id: tenantId,
              deleted_at: null,
              period_start: newPeriodStart,
              id: { not: childInv.id },
            },
            select: { id: true },
          });
          if (childCollision === null) {
            await tx.creditCardInvoice.update({
              where: { id: childInv.id },
              data: { period_start: newPeriodStart, period_end: newPeriodEnd, due_date: newDueDate },
            });
          }
          // Re-bind child card transactions to the updated invoice period
          await tx.transaction.updateMany({
            where: {
              credit_card_id: child.id,
              tenant_id: tenantId,
              deleted_at: null,
              date: { gte: newPeriodStart, lte: newPeriodEnd },
              OR: [{ credit_card_invoice_id: null }, { credit_card_invoice_id: childInv.id }],
            },
            data: { credit_card_invoice_id: childInv.id },
          });
          // Detach child transactions now outside the period
          await tx.transaction.updateMany({
            where: {
              credit_card_invoice_id: childInv.id,
              tenant_id: tenantId,
              deleted_at: null,
              OR: [{ date: { lt: newPeriodStart } }, { date: { gt: newPeriodEnd } }],
            },
            data: { credit_card_invoice_id: null },
          });
        }
      }

      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'CreditCardInvoice',
        entityId: invoiceId,
        action: 'UPDATE',
        beforeData: {
          period_start: invoice.period_start,
          period_end:   invoice.period_end,
          due_date:     invoice.due_date,
        },
        afterData: { period_start: newPeriodStart, period_end: newPeriodEnd, due_date: newDueDate },
        ipAddress,
        userAgent,
      });
    });

    const updated = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    return { data: updated };
  },

  // -------------------------------------------------------------------------
  // Pay invoice
  // -------------------------------------------------------------------------

  async payInvoice(
    cardId: string,
    invoiceId: string,
    tenantId: string,
    userId: string,
    data: PayInvoiceInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Find and validate invoice
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }
    if (!['OPEN', 'PARTIAL', 'CLOSED'].includes(invoice.status)) {
      throw new ValidationError(
        'Apenas faturas em aberto, parciais ou fechadas podem ser pagas.',
      );
    }

    // 2. Validate payment account belongs to tenant (not INTERNAL)
    const paymentAccount = await prisma.account.findFirst({
      where: {
        id: data.account_id,
        tenant_id: tenantId,
        deleted_at: null,
        type: { not: 'INTERNAL' },
      },
      select: { id: true },
    });
    if (paymentAccount === null) {
      throw new NotFoundError('Conta para pagamento não encontrada.');
    }

    // 3. Get the card's internal account
    const card = await creditCardsRepository.findById(cardId, tenantId);
    if (card === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }

    // Each card (principal or additional) has its own internal_account_id.
    // For additional cards, we still use their own internal account since each
    // card has its own INTERNAL account linked via internal_account_id.
    const internalAccountId = card.internal_account_id;
    if (!internalAccountId) {
      throw new ValidationError('Conta interna do cartão não encontrada.');
    }

    const internalAccount = { id: internalAccountId };

    const paymentAmount = new Prisma.Decimal(data.amount);
    const paidAt = data.paid_at != null ? new Date(data.paid_at) : new Date();

    let updatedInvoice: Awaited<ReturnType<typeof creditCardsRepository.updateInvoicePaidAmount>>;

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 4a. Create InvoicePayment record
      await creditCardsRepository.createInvoicePayment(
        {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          amount: paymentAmount,
          paid_at: paidAt,
          account_id: data.account_id,
          notes: data.notes ?? null,
        },
        tx,
      );

      // 4b. Update invoice total_paid and status
      updatedInvoice = await creditCardsRepository.updateInvoicePaidAmount(
        invoiceId,
        tenantId,
        paymentAmount,
        tx,
      );

      // 4c. Create a parent transaction for the payment (to anchor ledger entries)
      // Nota: NÃO associar credit_card_invoice_id para não aparecer como lançamento da fatura
      const paymentTransaction = await tx.transaction.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          type: 'EXPENSE',
          status: 'REALIZADO',
          amount: paymentAmount,
          description: `Pagamento de fatura`,
          date: paidAt,
          account_id: data.account_id,
          notes: data.notes ?? null,
          is_reconciled: false,
        },
      });

      // 4d. Create ledger entries: DEBIT payment account, CREDIT internal account
      await tx.ledgerEntry.create({
        data: {
          tenant_id: tenantId,
          account_id: data.account_id,
          transaction_id: paymentTransaction.id,
          type: 'DEBIT',
          amount: paymentAmount,
          status: 'REALIZADO',
        },
      });
      await tx.ledgerEntry.create({
        data: {
          tenant_id: tenantId,
          account_id: internalAccount.id,
          transaction_id: paymentTransaction.id,
          type: 'CREDIT',
          amount: paymentAmount,
          status: 'REALIZADO',
        },
      });

      // 4e. If invoice is now PAID → release limit on principal card
      if (updatedInvoice.status === 'PAID') {
        // Find the principal card (could be the card itself or its parent)
        const principalCardId = card.parent_card_id ?? card.id;
        await creditCardsRepository.releaseLimit(
          principalCardId,
          tenantId,
          invoice.total_amount,
          tx,
        );
      }

      // 4f. Audit log
      await createAuditLog({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        userId,
        entityType: 'InvoicePayment',
        entityId: invoiceId,
        action: 'CREATE',
        afterData: {
          invoice_id: invoiceId,
          amount: data.amount,
          paid_at: paidAt.toISOString(),
          account_id: data.account_id,
          new_status: updatedInvoice.status,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });

    return { data: updatedInvoice! };
  },

  // -------------------------------------------------------------------------
  // List invoice payments
  // -------------------------------------------------------------------------

  async listInvoicePayments(cardId: string, invoiceId: string, tenantId: string) {
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }
    const payments = await prisma.invoicePayment.findMany({
      where: { invoice_id: invoiceId, tenant_id: tenantId },
      orderBy: { paid_at: 'desc' },
      select: { id: true, amount: true, paid_at: true, account_id: true, notes: true },
    });
    return { data: payments };
  },

  // -------------------------------------------------------------------------
  // Reverse invoice payment (estorno)
  // -------------------------------------------------------------------------

  async reverseInvoicePayment(
    cardId: string,
    invoiceId: string,
    paymentId: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Find invoice
    const invoice = await creditCardsRepository.findInvoiceById(invoiceId, tenantId);
    if (invoice === null || invoice.credit_card_id !== cardId) {
      throw new NotFoundError('Fatura não encontrada.');
    }

    // 2. Find payment
    const payment = await prisma.invoicePayment.findFirst({
      where: { id: paymentId, invoice_id: invoiceId, tenant_id: tenantId },
    });
    if (payment === null) {
      throw new NotFoundError('Pagamento não encontrado.');
    }

    // 3. Find the transaction linked to this payment (by account + amount + description + date)
    // Nota: credit_card_invoice_id não é mais usado na transação de pagamento
    const paymentTransaction = await prisma.transaction.findFirst({
      where: {
        tenant_id: tenantId,
        account_id: payment.account_id,
        amount: payment.amount,
        description: 'Pagamento de fatura',
        date: payment.paid_at,
        status: { not: 'CANCELADO' },
      },
      orderBy: { created_at: 'desc' },
    });

    // 4. Get card and internal account
    const card = await creditCardsRepository.findById(cardId, tenantId);
    if (card === null) throw new NotFoundError('Cartão não encontrado.');
    const principalCardId = card.parent_card_id ?? card.id;
    const internalAccount = await prisma.account.findFirst({
      where: { credit_card_id: principalCardId, tenant_id: tenantId, deleted_at: null, type: 'INTERNAL' },
      select: { id: true },
    });
    if (internalAccount === null) throw new ValidationError('Conta interna do cartão não encontrada.');

    let updatedInvoice: CreditCardInvoice;

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 5a. Cancel the payment transaction and its ledger entries
      if (paymentTransaction) {
        await tx.ledgerEntry.updateMany({
          where: { transaction_id: paymentTransaction.id, tenant_id: tenantId },
          data: { status: 'CANCELADO' },
        });
        await tx.transaction.update({
          where: { id: paymentTransaction.id },
          data: { status: 'CANCELADO' },
        });
      }

      // 5b. Delete the invoice payment record
      await tx.invoicePayment.delete({ where: { id: paymentId } });

      // 5c. Reverse total_paid on invoice
      const wasFullyPaid = invoice.status === 'PAID';
      await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: { total_paid: { decrement: payment.amount } },
      });

      const refreshed = await tx.creditCardInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
      let newStatus: typeof refreshed.status;
      if (refreshed.total_paid.lte(new Prisma.Decimal(0))) {
        newStatus = refreshed.due_date < new Date() ? 'CLOSED' : 'OPEN';
      } else {
        newStatus = 'PARTIAL';
      }
      updatedInvoice = await tx.creditCardInvoice.update({
        where: { id: invoiceId },
        data: { status: newStatus, total_paid: { set: refreshed.total_paid.lte(0) ? new Prisma.Decimal(0) : refreshed.total_paid } },
      });

      // 5d. Re-block limit if invoice was previously PAID
      if (wasFullyPaid) {
        await creditCardsRepository.blockLimit(principalCardId, tenantId, invoice.total_amount, tx);
      }

      // 5e. Audit log
      await createAuditLog({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        userId,
        entityType: 'InvoicePayment',
        entityId: invoiceId,
        action: 'DELETE',
        afterData: {
          payment_id: paymentId,
          reversed_amount: payment.amount.toString(),
          new_status: newStatus,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });

    return { data: updatedInvoice! };
  },

  // -------------------------------------------------------------------------
  // Create installment purchase
  // -------------------------------------------------------------------------

  async createInstallment(
    tenantId: string,
    userId: string,
    data: CreateInstallmentInput,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // 1. Find credit card
    const card = await creditCardsRepository.findById(data.credit_card_id, tenantId);
    if (card === null) {
      throw new NotFoundError('Cartão de crédito não encontrado.');
    }
    if (!card.is_active) {
      throw new ValidationError('O cartão de crédito está inativo.');
    }

    // 2. Get principal card (for limit management)
    const principalCardId = card.parent_card_id ?? card.id;
    let principalCard = card;
    if (card.parent_card_id !== null) {
      const parent = await creditCardsRepository.findById(card.parent_card_id, tenantId);
      if (parent === null) {
        throw new NotFoundError('Cartão principal não encontrado.');
      }
      principalCard = parent;
    }

    // 3. Check available limit
    const totalAmount = new Prisma.Decimal(data.total_amount);
    if (principalCard.limit_available.lt(totalAmount)) {
      throw new ValidationError(
        `Limite insuficiente. Disponível: R$ ${principalCard.limit_available.toFixed(2)}, necessário: R$ ${totalAmount.toFixed(2)}.`,
      );
    }

    // 4. Calculate individual installment amounts (handle rounding)
    const n = data.total_installments;
    const baseAmount = totalAmount.div(n).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const remainder = totalAmount.sub(baseAmount.mul(n));

    // Get internal account for ledger entries
    const internalAccount = await prisma.account.findFirst({
      where: {
        credit_card_id: data.credit_card_id,
        tenant_id: tenantId,
        deleted_at: null,
        type: 'INTERNAL',
      },
      select: { id: true },
    });
    if (internalAccount === null) {
      throw new ValidationError('Conta interna do cartão não encontrada.');
    }

    const purchaseDate = parseDateLocal(data.purchase_date);

    let createdInstallment: { id: string; total_amount: Prisma.Decimal; total_installments: number; description: string };

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      // 5a. Create parent transaction (EXPENSE, REALIZADO)
      // credit_card_id is intentionally null so it does NOT appear in any invoice listing.
      // It serves only as the anchor record for the Installment row.
      const parentTransaction = await tx.transaction.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          type: 'EXPENSE',
          status: 'REALIZADO',
          amount: totalAmount,
          description: data.description,
          date: purchaseDate,
          credit_card_id: null,
          category_id: data.category_id ?? null,
          notes: data.notes ?? null,
          is_reconciled: false,
        },
      });

      // 5b. Create Installment record
      const installment = await tx.installment.create({
        data: {
          tenant_id: tenantId,
          parent_transaction_id: parentTransaction.id,
          total_amount: totalAmount,
          total_installments: n,
          credit_card_id: data.credit_card_id,
          description: data.description,
        },
      });

      // 5c. Create installment items (N individual transactions)
      for (let i = 1; i <= n; i++) {
        // Installment amount: last installment gets the remainder
        const installmentAmount = i === n
          ? baseAmount.add(remainder)
          : baseAmount;

        // Date for this installment: purchase_date + (i-1) months
        const installmentDate = new Date(
          purchaseDate.getFullYear(),
          purchaseDate.getMonth() + (i - 1),
          purchaseDate.getDate(),
        );

        // Find or create the invoice for this month
        const invoice = await creditCardsRepository.findOrCreateInvoice(
          data.credit_card_id,
          tenantId,
          installmentDate,
          tx,
        );

        // Create individual transaction (EXPENSE, PREVISTO)
        const itemTransaction = await tx.transaction.create({
          data: {
            tenant_id: tenantId,
            user_id: userId,
            type: 'EXPENSE',
            status: 'PREVISTO',
            amount: installmentAmount,
            description: `${data.description} (${i}/${n})`,
            date: installmentDate,
            credit_card_id: data.credit_card_id,
            credit_card_invoice_id: invoice.id,
            category_id: data.category_id ?? null,
            installment_id: installment.id,
            recurrence_index: i,
            is_reconciled: false,
          },
        });

        // Create ledger entry: DEBIT on internal account (PREVISTO — becomes REALIZADO when invoice is paid)
        await tx.ledgerEntry.create({
          data: {
            tenant_id: tenantId,
            account_id: internalAccount.id,
            transaction_id: itemTransaction.id,
            type: 'DEBIT',
            amount: installmentAmount,
            status: 'PREVISTO',
          },
        });

        // Create InstallmentItem record
        await tx.installmentItem.create({
          data: {
            tenant_id: tenantId,
            installment_id: installment.id,
            transaction_id: itemTransaction.id,
            credit_card_invoice_id: invoice.id,
            installment_number: i,
            amount: installmentAmount,
          },
        });

        // Update invoice total_amount
        await creditCardsRepository.updateInvoiceAmount(
          invoice.id,
          tenantId,
          installmentAmount,
          tx,
        );
      }

      // 5d. Block limit on principal card (total amount)
      await creditCardsRepository.blockLimit(principalCardId, tenantId, totalAmount, tx);

      // 5e. Add tags to parent transaction
      const tagIds = data.tag_ids ?? [];
      for (const tagId of tagIds) {
        await tx.transactionTag.upsert({
          where: {
            transaction_id_tag_id: {
              transaction_id: parentTransaction.id,
              tag_id: tagId,
            },
          },
          create: {
            transaction_id: parentTransaction.id,
            tenant_id: tenantId,
            tag_id: tagId,
          },
          update: { deleted_at: null },
        });
      }

      // 5f. Audit log
      await createAuditLog({
        prisma: tx as unknown as PrismaClient,
        tenantId,
        userId,
        entityType: 'Installment',
        entityId: installment.id,
        action: 'CREATE',
        afterData: {
          credit_card_id: data.credit_card_id,
          description: data.description,
          total_amount: data.total_amount,
          total_installments: n,
          purchase_date: data.purchase_date,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      createdInstallment = installment;
    });

    return { data: createdInstallment! };
  },
};
