// =============================================================================
// Imports Controller
// =============================================================================

import type { Request, Response, NextFunction } from 'express';
import { importsService } from './imports.service';
import { bradescoImportSchema } from './imports.schemas';
import type { ReconcileInput, ListImportItemsQuery, ListImportsQuery } from './imports.schemas';

export const importsController = {
  /**
   * POST /imports/upload
   * Upload and parse an OFX/CSV/TXT statement file.
   */
  async uploadImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const plan = req.tenant!.plan;
      const userId = req.user!.userId;
      const file = req.file;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      if (file === undefined) {
        res.status(400).json({ error: 'Arquivo é obrigatório.', code: 'VALIDATION_ERROR' });
        return;
      }

      const result = await importsService.uploadImport(
        tenantId,
        userId,
        plan,
        file,
        req.body as Parameters<typeof importsService.uploadImport>[4],
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      const statusCode = result.status === 'PROCESSING' ? 202 : 201;
      res.status(statusCode).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /imports
   * List imports (paginated).
   */
  async listImports(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const query = req.query as unknown as ListImportsQuery;

      const result = await importsService.listImports(
        tenantId,
        query.page,
        query.pageSize,
        query.status,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /imports/:id
   * Get a single import with item counts.
   */
  async getImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;

      const record = await importsService.getImport(id, tenantId);
      res.status(200).json(record);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /imports/:id/items
   * List import items for an import (paginated, optional status filter).
   */
  async listImportItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      const query = req.query as unknown as ListImportItemsQuery;

      const result = await importsService.listImportItems(id, tenantId, {
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /imports/:id/items/:itemId/suggestions
   * Get suggested transaction matches for an import item.
   */
  async getSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const itemId = req.params['itemId'] as string;

      const suggestions = await importsService.getSuggestedMatches(tenantId, itemId);
      res.status(200).json({ data: suggestions });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /imports/reconcile
   * Manually link an import item to a transaction.
   */
  async manualReconcile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const body = req.body as ReconcileInput;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      const reconciliation = await importsService.manualReconcile(
        tenantId,
        userId,
        body.import_item_id,
        body.transaction_id,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(201).json(reconciliation);
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /imports/reconcile/:reconciliationId
   * Undo a reconciliation.
   */
  async dereconcile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const reconciliationId = req.params['reconciliationId'] as string;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      await importsService.dereconcile(
        tenantId,
        userId,
        reconciliationId,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /imports/bradesco-invoice/preview
   * Parse a Bradesco invoice CSV and return a preview (no DB writes).
   */
  async previewBradescoInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const plan = req.tenant!.plan;
      const file = req.file;

      if (file === undefined) {
        res.status(400).json({ error: 'Arquivo é obrigatório.', code: 'VALIDATION_ERROR' });
        return;
      }

      const preview = await importsService.previewBradescoInvoice(tenantId, plan, file);
      res.status(200).json(preview);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /imports/bradesco-invoice/import
   * Import transactions from a Bradesco invoice CSV.
   */
  async importBradescoInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const plan = req.tenant!.plan;
      const userId = req.user!.userId;
      const file = req.file;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      if (file === undefined) {
        res.status(400).json({ error: 'Arquivo é obrigatório.', code: 'VALIDATION_ERROR' });
        return;
      }

      // card_mappings is sent as a JSON string in the multipart form body
      const rawMappings = (req.body as Record<string, unknown>)['card_mappings'];
      if (rawMappings === undefined) {
        res.status(400).json({ error: 'card_mappings é obrigatório.', code: 'VALIDATION_ERROR' });
        return;
      }
      let parsedBody: unknown;
      try {
        parsedBody = { card_mappings: typeof rawMappings === 'string' ? JSON.parse(rawMappings) : rawMappings };
      } catch {
        res.status(400).json({ error: 'card_mappings deve ser um JSON válido.', code: 'VALIDATION_ERROR' });
        return;
      }
      const validated = bradescoImportSchema.safeParse(parsedBody);
      if (!validated.success) {
        res.status(400).json({ error: validated.error.errors[0]?.message ?? 'Dados inválidos.', code: 'VALIDATION_ERROR' });
        return;
      }

      const result = await importsService.importBradescoInvoice(
        tenantId,
        userId,
        plan,
        file,
        validated.data.card_mappings,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /imports/:id/transactions
   * List transactions created from a specific import (Bradesco invoice imports).
   */
  async listImportTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const pageSize = parseInt(String(req.query['pageSize'] ?? '200'), 10);

      const result = await importsService.listImportTransactions(id, tenantId, page, pageSize);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /imports/:id
   * Delete an import and all transactions created from it.
   */
  async deleteImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      await importsService.deleteImport(
        id,
        tenantId,
        userId,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /imports/:id/items/:itemId/ignore
   * Mark an import item as ignored.
   */
  async ignoreImportItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const itemId = req.params['itemId'] as string;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      await importsService.ignoreImportItem(
        tenantId,
        userId,
        itemId,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
