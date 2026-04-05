import { Prisma, type TransactionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../lib/errors';
import {
  FEATURE_KEYS,
  getPlanLimit,
} from '../../lib/plan-limits';
import { transactionsRepository } from './transactions.repository';
import {
  creditCardsRepository,
} from '../credit-cards/credit-cards.repository';
import type {
  LedgerEntryCreateInput,
  TransactionWithRelations,
} from './transactions.repository';
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  ListTransactionsQuery,
} from './transactions.schemas';

// ---------------------------------------------------------------------------
// Category rule helpers
// ---------------------------------------------------------------------------

/** Strip installment suffix like " (3/10)" from a description to get the base pattern. */
export function descriptionPattern(description: string): string {
  return description.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
}

/** Look up a category rule for the given description pattern. */
export async function findCategoryRule(tenantId: string, description: string): Promise<string | null> {
  const pattern = descriptionPattern(description);
  const rule = await prisma.categoryRule.findFirst({
    where: { tenant_id: tenantId, pattern, deleted_at: null },
    select: { category_id: true },
  });
  return rule?.category_id ?? null;
}

// ---------------------------------------------------------------------------
// Ledger Engine — double-entry builder
// ---------------------------------------------------------------------------

interface LedgerEntrySpec {
  account_id: string;
  type: 'DEBIT' | 'CREDIT';
  amount: Prisma.Decimal;
  status: TransactionStatus;
}

