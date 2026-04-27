import { Router } from 'express';
import { authenticateUser } from '../../middleware/auth.middleware';
import { requireTenantAccess } from '../../middleware/tenant.middleware';
import { validateBody } from '../../middleware/validate.middleware';
import { creditCardsController } from './credit-cards.controller';
import {
  createCreditCardSchema,
  updateCreditCardSchema,
  payInvoiceSchema,
  createInstallmentSchema,
  updateInvoiceSchema,
} from './credit-cards.schemas';

const router: Router = Router();

// ---------------------------------------------------------------------------
// Installments (placed before /:id to avoid route conflict)
// ---------------------------------------------------------------------------

// POST /credit-cards/installments
router.post(
  '/installments',
  authenticateUser,
  requireTenantAccess,
  validateBody(createInstallmentSchema),
  creditCardsController.createInstallment,
);

// ---------------------------------------------------------------------------
// Credit card CRUD
// ---------------------------------------------------------------------------

// GET /credit-cards
router.get(
  '/',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.listCards,
);

// POST /credit-cards
router.post(
  '/',
  authenticateUser,
  requireTenantAccess,
  validateBody(createCreditCardSchema),
  creditCardsController.createCard,
);

// GET /credit-cards/:id
router.get(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.getCard,
);

// PATCH /credit-cards/:id
router.patch(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateCreditCardSchema),
  creditCardsController.updateCard,
);

// DELETE /credit-cards/:id
router.delete(
  '/:id',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.deleteCard,
);

// ---------------------------------------------------------------------------
// Invoice routes (nested under /:id)
// ---------------------------------------------------------------------------

// GET /credit-cards/:id/invoices
router.get(
  '/:id/invoices',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.listInvoices,
);

// GET /credit-cards/:id/invoices/:invoiceId
router.get(
  '/:id/invoices/:invoiceId',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.getInvoice,
);

// PATCH /credit-cards/:id/invoices/:invoiceId
router.patch(
  '/:id/invoices/:invoiceId',
  authenticateUser,
  requireTenantAccess,
  validateBody(updateInvoiceSchema),
  creditCardsController.updateInvoice,
);

// DELETE /credit-cards/:id/invoices/:invoiceId
router.delete(
  '/:id/invoices/:invoiceId',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.deleteInvoice,
);

// GET /credit-cards/:id/invoices/:invoiceId/transactions
router.get(
  '/:id/invoices/:invoiceId/transactions',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.listInvoiceTransactions,
);

// GET /credit-cards/:id/invoices/:invoiceId/payments
router.get(
  '/:id/invoices/:invoiceId/payments',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.listInvoicePayments,
);

// POST /credit-cards/:id/invoices/:invoiceId/pay
router.post(
  '/:id/invoices/:invoiceId/pay',
  authenticateUser,
  requireTenantAccess,
  validateBody(payInvoiceSchema),
  creditCardsController.payInvoice,
);

// DELETE /credit-cards/:id/invoices/:invoiceId/payments/:paymentId
router.delete(
  '/:id/invoices/:invoiceId/payments/:paymentId',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.reverseInvoicePayment,
);

// POST /credit-cards/:id/invoices/:invoiceId/close
router.post(
  '/:id/invoices/:invoiceId/close',
  authenticateUser,
  requireTenantAccess,
  creditCardsController.closeInvoice,
);

export default router;
