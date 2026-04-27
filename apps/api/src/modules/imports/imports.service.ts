// =============================================================================
// Imports Service — parsing, matching, reconciliation logic
// =============================================================================

import type { Transaction } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors';
import { checkPlanLimit, FEATURE_KEYS } from '../../lib/plan-limits';
import { importsRepository } from './imports.repository';
import { parseOFX } from './parsers/ofx.parser';
import { parseCSV, getPresetMapping } from './parsers/csv.parser';
import { parseBradescoInvoice, decodeInvoiceBuffer } from './parsers/bradesco-invoice.parser';
import { creditCardsRepository } from '../credit-cards/credit-cards.repository';
import { findCategoryRule } from '../transactions/transactions.service';
import type { ParsedTransaction } from './parsers/ofx.parser';
import type { UploadImportInput, BradescoCardMapping } from './imports.schemas';
import { csvColumnMappingSchema } from './imports.schemas';

// ---------------------------------------------------------------------------
// Matching algorithm
// ---------------------------------------------------------------------------

const SYNC_THRESHOLD = 200; // rows below which we process synchronously
const SCORE_SUGGEST = 0.5; // minimum score to include as suggestion
const SCORE_AUTO = 0.8; // minimum score to auto-reconcile
const MAX_SUGGESTIONS = 5;

export interface MatchCandidate {
  transaction: Transaction;
  score: number;
  value_score: number;
  date_score: number;
  description_score: number;
}

function wordOverlap(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  return common / Math.max(wordsA.size, wordsB.size);
}

