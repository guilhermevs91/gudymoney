// =============================================================================
// Imports Repository — CRUD + specialized queries
// =============================================================================

import { Prisma, type Import, type ImportItem, type Reconciliation, type Transaction } from '@prisma/client';
import { prisma } from '../../lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportWithCounts = Import & {
  _count: { import_items: number };
  pending_count: number;
  matched_count: number;
  ignored_count: number;
};

export type ImportItemWithReconciliation = ImportItem & {
  reconciliation: Reconciliation | null;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const importsRepository = {
  // -------------------------------------------------------------------------
  // Import records
  // -------------------------------------------------------------------------

  async createImport(data: {
    tenant_id: string;
    account_id?: string | null;
    credit_card_id?: string | null;
    format: 'OFX' | 'CSV' | 'TXT';
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    filename: string;
    total_rows: number;
  }): Promise<Import> {
    return prisma.import.create({ data });
  },

  async updateImport(
    id: string,
    tenantId: string,
    data: Partial<{
      status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
      processed_rows: number;
      matched_rows: number;
      total_rows: number;
      error_message: string | null;
    }>,
  ): Promise<Import> {
    return prisma.import.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  /**
   * Soft-delete an import and all transactions created from it (including their ledger entries).
   */
  async softDeleteImport(id: string, tenantId: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Get all transactions linked to this import (with amount + invoice info)
      const txRecords = await tx.transaction.findMany({
        where: { import_id: id, tenant_id: tenantId, deleted_at: null },
        select: { id: true, amount: true, credit_card_invoice_id: true },
      });
      const transactionIds = txRecords.map((t) => t.id);

      // Soft-delete ledger entries for those transactions
      if (transactionIds.length > 0) {
        await tx.ledgerEntry.updateMany({
          where: { transaction_id: { in: transactionIds }, deleted_at: null },
          data: { deleted_at: now },
        });
      }

      // Reverse the invoice total_amount for each affected invoice
      const invoiceAmounts = new Map<string, Prisma.Decimal>();
      for (const t of txRecords) {
        if (t.credit_card_invoice_id !== null) {
          const prev = invoiceAmounts.get(t.credit_card_invoice_id) ?? new Prisma.Decimal(0);
          invoiceAmounts.set(t.credit_card_invoice_id, prev.add(t.amount));
        }
      }
      for (const [invoiceId, totalToRemove] of invoiceAmounts) {
        await tx.creditCardInvoice.update({
          where: { id: invoiceId },
          data: { total_amount: { decrement: totalToRemove } },
        });
      }

      // Soft-delete transactions linked to this import
      await tx.transaction.updateMany({
        where: { import_id: id, tenant_id: tenantId, deleted_at: null },
        data: { deleted_at: now },
      });

      // Soft-delete import items
      await tx.importItem.updateMany({
        where: { import_id: id, tenant_id: tenantId, deleted_at: null },
        data: { deleted_at: now },
      });

      // Soft-delete the import record
      await tx.import.update({
        where: { id },
        data: { deleted_at: now, tenant_id: tenantId },
      });
    });
  },

  async findImports(
    tenantId: string,
    page: number,
    pageSize: number,
    status?: string,
  ): Promise<{ data: Import[]; total: number }> {
    const where: Prisma.ImportWhereInput = {
      tenant_id: tenantId,
      deleted_at: null,
      ...(status !== undefined ? { status: status as Import['status'] } : {}),
    };

    const skip = (page - 1) * pageSize;
    const [data, total] = await prisma.$transaction([
      prisma.import.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      prisma.import.count({ where }),
    ]);

    return { data, total };
  },

  async findImportById(
    id: string,
    tenantId: string,
  ): Promise<ImportWithCounts | null> {
    const record = await prisma.import.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });

    if (record === null) return null;

    // Aggregate status counts manually for SQLite/PG compatibility
    const [pending, matched, ignored] = await prisma.$transaction([
      prisma.importItem.count({
        where: { import_id: id, tenant_id: tenantId, status: 'PENDING', deleted_at: null },
      }),
      prisma.importItem.count({
        where: { import_id: id, tenant_id: tenantId, status: 'MATCHED', deleted_at: null },
      }),
      prisma.importItem.count({
        where: { import_id: id, tenant_id: tenantId, status: 'IGNORED', deleted_at: null },
      }),
    ]);

    return {
      ...record,
      _count: { import_items: pending + matched + ignored },
      pending_count: pending,
      matched_count: matched,
      ignored_count: ignored,
    };
  },

  // -------------------------------------------------------------------------
  // Import Items
  // -------------------------------------------------------------------------

  async createImportItems(
    items: Array<{
      tenant_id: string;
      import_id: string;
      raw_data: Record<string, unknown>;
      date: Date;
      amount: number;
      description: string;
      external_id?: string;
      status: 'PENDING' | 'MATCHED' | 'IGNORED';
    }>,
  ): Promise<ImportItem[]> {
    // createMany does not return records in Prisma; use sequential creates to get IDs
    const created: ImportItem[] = [];
    for (const item of items) {
      const record = await prisma.importItem.create({
        data: {
          tenant_id: item.tenant_id,
          import_id: item.import_id,
          raw_data: item.raw_data as Prisma.InputJsonValue,
          date: item.date,
          amount: new Prisma.Decimal(item.amount),
          description: item.description,
          external_id: item.external_id ?? null,
          status: item.status,
        },
      });
      created.push(record);
    }
    return created;
  },

  async findImportItems(
    importId: string,
    tenantId: string,
    query: { status?: string; page: number; pageSize: number },
  ): Promise<{ data: ImportItemWithReconciliation[]; total: number }> {
    const where: Prisma.ImportItemWhereInput = {
      import_id: importId,
      tenant_id: tenantId,
      deleted_at: null,
      ...(query.status !== undefined
        ? { status: query.status as ImportItem['status'] }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await prisma.$transaction([
      prisma.importItem.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { date: 'asc' },
        include: { reconciliation: true },
      }),
      prisma.importItem.count({ where }),
    ]);

    return { data: data as ImportItemWithReconciliation[], total };
  },

  async findImportItemById(
    id: string,
    tenantId: string,
  ): Promise<ImportItemWithReconciliation | null> {
    const item = await prisma.importItem.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
      include: { reconciliation: true },
    });
    return item as ImportItemWithReconciliation | null;
  },

  async updateImportItem(
    id: string,
    tenantId: string,
    data: Partial<{ status: 'PENDING' | 'MATCHED' | 'IGNORED' }>,
  ): Promise<ImportItem> {
    return prisma.importItem.update({
      where: { id },
      data: { ...data, tenant_id: tenantId },
    });
  },

  // -------------------------------------------------------------------------
  // Reconciliations
  // -------------------------------------------------------------------------

  async createReconciliation(data: {
    tenant_id: string;
    import_item_id: string;
    transaction_id: string;
    score: number;
    matched_by: string;
  }): Promise<Reconciliation> {
    return prisma.reconciliation.create({ data });
  },

  async findReconciliationById(
    id: string,
    tenantId: string,
  ): Promise<Reconciliation | null> {
    return prisma.reconciliation.findFirst({
      where: { id, tenant_id: tenantId, deleted_at: null },
    });
  },

  async softDeleteReconciliation(id: string, tenantId: string): Promise<void> {
    await prisma.reconciliation.update({
      where: { id },
      data: { deleted_at: new Date(), tenant_id: tenantId },
    });
  },

  // -------------------------------------------------------------------------
  // Transaction lookup for matching
  // -------------------------------------------------------------------------

  async findTransactionsForMatching(
    tenantId: string,
    dateFrom: Date,
    dateTo: Date,
    amountMin: number,
    amountMax: number,
  ): Promise<Transaction[]> {
    return prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        is_reconciled: false,
        date: { gte: dateFrom, lte: dateTo },
        amount: {
          gte: new Prisma.Decimal(amountMin),
          lte: new Prisma.Decimal(amountMax),
        },
      },
      orderBy: { date: 'asc' },
    });
  },
};
