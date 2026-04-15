import {
  Prisma,
  type Transaction,
  type LedgerEntry,
  type TransactionStatus,
  type LedgerEntryType,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ListTransactionsQuery } from './transactions.schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LedgerEntryCreateInput {
  tenant_id: string;
  account_id: string;
  transaction_id: string;
  type: LedgerEntryType;
  amount: Prisma.Decimal | number;
  status: TransactionStatus;
}

export type TransactionWithRelations = Transaction & {
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  credit_card: { id: string; name: string; last_four: string; brand: string | null } | null;
  transaction_tags: Array<{
    tag: { id: string; name: string; color: string | null };
  }>;
};

// ---------------------------------------------------------------------------
// São Paulo timezone helpers
// ---------------------------------------------------------------------------

/** Convert a YYYY-MM-DD local date string to UTC start-of-day in São Paulo TZ */
function toStartOfDaySP(dateStr: string): Date {
  // America/Sao_Paulo is UTC-3 (standard) / UTC-2 (summer). Using fixed offset
  // -03:00 for the start boundary is conservative and correct for most of the year.
  return new Date(`${dateStr}T00:00:00-03:00`);
}

/** Convert a YYYY-MM-DD local date string to UTC end-of-day in São Paulo TZ */
function toEndOfDaySP(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999-03:00`);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const transactionsRepository = {
  /**
   * List transactions with filtering and pagination.
   */
  async findAll(
    tenantId: string,
    query: ListTransactionsQuery,
  ): Promise<{ transactions: TransactionWithRelations[]; total: number }> {
    const {
      page,
      pageSize,
      type,
      status,
      account_id,
      credit_card_id,
      category_id,
      tag_id,
      date_from,
      date_to,
      amount_min,
      amount_max,
      search,
      is_reconciled,
      credit_card_invoice_id,
    } = query;

    const where: Prisma.TransactionWhereInput = {
      tenant_id: tenantId,
      deleted_at: null,
    };

    if (type !== undefined) where.type = type;
    if (status !== undefined) where.status = status;
    if (account_id !== undefined) where.account_id = account_id;
    if (credit_card_id !== undefined) {
      where.credit_card_id = credit_card_id;
    } else {
      // Exclude credit card expense entries (they belong to invoices, not the general ledger)
      where.credit_card_id = null;
    }
    if (category_id !== undefined) where.category_id = category_id;
    if (is_reconciled !== undefined) where.is_reconciled = is_reconciled;
    if (credit_card_invoice_id !== undefined) where.credit_card_invoice_id = credit_card_invoice_id;

    if (search !== undefined && search.length > 0) {
      // Suporta formato brasileiro: "1.500,00" → "1500.00", "650" → "650"
      const normalizedSearch = search.indexOf(',') !== -1
        ? search.replace(/\./g, '').replace(',', '.')
        : search;
      const numericSearch = parseFloat(normalizedSearch);

      if (!isNaN(numericSearch) && numericSearch > 0) {
        // Busca por substring no valor: "650" encontra 650.00, 1650.00, 6500.00, etc.
        const amountPattern = `%${normalizedSearch}%`;
        const amountMatches = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `SELECT id FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL AND CAST(amount AS TEXT) LIKE $2`,
          tenantId,
          amountPattern,
        );
        const matchingIds = amountMatches.map((r) => r.id);

        where.AND = [
          {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              ...(matchingIds.length > 0 ? [{ id: { in: matchingIds } }] : []),
            ],
          },
        ];
      } else {
        where.description = { contains: search, mode: 'insensitive' };
      }
    }

    if (date_from !== undefined || date_to !== undefined) {
      where.date = {
        ...(date_from !== undefined ? { gte: toStartOfDaySP(date_from) } : {}),
        ...(date_to !== undefined ? { lte: toEndOfDaySP(date_to) } : {}),
      };
    }

    if (amount_min !== undefined || amount_max !== undefined) {
      where.amount = {
        ...(amount_min !== undefined ? { gte: new Prisma.Decimal(amount_min) } : {}),
        ...(amount_max !== undefined ? { lte: new Prisma.Decimal(amount_max) } : {}),
      };
    }

    if (tag_id !== undefined) {
      where.transaction_tags = {
        some: {
          tag_id,
          deleted_at: null,
        },
      };
    }

    const skip = (page - 1) * pageSize;

    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        include: {
          category: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          credit_card: { select: { id: true, name: true, last_four: true, brand: true } },
          transaction_tags: {
            where: { deleted_at: null },
            include: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions: transactions as TransactionWithRelations[], total };
  },

  /**
   * Find a single transaction by id scoped to tenant.
   */
  async findById(
    id: string,
    tenantId: string,
  ): Promise<TransactionWithRelations | null> {
    const transaction = await prisma.transaction.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        credit_card: { select: { id: true, name: true, last_four: true, brand: true } },
        transaction_tags: {
          where: { deleted_at: null },
          include: {
            tag: { select: { id: true, name: true, color: true } },
          },
        },
      },
    });
    return transaction as TransactionWithRelations | null;
  },

  /**
   * Raw create — ledger entries handled by the service layer.
   */
  async create(
    tx: Prisma.TransactionClient,
    data: Prisma.TransactionUncheckedCreateInput,
  ): Promise<Transaction> {
    return tx.transaction.create({ data });
  },

  /**
   * Update a transaction record.
   */
  async update(
    tx: Prisma.TransactionClient,
    id: string,
    tenantId: string,
    data: Prisma.TransactionUncheckedUpdateInput,
  ): Promise<Transaction> {
    return tx.transaction.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  /**
   * Soft-delete a transaction.
   */
  async softDelete(
    tx: Prisma.TransactionClient,
    id: string,
    tenantId: string,
  ): Promise<Transaction> {
    return tx.transaction.update({
      where: { id },
      data: { deleted_at: new Date(), tenant_id: tenantId },
    });
  },

  /**
   * Bulk-create ledger entries.
   */
  async createLedgerEntries(
    tx: Prisma.TransactionClient,
    entries: LedgerEntryCreateInput[],
  ): Promise<LedgerEntry[]> {
    const created: LedgerEntry[] = [];
    for (const entry of entries) {
      const record = await tx.ledgerEntry.create({ data: entry });
      created.push(record);
    }
    return created;
  },

  /**
   * Update status of all ledger entries for a transaction.
   */
  async updateLedgerEntriesStatus(
    tx: Prisma.TransactionClient,
    transactionId: string,
    tenantId: string,
    status: TransactionStatus,
  ): Promise<void> {
    await tx.ledgerEntry.updateMany({
      where: {
        transaction_id: transactionId,
        tenant_id: tenantId,
        deleted_at: null,
      },
      data: { status },
    });
  },

  /**
   * Soft-delete all ledger entries for a transaction (used on cancellation/delete).
   */
  async softDeleteLedgerEntries(
    tx: Prisma.TransactionClient,
    transactionId: string,
    tenantId: string,
  ): Promise<void> {
    await tx.ledgerEntry.updateMany({
      where: {
        transaction_id: transactionId,
        tenant_id: tenantId,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
  },

  /**
   * Upsert transaction tags (add new tags, ignore already-existing ones).
   */
  async addTags(
    tx: Prisma.TransactionClient,
    transactionId: string,
    tenantId: string,
    tagIds: string[],
  ): Promise<void> {
    for (const tag_id of tagIds) {
      await tx.transactionTag.upsert({
        where: { transaction_id_tag_id: { transaction_id: transactionId, tag_id } },
        create: { transaction_id: transactionId, tenant_id: tenantId, tag_id },
        update: { deleted_at: null },
      });
    }
  },

  /**
   * Soft-delete specific tags from a transaction.
   */
  async removeTags(
    tx: Prisma.TransactionClient,
    transactionId: string,
    tenantId: string,
    tagIds: string[],
  ): Promise<void> {
    await tx.transactionTag.updateMany({
      where: {
        transaction_id: transactionId,
        tenant_id: tenantId,
        tag_id: { in: tagIds },
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
  },

  /**
   * Sync tags — soft-delete removed tags, upsert new tags (replace all).
   */
  async syncTags(
    tx: Prisma.TransactionClient,
    transactionId: string,
    tenantId: string,
    tagIds: string[],
  ): Promise<void> {
    // Soft-delete all current tags not in the new list
    await tx.transactionTag.updateMany({
      where: {
        transaction_id: transactionId,
        tenant_id: tenantId,
        tag_id: { notIn: tagIds },
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });

    // Upsert all tags in the new list
    for (const tag_id of tagIds) {
      await tx.transactionTag.upsert({
        where: { transaction_id_tag_id: { transaction_id: transactionId, tag_id } },
        create: { transaction_id: transactionId, tenant_id: tenantId, tag_id },
        update: { deleted_at: null },
      });
    }
  },
};

export type { PrismaClient };
