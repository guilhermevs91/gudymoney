import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors';
import * as service from './budgets.service';
import type {
  UpsertBudgetInput,
  GetBudgetQuery,
  ChangeScopeInput,
  CreateBudgetInput,
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
  FutureExistsQuery,
  BudgetSuggestionsQuery,
} from './budgets.schemas';

// ---------------------------------------------------------------------------
// GET /budgets
// Returns the budget (with actuals) for the requested year/month.
// Responds with { data: null } and 404 when no budget exists yet — this is
// NOT treated as an error condition.
// ---------------------------------------------------------------------------
export async function getBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const { year, month } = req.query as unknown as GetBudgetQuery;

    const budget = await service.getBudgetWithActuals(
      tenantId,
      userId,
      plan,
      budget_scope,
      year,
      month,
    );

    if (budget === null) {
      res.status(404).json({ data: null });
      return;
    }

    res.status(200).json({ data: budget });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /budgets
// Creates an empty budget for the period (idempotent — returns existing if found).
// ---------------------------------------------------------------------------
export async function createBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const data = req.body as CreateBudgetInput;

    const budget = await service.createEmptyBudget(tenantId, userId, plan, budget_scope, data);
    res.status(201).json({ data: budget });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PUT /budgets
// Creates or updates the budget for the given period.
// ---------------------------------------------------------------------------
export async function upsertBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const data = req.body as UpsertBudgetInput;

    const budget = await service.upsertBudget(tenantId, userId, plan, budget_scope, data);

    res.status(200).json({ data: budget });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /budgets/:id/items
// ---------------------------------------------------------------------------
export async function addItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const budgetId = req.params['id'] as string;
    const data = req.body as CreateBudgetItemInput;

    const item = await service.addBudgetItem(budgetId, tenantId, userId, plan, budget_scope, data);
    res.status(201).json({ data: item });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /budgets/:id/items/:itemId
// ---------------------------------------------------------------------------
export async function updateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const budgetId = req.params['id'] as string;
    const itemId = req.params['itemId'] as string;
    const data = req.body as UpdateBudgetItemInput;

    const item = await service.updateBudgetItem(budgetId, itemId, tenantId, userId, plan, budget_scope, data);
    res.status(200).json({ data: item });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /budgets/:id/items/:itemId?delete_future=true
// ---------------------------------------------------------------------------
export async function deleteItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const budgetId = req.params['id'] as string;
    const itemId = req.params['itemId'] as string;
    const deleteFuture = req.query['delete_future'] === 'true';

    await service.deleteBudgetItem(budgetId, itemId, tenantId, userId, plan, budget_scope, deleteFuture);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /budgets/:id/versions
// Returns the full version history (snapshots) for a budget.
// ---------------------------------------------------------------------------
export async function getBudgetVersions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tenantId } = req.user!;
    const { plan } = req.tenant!;
    const id = req.params['id'] as string;

    const versions = await service.getBudgetVersions(id, tenantId, plan);

    res.status(200).json(versions);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /budgets/items/future-exists
// ---------------------------------------------------------------------------
export async function checkFutureExists(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const { category_id, from_year, from_month } = req.query as unknown as FutureExistsQuery;

    const exists = await service.itemExistsInFutureMonths(
      tenantId, plan, budget_scope, userId, category_id, from_year, from_month,
    );
    res.status(200).json({ exists });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /budgets/suggestions
// Returns categories used in transactions that are not yet in the budget.
// ---------------------------------------------------------------------------
export async function getSuggestions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId } = req.user!;
    const { plan, budget_scope } = req.tenant!;
    const { year, month } = req.query as unknown as BudgetSuggestionsQuery;

    const suggestions = await service.getSuggestions(tenantId, userId, plan, budget_scope, year, month);

    // Enrich with category names
    const categoryIds = suggestions.map((s) => s.category_id);
    const categories = categoryIds.length > 0
      ? await (await import('../../lib/prisma')).prisma.category.findMany({
          where: { id: { in: categoryIds }, tenant_id: tenantId, deleted_at: null },
          select: { id: true, name: true },
        })
      : [];
    const catMap = new Map(categories.map((c) => [c.id, c.name]));

    const enriched = suggestions.map((s) => ({ ...s, category_name: catMap.get(s.category_id) ?? s.category_id }));

    res.status(200).json({ data: enriched });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /budgets/scope
// Allows an ADMIN to change the tenant's budget scoping strategy.
// ---------------------------------------------------------------------------
export async function changeBudgetScope(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId, tenantId, role } = req.user!;
    const { budget_scope } = req.body as ChangeScopeInput;

    await service.changeBudgetScope(tenantId, userId, role, budget_scope);

    res.status(200).json({ budget_scope });
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    next(err);
  }
}