function daysDiff(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Run the matching algorithm against a list of transactions.
 * Returns candidates sorted by score descending, filtered to score >= 0.5.
 */
export function matchingAlgorithm(
  item: ParsedTransaction,
  transactions: Transaction[],
): MatchCandidate[] {
  const candidates: MatchCandidate[] = [];

  for (const tx of transactions) {
    const txAmount = tx.amount.toNumber();
    const importAmount = Math.abs(item.amount);

    // Value score: exact match within 0.01
    const value_score = Math.abs(Math.abs(txAmount) - importAmount) <= 0.01 ? 0.4 : 0;

    // Date score
    const diff = daysDiff(item.date, tx.date);
    let date_score = 0;
    if (diff <= 2) {
      date_score = 0.3;
    } else if (diff <= 7) {
      date_score = 0.15;
    }

    // Description score: word overlap * 0.2
    const overlap = wordOverlap(item.description, tx.description);
    const description_score = overlap * 0.2;

    const score = value_score + date_score + description_score;

    if (score >= SCORE_SUGGEST) {
      candidates.push({ transaction: tx, score, value_score, date_score, description_score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// ---------------------------------------------------------------------------
// Format detection from filename / mimetype
// ---------------------------------------------------------------------------

function detectFormat(
  filename: string,
  mimetype: string,
): 'OFX' | 'CSV' | 'TXT' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx')) return 'OFX';
  if (lower.endsWith('.txt')) return 'TXT';
  if (lower.endsWith('.csv')) return 'CSV';
  if (mimetype.includes('csv') || mimetype.includes('comma')) return 'CSV';
  return 'OFX';
}

// ---------------------------------------------------------------------------
// Process import items in bulk
// ---------------------------------------------------------------------------

interface ProcessStats {
  total: number;
  matched: number;
  pending: number;
  failed: number;
}

async function processImport(
  importId: string,
  tenantId: string,
  userId: string,
  items: ParsedTransaction[],
  ipAddress?: string,
  userAgent?: string,
): Promise<ProcessStats> {
  let matched = 0;
  let failed = 0;

  // Determine date range for fetching candidate transactions (±7 days around all items)
  const dates = items.map((i) => i.date.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  minDate.setDate(minDate.getDate() - 7);
  maxDate.setDate(maxDate.getDate() + 7);

  const amounts = items.map((i) => Math.abs(i.amount));
  const amountMin = Math.max(0, Math.min(...amounts) - 0.01);
  const amountMax = Math.max(...amounts) + 0.01;

  // Fetch potential matching transactions once
  const candidateTransactions = await importsRepository.findTransactionsForMatching(
    tenantId,
    minDate,
    maxDate,
    amountMin,
    amountMax,
  );

  // Create all import items
  const createdItems = await importsRepository.createImportItems(
    items.map((item) => ({
      tenant_id: tenantId,
      import_id: importId,
      raw_data: {
        date: item.date.toISOString(),
        amount: item.amount,
        description: item.description,
        external_id: item.external_id ?? null,
      },
      date: item.date,
      amount: item.amount,
      description: item.description,
      external_id: item.external_id,
      status: 'PENDING' as const,
    })),
  );

  // Track auto-reconciled transaction IDs to avoid double-matching
  const usedTransactionIds = new Set<string>();

  for (let idx = 0; idx < createdItems.length; idx++) {
    const importItem = createdItems[idx];
    const parsedItem = items[idx];

    // Filter out already-used transactions
    const available = candidateTransactions.filter(
      (t) => !usedTransactionIds.has(t.id),
    );
    const candidates = matchingAlgorithm(parsedItem, available);

    if (candidates.length === 0 || candidates[0].score < SCORE_AUTO) {
      // Not auto-matched — leave as PENDING
      continue;
    }

    // Auto-match the best candidate
    const best = candidates[0];

    try {
      await prisma.$transaction(async (tx) => {
        // Create reconciliation
        await tx.reconciliation.create({
          data: {
            tenant_id: tenantId,
            import_item_id: importItem.id,
            transaction_id: best.transaction.id,
            score: best.score,
            matched_by: 'AUTO',
          },
        });

        // Update import item status
        await tx.importItem.update({
          where: { id: importItem.id },
          data: { status: 'MATCHED' },
        });

        // Mark transaction as reconciled
        await tx.transaction.update({
          where: { id: best.transaction.id },
          data: { is_reconciled: true },
        });

        await createAuditLog({
          prisma: tx,
          tenantId,
          userId,
          entityType: 'Reconciliation',
          entityId: importItem.id,
          action: 'CREATE',
          afterData: {
            import_item_id: importItem.id,
            transaction_id: best.transaction.id,
            score: best.score,
            matched_by: 'AUTO',
          },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        });
      });

      usedTransactionIds.add(best.transaction.id);
      matched++;
    } catch {
      failed++;
    }
  }

  const total = items.length;
  const pending = total - matched - failed;

  // Update import record
  await importsRepository.updateImport(importId, tenantId, {
    status: 'COMPLETED',
    processed_rows: total,
    matched_rows: matched,
  });

  return { total, matched, pending, failed };
}

// ---------------------------------------------------------------------------
// Service public API
// ---------------------------------------------------------------------------

export const importsService = {
  /**
   * Upload and (optionally) begin processing an import file.
   * PAID plan only.
   */
  async uploadImport(
    tenantId: string,
    userId: string,
    plan: string,
    file: Express.Multer.File,
    data: UploadImportInput,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    import_id: string;
    status: string;
    results?: ProcessStats;
  }> {
    if (plan !== 'PAID' && plan !== 'DEV') {
      throw new ForbiddenError(
        'Importação de extratos é exclusiva do plano PAID.',
      );
    }

    const content = decodeInvoiceBuffer(file.buffer);
    const format = detectFormat(file.originalname, file.mimetype);

    let parsedItems: ParsedTransaction[];

    try {
      if (format === 'OFX' || format === 'TXT') {
        parsedItems = parseOFX(content);
      } else {
        // CSV — resolve column mapping
        let mapping: { date: string; amount: string; description: string };

        if (data.column_mapping !== undefined) {
          const rawMapping = JSON.parse(data.column_mapping) as unknown;
          const parsed = csvColumnMappingSchema.safeParse(rawMapping);
          if (!parsed.success) {
            throw new ValidationError('column_mapping inválido.');
          }
          if (parsed.data.preset !== undefined && parsed.data.preset !== 'custom') {
            const preset = getPresetMapping(parsed.data.preset);
            mapping = preset ?? {
              date: parsed.data.date,
              amount: parsed.data.amount,
              description: parsed.data.description,
            };
          } else {
            mapping = {
              date: parsed.data.date,
              amount: parsed.data.amount,
              description: parsed.data.description,
            };
          }
        } else {
          throw new ValidationError(
            'column_mapping é obrigatório para arquivos CSV.',
          );
        }

        parsedItems = parseCSV(content, mapping);
      }
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(
        `Falha ao processar arquivo: ${(err as Error).message}`,
      );
    }

    // Create Import record
    const importRecord = await importsRepository.createImport({
      tenant_id: tenantId,
      account_id: data.account_id ?? null,
      credit_card_id: data.credit_card_id ?? null,
      format,
      status: 'PROCESSING',
      filename: file.originalname,
      total_rows: parsedItems.length,
    });

    await createAuditLog({
      prisma,
      tenantId,
      userId,
      entityType: 'Import',
      entityId: importRecord.id,
      action: 'CREATE',
      afterData: {
        format,
        filename: file.originalname,
        total_rows: parsedItems.length,
        account_id: data.account_id ?? null,
        credit_card_id: data.credit_card_id ?? null,
      },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });

    if (parsedItems.length === 0) {
      await importsRepository.updateImport(importRecord.id, tenantId, {
        status: 'COMPLETED',
        processed_rows: 0,
        matched_rows: 0,
      });
      return { import_id: importRecord.id, status: 'COMPLETED', results: { total: 0, matched: 0, pending: 0, failed: 0 } };
    }

    if (parsedItems.length <= SYNC_THRESHOLD) {
      // Synchronous processing
      const results = await processImport(
        importRecord.id,
        tenantId,
        userId,
        parsedItems,
        ipAddress,
        userAgent,
      );
      return { import_id: importRecord.id, status: 'COMPLETED', results };
    }

    // Async processing — defer with setImmediate
    setImmediate(() => {
      processImport(importRecord.id, tenantId, userId, parsedItems, ipAddress, userAgent).catch(
        async (err) => {
          console.error('[Import] Async processing error:', err);
          await importsRepository.updateImport(importRecord.id, tenantId, {
            status: 'FAILED',
            error_message: (err as Error).message,
          });
        },
      );
    });

    return { import_id: importRecord.id, status: 'PROCESSING' };
  },

  /**
   * List imports for tenant (paginated).
   */
  async listImports(
    tenantId: string,
    page: number,
    pageSize: number,
    status?: string,
  ) {
    const { data, total } = await importsRepository.findImports(
      tenantId,
      page,
      pageSize,
      status,
    );
    return { data, total, page, pageSize };
  },

  /**
   * Get a single import with item counts.
   */
  async getImport(id: string, tenantId: string) {
    const record = await importsRepository.findImportById(id, tenantId);
    if (record === null) {
      throw new NotFoundError('Importação não encontrada.');
    }
    return record;
  },

  /**
   * List items of an import (paginated, optional status filter).
   */
  async listImportItems(
    id: string,
    tenantId: string,
    query: { status?: string; page: number; pageSize: number },
  ) {
    // Verify import exists
    const importRecord = await importsRepository.findImportById(id, tenantId);
    if (importRecord === null) {
      throw new NotFoundError('Importação não encontrada.');
    }

    const { data, total } = await importsRepository.findImportItems(
      id,
      tenantId,
      query,
    );
    return { data, total, page: query.page, pageSize: query.pageSize };
  },

  /**
   * Get suggested transaction matches for an import item.
   */
  async getSuggestedMatches(tenantId: string, importItemId: string) {
    const item = await importsRepository.findImportItemById(
      importItemId,
      tenantId,
    );
    if (item === null) {
      throw new NotFoundError('Item de importação não encontrado.');
    }

    const itemDate = item.date;
    const dateFrom = new Date(itemDate);
    const dateTo = new Date(itemDate);
    dateFrom.setDate(dateFrom.getDate() - 7);
    dateTo.setDate(dateTo.getDate() + 7);

    const itemAmount = item.amount.toNumber();
    const amountMin = Math.max(0, Math.abs(itemAmount) - 0.01);
    const amountMax = Math.abs(itemAmount) + 0.01;

    const transactions = await importsRepository.findTransactionsForMatching(
      tenantId,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    );

    const parsedItem: ParsedTransaction = {
      date: item.date,
      amount: itemAmount,
      description: item.description,
      external_id: item.external_id ?? undefined,
    };

    const candidates = matchingAlgorithm(parsedItem, transactions).slice(
      0,
      MAX_SUGGESTIONS,
    );

    return candidates.map((c) => ({
      transaction_id: c.transaction.id,
      score: c.score,
      value_score: c.value_score,
      date_score: c.date_score,
      description_score: c.description_score,
      transaction: c.transaction,
    }));
  },

  /**
   * Manually reconcile an import item with a transaction.
   */
  async manualReconcile(
    tenantId: string,
    userId: string,
    importItemId: string,
    transactionId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const [importItem, transaction] = await Promise.all([
      importsRepository.findImportItemById(importItemId, tenantId),
      prisma.transaction.findFirst({
        where: { id: transactionId, tenant_id: tenantId, deleted_at: null },
      }),
    ]);

    if (importItem === null) {
      throw new NotFoundError('Item de importação não encontrado.');
    }
    if (transaction === null) {
      throw new NotFoundError('Transação não encontrada.');
    }
    if (importItem.status !== 'PENDING') {
      throw new ValidationError(
        'Item de importação já foi conciliado ou ignorado.',
      );
    }
    if (transaction.is_reconciled) {
      throw new ValidationError('Transação já está conciliada.');
    }

    let reconciliation: Awaited<ReturnType<typeof importsRepository.createReconciliation>>;

    await prisma.$transaction(async (tx) => {
      // Create reconciliation record
      reconciliation = await tx.reconciliation.create({
        data: {
          tenant_id: tenantId,
          import_item_id: importItemId,
          transaction_id: transactionId,
          score: 1.0,
          matched_by: userId,
        },
      });

      // Update import item
      await tx.importItem.update({
        where: { id: importItemId },
        data: { status: 'MATCHED' },
      });

      // Mark transaction as reconciled
      await tx.transaction.update({
        where: { id: transactionId },
        data: { is_reconciled: true, reconciliation_id: reconciliation.id },
      });

      await createAuditLog({
        prisma: tx,
        tenantId,
        userId,
        entityType: 'Reconciliation',
        entityId: reconciliation.id,
        action: 'CREATE',
        afterData: {
          import_item_id: importItemId,
          transaction_id: transactionId,
          score: 1.0,
          matched_by: userId,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });

    return reconciliation!;
  },

  /**
   * Undo a reconciliation.
   */
  async dereconcile(
    tenantId: string,
    userId: string,
    reconciliationId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const reconciliation = await importsRepository.findReconciliationById(
      reconciliationId,
      tenantId,
    );
    if (reconciliation === null) {
      throw new NotFoundError('Conciliação não encontrada.');
    }

    await prisma.$transaction(async (tx) => {
      // Soft delete reconciliation
      await tx.reconciliation.update({
        where: { id: reconciliationId },
        data: { deleted_at: new Date() },
      });

      // Reset import item status
      await tx.importItem.update({
        where: { id: reconciliation.import_item_id },
        data: { status: 'PENDING' },
      });

      // Unlink transaction
      await tx.transaction.update({
        where: { id: reconciliation.transaction_id },
        data: { is_reconciled: false, reconciliation_id: null },
      });

      await createAuditLog({
        prisma: tx,
        tenantId,
        userId,
        entityType: 'Reconciliation',
        entityId: reconciliationId,
        action: 'DELETE',
        beforeData: {
          import_item_id: reconciliation.import_item_id,
          transaction_id: reconciliation.transaction_id,
          score: reconciliation.score,
        },
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      });
    });
  },

  // ===========================================================================
  // Bradesco Invoice Import
  // ===========================================================================

  /**
   * Parse a Bradesco invoice CSV and return a preview of each card section
   * with existing-card matches (by last_four).  No DB writes.
   */
  async previewBradescoInvoice(
    tenantId: string,
    plan: string,
    file: Express.Multer.File,
  ) {
    if (plan !== 'PAID' && plan !== 'DEV') {
      throw new ForbiddenError('Importação de faturas é exclusiva do plano PAID.');
    }

    const content = decodeInvoiceBuffer(file.buffer);
    let invoice;
    try {
      invoice = parseBradescoInvoice(content);
    } catch (err) {
      throw new ValidationError(
        `Falha ao processar arquivo: ${(err as Error).message}`,
      );
    }

    if (invoice.cards.length === 0) {
      throw new ValidationError(
        'Nenhuma seção de cartão encontrada. Verifique se o arquivo é uma fatura Bradesco válida.',
      );
    }

    // For each card section, look for a matching card by last_four
    const allCards = await prisma.creditCard.findMany({
      where: { tenant_id: tenantId, deleted_at: null },
      select: { id: true, name: true, brand: true, last_four: true, parent_card_id: true },
    });

    const previewCards = invoice.cards.map((section) => {
      const existing = allCards.find((c) => c.last_four === section.last_four) ?? null;
      const total = section.transactions.reduce((sum, t) => sum + t.amount_brl, 0);

      return {
        holder_name: section.holder_name,
        last_four: section.last_four,
        transaction_count: section.transactions.length,
        total_amount: Math.round(total * 100) / 100,
        existing_card: existing
          ? { id: existing.id, name: existing.name, brand: existing.brand ?? null, parent_card_id: existing.parent_card_id ?? null }
          : null,
        transactions: section.transactions.slice(0, 5).map((t) => ({
          date: t.date.toISOString().substring(0, 10),
          description: t.description,
          amount: t.amount_brl,
          installment_index: t.installment_index,
          installment_total: t.installment_total,
        })),
      };
    });

    return {
      statement_date: invoice.statement_date.toISOString().substring(0, 10),
      cards: previewCards,
    };
  },

  /**
   * Import a Bradesco invoice: create missing credit cards and EXPENSE
   * transactions for every line item.
   */
  async importBradescoInvoice(
    tenantId: string,
    userId: string,
    plan: string,
    file: Express.Multer.File,
    cardMappings: BradescoCardMapping[],
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (plan !== 'PAID' && plan !== 'DEV') {
      throw new ForbiddenError('Importação de faturas é exclusiva do plano PAID.');
    }

    const content = decodeInvoiceBuffer(file.buffer);
    let invoice;
    try {
      invoice = parseBradescoInvoice(content);
    } catch (err) {
      throw new ValidationError(
        `Falha ao processar arquivo: ${(err as Error).message}`,
      );
    }

    // Count total transactions across all non-skipped cards
    const totalRows = invoice.cards.reduce((sum, s) => {
      const mapping = cardMappings.find((m) => m.last_four === s.last_four);
      if (mapping?.skip === true) return sum;
      return sum + s.transactions.length;
    }, 0);

    // Create the import record immediately so it appears in the list
    const importRecord = await importsRepository.createImport({
      tenant_id: tenantId,
      format: 'CSV',
      status: 'PROCESSING',
      filename: file.originalname,
      total_rows: totalRows,
    });

    // Build a lookup: last_four → mapping
    const mappingByLast4 = new Map(cardMappings.map((m) => [m.last_four, m]));

    // Resolve / create credit cards.
    // Process cards that create new entries in dependency order:
    // cards without a __new__ parent_card_id first, children second.
    const resolvedCards = new Map<string, string>(); // last_four → credit_card_id

    // Mark existing cards immediately
    for (const [last4, mapping] of mappingByLast4) {
      if (mapping.skip !== true && mapping.credit_card_id != null) {
        resolvedCards.set(last4, mapping.credit_card_id);
      }
    }

    // Create new cards: parents first (no __new__ dependency), then children
    const newCardMappings = cardMappings.filter(
      (m) => m.skip !== true && m.create_card != null,
    );
    const sortedNew = [
      ...newCardMappings.filter(
        (m) => !m.create_card!.parent_card_id?.startsWith('__new__'),
      ),
      ...newCardMappings.filter(
        (m) => m.create_card!.parent_card_id?.startsWith('__new__'),
      ),
    ];

    for (const mapping of sortedNew) {
      const currentCardCount = await prisma.creditCard.count({
        where: { tenant_id: tenantId, deleted_at: null, parent_card_id: null },
      });
      const limitCheck = await checkPlanLimit(
        prisma as Parameters<typeof checkPlanLimit>[0],
        plan as 'FREE' | 'PAID' | 'DEV',
        FEATURE_KEYS.MAX_CREDIT_CARDS,
        currentCardCount,
      );
      if (!limitCheck.allowed) {
        throw new ForbiddenError(
          `Limite do plano atingido: máximo de ${limitCheck.limit} cartão(ões) de crédito.`,
        );
      }

      const cc = mapping.create_card!;

      // Resolve __new__LAST4 parent references
      let resolvedParentId: string | null = cc.parent_card_id ?? null;
      if (resolvedParentId?.startsWith('__new__')) {
        const parentLast4 = resolvedParentId.replace('__new__', '');
        resolvedParentId = resolvedCards.get(parentLast4) ?? null;
      }

      // Inherit closing_day / due_day from parent when not provided
      let effectiveClosingDay = cc.closing_day ?? 1;
      let effectiveDueDay = cc.due_day ?? 1;
      if (resolvedParentId !== null && (cc.closing_day == null || cc.due_day == null)) {
        const parentCard = await prisma.creditCard.findFirst({
          where: { id: resolvedParentId, tenant_id: tenantId, deleted_at: null },
          select: { closing_day: true, due_day: true },
        });
        if (parentCard !== null) {
          effectiveClosingDay = cc.closing_day ?? parentCard.closing_day;
          effectiveDueDay = cc.due_day ?? parentCard.due_day;
        }
      }

      const newCard = await prisma.$transaction(async (tx) => {
        const internalAccount = await tx.account.create({
          data: {
            tenant_id: tenantId,
            name: `[CC] ${cc.name}`,
            type: 'INTERNAL',
            initial_balance: 0,
            currency: 'BRL',
            is_active: true,
          },
        });

        const card = await tx.creditCard.create({
          data: {
            tenant_id: tenantId,
            name: cc.name,
            brand: cc.brand ?? null,
            last_four: mapping.last_four,
            limit_total: new Prisma.Decimal(cc.limit_total ?? 0),
            limit_used: new Prisma.Decimal(0),
            limit_available: new Prisma.Decimal(cc.limit_total ?? 0),
            closing_day: effectiveClosingDay,
            due_day: effectiveDueDay,
            parent_card_id: resolvedParentId,
            internal_account_id: internalAccount.id,
            is_active: true,
          },
        });

        await createAuditLog({
          prisma: tx,
          tenantId,
          userId,
          entityType: 'CreditCard',
          entityId: card.id,
          action: 'CREATE',
          afterData: { name: cc.name, last_four: mapping.last_four },
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        });

        return card;
      });

      resolvedCards.set(mapping.last_four, newCard.id);
    }

    // Create transactions for each card section
    let importedCount = 0;
    const errors: string[] = [];
    const importItemsToCreate: Array<{
      tenant_id: string;
      import_id: string;
      raw_data: Record<string, unknown>;
      date: Date;
      amount: number;
      description: string;
      status: 'PENDING' | 'MATCHED' | 'IGNORED';
    }> = [];

    for (const section of invoice.cards) {
      const creditCardId = resolvedCards.get(section.last_four);
      if (creditCardId === undefined) continue; // skipped

      // Get the internal account for this card (needed for ledger entries)
      const card = await prisma.creditCard.findFirst({
        where: { id: creditCardId, tenant_id: tenantId, deleted_at: null },
        select: { internal_account_id: true, closing_day: true, due_day: true, parent_card_id: true },
      });
      if (card === null) continue;
      const principalCardId = card.parent_card_id ?? creditCardId;

      // When Bradesco lists multiple parcels of the same purchase in the same
      // invoice (e.g. 3/6, 4/6, 5/6, 6/6 all appear as separate lines), we only
      // need to process the one with the lowest instIndex — it will generate all
      // the remaining parcels. Mark the higher-index duplicates as IGNORED so we
      // don't create multiple Installment groups for the same purchase.
      const seenInstallmentKey = new Set<string>();

      for (const txn of section.transactions) {
        const instIndex = txn.installment_index;
        const instTotal = txn.installment_total;
        const isInstallment = instIndex !== null && instTotal !== null && instTotal > 1;

        try {
          if (isInstallment) {
            // ----------------------------------------------------------------
            // INSTALLMENT PATH
            // The date on the imported line is the purchase date (= date of parcela 1).
            // Parcelas are generated forward: parcela i falls on txn.date + (i-1) months.
            // ----------------------------------------------------------------
            const descBase = txn.description;
            const totalAmount = new Prisma.Decimal(txn.amount_brl).mul(instTotal);

            // Bradesco lists every open parcel as a separate line (3/6, 4/6, 5/6, 6/6).
            // We group by "description + total" and only process the lowest instIndex —
            // that one generates all remaining parcels. Skip the rest to avoid duplicates.
            const instGroupKey = `${descBase}__${instTotal}__${txn.amount_brl}`;
            if (seenInstallmentKey.has(instGroupKey)) {
              importItemsToCreate.push({
                tenant_id: tenantId,
                import_id: importRecord.id,
                date: txn.date,
                amount: txn.amount_brl,
                description: `${descBase} (${instIndex}/${instTotal})`,
                status: 'IGNORED',
                raw_data: { card: section.last_four, action: 'duplicate_parcel_in_statement' },
              });
              continue;
            }
            seenInstallmentKey.add(instGroupKey);

            // The imported date is the date of parcel instIndex.
            // Back-calculate parcel 1 date so the full sequence is correct.
            const firstInstDate = new Date(Date.UTC(
              txn.date.getUTCFullYear(),
              txn.date.getUTCMonth() - (instIndex - 1),
              txn.date.getUTCDate(),
            ));

            // Dedup: check if the specific installment transaction (parcela instIndex) already exists.
            // Use a ±1-day window on the date to absorb UTC vs local-time differences between
            // manually created installments (local Date) and imported ones (UTC midnight).
            const dedupDateFrom = new Date(Date.UTC(
              txn.date.getUTCFullYear(), txn.date.getUTCMonth(), txn.date.getUTCDate() - 1,
            ));
            const dedupDateTo = new Date(Date.UTC(
              txn.date.getUTCFullYear(), txn.date.getUTCMonth(), txn.date.getUTCDate() + 1,
            ));
            const existingInstallment = await prisma.transaction.findFirst({
              where: {
                tenant_id: tenantId,
                credit_card_id: creditCardId,
                date: { gte: dedupDateFrom, lte: dedupDateTo },
                amount: new Prisma.Decimal(txn.amount_brl),
                description: `${descBase} (${instIndex}/${instTotal})`,
                deleted_at: null,
              },
              select: { id: true },
            });

            let itemAction: 'created' | 'duplicate' = 'created';

            if (existingInstallment !== null) {
              itemAction = 'duplicate';
            } else {
              // Individual installment amount (equal split; last gets remainder)
              const baseAmt = new Prisma.Decimal(txn.amount_brl); // each parcel = value from extract
              const remainder = totalAmount.sub(baseAmt.mul(instTotal)); // should be 0 for equal splits

              // Only create parcels from instIndex onwards (past ones already happened)
              const today = new Date();

              await prisma.$transaction(async (tx) => {
                // Parent transaction — anchor for the Installment record only.
                // credit_card_id is null so it does NOT appear in any invoice listing.
                const parentTransaction = await tx.transaction.create({
                  data: {
                    tenant_id: tenantId,
                    user_id: userId,
                    type: 'EXPENSE',
                    status: 'REALIZADO',
                    amount: totalAmount,
                    description: descBase,
                    date: firstInstDate,
                    credit_card_id: null,
                    is_reconciled: false,
                    import_id: importRecord.id,
                  },
                });

                // Installment record
                const installment = await tx.installment.create({
                  data: {
                    tenant_id: tenantId,
                    parent_transaction_id: parentTransaction.id,
                    total_amount: totalAmount,
                    total_installments: instTotal,
                    credit_card_id: creditCardId,
                    description: descBase,
                  },
                });

                // Create installment transactions starting from instIndex (skip past ones)
                for (let i = instIndex; i <= instTotal; i++) {
                  const instAmount = i === instTotal
                    ? baseAmt.add(remainder)
                    : baseAmt;

                  // Date of installment i = firstInstDate + (i-1) months
                  const instDate = new Date(Date.UTC(
                    firstInstDate.getUTCFullYear(),
                    firstInstDate.getUTCMonth() + (i - 1),
                    firstInstDate.getUTCDate(),
                  ));

                  // Parcelas cuja data já passou (≤ hoje) = REALIZADO, futuras = PREVISTO
                  const instStatus = instDate <= today ? 'REALIZADO' : 'PREVISTO';

                  const invoice = await creditCardsRepository.findOrCreateInvoice(
                    creditCardId, tenantId, instDate, tx,
                  );

                  const instCategoryId = await findCategoryRule(tenantId, descBase);

                  const itemTx = await tx.transaction.create({
                    data: {
                      tenant_id: tenantId,
                      user_id: userId,
                      type: 'EXPENSE',
                      status: instStatus,
                      amount: instAmount,
                      description: `${descBase} (${i}/${instTotal})`,
                      date: instDate,
                      credit_card_id: creditCardId,
                      credit_card_invoice_id: invoice.id,
                      installment_id: installment.id,
                      recurrence_index: i,
                      is_reconciled: instStatus === 'REALIZADO',
                      import_id: importRecord.id,
                      category_id: instCategoryId,
                    },
                  });

                  await tx.ledgerEntry.create({
                    data: {
                      tenant_id: tenantId,
                      account_id: card.internal_account_id,
                      transaction_id: itemTx.id,
                      type: 'DEBIT',
                      amount: instAmount,
                      status: instStatus,
                    },
                  });

                  await tx.installmentItem.create({
                    data: {
                      tenant_id: tenantId,
                      installment_id: installment.id,
                      transaction_id: itemTx.id,
                      credit_card_invoice_id: invoice.id,
                      installment_number: i,
                      amount: instAmount,
                    },
                  });

                  await creditCardsRepository.updateInvoiceAmount(invoice.id, tenantId, instAmount, tx);
                }

                // Block full limit on principal card once
                await creditCardsRepository.blockLimit(principalCardId, tenantId, totalAmount, tx);
              });

              importedCount++;
            }

            importItemsToCreate.push({
              tenant_id: tenantId,
              import_id: importRecord.id,
              date: txn.date,
              amount: txn.amount_brl,
              description: `${descBase} (${instIndex}/${instTotal})`,
              status: itemAction === 'duplicate' ? 'IGNORED' : 'MATCHED',
              raw_data: { card: section.last_four, action: itemAction, installment: true },
            });

          } else {
            // ----------------------------------------------------------------
            // SIMPLE TRANSACTION PATH (unchanged)
            // ----------------------------------------------------------------
            let description = txn.description;
            if (instIndex !== null && instTotal !== null) {
              description += ` (${instIndex}/${instTotal})`;
            }

            const dupDateFrom = new Date(Date.UTC(
              txn.date.getUTCFullYear(), txn.date.getUTCMonth(), txn.date.getUTCDate() - 1,
            ));
            const dupDateTo = new Date(Date.UTC(
              txn.date.getUTCFullYear(), txn.date.getUTCMonth(), txn.date.getUTCDate() + 1,
            ));
            const duplicate = await prisma.transaction.findFirst({
              where: {
                tenant_id: tenantId,
                credit_card_id: creditCardId,
                date: { gte: dupDateFrom, lte: dupDateTo },
                amount: new Prisma.Decimal(txn.amount_brl),
                description,
                deleted_at: null,
              },
              select: { id: true, credit_card_invoice_id: true },
            });

            let changed = false;
            let itemAction: 'created' | 'repaired' | 'duplicate' = 'created';
            await prisma.$transaction(async (tx) => {
              const invoice = await creditCardsRepository.findOrCreateInvoice(
                creditCardId, tenantId, txn.date, tx,
              );
              const invoiceId = invoice.id;

              if (duplicate !== null) {
                if (duplicate.credit_card_invoice_id !== invoiceId) {
                  await tx.transaction.update({
                    where: { id: duplicate.id },
                    data: { credit_card_invoice_id: invoiceId, import_id: importRecord.id },
                  });
                  if (duplicate.credit_card_invoice_id === null) {
                    await creditCardsRepository.updateInvoiceAmount(invoiceId, tenantId, new Prisma.Decimal(txn.amount_brl), tx);
                    await creditCardsRepository.blockLimit(principalCardId, tenantId, new Prisma.Decimal(txn.amount_brl), tx);
                  }
                  changed = true;
                  itemAction = 'repaired';
                } else {
                  itemAction = 'duplicate';
                }
                return;
              }

              const simpleCategoryId = await findCategoryRule(tenantId, description);

              const created = await tx.transaction.create({
                data: {
                  tenant_id: tenantId,
                  user_id: userId,
                  type: 'EXPENSE',
                  status: 'REALIZADO',
                  amount: new Prisma.Decimal(txn.amount_brl),
                  description,
                  date: txn.date,
                  credit_card_id: creditCardId,
                  credit_card_invoice_id: invoiceId,
                  is_reconciled: false,
                  import_id: importRecord.id,
                  category_id: simpleCategoryId,
                },
              });

              await tx.ledgerEntry.create({
                data: {
                  tenant_id: tenantId,
                  account_id: card.internal_account_id,
                  transaction_id: created.id,
                  type: 'DEBIT',
                  amount: new Prisma.Decimal(txn.amount_brl),
                  status: 'REALIZADO',
                },
              });

              await creditCardsRepository.updateInvoiceAmount(invoiceId, tenantId, new Prisma.Decimal(txn.amount_brl), tx);
              await creditCardsRepository.blockLimit(principalCardId, tenantId, new Prisma.Decimal(txn.amount_brl), tx);

              changed = true;
              itemAction = 'created';
            });

            if (changed) importedCount++;

            importItemsToCreate.push({
              tenant_id: tenantId,
              import_id: importRecord.id,
              date: txn.date,
              amount: txn.amount_brl,
              description,
              status: (itemAction as string) === 'duplicate' ? 'IGNORED' : 'MATCHED',
              raw_data: { card: section.last_four, action: itemAction },
            });
          }

        } catch (err) {
          const errMsg = (err as Error).message;
          errors.push(`${section.last_four} / ${txn.description}: ${errMsg}`);

          let description = txn.description;
          if (instIndex !== null && instTotal !== null) {
            description += ` (${instIndex}/${instTotal})`;
          }
          importItemsToCreate.push({
            tenant_id: tenantId,
            import_id: importRecord.id,
            date: txn.date,
            amount: txn.amount_brl,
            description,
            status: 'PENDING',
            raw_data: { card: section.last_four, action: 'error', error: errMsg },
          });
        }
      }
    }

    // Persist import items (all statuses)
    if (importItemsToCreate.length > 0) {
      await importsRepository.createImportItems(importItemsToCreate);
    }

    // Update import record with final status
    await importsRepository.updateImport(importRecord.id, tenantId, {
      status: errors.length > 0 && importedCount === 0 ? 'FAILED' : 'COMPLETED',
      processed_rows: importItemsToCreate.length,
      matched_rows: importedCount,
      total_rows: totalRows,
      error_message: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
    });

    return {
      import_id: importRecord.id,
      imported: importedCount,
      cards_resolved: resolvedCards.size,
      errors: errors.length,
      error_details: errors.slice(0, 10),
    };
  },

  /**
   * List transactions created from a specific import (via import_id).
   */
  async listImportTransactions(
    id: string,
    tenantId: string,
    page: number,
    pageSize: number,
  ) {
    const record = await importsRepository.findImportById(id, tenantId);
    if (record === null) {
      throw new NotFoundError('Importação não encontrada.');
    }

    const skip = (page - 1) * pageSize;
    const [transactions, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where: { import_id: id, tenant_id: tenantId, deleted_at: null },
        skip,
        take: pageSize,
        orderBy: { date: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
          credit_card: { select: { id: true, name: true, last_four: true, brand: true } },
        },
      }),
      prisma.transaction.count({
        where: { import_id: id, tenant_id: tenantId, deleted_at: null },
      }),
    ]);

    return { data: transactions, total, page, pageSize };
  },

  /**
   * Delete an import and all transactions created from it.
   */
  async deleteImport(
    id: string,
    tenantId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const record = await importsRepository.findImportById(id, tenantId);
    if (record === null) {
      throw new NotFoundError('Importação não encontrada.');
    }

    await importsRepository.softDeleteImport(id, tenantId);

    await createAuditLog({
      prisma,
      tenantId,
      userId,
      entityType: 'Import',
      entityId: id,
      action: 'DELETE',
      beforeData: { filename: record.filename, status: record.status },
      afterData: null,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  },

  /**
   * Mark an import item as ignored.
   */
  async ignoreImportItem(
    tenantId: string,
    userId: string,
    importItemId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const item = await importsRepository.findImportItemById(
      importItemId,
      tenantId,
    );
    if (item === null) {
      throw new NotFoundError('Item de importação não encontrado.');
    }
    if (item.status !== 'PENDING') {
      throw new ValidationError('Apenas itens pendentes podem ser ignorados.');
    }

    await importsRepository.updateImportItem(importItemId, tenantId, {
      status: 'IGNORED',
    });

    await createAuditLog({
      prisma,
      tenantId,
      userId,
      entityType: 'ImportItem',
      entityId: importItemId,
      action: 'UPDATE',
      beforeData: { status: 'PENDING' },
      afterData: { status: 'IGNORED' },
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    });
  },
};
