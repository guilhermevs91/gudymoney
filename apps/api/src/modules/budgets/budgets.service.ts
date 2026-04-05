import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import * as repo from './budgets.repository';
import { PlanLimitError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { createAuditLog } from '../../lib/audit';
import type { UpsertBudgetInput, CreateBudgetInput, CreateBudgetItemInput, UpdateBudgetItemInput } from './budgets.schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isPaidPlan(plan: string): void {
  if (plan !== 'PAID' && plan !== 'DEV') {
    throw new PlanLimitError('Orçamento disponível apenas no plano pago');
  }
}

function getEffectiveUserId(budgetScope: string, requestUserId: string): string | null {
  return budgetScope === 'USER' ? requestUserId : null;
}

// ---------------------------------------------------------------------------
// getBudgetWithActuals
// Returns the budget for the given period enriched with actual_spent, remaining
// and percentage_used per item, plus overall totals. Returns null if no budget
// exists yet for the period.
// ---------------------------------------------------------------------------
export async function getBudgetWithActuals(
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  year: number,
  month: number,
) {
  isPaidPlan(plan);
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);
  const budget = await repo.findBudget(prisma, tenantId, year, month, effectiveUserId);

  if (budget === null) return null;

  // Enrich each item with actual_spent, remaining and percentage_used
  const enrichedItems = await Promise.all(
    budget.budget_items
      .filter((i) => i.deleted_at === null)
      .map(async (item) => {
        const spent = await repo.calculateActualSpent(
          prisma,
          tenantId,
          year,
          month,
          item.category_id,
          effectiveUserId,
          (item.type as 'INCOME' | 'EXPENSE') ?? 'EXPENSE',
        );
        const plannedPlusRollover = new Prisma.Decimal(item.planned_amount).plus(
          item.rollover_amount,
        );
        const actualSpent = spent.amount ?? new Prisma.Decimal(0);
        const remaining = plannedPlusRollover.minus(actualSpent);
        const percentageUsed = plannedPlusRollover.gt(0)
          ? actualSpent.div(plannedPlusRollover).mul(100).toDecimalPlaces(1).toNumber()
          : 0;

        return { ...item, actual_amount: actualSpent, remaining, percentage_used: percentageUsed };
      }),
  );

  // Aggregate totals across all items
  const totals = enrichedItems.reduce(
    (acc, item) => ({
      planned: acc.planned
        .plus(new Prisma.Decimal(item.planned_amount))
        .plus(new Prisma.Decimal(item.rollover_amount)),
      actual: acc.actual.plus(item.actual_amount),
      remaining: acc.remaining.plus(item.remaining),
    }),
    {
      planned: new Prisma.Decimal(0),
      actual: new Prisma.Decimal(0),
      remaining: new Prisma.Decimal(0),
    },
  );

  const totalPercentage = totals.planned.gt(0)
    ? totals.actual.div(totals.planned).mul(100).toDecimalPlaces(1).toNumber()
    : 0;

  return {
    ...budget,
    budget_items: enrichedItems,
    totals: { ...totals, percentage_used: totalPercentage },
  };
}

