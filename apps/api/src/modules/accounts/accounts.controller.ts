import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import * as service from './accounts.service';
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
} from './accounts.schemas';

// ---------------------------------------------------------------------------
// List accounts
// GET /
// ---------------------------------------------------------------------------

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const query = req.query as unknown as ListAccountsQuery;
    const result = await service.listAccounts(tenantId, query);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Get one account (with balance)
// GET /:id
// ---------------------------------------------------------------------------

export async function getOne(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params['id'] as string;
    const result = await service.getAccountWithBalance(id, tenantId);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Get balance only
// GET /:id/balance
// ---------------------------------------------------------------------------

export async function getBalance(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const id = req.params['id'] as string;
    const result = await service.getAccountWithBalance(id, tenantId);
    res.json({ data: result.data.balance });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Create account
// POST /
// ---------------------------------------------------------------------------

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const plan = req.tenant!.plan;
    const body = req.body as CreateAccountInput;
    const result = await service.createAccount(tenantId, userId, plan, body);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Update account
// PATCH /:id
// ---------------------------------------------------------------------------

export async function update(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const id = req.params['id'] as string;
    const body = req.body as UpdateAccountInput;
    const result = await service.updateAccount(id, tenantId, userId, body);
    res.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Delete account
// DELETE /:id
// ---------------------------------------------------------------------------

export async function remove(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const id = req.params['id'] as string;
    await service.deleteAccount(id, tenantId, userId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}
