import type { Request, Response, NextFunction } from 'express';
import { transactionsService } from './transactions.service';
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  ListTransactionsQuery,
} from './transactions.schemas';

export const transactionsController = {
  /**
   * GET /transactions
   * Returns a paginated list of transactions for the authenticated tenant.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const plan = req.tenant!.plan;
      const query = req.query as unknown as ListTransactionsQuery;

      const result = await transactionsService.listTransactions(
        tenantId,
        plan,
        query,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /transactions/:id
   * Returns a single transaction.
   */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;

      const transaction = await transactionsService.getTransaction(id, tenantId);

      res.status(200).json({ data: transaction });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /transactions
   * Creates a new transaction and the corresponding ledger entries.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const data = req.body as CreateTransactionInput;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      const transaction = await transactionsService.createTransaction(
        tenantId,
        userId,
        data,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(201).json({ data: transaction });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /transactions/:id
   * Updates mutable fields of a transaction.
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const data = req.body as UpdateTransactionInput;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      const transaction = await transactionsService.updateTransaction(
        id,
        tenantId,
        userId,
        data,
        ipAddress ?? undefined,
        userAgent ?? undefined,
      );

      res.status(200).json({ data: transaction });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /transactions/:id
   * Soft-deletes a transaction and its ledger entries.
   */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const ipAddress = req.ip ?? null;
      const userAgent = req.headers['user-agent'] ?? null;

      await transactionsService.deleteTransaction(
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
   * GET /transactions/projection?year=&month=
   * Returns income/expense totals for the given month + next 5 months.
   */
  async projection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const year = Number(req.query['year']);
      const month = Number(req.query['month']);
      if (!year || !month) { res.status(400).json({ error: 'year and month are required' }); return; }

      const result = await transactionsService.getProjection(tenantId, year, month);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async categorize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      // apply_to_similar: 'none' | 'similar' | 'similar_and_rule'
      const { category_id, apply_to_similar } = req.body as {
        category_id: string;
        apply_to_similar: 'none' | 'similar' | 'similar_and_rule';
      };

      const result = await transactionsService.categorizeTransaction(
        id, tenantId, category_id, apply_to_similar,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
