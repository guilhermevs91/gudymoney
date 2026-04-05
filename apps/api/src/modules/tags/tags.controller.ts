import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import * as service from './tags.service';
import type { CreateTagInput, UpdateTagInput } from './tags.schemas';

// ---------------------------------------------------------------------------
// List tags
// GET /
// ---------------------------------------------------------------------------

export async function list(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tenantId = req.user!.tenantId;
    const result = await service.listTags(tenantId);
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
// Get one tag
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
    const result = await service.getTag(id, tenantId);
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
// Create tag
// POST /
// ---------------------------------------------------------------------------

export async function create(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const body = req.body as CreateTagInput;
    const result = await service.createTag(tenantId, userId, body);
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
// Update tag
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
    const body = req.body as UpdateTagInput;
    const result = await service.updateTag(id, tenantId, userId, body);
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
// Delete tag
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
    await service.deleteTag(id, tenantId, userId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}
