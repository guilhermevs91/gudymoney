import type { Request, Response, NextFunction } from 'express';
import { recurrencesService } from './recurrences.service';
import type {
  CreateRecurrenceInput,
  UpdateRecurrenceInput,
  CancelRecurrenceInput,
  ListRecurrencesQuery,
} from './recurrences.schemas';

export const recurrencesController = {
  /**
   * GET /recurrences
   * Returns a paginated list of recurrences for the authenticated tenant.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const query = req.query as unknown as ListRecurrencesQuery;

      const result = await recurrencesService.listRecurrences(tenantId, query);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /recurrences
   * Creates a new recurrence and pre-generates PREVISTO transactions.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const plan = req.tenant!.plan;
      const data = req.body as CreateRecurrenceInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const recurrence = await recurrencesService.createRecurrence(
        tenantId,
        userId,
        plan,
        data,
        ipAddress,
        userAgent,
      );

      res.status(201).json({ data: recurrence });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /recurrences/:id
   * Returns a single recurrence.
   */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;

      const recurrence = await recurrencesService.getRecurrence(id, tenantId);

      res.status(200).json({ data: recurrence });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PUT /recurrences/:id
   * Updates a recurrence with scope-based transaction propagation.
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const data = req.body as UpdateRecurrenceInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const recurrence = await recurrencesService.updateRecurrence(
        id,
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );

      res.status(200).json({ data: recurrence });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /recurrences/:id
   * Cancels a recurrence and optionally cancels future transactions.
   * Returns 200 with the updated recurrence (not 204).
   */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const data = req.body as CancelRecurrenceInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      await recurrencesService.cancelRecurrence(
        id,
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /recurrences/:id/transactions
   * Lists all generated transactions for a recurrence (paginated).
   */
  async listTransactions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));
      const pageSize = Math.min(
        50,
        Math.max(1, parseInt(String(req.query['pageSize'] ?? '20'), 10)),
      );

      const result = await recurrencesService.listRecurrenceTransactions(
        id,
        tenantId,
        page,
        pageSize,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
