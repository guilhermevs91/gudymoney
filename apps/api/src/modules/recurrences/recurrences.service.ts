import { Prisma, type Recurrence } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import {
  NotFoundError,
  PlanLimitError,
  ValidationError,
} from '../../lib/errors';
import {
  FEATURE_KEYS,
  getPlanLimit,
} from '../../lib/plan-limits';
import { recurrencesRepository } from './recurrences.repository';
import type {
  RecurrenceWithRelations,
  TransactionCreateManyInput,
} from './recurrences.repository';
import { transactionsRepository } from '../transactions/transactions.repository';
import type { LedgerEntryCreateInput } from '../transactions/transactions.repository';
import type {
  CreateRecurrenceInput,
  UpdateRecurrenceInput,
  CancelRecurrenceInput,
  ListRecurrencesQuery,
} from './recurrences.schemas';

// ---------------------------------------------------------------------------
// Ledger entry builder for recurrence transactions
// ---------------------------------------------------------------------------

/**
 * Build ledger entry inputs for a set of recurrence-generated transactions.
 * Only account-based transactions generate ledger entries (credit card
 * transactions are handled when the invoice is paid).
 */
async function buildLedgerEntriesForRecurrences(
  tx: Prisma.TransactionClient,
  transactions: Array<{
    id: string;
    tenant_id: string;
    type: string;
    amount: Prisma.Decimal;
    status: string;
    account_id: string | null;
    credit_card_id: string | null;
  }>,
): Promise<void> {
  const ledgerInputs: LedgerEntryCreateInput[] = [];

  for (const t of transactions) {
    if (t.account_id === null) continue;
    if (t.credit_card_id !== null) continue; // credit card expenses handled on invoice payment

    const entryType = t.type === 'INCOME' ? 'CREDIT' : 'DEBIT';
    ledgerInputs.push({
      tenant_id: t.tenant_id,
      account_id: t.account_id,
      transaction_id: t.id,
      type: entryType as 'CREDIT' | 'DEBIT',
      amount: t.amount,
      status: t.status as 'PREVISTO' | 'REALIZADO' | 'CANCELADO',
    });
  }

  if (ledgerInputs.length > 0) {
    await transactionsRepository.createLedgerEntries(tx, ledgerInputs);
  }
}

// ---------------------------------------------------------------------------
// Date stepping helpers
// ---------------------------------------------------------------------------

/**
 * Add one recurrence period to a date based on frequency.
 * Handles month-end edge cases for MONTHLY and YEARLY.
 */
function addFrequency(
  date: Date,
  frequency: string,
  startDay: number,
): Date {
  const next = new Date(date);

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'BIWEEKLY':
      next.setDate(next.getDate() + 14);
      break;
    case 'MONTHLY': {
      const currentMonth = next.getMonth();
      next.setMonth(currentMonth + 1);
      // Handle month-end: if the resulting month overflowed, clamp to last day
      if (next.getMonth() !== (currentMonth + 1) % 12) {
        next.setDate(0); // last day of previous month
      } else {
        // Ensure we use the original start day if possible
        const daysInMonth = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0,
        ).getDate();
        next.setDate(Math.min(startDay, daysInMonth));
      }
      break;
    }
    case 'YEARLY': {
      const yearMonth = next.getMonth();
      next.setFullYear(next.getFullYear() + 1);
      // Handle Feb 29 → Feb 28 in non-leap years
      if (next.getMonth() !== yearMonth) {
        next.setDate(0);
      }
      break;
    }
    default:
      throw new ValidationError(`Frequência desconhecida: ${frequency}`);
  }

  return next;
}

// ---------------------------------------------------------------------------
// Transaction generation helper
// ---------------------------------------------------------------------------

/**
 * Generate all Transaction create-many inputs between `from` (inclusive) and
 * `until` (inclusive) based on the recurrence's frequency.
 *
 * Starts the index counter at `startIndex` so that calls for horizon extension
 * can continue from where they left off.
 */
