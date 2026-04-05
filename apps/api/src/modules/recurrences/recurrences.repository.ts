import { Prisma, type Recurrence, type Transaction } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ListRecurrencesQuery } from './recurrences.schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecurrenceWithRelations = Recurrence & {
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  credit_card: { id: string; name: string } | null;
};

export type TransactionCreateManyInput = Prisma.TransactionCreateManyInput;

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const recurrencesRepository = {
  /**
   * Paginated list of recurrences for a tenant.
   */
  async findAll(
    tenantId: string,
    query: ListRecurrencesQuery,
  ): Promise<{ recurrences: RecurrenceWithRelations[]; total: number }> {
    const { page, pageSize, is_active, type } = query;

    const where: Prisma.RecurrenceWhereInput = {
      tenant_id: tenantId,
      deleted_at: null,
    };

    if (is_active !== undefined) where.is_active = is_active;
    if (type !== undefined) where.type = type;

    const skip = (page - 1) * pageSize;

    const [recurrences, total] = await prisma.$transaction([
      prisma.recurrence.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ created_at: 'desc' }],
        include: {
          category: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          credit_card: { select: { id: true, name: true } },
        },
      }),
      prisma.recurrence.count({ where }),
    ]);

    return { recurrences: recurrences as RecurrenceWithRelations[], total };
  },

  /**
   * Find a single recurrence by id scoped to tenant.
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<RecurrenceWithRelations | null> {
    const recurrence = await prisma.recurrence.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        credit_card: { select: { id: true, name: true } },
      },
    });
    return recurrence as RecurrenceWithRelations | null;
  },

  /**
   * Create a recurrence record.
   */
  async create(
    tx: Prisma.TransactionClient,
    data: Prisma.RecurrenceUncheckedCreateInput,
  ): Promise<Recurrence> {
    return tx.recurrence.create({ data });
  },

  /**
   * Update a recurrence record.
   */
  async update(
    id: string,
    tenantId: string,
    data: Prisma.RecurrenceUncheckedUpdateInput,
  ): Promise<Recurrence> {
    return prisma.recurrence.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  /**
   * Set is_active on a recurrence.
   */
  async setIsActive(
    id: string,
    tenantId: string,
    isActive: boolean,
  ): Promise<Recurrence> {
    return prisma.recurrence.update({
      where: { id },
      data: { is_active: isActive, tenant_id: tenantId },
    });
  },

  /**
   * Update the horizon_generated_until field.
   */
  async updateHorizon(
    id: string,
    tenantId: string,
    newHorizon: Date,
  ): Promise<Recurrence> {
    return prisma.recurrence.update({
      where: { id },
      data: { horizon_generated_until: newHorizon, tenant_id: tenantId },
    });
  },

  /**
   * Batch-create transactions for a recurrence.
   * Returns the created records (so callers can generate ledger entries).
   */
  async createTransactions(
    tx: Prisma.TransactionClient,
    transactions: TransactionCreateManyInput[],
  ): Promise<Transaction[]> {
    const created: Transaction[] = [];
    for (const data of transactions) {
      const record = await tx.transaction.create({ data });
      created.push(record);
    }
    return created;
  },

  /**
   * Find all PREVISTO transactions for a recurrence, optionally from a given index.
   */
  async findFutureTransactions(
    recurrenceId: string,
    tenantId: string,
    fromIndex?: number,
  ): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        status: 'PREVISTO',
        deleted_at: null,
        ...(fromIndex !== undefined
          ? { recurrence_index: { gte: fromIndex } }
          : {}),
      },
      orderBy: { recurrence_index: 'asc' },
    });
  },

  /**
   * Update PREVISTO transactions for a recurrence from a given index.
   * Returns the count of updated records.
   */
  async updateFutureTransactions(
    recurrenceId: string,
    tenantId: string,
    fromIndex: number,
    data: {
      description?: string;
      amount?: Prisma.Decimal;
      category_id?: string | null;
    },
  ): Promise<number> {
    const result = await prisma.transaction.updateMany({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        status: 'PREVISTO',
        deleted_at: null,
        recurrence_index: { gte: fromIndex },
      },
      data,
    });
    return result.count;
  },

  /**
   * Update ALL PREVISTO transactions for a recurrence (scope=ALL).
   * Returns the count of updated records.
   */
  async updateAllPrevistoTransactions(
    recurrenceId: string,
    tenantId: string,
    data: {
      description?: string;
      amount?: Prisma.Decimal;
      category_id?: string | null;
    },
  ): Promise<number> {
    const result = await prisma.transaction.updateMany({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        status: 'PREVISTO',
        deleted_at: null,
      },
      data,
    });
    return result.count;
  },

  /**
   * Update a single PREVISTO transaction by recurrence index.
   */
  async updateTransactionByIndex(
    recurrenceId: string,
    tenantId: string,
    recurrenceIndex: number,
    data: {
      description?: string;
      amount?: Prisma.Decimal;
      category_id?: string | null;
    },
  ): Promise<number> {
    const result = await prisma.transaction.updateMany({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        status: 'PREVISTO',
        recurrence_index: recurrenceIndex,
        deleted_at: null,
      },
      data,
    });
    return result.count;
  },

  /**
   * Soft-delete all PREVISTO transactions for a recurrence, optionally from a given index.
   * Returns the count of soft-deleted records.
   */
  async softDeleteFutureTransactions(
    recurrenceId: string,
    tenantId: string,
    fromIndex?: number,
  ): Promise<number> {
    const result = await prisma.transaction.updateMany({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        status: 'PREVISTO',
        deleted_at: null,
        ...(fromIndex !== undefined
          ? { recurrence_index: { gte: fromIndex } }
          : {}),
      },
      data: { deleted_at: new Date() },
    });
    return result.count;
  },

  /**
   * Find all active infinite recurrences needing horizon extension.
   * Criteria: is_active=true, end_date=null, horizon_generated_until < NOW() + 3 months
   */
  async findInfiniteRecurrencesNeedingExtension(): Promise<Recurrence[]> {
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    return prisma.recurrence.findMany({
      where: {
        is_active: true,
        end_date: null,
        deleted_at: null,
        horizon_generated_until: { lt: threeMonthsFromNow },
      },
    });
  },

  /**
   * Count generated transactions for a recurrence.
   */
  async countTransactions(
    recurrenceId: string,
    tenantId: string,
  ): Promise<number> {
    return prisma.transaction.count({
      where: {
        recurrence_id: recurrenceId,
        tenant_id: tenantId,
        deleted_at: null,
      },
    });
  },

  /**
   * Paginated list of transactions belonging to a recurrence.
   */
  async findTransactionsByRecurrence(
    recurrenceId: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const where: Prisma.TransactionWhereInput = {
      recurrence_id: recurrenceId,
      tenant_id: tenantId,
      deleted_at: null,
    };

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ recurrence_index: 'asc' }],
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  },
};