// ---------------------------------------------------------------------------
// upsertBudget
// Creates or updates the budget for the given period, computes rollover amounts
// from the previous month, increments the version counter and saves a snapshot.
// ---------------------------------------------------------------------------
export async function upsertBudget(
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  data: UpsertBudgetInput,
) {
  isPaidPlan(plan);
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);

  return prisma.$transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // 1. Calculate rollover amounts from the previous month's budget
    // -----------------------------------------------------------------------
    const prevBudget = await repo.findPreviousMonthBudget(
      tx,
      tenantId,
      data.year,
      data.month,
      effectiveUserId,
    );

    const rolloverMap = new Map<string, Prisma.Decimal>();

    if (prevBudget !== null) {
      for (const prevItem of prevBudget.budget_items.filter(
        (i) => i.deleted_at === null && i.rollover_enabled,
      )) {
        const spent = await repo.calculateActualSpent(
          tx,
          tenantId,
          prevBudget.year,
          prevBudget.month,
          prevItem.category_id,
          effectiveUserId,
          (prevItem.type as 'INCOME' | 'EXPENSE') ?? 'EXPENSE',
        );
        const plannedPlusRollover = new Prisma.Decimal(prevItem.planned_amount).plus(
          prevItem.rollover_amount,
        );
        const actualSpent = spent.amount ?? new Prisma.Decimal(0);
        const unspent = plannedPlusRollover.minus(actualSpent);
        if (unspent.gt(0)) {
          rolloverMap.set(prevItem.category_id, unspent);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Find or create the budget record for the target period
    // -----------------------------------------------------------------------
    let budget = await repo.findBudget(tx, tenantId, data.year, data.month, effectiveUserId);

    if (budget === null) {
      budget = await repo.createBudget(tx, {
        tenant_id: tenantId,
        year: data.year,
        month: data.month,
        scope: budgetScope as 'TENANT' | 'USER',
        user_id: effectiveUserId,
        created_by: userId,
      });
    }

    const resolvedBudget = budget!;

    // -----------------------------------------------------------------------
    // 3. Upsert items with rollover amounts resolved
    // -----------------------------------------------------------------------
    const itemsWithRollover = data.items.map((item) => ({
      ...item,
      rollover_amount: rolloverMap.get(item.category_id) ?? new Prisma.Decimal(0),
      created_by: userId,
    }));

    await repo.upsertBudgetItems(tx, resolvedBudget.id, tenantId, itemsWithRollover);

    // -----------------------------------------------------------------------
    // 4. Increment version and persist a snapshot
    // -----------------------------------------------------------------------
    const updatedBudget = await repo.updateBudgetVersion(tx, resolvedBudget.id, tenantId);

    await repo.createBudgetVersion(tx, resolvedBudget.id, tenantId, updatedBudget.version, {
      items: itemsWithRollover,
    });

    // -----------------------------------------------------------------------
    // 5. Audit log
    // -----------------------------------------------------------------------
    await createAuditLog({
      prisma: tx,
      tenantId,
      userId,
      entityType: 'budgets',
      entityId: resolvedBudget.id,
      action: 'UPDATE',
    });

    // -----------------------------------------------------------------------
    // 6. Return budget with items (fetch inside tx so items are visible)
    // -----------------------------------------------------------------------
    const budgetWithItems = await repo.findBudget(tx, tenantId, data.year, data.month, effectiveUserId);
    return budgetWithItems ?? updatedBudget;
  });
}

// ---------------------------------------------------------------------------
// createEmptyBudget
// Creates a budget for the period with no items.
// ---------------------------------------------------------------------------
export async function createEmptyBudget(
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  data: CreateBudgetInput,
) {
  isPaidPlan(plan);
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);

  const existing = await repo.findBudget(prisma, tenantId, data.year, data.month, effectiveUserId);
  if (existing !== null) {
    return existing;
  }

  return repo.createBudget(prisma, {
    tenant_id: tenantId,
    year: data.year,
    month: data.month,
    scope: budgetScope as 'TENANT' | 'USER',
    user_id: effectiveUserId,
    created_by: userId,
  });
}

