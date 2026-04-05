import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError } from '../../lib/errors';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.schemas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  created_by: string | null;
  tenant_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
  is_system: boolean;
  type: 'INCOME' | 'EXPENSE' | 'BOTH';
};

export type CategoryWithChildren = CategoryRow & {
  subcategories: CategoryRow[];
};

// ---------------------------------------------------------------------------
// Count (root categories only, for plan enforcement)
// ---------------------------------------------------------------------------

export async function countActiveRootCategories(tenantId: string): Promise<number> {
  return prisma.category.count({
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      parent_id: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findAll(
  tenantId: string,
  includeDeleted = false,
  parentId?: string | null,
  typeFilter?: 'INCOME' | 'EXPENSE' | 'BOTH',
): Promise<CategoryRow[]> {
  const deletedFilter = includeDeleted ? {} : { deleted_at: null };
  const parentFilter = parentId !== undefined ? { parent_id: parentId } : {};
  const typeWhere = typeFilter ? { type: typeFilter } : {};

  return prisma.category.findMany({
    where: { tenant_id: tenantId, ...deletedFilter, ...parentFilter, ...typeWhere },
    orderBy: { name: 'asc' },
  });
}

/** Returns all non-deleted categories for the tenant as a flat list. */
export async function findAllFlat(
  tenantId: string,
  includeDeleted = false,
  typeFilter?: 'INCOME' | 'EXPENSE' | 'BOTH',
): Promise<CategoryRow[]> {
  const deletedFilter = includeDeleted ? {} : { deleted_at: null };
  const typeWhere = typeFilter ? { type: typeFilter } : {};
  return prisma.category.findMany({
    where: { tenant_id: tenantId, ...deletedFilter, ...typeWhere },
    orderBy: [{ parent_id: 'asc' }, { name: 'asc' }],
  });
}

export async function findById(id: string, tenantId: string): Promise<CategoryRow | null> {
  return prisma.category.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
  });
}

// ---------------------------------------------------------------------------
// Tree builder (in-memory)
// ---------------------------------------------------------------------------

export function buildTree(rows: CategoryRow[]): CategoryWithChildren[] {
  const byId = new Map<string, CategoryWithChildren>();
  const roots: CategoryWithChildren[] = [];

  for (const row of rows) {
    byId.set(row.id, { ...row, subcategories: [] });
  }

  for (const node of byId.values()) {
    if (node.parent_id === null) {
      roots.push(node);
    } else {
      const parent = byId.get(node.parent_id);
      if (parent !== undefined) {
        parent.subcategories.push(node);
      } else {
        // Orphan (parent was deleted and not included) — surface at root
        roots.push(node);
      }
    }
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function create(
  tenantId: string,
  userId: string,
  data: CreateCategoryInput,
): Promise<CategoryRow> {
  // If a soft-deleted record with same name+parent exists, restore it with new attributes
  const existing = await prisma.category.findFirst({
    where: {
      tenant_id: tenantId,
      name: data.name,
      parent_id: data.parent_id ?? null,
      deleted_at: { not: null },
    },
  });

  if (existing) {
    return prisma.category.update({
      where: { id: existing.id },
      data: {
        deleted_at: null,
        color: data.color ?? existing.color,
        icon: data.icon ?? existing.icon,
        type: data.type ?? existing.type,
        created_by: userId,
        updated_at: new Date(),
      },
    });
  }

  try {
    return await prisma.category.create({
      data: {
        tenant_id: tenantId,
        created_by: userId,
        name: data.name,
        color: data.color ?? null,
        icon: data.icon ?? null,
        parent_id: data.parent_id ?? null,
        type: data.type ?? 'BOTH',
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(
        `A category named "${data.name}" already exists${data.parent_id ? ' under that parent' : ''}.`,
      );
    }
    throw err;
  }
}

export async function update(
  id: string,
  tenantId: string,
  data: UpdateCategoryInput,
): Promise<CategoryRow> {
  try {
    return await prisma.category.update({
      where: { id, tenant_id: tenantId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(
        `A category named "${data.name}" already exists under that parent.`,
      );
    }
    throw err;
  }
}

/** Soft-deletes a category AND all its direct subcategories. */
export async function softDeleteWithChildren(
  id: string,
  tenantId: string,
): Promise<CategoryRow> {
  const now = new Date();

  // Soft-delete subcategories first
  await prisma.category.updateMany({
    where: { parent_id: id, tenant_id: tenantId, deleted_at: null },
    data: { deleted_at: now },
  });

  // Soft-delete the parent itself
  return prisma.category.update({
    where: { id, tenant_id: tenantId },
    data: { deleted_at: now },
  });
}
