import type { Request, Response, NextFunction } from 'express';
import { creditCardsService } from './credit-cards.service';
import type {
  CreateCreditCardInput,
  UpdateCreditCardInput,
  PayInvoiceInput,
  CreateInstallmentInput,
  UpdateInvoiceInput,
} from './credit-cards.schemas';

export const creditCardsController = {
  // -------------------------------------------------------------------------
  // GET /credit-cards
  // -------------------------------------------------------------------------

  async listCards(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const includeInactive = req.query['include_inactive'] === 'true';

      const result = await creditCardsService.listCards(tenantId, includeInactive);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // GET /credit-cards/:id
  // -------------------------------------------------------------------------

  async getCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;

      const result = await creditCardsService.getCard(id, tenantId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // POST /credit-cards
  // -------------------------------------------------------------------------

  async createCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const plan = req.tenant!.plan;
      const data = req.body as CreateCreditCardInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await creditCardsService.createCard(
        tenantId,
        userId,
        plan,
        data,
        ipAddress,
        userAgent,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // PATCH /credit-cards/:id
  // -------------------------------------------------------------------------

  async updateCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const data = req.body as UpdateCreditCardInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await creditCardsService.updateCard(
        id,
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // DELETE /credit-cards/:id
  // -------------------------------------------------------------------------

  async deleteCard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const id = req.params['id'] as string;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      await creditCardsService.deleteCard(id, tenantId, userId, ipAddress, userAgent);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // GET /credit-cards/:id/invoices
  // -------------------------------------------------------------------------

  async listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const id = req.params['id'] as string;
      const page = parseInt(String(req.query['page'] ?? '1'), 10);
      const pageSize = parseInt(String(req.query['pageSize'] ?? '20'), 10);

      const result = await creditCardsService.listInvoices(id, tenantId, page, pageSize);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // GET /credit-cards/:id/invoices/:invoiceId/transactions
  // -------------------------------------------------------------------------

  async listInvoiceTransactions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const { id, invoiceId } = req.params as Record<string, string>;

      const result = await creditCardsService.listInvoiceTransactions(id, invoiceId, tenantId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // GET /credit-cards/:id/invoices/:invoiceId
  // -------------------------------------------------------------------------

  async getInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const { id, invoiceId } = req.params as Record<string, string>;

      const result = await creditCardsService.getInvoice(id, invoiceId, tenantId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // DELETE /credit-cards/:id/invoices/:invoiceId
  // -------------------------------------------------------------------------

  async deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId } = req.params as Record<string, string>;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      await creditCardsService.deleteInvoice(id, invoiceId, tenantId, userId, ipAddress, userAgent);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // PATCH /credit-cards/:id/invoices/:invoiceId
  // -------------------------------------------------------------------------

  async updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId } = req.params as Record<string, string>;
      const data = req.body as UpdateInvoiceInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await creditCardsService.updateInvoice(id, invoiceId, tenantId, userId, data, ipAddress, userAgent);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // POST /credit-cards/:id/invoices/:invoiceId/pay
  // -------------------------------------------------------------------------

  async payInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId } = req.params as Record<string, string>;
      const data = req.body as PayInvoiceInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await creditCardsService.payInvoice(
        id,
        invoiceId,
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // GET /credit-cards/:id/invoices/:invoiceId/payments
  // -------------------------------------------------------------------------

  async listInvoicePayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const { id, invoiceId } = req.params as Record<string, string>;
      const result = await creditCardsService.listInvoicePayments(id, invoiceId, tenantId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // DELETE /credit-cards/:id/invoices/:invoiceId/payments/:paymentId
  // -------------------------------------------------------------------------

  async reverseInvoicePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId, paymentId } = req.params as Record<string, string>;
      const result = await creditCardsService.reverseInvoicePayment(
        id,
        invoiceId,
        paymentId,
        tenantId,
        userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // POST /credit-cards/:id/invoices/:invoiceId/close
  // -------------------------------------------------------------------------

  async closeInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId } = req.params as Record<string, string>;
      const result = await creditCardsService.closeInvoice(
        id,
        invoiceId,
        tenantId,
        userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // POST /credit-cards/:id/invoices/:invoiceId/reopen
  // -------------------------------------------------------------------------

  async reopenInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const { id, invoiceId } = req.params as Record<string, string>;
      const result = await creditCardsService.reopenInvoice(
        id,
        invoiceId,
        tenantId,
        userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // -------------------------------------------------------------------------
  // POST /credit-cards/installments
  // -------------------------------------------------------------------------

  async createInstallment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant!.id;
      const userId = req.user!.userId;
      const data = req.body as CreateInstallmentInput;
      const ipAddress = req.ip ?? undefined;
      const userAgent = req.headers['user-agent'] ?? undefined;

      const result = await creditCardsService.createInstallment(
        tenantId,
        userId,
        data,
        ipAddress,
        userAgent,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};
