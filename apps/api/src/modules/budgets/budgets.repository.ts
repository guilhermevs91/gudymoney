import { Prisma, type PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Internal type alias for the transaction client Prisma passes to $transaction
// callbacks — it shares the same model API surface as PrismaClient.
// ---------------------------------------------------------------------------
type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

type Client = PrismaClient | PrismaTransactionClient;

// ---------------------------------------------------------------------------
// Budget item create/update input shape used by upsertBudgetItems
// ---------------------------------------------------------------------------
export interface BudgetItemUpsertInput {
  category_id: string;
  type?: 'INCOME' | 'EXPENSE';
  planned_amount: number | Prisma.Decimal;
  rollover_enabled: boolean;
  rollover_amount?: number | Prisma.Decimal;
  created_by?: string;
}

// ---------------------------------------------------------------------------
// findBudget
// Returns the Budget (with budget_items and their categories) for the given
// tenant / year / month / optional user, or null when not found.
// ---------------------------------------------------------------------------
export async function findBudget(
  prismaClient: Client,
  tenantId: string,
  year: number,
  month: number,
  userId: string | null,
) {
  return (prismaClient as PrismaClient).budget.findFirst({
    where: {
      tenant_id: tenantId,
      year,
      month,
      user_id: userId ?? null,
      deleted_at: null,
    },
    include: {
      budget_items: {
        where: { deleted_at: null },
        include: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// findBudgetById
// Returns a Budget with its items for the given id scoped to tenant.
// ---------------------------------------------------------------------------
export async function findBudgetById(
  prismaClient: Client,
  id: string,
  tenantId: string,
) {
  return (prismaClient as PrismaClient).budget.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
    include: {
      budget_items: {
        where: { deleted_at: null },
        include: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// createBudget
// ---------------------------------------------------------------------------
export async function createBudget(
  prismaClient: Client,
  data: {
    tenant_id: string;
    year: number;
    month: number;
    scope: 'TENANT' | 'USER';
    user_id?: string | null;
    created_by?: string;
  },
) {
  return (prismaClient as PrismaClient).budget.create({
    data: {
      tenant_id: data.tenant_id,
      year: data.year,
      month: data.month,
      scope: data.scope,
      user_id: data.user_id ?? null,
      version: 0,
      created_by: data.created_by ?? null,
    },
    include: {
      budget_items: {
        where: { deleted_at: null },
        include: {
          category: { select: { id: true, name: true, color: true } },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// updateBudgetVersion
// Atomically increments the version counter and returns the updated Budget.
// ---------------------------------------------------------------------------
export async function updateBudgetVersion(
  prismaClient: Client,
  id: string,
  tenantId: string,
) {
  return (prismaClient as PrismaClient).budget.update({
    where: { id },
    data: {
      version: { increment: 1 },
      tenant_id: tenantId,
      updated_at: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// upsertBudgetItems
// For each item in the supplied list:
//   - If a BudgetItem already exists for (budget_id, category_id) -> update it
//   - Otherwise create it
// Soft-deletes any existing item whose category_id is NOT in the new list.
// ---------------------------------------------------------------------------
export async function upsertBudgetItems(
  prismaClient: Client,
  budgetId: string,
  tenantId: string,
  items: BudgetItemUpsertInput[],
) {
  const client = prismaClient as PrismaClient;
  const categoryIds = items.map((i) => i.category_id);

  // Soft-delete items that are no longer in the list
  await client.budgetItem.updateMany({
    where: {
      budget_id: budgetId,
      tenant_id: tenantId,
      category_id: { notIn: categoryIds },
      deleted_at: null,
    },
    data: { deleted_at: new Date() },
  });

  // Upsert each item
  for (const item of items) {
    const existing = await client.budgetItem.findFirst({
      where: {
        budget_id: budgetId,
        category_id: item.category_id,
        deleted_at: null,
      },
    });

    const rolloverAmount = item.rollover_amount
      ? new Prisma.Decimal(item.rollover_amount.toString())
      : new Prisma.Decimal(0);

    if (existing !== null) {
      await client.budgetItem.update({
        where: { id: existing.id },
        data: {
          type: item.type ?? 'EXPENSE',
          planned_amount: new Prisma.Decimal(item.planned_amount.toString()),
          rollover_enabled: item.rollover_enabled,
          rollover_amount: rolloverAmount,
          updated_at: new Date(),
        },
      });
    } else {
      await client.budgetItem.create({
        data: {
          tenant_id: tenantId,
          budget_id: budgetId,
          category_id: item.category_id,
          type: item.type ?? 'EXPENSE',
          planned_amount: new Prisma.Decimal(item.planned_amount.toString()),
          rollover_enabled: item.rollover_enabled,
          rollover_amount: rolloverAmount,
          created_by: item.created_by ?? null,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// createBudgetVersion
// Persists a snapshot of the budget at a given version number.
// ---------------------------------------------------------------------------
export async function createBudgetVersion(
  prismaClient: Client,
  budgetId: string,
  tenantId: string,
  version: number,
  snapshot: object,
) {
  return (prismaClient as PrismaClient).budgetVersion.create({
    data: {
      tenant_id: tenantId,
      budget_id: budgetId,
      version,
      snapshot,
    },
  });
}

// ---------------------------------------------------------------------------
// findBudgetVersions
// Returns all BudgetVersion records for a budget, ordered newest-first.
// ---------------------------------------------------------------------------
export async function findBudgetVersions(
  prismaClient: Client,
  budgetId: string,
  tenantId: string,
) {
  return (prismaClient as PrismaClient).budgetVersion.findMany({
    where: { budget_id: budgetId, tenant_id: tenantId },
    orderBy: { version: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// calculateActualSpent
// Aggregates the SUM of transactions with status REALIZADO or PREVISTO for the
// given tenant / year / month / category, optionally scoped to a user.
// Returns { amount: Prisma.Decimal } — amount defaults to 0 when no rows match.
// ---------------------------------------------------------------------------
export async function calculateActualSpent(
  prismaClient: Client,
  tenantId: string,
  year: number,
  month: number,
  categoryId: string,
  userId: string | null,
  type: 'INCOME' | 'EXPENSE' = 'EXPENSE',
): Promise<{ amount: Prisma.Decimal }> {
  const client = prismaClient as PrismaClient;

  // Use UTC boundaries so transactions saved either as UTC midnight (legacy)
  // or as SP noon (new fix) both fall inside the correct month range.
  const mm = String(month).padStart(2, '0');
  const firstDay = new Date(`${year}-${mm}-01T00:00:00.000Z`);
  const lastDay = new Date(year, month, 0); // day 0 of next month = last day of current month
  const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
  const lastDayEnd = new Date(`${lastDayStr}T23:59:59.999Z`);

  const result = await client.transaction.aggregate({
    _sum: { amount: true },
    where: {
      tenant_id: tenantId,
      category_id: categoryId,
      type,
      status: { in: ['REALIZADO', 'PREVISTO'] },
      deleted_at: null,
      date: { gte: firstDay, lte: lastDayEnd },
      ...(userId !== null ? { user_id: userId } : {}),
    },
  });

  return { amount: result._sum.amount ?? new Prisma.Decimal(0) };
}

// ---------------------------------------------------------------------------
// findPreviousMonthBudget
// Returns the Budget (with items) for the month immediately preceding the
// supplied year/month. Handles the January → December year boundary.
// ---------------------------------------------------------------------------
export async function findPreviousMonthBudget(
  prismaClient: Client,
  tenantId: string,
  year: number,
  month: number,
  userId: string | null,
) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  return findBudget(prismaClient, tenantId, prevYear, prevMonth, userId);
}
