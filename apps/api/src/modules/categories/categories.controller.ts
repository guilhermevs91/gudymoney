import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import * as service from './categories.service';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ListCategoriesQuery,
} from './categories.schemas';

// ---------------------------------------------------------------------------
// List categories
// GET /
// ---------------------------------------------------------------------------

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const query = req.query as unknown as ListCategoriesQuery;
    const result = await service.listCategories(tenantId, query);
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
// Get one category
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
    const result = await service.getCategory(id, tenantId);
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
// Create category
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
    const body = req.body as CreateCategoryInput;
    const result = await service.createCategory(tenantId, userId, plan, body);
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
// Update category
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
    const body = req.body as UpdateCategoryInput;
    const result = await service.updateCategory(id, tenantId, userId, body);
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
// Delete category
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
    await service.deleteCategory(id, tenantId, userId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}