// ---------------------------------------------------------------------------
// applyItemToFutureMonths
// Internal helper: creates or updates the same category/type/amount item on
// all budgets that already exist for months after (year, month) within the
// same tenant. Only touches budgets that already exist — does not create new
// budget records for future months that have none.
// ---------------------------------------------------------------------------
async function applyItemToFutureMonths(
  tenantId: string,
  userId: string,
  budgetScope: string,
  fromYear: number,
  fromMonth: number,
  categoryId: string,
  type: 'INCOME' | 'EXPENSE',
  plannedAmount: number,
  rolloverEnabled: boolean,
  replicateMonths = 12,
) {
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);
  const scope = budgetScope as 'TENANT' | 'USER';

  const futureMonths: { year: number; month: number }[] = [];
  for (let i = 1; i <= replicateMonths; i++) {
    const d = new Date(fromYear, fromMonth - 1 + i, 1);
    futureMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  for (const { year, month } of futureMonths) {
    // Garante que o orçamento existe — cria se necessário
    let budget = await prisma.budget.findFirst({
      where: { tenant_id: tenantId, year, month, user_id: effectiveUserId ?? null, deleted_at: null },
    });

    if (!budget) {
      budget = await prisma.budget.create({
        data: {
          tenant_id: tenantId,
          year,
          month,
          scope,
          user_id: effectiveUserId ?? null,
          version: 0,
          created_by: userId,
        },
      });
    }

    const existing = await prisma.budgetItem.findFirst({
      where: { budget_id: budget.id, category_id: categoryId, deleted_at: null },
    });

    if (existing !== null) {
      await prisma.budgetItem.update({
        where: { id: existing.id },
        data: {
          type,
          planned_amount: new Prisma.Decimal(plannedAmount),
          rollover_enabled: rolloverEnabled,
          updated_at: new Date(),
        },
      });
    } else {
      await prisma.budgetItem.create({
        data: {
          tenant_id: tenantId,
          budget_id: budget.id,
          category_id: categoryId,
          type,
          planned_amount: new Prisma.Decimal(plannedAmount),
          rollover_enabled: rolloverEnabled,
          rollover_amount: new Prisma.Decimal(0),
          created_by: userId,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// addBudgetItem
// Adds a single item to an existing budget. When apply_to_future is true,
// replicates the item to all future budgets that already exist.
// ---------------------------------------------------------------------------
export async function addBudgetItem(
  budgetId: string,
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  data: CreateBudgetItemInput,
) {
  isPaidPlan(plan);
  const budget = await repo.findBudgetById(prisma, budgetId, tenantId);
  if (budget === null) throw new NotFoundError('Orçamento não encontrado.');

  const existing = await prisma.budgetItem.findFirst({
    where: { budget_id: budgetId, category_id: data.category_id, deleted_at: null },
  });

  let item;
  if (existing !== null) {
    item = await prisma.budgetItem.update({
      where: { id: existing.id },
      data: {
        type: data.type ?? 'EXPENSE',
        planned_amount: new Prisma.Decimal(data.planned_amount),
        updated_at: new Date(),
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    });
  } else {
    item = await prisma.budgetItem.create({
      data: {
        tenant_id: tenantId,
        budget_id: budgetId,
        category_id: data.category_id,
        type: data.type ?? 'EXPENSE',
        planned_amount: new Prisma.Decimal(data.planned_amount),
        rollover_enabled: data.rollover_enabled,
        rollover_amount: new Prisma.Decimal(0),
        created_by: userId,
      },
      include: { category: { select: { id: true, name: true, color: true } } },
    });
  }

  if (data.apply_to_future) {
    await applyItemToFutureMonths(
      tenantId,
      userId,
      budgetScope,
      budget.year,
      budget.month,
      data.category_id,
      data.type ?? 'EXPENSE',
      data.planned_amount,
      data.rollover_enabled,
    );
  }

  return item;
}

// ---------------------------------------------------------------------------
// updateBudgetItem
// Updates planned_amount (and optionally rollover_enabled) of an item.
// When apply_to_future is true, propagates the change to all future budgets.
// ---------------------------------------------------------------------------
export async function updateBudgetItem(
  budgetId: string,
  itemId: string,
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  data: UpdateBudgetItemInput,
) {
  isPaidPlan(plan);
  const item = await prisma.budgetItem.findFirst({
    where: { id: itemId, budget_id: budgetId, tenant_id: tenantId, deleted_at: null },
    include: { budget: { select: { year: true, month: true } } },
  });
  if (item === null) throw new NotFoundError('Item de orçamento não encontrado.');

  const updated = await prisma.budgetItem.update({
    where: { id: itemId },
    data: {
      planned_amount: new Prisma.Decimal(data.planned_amount),
      ...(data.rollover_enabled !== undefined ? { rollover_enabled: data.rollover_enabled } : {}),
      updated_at: new Date(),
    },
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  if (data.apply_to_future || (data.replicate_months ?? 0) > 0) {
    await applyItemToFutureMonths(
      tenantId,
      userId,
      budgetScope,
      item.budget.year,
      item.budget.month,
      item.category_id,
      (item.type as 'INCOME' | 'EXPENSE') ?? 'EXPENSE',
      data.planned_amount,
      data.rollover_enabled ?? item.rollover_enabled,
      data.replicate_months ?? 12,
    );
  }

  return updated;
}

// ---------------------------------------------------------------------------
// getSuggestions
// Returns categories that have transactions in the given month but are NOT yet
// present in the budget for that month.
// ---------------------------------------------------------------------------
export async function getSuggestions(
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  year: number,
  month: number,
): Promise<{ category_id: string; category_name: string; type: 'INCOME' | 'EXPENSE'; actual_amount: number }[]> {
  isPaidPlan(plan);
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Categories already in the budget
  const budget = await repo.findBudget(prisma, tenantId, year, month, effectiveUserId);
  const existingCategoryIds = new Set(
    (budget?.budget_items ?? [])
      .filter((i) => i.deleted_at === null)
      .map((i) => i.category_id),
  );

  // Transactions in the period grouped by category
  const grouped = await prisma.transaction.groupBy({
    by: ['category_id', 'type'],
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      status: { in: ['REALIZADO', 'PREVISTO'] },
      type: { in: ['INCOME', 'EXPENSE'] },
      category_id: { not: null },
      date: { gte: startDate, lte: endDate },
    },
    _sum: { amount: true },
  });

  // Deduplicate: if a category appears as both INCOME and EXPENSE, keep only the entry
  // with the higher actual amount to avoid inserting two budget items for the same category.
  const deduped = new Map<string, { type: 'INCOME' | 'EXPENSE'; amount: number }>();
  for (const g of grouped) {
    if (g.category_id === null || existingCategoryIds.has(g.category_id)) continue;
    const amount = Number(g._sum.amount ?? 0);
    const existing = deduped.get(g.category_id);
    if (!existing || amount > existing.amount) {
      deduped.set(g.category_id, { type: g.type as 'INCOME' | 'EXPENSE', amount });
    }
  }

  return Array.from(deduped.entries()).map(([category_id, { type, amount }]) => ({
    category_id,
    category_name: '',
    type,
    actual_amount: amount,
  }));
}

// ---------------------------------------------------------------------------
// deleteBudgetItem
// Soft-deletes a single budget item. When delete_future is true, also
// soft-deletes the same category item in all future budgets of the tenant.
// ---------------------------------------------------------------------------
export async function deleteBudgetItem(
  budgetId: string,
  itemId: string,
  tenantId: string,
  userId: string,
  plan: string,
  budgetScope: string,
  deleteFuture: boolean,
) {
  isPaidPlan(plan);
  const item = await prisma.budgetItem.findFirst({
    where: { id: itemId, budget_id: budgetId, tenant_id: tenantId, deleted_at: null },
    include: { budget: { select: { year: true, month: true } } },
  });
  if (item === null) throw new NotFoundError('Item de orçamento não encontrado.');

  await prisma.budgetItem.update({
    where: { id: itemId },
    data: { deleted_at: new Date() },
  });

  if (deleteFuture) {
    const effectiveUserId = getEffectiveUserId(budgetScope, userId);

    const futureBudgets = await prisma.budget.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        user_id: effectiveUserId ?? null,
        OR: [
          { year: { gt: item.budget.year } },
          { year: item.budget.year, month: { gt: item.budget.month } },
        ],
      },
      select: { id: true },
      take: 24,
    });

    const budgetIds = futureBudgets.map((b) => b.id);
    if (budgetIds.length > 0) {
      await prisma.budgetItem.updateMany({
        where: {
          budget_id: { in: budgetIds },
          category_id: item.category_id,
          tenant_id: tenantId,
          deleted_at: null,
        },
        data: { deleted_at: new Date() },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// itemExistsInFutureMonths
// Returns true if the given category has a budget item in any budget after
// (fromYear, fromMonth) within the same tenant.
// ---------------------------------------------------------------------------
export async function itemExistsInFutureMonths(
  tenantId: string,
  plan: string,
  budgetScope: string,
  userId: string,
  categoryId: string,
  fromYear: number,
  fromMonth: number,
): Promise<boolean> {
  isPaidPlan(plan);
  const effectiveUserId = getEffectiveUserId(budgetScope, userId);

  const count = await prisma.budgetItem.count({
    where: {
      tenant_id: tenantId,
      category_id: categoryId,
      deleted_at: null,
      budget: {
        deleted_at: null,
        user_id: effectiveUserId ?? null,
        OR: [
          { year: { gt: fromYear } },
          { year: fromYear, month: { gt: fromMonth } },
        ],
      },
    },
  });

  return count > 0;
}

// ---------------------------------------------------------------------------
// getBudgetVersions
// Returns all version snapshots for the given budget (paid plan only).
// ---------------------------------------------------------------------------
export async function getBudgetVersions(
  budgetId: string,
  tenantId: string,
  plan: string,
) {
  isPaidPlan(plan);
  return repo.findBudgetVersions(prisma, budgetId, tenantId);
}

// ---------------------------------------------------------------------------
// changeBudgetScope
// Allows an ADMIN to switch the tenant's budget scoping strategy.
// ---------------------------------------------------------------------------
export async function changeBudgetScope(
  tenantId: string,
  userId: string,
  role: string,
  newScope: 'TENANT' | 'USER',
) {
  if (role !== 'ADMIN') {
    throw new ForbiddenError('Apenas administradores podem alterar o escopo do orçamento');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { budget_scope: newScope, updated_at: new Date() },
  });

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'tenants',
    entityId: tenantId,
    action: 'UPDATE',
    afterData: { budget_scope: newScope },
  });
}
