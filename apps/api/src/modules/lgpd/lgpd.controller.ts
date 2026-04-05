import type { Request, Response, NextFunction } from 'express';
import { lgpdService } from './lgpd.service';
import type { RecordConsentInput, RevokeConsentInput, DeleteAccountInput } from './lgpd.schemas';

export const lgpdController = {
  /**
   * GET /lgpd/my-data
   * Returns a summary of the user's personal and financial data categories.
   */
  async getMyData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.id;
      const data = await lgpdService.getMyData(userId, tenantId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /lgpd/export
   * Exports all of the user's financial data as CSV (LGPD data portability).
   */
  async exportData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.id;
      const { csv_content, filename } = await lgpdService.exportMyData(userId, tenantId);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv_content);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /lgpd/consents
   * Returns all consent records (granted and revoked) for the current user.
   */
  async getConsents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const consents = await lgpdService.getConsents(userId);
      res.status(200).json({ data: consents });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /lgpd/consents
   * Record consent for one or more purposes.
   */
  async recordConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.id;
      const body = req.body as RecordConsentInput;
      const ipAddress = req.ip;

      await lgpdService.recordConsent(
        userId,
        tenantId,
        body.purposes,
        body.policy_version,
        ipAddress,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /lgpd/consents
   * Revoke consent for a specific purpose.
   */
  async revokeConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.id;
      const body = req.body as RevokeConsentInput;

      await lgpdService.revokeConsent(userId, tenantId, body.purpose);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /lgpd/account
   * Request account deletion — anonymizes user data, retains financial records.
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const tenantId = req.tenant!.id;
      const body = req.body as DeleteAccountInput;
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await lgpdService.requestAccountDeletion(
        userId,
        tenantId,
        body.password,
        ipAddress,
        userAgent,
      );

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