export function generateTransactions(
  recurrence: {
    id: string;
    tenant_id: string;
    description: string;
    amount: Prisma.Decimal;
    type: string;
    frequency: string;
    start_date: Date;
    category_id: string | null;
    account_id: string | null;
    credit_card_id: string | null;
  },
  from: Date,
  until: Date,
  startIndex: number = 1,
): TransactionCreateManyInput[] {
  const transactions: TransactionCreateManyInput[] = [];
  const startDay = recurrence.start_date.getDate();

  let current = new Date(from);
  // Normalize to midnight UTC to avoid time-zone drift across iterations
  current.setUTCHours(0, 0, 0, 0);

  const untilNorm = new Date(until);
  untilNorm.setUTCHours(23, 59, 59, 999);

  let index = startIndex;

  while (current <= untilNorm) {
    transactions.push({
      tenant_id: recurrence.tenant_id,
      type: recurrence.type as 'INCOME' | 'EXPENSE',
      status: 'PREVISTO',
      amount: recurrence.amount,
      description: recurrence.description,
      date: new Date(current),
      category_id: recurrence.category_id ?? null,
      account_id: recurrence.account_id ?? null,
      credit_card_id: recurrence.credit_card_id ?? null,
      recurrence_id: recurrence.id,
      recurrence_index: index,
      is_reconciled: false,
    });

    index++;
    current = addFrequency(current, recurrence.frequency, startDay);
  }

  return transactions;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const recurrencesService = {
  /**
   * List recurrences for a tenant (paginated).
   */
  async listRecurrences(
    tenantId: string,
    query: ListRecurrencesQuery,
  ): Promise<{
    data: RecurrenceWithRelations[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const { recurrences, total } = await recurrencesRepository.findAll(
      tenantId,
      query,
    );
    return {
      data: recurrences,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  /**
   * Get a single recurrence or throw NotFoundError.
   */
  async getRecurrence(
    id: string,
    tenantId: string,
  ): Promise<RecurrenceWithRelations> {
    const recurrence = await recurrencesRepository.findById(id, tenantId);
    if (recurrence === null) {
      throw new NotFoundError('Recorrência não encontrada.');
    }
    return recurrence;
  },

  /**
   * Create a recurrence and pre-generate its transactions.
   */
  async createRecurrence(
    tenantId: string,
    userId: string,
    plan: string,
    data: CreateRecurrenceInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RecurrenceWithRelations & { transaction_count: number }> {
    const startDate = new Date(`${data.start_date}T00:00:00Z`);
    const isInfinite = data.end_date == null;

    // -----------------------------------------------------------------
    // Plan limit checks
    // -----------------------------------------------------------------
    if (plan === 'FREE') {
      if (isInfinite) {
        throw new PlanLimitError(
          'Plano FREE não permite recorrências infinitas. Defina uma data de término ou faça upgrade.',
        );
      }

      const maxMonths = await getPlanLimit(
        prisma,
        'FREE',
        FEATURE_KEYS.MAX_RECURRENCE_MONTHS,
      );

      if (Number.isFinite(maxMonths)) {
        const endDate = new Date(`${data.end_date}T00:00:00Z`);
        const horizonLimit = new Date(startDate);
        horizonLimit.setMonth(horizonLimit.getMonth() + maxMonths);

        if (endDate > horizonLimit) {
          throw new PlanLimitError(
            `Plano FREE limita recorrências a ${maxMonths} meses. Faça upgrade para um plano pago.`,
          );
        }
      }
    }

    // -----------------------------------------------------------------
    // Validate account / credit card belongs to tenant
    // -----------------------------------------------------------------
    if (data.account_id != null) {
      const account = await prisma.account.findFirst({
        where: {
          id: data.account_id,
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

    if (data.credit_card_id != null) {
      const card = await prisma.creditCard.findFirst({
        where: {
          id: data.credit_card_id,
          tenant_id: tenantId,
          deleted_at: null,
          is_active: true,
        },
        select: { id: true },
      });
      if (card === null) {
        throw new NotFoundError('Cartão de crédito não encontrado.');
      }
    }

    // -----------------------------------------------------------------
    // Determine generation horizon
    // -----------------------------------------------------------------
    let generationUntil: Date;

    if (isInfinite) {
      generationUntil = new Date(startDate);
      generationUntil.setFullYear(generationUntil.getFullYear() + 1);
    } else {
      generationUntil = new Date(`${data.end_date}T00:00:00Z`);
    }

    // -----------------------------------------------------------------
    // Atomic creation
    // -----------------------------------------------------------------
    let createdRecurrenceId: string;
    let transactionCount = 0;

    await prisma.$transaction(async (tx) => {
      const recurrence = await recurrencesRepository.create(tx, {
        tenant_id: tenantId,
        description: data.description,
        amount: new Prisma.Decimal(data.amount),
        type: data.type,
        frequency: data.frequency,
        start_date: startDate,
        end_date: isInfinite ? null : new Date(`${data.end_date}T00:00:00Z`),
        horizon_generated_until: generationUntil,
        category_id: data.category_id ?? null,
        account_id: data.account_id ?? null,
        credit_card_id: data.credit_card_id ?? null,
        is_active: true,
      });

      const txInputs = generateTransactions(
        {
          id: recurrence.id,
          tenant_id: tenantId,
          description: recurrence.description,
          amount: recurrence.amount,
          type: recurrence.type,
          frequency: recurrence.frequency,
          start_date: recurrence.start_date,
          category_id: recurrence.category_id,
          account_id: recurrence.account_id,
          credit_card_id: recurrence.credit_card_id,
        },
        startDate,
        generationUntil,
        1,
      );

      const createdTransactions = await recurrencesRepository.createTransactions(
        tx,
        txInputs,
      );
      transactionCount = createdTransactions.length;

      await buildLedgerEntriesForRecurrences(tx, createdTransactions);

      await createAuditLog({
        prisma: tx as Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
        tenantId,
        userId,
        entityType: 'Recurrence',
        entityId: recurrence.id,
        action: 'CREATE',
        afterData: {
          description: data.description,
          amount: data.amount,
          type: data.type,
          frequency: data.frequency,
          start_date: data.start_date,
          end_date: data.end_date ?? null,
          transaction_count: transactionCount,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });

      createdRecurrenceId = recurrence.id;
    });

    // Fetch with relations AFTER the transaction commits
    const withRelations = await recurrencesRepository.findById(createdRecurrenceId!, tenantId);
    if (withRelations === null) {
      throw new Error('Failed to fetch created recurrence.');
    }

    return { ...withRelations, transaction_count: transactionCount };
  },

  /**
   * Update a recurrence and apply changes to affected transactions.
   */
  async updateRecurrence(
    id: string,
    tenantId: string,
    userId: string,
    data: UpdateRecurrenceInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RecurrenceWithRelations> {
    const existing = await recurrencesRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Recorrência não encontrada.');
    }

    // Build transaction update payload
    const txUpdateData: {
      description?: string;
      amount?: Prisma.Decimal;
      category_id?: string | null;
    } = {};

    if (data.description !== undefined) txUpdateData.description = data.description;
    if (data.amount !== undefined) txUpdateData.amount = new Prisma.Decimal(data.amount);
    if ('category_id' in data) txUpdateData.category_id = data.category_id ?? null;

    // Build recurrence master record update payload
    const recurrenceUpdateData: Prisma.RecurrenceUncheckedUpdateInput = {};
    if (data.description !== undefined) recurrenceUpdateData.description = data.description;
    if (data.amount !== undefined) recurrenceUpdateData.amount = new Prisma.Decimal(data.amount);
    if ('category_id' in data) recurrenceUpdateData.category_id = data.category_id ?? null;
    if (data.is_active !== undefined) recurrenceUpdateData.is_active = data.is_active;

    // When deactivating, soft-delete all future PREVISTO transactions
    if (data.is_active === false) {
      await recurrencesRepository.softDeleteFutureTransactions(id, tenantId);
    }

    const { scope, from_index } = data;

    // Apply transaction updates based on scope
    if (scope === 'THIS') {
      if (from_index === undefined) {
        throw new ValidationError('from_index é obrigatório quando scope = THIS.');
      }
      await recurrencesRepository.updateTransactionByIndex(
        id,
        tenantId,
        from_index,
        txUpdateData,
      );
    } else if (scope === 'THIS_AND_FUTURE') {
      if (from_index === undefined) {
        throw new ValidationError('from_index é obrigatório quando scope = THIS_AND_FUTURE.');
      }
      await recurrencesRepository.updateFutureTransactions(
        id,
        tenantId,
        from_index,
        txUpdateData,
      );
    } else {
      // ALL
      await recurrencesRepository.updateAllPrevistoTransactions(
        id,
        tenantId,
        txUpdateData,
      );
    }

    // Always update master record too
    const updated = await recurrencesRepository.update(id, tenantId, recurrenceUpdateData);

    await createAuditLog({
      prisma,
      tenantId,
      userId,
      entityType: 'Recurrence',
      entityId: id,
      action: 'UPDATE',
      beforeData: {
        description: existing.description,
        amount: existing.amount.toString(),
        category_id: existing.category_id,
      },
      afterData: {
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...('category_id' in data ? { category_id: data.category_id } : {}),
        scope,
        from_index,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    const withRelations = await recurrencesRepository.findById(updated.id, tenantId);
    if (withRelations === null) {
      throw new Error('Failed to fetch updated recurrence.');
    }
    return withRelations;
  },

  /**
   * Cancel a recurrence (set is_active=false) and optionally cancel future transactions.
   */
  async cancelRecurrence(
    id: string,
    tenantId: string,
    userId: string,
    data: CancelRecurrenceInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RecurrenceWithRelations> {
    const existing = await recurrencesRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Recorrência não encontrada.');
    }

    const { future_action, from_index } = data;

    // Deactivate the recurrence
    await recurrencesRepository.setIsActive(id, tenantId, false);

    // Handle future PREVISTO transactions
    if (future_action === 'CANCEL') {
      await recurrencesRepository.softDeleteFutureTransactions(id, tenantId);
    } else if (future_action === 'CANCEL_FROM_INDEX') {
      if (from_index === undefined) {
        throw new ValidationError(
          'from_index é obrigatório quando future_action = CANCEL_FROM_INDEX.',
        );
      }
      await recurrencesRepository.softDeleteFutureTransactions(id, tenantId, from_index);
    }
    // KEEP: do nothing with future transactions

    await createAuditLog({
      prisma,
      tenantId,
      userId,
      entityType: 'Recurrence',
      entityId: id,
      action: 'UPDATE',
      beforeData: { is_active: true },
      afterData: { is_active: false, future_action, from_index },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    const withRelations = await recurrencesRepository.findById(id, tenantId);
    if (withRelations === null) {
      throw new Error('Failed to fetch cancelled recurrence.');
    }
    return withRelations;
  },

  /**
   * List transactions generated by a recurrence (paginated).
   */
  async listRecurrenceTransactions(
    id: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: Recurrence[]; total: number; page: number; pageSize: number }> {
    const existing = await recurrencesRepository.findById(id, tenantId);
    if (existing === null) {
      throw new NotFoundError('Recorrência não encontrada.');
    }

    const { transactions, total } =
      await recurrencesRepository.findTransactionsByRecurrence(
        id,
        tenantId,
        page,
        pageSize,
      );

    return {
      data: transactions as unknown as Recurrence[],
      total,
      page,
      pageSize,
    };
  },

  /**
   * Extend horizon for all infinite recurrences that need it.
   * Called by the daily cron job.
   */
  async extendInfiniteRecurrences(): Promise<number> {
    const recurrences =
      await recurrencesRepository.findInfiniteRecurrencesNeedingExtension();

    let extended = 0;

    for (const recurrence of recurrences) {
      try {
        const from = new Date(recurrence.horizon_generated_until);
        // Add 1 millisecond so we don't duplicate the boundary transaction
        from.setMilliseconds(from.getMilliseconds() + 1);

        const until = new Date(recurrence.horizon_generated_until);
        until.setMonth(until.getMonth() + 3);

        // Count existing transactions to determine startIndex
        const existingCount = await recurrencesRepository.countTransactions(
          recurrence.id,
          recurrence.tenant_id,
        );

        const txInputs = generateTransactions(
          {
            id: recurrence.id,
            tenant_id: recurrence.tenant_id,
            description: recurrence.description,
            amount: recurrence.amount,
            type: recurrence.type,
            frequency: recurrence.frequency,
            start_date: recurrence.start_date,
            category_id: recurrence.category_id,
            account_id: recurrence.account_id,
            credit_card_id: recurrence.credit_card_id,
          },
          from,
          until,
          existingCount + 1,
        );

        if (txInputs.length > 0) {
          await prisma.$transaction(async (tx) => {
            const createdTransactions = await recurrencesRepository.createTransactions(tx, txInputs);
            await buildLedgerEntriesForRecurrences(tx, createdTransactions);
            await recurrencesRepository.updateHorizon(
              recurrence.id,
              recurrence.tenant_id,
              until,
            );
          });
        } else {
          // Still update the horizon even if no transactions were generated
          await recurrencesRepository.updateHorizon(
            recurrence.id,
            recurrence.tenant_id,
            until,
          );
        }

        extended++;
      } catch (err) {
        console.error(
          `[RecurrenceService] Failed to extend recurrence ${recurrence.id}:`,
          err,
        );
      }
    }

    return extended;
  },
};
