import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ConflictError } from '../../lib/errors';
import type { CreateTagInput, UpdateTagInput } from './tags.schemas';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findAll(tenantId: string) {
  return prisma.tag.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    orderBy: { name: 'asc' },
  });
}

export async function findById(id: string, tenantId: string) {
  return prisma.tag.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
  });
}

export async function findByName(
  name: string,
  tenantId: string,
  excludeId?: string,
) {
  return prisma.tag.findFirst({
    where: {
      name,
      tenant_id: tenantId,
      deleted_at: null,
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function create(
  tenantId: string,
  userId: string,
  data: CreateTagInput,
) {
  try {
    return await prisma.tag.create({
      data: {
        tenant_id: tenantId,
        created_by: userId,
        name: data.name,
        color: data.color ?? null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(`A tag named "${data.name}" already exists.`);
    }
    throw err;
  }
}

export async function update(
  id: string,
  tenantId: string,
  data: UpdateTagInput,
) {
  try {
    return await prisma.tag.update({
      where: { id, tenant_id: tenantId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ConflictError(`A tag named "${data.name}" already exists.`);
    }
    throw err;
  }
}

export async function softDelete(id: string, tenantId: string) {
  return prisma.tag.update({
    where: { id, tenant_id: tenantId },
    data: { deleted_at: new Date() },
  });
}
