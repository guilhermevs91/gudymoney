import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import { checkPlanLimit, FEATURE_KEYS } from '../../lib/plan-limits';
import { NotFoundError, PlanLimitError } from '../../lib/errors';
import type { PlanType } from '@prisma/client';
import * as repo from './categories.repository';

// ---------------------------------------------------------------------------
// Color palette & picker
// ---------------------------------------------------------------------------

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#64748b', '#0ea5e9', '#d946ef', '#fb923c', '#4ade80',
];

async function pickUniqueColor(tenantId: string): Promise<string> {
  const used = await prisma.category.findMany({
    where: { tenant_id: tenantId, deleted_at: null, color: { not: null } },
    select: { color: true },
  });
  const usedSet = new Set(used.map((c) => c.color as string));
  const available = COLOR_PALETTE.filter((c) => !usedSet.has(c));
  const pool = available.length > 0 ? available : COLOR_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  ListCategoriesQuery,
} from './categories.schemas';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listCategories(
  tenantId: string,
  query: ListCategoriesQuery,
) {
  if (query.flat) {
    const rows = await repo.findAllFlat(tenantId, query.include_deleted, query.type);
    return { data: rows, total: rows.length };
  }

  // Tree mode — load everything that matches the parent filter then build tree
  if (query.parent_id !== undefined) {
    const rows = await repo.findAll(tenantId, query.include_deleted, query.parent_id, query.type);
    return { data: rows, total: rows.length };
  }

  // Full tree
  const rows = await repo.findAllFlat(tenantId, query.include_deleted, query.type);
  const tree = repo.buildTree(rows);
  return { data: tree, total: tree.length };
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

export async function getCategory(id: string, tenantId: string) {
  const category = await repo.findById(id, tenantId);
  if (category === null) {
    throw new NotFoundError('Category not found.');
  }
  return { data: category };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCategory(
  tenantId: string,
  userId: string,
  plan: PlanType,
  data: CreateCategoryInput,
) {
  // Plan enforcement: only for root categories
  if (data.parent_id === null || data.parent_id === undefined) {
    const currentCount = await repo.countActiveRootCategories(tenantId);
    const check = await checkPlanLimit(
      prisma,
      plan,
      FEATURE_KEYS.MAX_CATEGORIES,
      currentCount,
    );
    if (!check.allowed) {
      throw new PlanLimitError(
        `Plan limit reached: maximum ${check.limit} root categories allowed (current: ${check.current}).`,
      );
    }
  }

  let color = data.color;
  if (!color) {
    if (data.parent_id) {
      const parent = await repo.findById(data.parent_id, tenantId);
      color = parent?.color ?? await pickUniqueColor(tenantId);
    } else {
      color = await pickUniqueColor(tenantId);
    }
  }
  const category = await repo.create(tenantId, userId, { ...data, color });

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Category',
    entityId: category.id,
    action: 'CREATE',
    afterData: category as unknown as Record<string, unknown>,
  });

  return { data: category };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateCategory(
  id: string,
  tenantId: string,
  userId: string,
  data: UpdateCategoryInput,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Category not found.');
  }

  const updated = await repo.update(id, tenantId, data);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Category',
    entityId: id,
    action: 'UPDATE',
    beforeData: existing as unknown as Record<string, unknown>,
    afterData: updated as unknown as Record<string, unknown>,
  });

  return { data: updated };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteCategory(
  id: string,
  tenantId: string,
  userId: string,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Category not found.');
  }

  const deleted = await repo.softDeleteWithChildren(id, tenantId);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Category',
    entityId: id,
    action: 'DELETE',
    beforeData: existing as unknown as Record<string, unknown>,
    afterData: deleted as unknown as Record<string, unknown>,
  });
}