function buildLedgerEntries(
  transaction: {
    id: string;
    tenant_id: string;
    type: string;
    amount: Prisma.Decimal;
    status: TransactionStatus;
    account_id: string | null;
    credit_card_id: string | null;
  },
  internalAccountId: string | null,
  targetAccountId: string | null,
): LedgerEntrySpec[] {
  const entries: LedgerEntrySpec[] = [];
  const { type, amount, status, account_id, credit_card_id } = transaction;

  if (type === 'INCOME' && account_id !== null) {
    entries.push({ account_id, type: 'CREDIT', amount, status });
  } else if (type === 'EXPENSE' && account_id !== null && credit_card_id === null) {
    entries.push({ account_id, type: 'DEBIT', amount, status });
  } else if (type === 'EXPENSE' && credit_card_id !== null) {
    if (internalAccountId === null) {
      throw new ValidationError(
        'Cartão de crédito não possui conta interna configurada.',
      );
    }
    entries.push({ account_id: internalAccountId, type: 'DEBIT', amount, status });
  } else if (type === 'TRANSFER') {
    if (account_id === null || targetAccountId === null) {
      throw new ValidationError(
        'Transferência requer conta de origem e conta de destino.',
      );
    }
    entries.push({ account_id, type: 'DEBIT', amount, status });
    entries.push({ account_id: targetAccountId, type: 'CREDIT', amount, status });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Invoice resolution for credit card expenses
// ---------------------------------------------------------------------------

/**
 * Find the OPEN invoice for the given card/date or create a new one.
 * Uses calculateInvoicePeriod from credit-cards.repository for consistency.
 */
async function resolveInvoiceId(
  tx: Prisma.TransactionClient,
  creditCardId: string,
  tenantId: string,
  transactionDate: Date,
): Promise<string> {
  const invoice = await creditCardsRepository.findOrCreateInvoice(
    creditCardId,
    tenantId,
    transactionDate,
    tx as Parameters<typeof creditCardsRepository.findOrCreateInvoice>[3],
  );
  return invoice.id;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const transactionsService = {
  /**
   * List transactions with optional plan-based date restriction.
   */
  async listTransactions(
    tenantId: string,
    plan: string,
    query: ListTransactionsQuery,
  ): Promise<{
    data: TransactionWithRelations[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const effectiveQuery = { ...query };

    // For FREE plan: restrict to last N months if no date_from given
    if (plan === 'FREE' && effectiveQuery.date_from === undefined) {
      const historyMonths = await getPlanLimit(
        prisma,
        'FREE',
        FEATURE_KEYS.HISTORY_MONTHS,
      );
      if (Number.isFinite(historyMonths)) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - historyMonths);
        const yyyy = cutoff.getFullYear();
        const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
        const dd = String(cutoff.getDate()).padStart(2, '0');
        effectiveQuery.date_from = `${yyyy}-${mm}-${dd}`;
      }
    }

    const { transactions, total } = await transactionsRepository.findAll(
      tenantId,
      effectiveQuery,
    );

    return {
      data: transactions,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  /**
   * Get a single transaction or throw NotFoundError.
   */
  async getTransaction(
    id: string,
    tenantId: string,
  ): Promise<TransactionWithRelations> {
    const transaction = await transactionsRepository.findById(id, tenantId);
    if (transaction === null) {
      throw new NotFoundError('Transação não encontrada.');
    }
    return transaction;
  },

  /**
   * Create a transaction and the corresponding ledger entries atomically.
   */
  async createTransaction(
    tenantId: string,
    userId: string,
    data: CreateTransactionInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TransactionWithRelations> {
    const {
      type,
      status,
      amount,
      description,
      date,
      category_id,
      account_id,
      credit_card_id,
      credit_card_invoice_id,
      target_account_id,
      notes,
      pix_key,
      tag_ids,
    } = data;

    // Parse date as São Paulo local noon to avoid UTC midnight shifting the day
    const datePart = date.substring(0, 10); // YYYY-MM-DD
    const transactionDate = new Date(`${datePart}T12:00:00-03:00`);

    // Validate account belongs to tenant (if provided)
    if (account_id !== null && account_id !== undefined) {
      const account = await prisma.account.findFirst({
        where: {
          id: account_id,
          tenant_id: tenantId,
          deleted_at: null,
          type: { not: 'INTERNAL' },
        },
        select: { id: true },
      });
      if (account === null) {
        throw new NotFoundError('Conta não encontrada.');
      }
    }

    // Validate target_account belongs to tenant (for TRANSFER)
    if (target_account_id !== null && target_account_id !== undefined) {
      const targetAccount = await prisma.account.findFirst({
        where: {
          id: target_account_id,
          tenant_id: tenantId,
          deleted_at: null,
          type: { not: 'INTERNAL' },
        },
        select: { id: true },
      });
      if (targetAccount === null) {
        throw new NotFoundError('Conta de destino não encontrada.');
      }
    }

    // Resolve credit card details
    let internalAccountId: string | null = null;
    let resolvedInvoiceId: string | null = credit_card_invoice_id ?? null;

    let principalCardId: string | null = null;

    if (credit_card_id !== null && credit_card_id !== undefined) {
      const card = await prisma.creditCard.findFirst({
        where: {
          id: credit_card_id,
          tenant_id: tenantId,
          deleted_at: null,
          is_active: true,
        },
        select: { id: true, internal_account_id: true, parent_card_id: true },
      });
      if (card === null) {
        throw new NotFoundError('Cartão de crédito não encontrado.');
      }
      internalAccountId = card.internal_account_id;
      // Limit is always tracked on the principal card
      principalCardId = card.parent_card_id ?? card.id;
    }

    // createdTransaction fetched after DB transaction commits
    let createdId: string;

    await prisma.$transaction(async (tx) => {
      // Resolve invoice inside the transaction if needed
      if (
        credit_card_id !== null &&
        credit_card_id !== undefined &&
        resolvedInvoiceId === null
      ) {
        resolvedInvoiceId = await resolveInvoiceId(
          tx,
          credit_card_id,
          tenantId,
          transactionDate,
        );
      }

      // Auto-apply category rule if no category was provided
      let resolvedCategoryId = category_id ?? null;
      if (resolvedCategoryId === null) {
        const ruleCategory = await findCategoryRule(tenantId, description);
        if (ruleCategory !== null) resolvedCategoryId = ruleCategory;
      }

      // Create the transaction record
      const created = await transactionsRepository.create(tx, {
        tenant_id: tenantId,
        user_id: userId,
        type,
        status,
        amount: new Prisma.Decimal(amount),
        description,
        date: transactionDate,
        category_id: resolvedCategoryId,
        account_id: account_id ?? null,
        credit_card_id: credit_card_id ?? null,
        credit_card_invoice_id: resolvedInvoiceId,
        notes: notes ?? null,
        pix_key: pix_key ?? null,
        is_reconciled: false,
      });

      // Build and create ledger entries
      const ledgerSpecs = buildLedgerEntries(
        {
          id: created.id,
          tenant_id: tenantId,
          type: created.type,
          amount: created.amount,
          status: created.status,
          account_id: created.account_id,
          credit_card_id: created.credit_card_id,
        },
        internalAccountId,
        target_account_id ?? null,
      );

      const ledgerInputs: LedgerEntryCreateInput[] = ledgerSpecs.map((spec) => ({
        tenant_id: tenantId,
        account_id: spec.account_id,
        transaction_id: created.id,
        type: spec.type,
        amount: spec.amount,
        status: spec.status,
      }));

      await transactionsRepository.createLedgerEntries(tx, ledgerInputs);

      // Update invoice total_amount when creating a credit card transaction
      if (resolvedInvoiceId !== null && credit_card_id !== null && credit_card_id !== undefined) {
        await creditCardsRepository.updateInvoiceAmount(
          resolvedInvoiceId,
          tenantId,
          new Prisma.Decimal(amount),
          tx,
        );
      }

      // Block limit on the principal card
      if (principalCardId !== null && type === 'EXPENSE') {
        await creditCardsRepository.blockLimit(
          principalCardId,
          tenantId,
          new Prisma.Decimal(amount),
          tx,
        );
      }

      // Sync tags
      const tagIdsToSync = tag_ids ?? [];
      if (tagIdsToSync.length > 0) {
        await transactionsRepository.syncTags(tx, created.id, tenantId, tagIdsToSync);
      }

      // Audit log
      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'Transaction',
        entityId: created.id,
        action: 'CREATE',
        afterData: { type, status, amount, description, date },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      createdId = created.id;
    });

    // Fetch with relations AFTER the transaction commits (global client sees committed data)
    const withRelations = await transactionsRepository.findById(createdId!, tenantId);
    if (withRelations === null) {
      throw new Error('Failed to fetch created transaction.');
    }

    return withRelations;
  },

  /**
   * Update a transaction's mutable fields and handle ledger/status changes.
   */
  async updateTransaction(
    id: string,
    tenantId: string,
    userId: string,
    data: UpdateTransactionInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<TransactionWithRelations> {
    const existing = await transactionsRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Transação não encontrada.');
    }

    // Reconciled transactions on bank accounts (non-card) can only be cancelled or have
    // is_reconciled toggled. For credit card transactions, is_reconciled is just a visual
    // "checked in statement" flag and does not lock the record.
    if (existing.is_reconciled && existing.credit_card_id === null) {
      const keys = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
      const allowedChange =
        keys.every((k) => k === 'is_reconciled') ||
        (data.status === 'CANCELADO' && keys.every((k) => k === 'status' || k === 'is_reconciled'));
      if (!allowedChange) {
        throw new ForbiddenError(
          'Transação conciliada só pode ter o status alterado para CANCELADO ou ser desconciliada.',
        );
      }
    }

    const statusChanged =
      data.status !== undefined && data.status !== existing.status;
    const cancellingTransaction = data.status === 'CANCELADO';

    await prisma.$transaction(async (tx) => {
      // Handle ledger entry updates based on status change
      if (statusChanged) {
        if (cancellingTransaction) {
          await transactionsRepository.softDeleteLedgerEntries(tx, id, tenantId);

          // Release limit when cancelling a credit card expense
          if (existing.credit_card_id !== null && existing.type === 'EXPENSE') {
            const card = await tx.creditCard.findFirst({
              where: { id: existing.credit_card_id, tenant_id: tenantId },
              select: { parent_card_id: true, id: true },
            });
            if (card !== null) {
              const principalId = card.parent_card_id ?? card.id;
              await creditCardsRepository.releaseLimit(principalId, tenantId, existing.amount, tx);
            }
          }
        } else {
          await transactionsRepository.updateLedgerEntriesStatus(
            tx,
            id,
            tenantId,
            data.status as TransactionStatus,
          );
        }
      }

      // Build update payload (only mutable fields)
      const updateData: Prisma.TransactionUncheckedUpdateInput = {};
      if (data.status !== undefined) updateData.status = data.status;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount);
      if (data.date !== undefined) updateData.date = new Date(data.date);
      if ('category_id' in data) updateData.category_id = data.category_id ?? null;
      if ('notes' in data) updateData.notes = data.notes ?? null;
      if ('pix_key' in data) updateData.pix_key = data.pix_key ?? null;
      if (data.is_reconciled !== undefined) updateData.is_reconciled = data.is_reconciled;

      // If the date changed and this is a credit card transaction, resolve the correct invoice
      if (data.date !== undefined && existing.credit_card_id !== null) {
        const newDate = new Date(data.date);
        const invoice = await creditCardsRepository.findOrCreateInvoice(
          existing.credit_card_id,
          tenantId,
          newDate,
          tx as Parameters<typeof creditCardsRepository.findOrCreateInvoice>[3],
        );
        updateData.credit_card_invoice_id = invoice.id;
        // Reset reconciled flag — transaction hasn't been verified in the new invoice yet
        if (invoice.id !== existing.credit_card_invoice_id) {
          updateData.is_reconciled = false;
        }
      }

      await transactionsRepository.update(tx, id, tenantId, updateData);

      // Recalc invoice totals for any affected invoices
      const invoiceIdsToRecalc = new Set<string>();
      if (existing.credit_card_invoice_id !== null) invoiceIdsToRecalc.add(existing.credit_card_invoice_id);
      if (updateData.credit_card_invoice_id && updateData.credit_card_invoice_id !== existing.credit_card_invoice_id) {
        invoiceIdsToRecalc.add(updateData.credit_card_invoice_id as string);
      }
      for (const invId of invoiceIdsToRecalc) {
        await creditCardsRepository.recalcInvoiceTotal(invId, tenantId, tx as Parameters<typeof creditCardsRepository.recalcInvoiceTotal>[2]);
      }

      // Sync tags if provided
      if (data.tag_ids !== undefined) {
        await transactionsRepository.syncTags(tx, id, tenantId, data.tag_ids);
      }

      // Recurrence scope: propagate changes to future occurrences
      if (
        data.recurrence_scope === 'this_and_future' &&
        existing.recurrence_id !== null &&
        existing.recurrence_index !== null
      ) {
        const futureUpdateData: Prisma.TransactionUncheckedUpdateInput = {};
        if (data.amount !== undefined) futureUpdateData.amount = new Prisma.Decimal(data.amount);
        if (data.description !== undefined) futureUpdateData.description = data.description;
        if ('category_id' in data) futureUpdateData.category_id = data.category_id ?? null;
        if ('notes' in data) futureUpdateData.notes = data.notes ?? null;

        if (Object.keys(futureUpdateData).length > 0) {
          await tx.transaction.updateMany({
            where: {
              tenant_id: tenantId,
              recurrence_id: existing.recurrence_id,
              recurrence_index: { gt: existing.recurrence_index },
              deleted_at: null,
            },
            data: futureUpdateData,
          });
        }
      }

      // Audit log
      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'Transaction',
        entityId: id,
        action: 'UPDATE',
        beforeData: {
          status: existing.status,
          description: existing.description,
          date: existing.date,
          category_id: existing.category_id,
          notes: existing.notes,
        },
        afterData: data as Record<string, unknown>,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });

    // Fetch with relations AFTER the transaction commits
    const updatedTransaction = await transactionsRepository.findById(id, tenantId);
    if (updatedTransaction === null) {
      throw new Error('Failed to fetch updated transaction.');
    }

    return updatedTransaction;
  },

  /**
   * Soft-delete a transaction and its ledger entries.
   */
  async deleteTransaction(
    id: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const existing = await transactionsRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Transação não encontrada.');
    }

    if (existing.is_reconciled && existing.credit_card_id === null) {
      throw new ForbiddenError(
        'Transação conciliada não pode ser excluída. Desconcilie primeiro.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await transactionsRepository.softDeleteLedgerEntries(tx, id, tenantId);
      await transactionsRepository.softDelete(tx, id, tenantId);

      // Recalc invoice total after deletion
      if (existing.credit_card_invoice_id !== null) {
        await creditCardsRepository.recalcInvoiceTotal(
          existing.credit_card_invoice_id,
          tenantId,
          tx as Parameters<typeof creditCardsRepository.recalcInvoiceTotal>[2],
        );
      }

      // Release limit on the principal card when a credit card expense is deleted
      if (existing.credit_card_id !== null && existing.type === 'EXPENSE' && existing.status !== 'CANCELADO') {
        const card = await tx.creditCard.findFirst({
          where: { id: existing.credit_card_id, tenant_id: tenantId },
          select: { parent_card_id: true, id: true },
        });
        if (card !== null) {
          const principalId = card.parent_card_id ?? card.id;
          await creditCardsRepository.releaseLimit(principalId, tenantId, existing.amount, tx);
        }
      }

      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'Transaction',
        entityId: id,
        action: 'DELETE',
        beforeData: {
          type: existing.type,
          status: existing.status,
          amount: existing.amount.toString(),
          description: existing.description,
          date: existing.date,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });
  },

  /**
   * GET /transactions/projection
   * Returns income/expense totals (PREVISTO + REALIZADO, excluding CANCELADO)
   * for the given month and the next 5 months.
   */
  async getProjection(
    tenantId: string,
    fromYear: number,
    fromMonth: number,
  ): Promise<{ month: string; income: number; expense: number }[]> {
    const months: { year: number; month: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(fromYear, fromMonth - 1 + i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    return Promise.all(
      months.map(async ({ year, month }) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);

        const rows = await prisma.transaction.groupBy({
          by: ['type'],
          where: {
            tenant_id: tenantId,
            deleted_at: null,
            status: { not: 'CANCELADO' },
            type: { in: ['INCOME', 'EXPENSE'] },
            date: { gte: start, lte: end },
          },
          _sum: { amount: true },
        });

        const income = Number(rows.find((r) => r.type === 'INCOME')?._sum.amount ?? 0);
        const expense = Number(rows.find((r) => r.type === 'EXPENSE')?._sum.amount ?? 0);
        const label = new Date(year, month - 1, 1)
          .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          .replace('.', '');

        return { month: label, income, expense };
      }),
    );
  },

  /**
   * Categorize a transaction, optionally applying to similar transactions and saving a rule.
   * apply_to_similar:
   *   'none'             — only this transaction
   *   'similar'          — this + all uncategorized transactions with same base pattern
   *   'similar_and_rule' — same as above, plus save a CategoryRule for future auto-apply
   */
  async categorizeTransaction(
    id: string,
    tenantId: string,
    categoryId: string,
    applyToSimilar: 'none' | 'similar' | 'similar_and_rule',
  ) {
    const existing = await transactionsRepository.findById(id, tenantId);
    if (existing === null) throw new NotFoundError('Transação não encontrada.');

    const pattern = descriptionPattern(existing.description);

    await prisma.$transaction(async (tx) => {
      // 1. Always update this transaction
      await tx.transaction.update({
        where: { id, tenant_id: tenantId },
        data: { category_id: categoryId },
      });

      if (applyToSimilar === 'similar' || applyToSimilar === 'similar_and_rule') {
        // 2. Apply only to transactions from the same month onwards (never retroactive)
        const refDate = existing.date instanceof Date ? existing.date : new Date(existing.date);
        const fromDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1);

        await tx.transaction.updateMany({
          where: {
            tenant_id: tenantId,
            deleted_at: null,
            id: { not: id },
            date: { gte: fromDate },
            OR: [
              { description: pattern },
              { description: { startsWith: `${pattern} (` } },
            ],
          },
          data: { category_id: categoryId },
        });
      }

      if (applyToSimilar === 'similar_and_rule') {
        // 3. Save / update the rule for future auto-apply
        await tx.categoryRule.upsert({
          where: { tenant_id_pattern: { tenant_id: tenantId, pattern } },
          create: { tenant_id: tenantId, pattern, category_id: categoryId },
          update: { category_id: categoryId, deleted_at: null },
        });
      }
    });

    // Count how many were updated (for feedback)
    const similarCount = applyToSimilar !== 'none'
      ? await prisma.transaction.count({
          where: {
            tenant_id: tenantId,
            deleted_at: null,
            date: { gte: new Date(new Date(existing.date instanceof Date ? existing.date : new Date(existing.date)).getFullYear(), new Date(existing.date instanceof Date ? existing.date : new Date(existing.date)).getMonth(), 1) },
            OR: [
              { description: pattern },
              { description: { startsWith: `${pattern} (` } },
            ],
          },
        })
      : 1;

    return { updated: similarCount, pattern, rule_saved: applyToSimilar === 'similar_and_rule' };
  },
};
