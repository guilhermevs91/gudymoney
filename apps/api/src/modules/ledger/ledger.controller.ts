import type { Request, Response, NextFunction } from 'express';
import { ledgerService } from './ledger.service';

export const ledgerController = {
  /**
   * GET /ledger/accounts/:accountId/balance
   * Returns the realized and projected balance for a specific account.
   */
  async getAccountBalance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const accountId = req.params['accountId'] as string;

      const result = await ledgerService.getAccountBalance(accountId, tenantId);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /ledger/summary
   * Returns aggregated income, expense, realized and projected totals
   * across all active accounts for the tenant.
   */
  async getTenantSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const tenantId = req.tenant!.id;

      const year = req.query['year'] ? Number(req.query['year']) : undefined;
      const month = req.query['month'] ? Number(req.query['month']) : undefined;

      const summary = await ledgerService.getTenantSummary(tenantId, year, month);

      res.status(200).json(summary);
    } catch (err) {
      next(err);
    }
  },
};
