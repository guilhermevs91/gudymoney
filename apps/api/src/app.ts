import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorsMiddleware } from './middleware/errors.middleware';
import authRouter from './modules/auth/auth.routes';
import accountsRouter from './modules/accounts/accounts.routes';
import categoriesRouter from './modules/categories/categories.routes';
import tagsRouter from './modules/tags/tags.routes';
import creditCardsRouter from './modules/credit-cards/credit-cards.routes';
import recurrencesRouter from './modules/recurrences/recurrences.routes';
import budgetsRouter from './modules/budgets/budgets.routes';
import transactionsRouter from './modules/transactions/transactions.routes';
import importsRouter from './modules/imports/imports.routes';
import ledgerRouter from './modules/ledger/ledger.routes';
import notificationsRouter from './modules/notifications/notifications.routes';
import webhooksRouter from './modules/webhooks/webhooks.routes';
import billingRouter from './modules/billing/billing.routes';
import lgpdRouter from './modules/lgpd/lgpd.routes';
import superadminRouter from './modules/superadmin/superadmin.routes';
import membersRouter from './modules/members/members.routes';
import invitesRouter from './modules/invites/invites.routes';

const app: express.Express = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — relaxed in development, stricter in production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env['NODE_ENV'] === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});
app.use(limiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ---------------------------------------------------------------------------
// Module routes
// ---------------------------------------------------------------------------
app.use('/auth', authRouter);
app.use('/accounts', accountsRouter);
app.use('/categories', categoriesRouter);
app.use('/tags', tagsRouter);
app.use('/credit-cards', creditCardsRouter);
app.use('/recurrences', recurrencesRouter);
app.use('/budgets', budgetsRouter);
app.use('/transactions', transactionsRouter);
app.use('/imports', importsRouter);
app.use('/ledger', ledgerRouter);
app.use('/notifications', notificationsRouter);
app.use('/webhooks', webhooksRouter);
app.use('/billing', billingRouter);
app.use('/lgpd', lgpdRouter);
app.use('/superadmin', superadminRouter);
app.use('/members', membersRouter);
app.use('/invites', invitesRouter);

// 404 handler — must be placed after all valid routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found.', code: 'NOT_FOUND' });
});

// Global error handler — must be last
app.use(errorsMiddleware);

export default app;
