import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import { NotFoundError, ConflictError } from '../../lib/errors';
import * as repo from './tags.repository';
import type { CreateTagInput, UpdateTagInput } from './tags.schemas';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listTags(tenantId: string) {
  const tags = await repo.findAll(tenantId);
  return { data: tags, total: tags.length };
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

export async function getTag(id: string, tenantId: string) {
  const tag = await repo.findById(id, tenantId);
  if (tag === null) {
    throw new NotFoundError('Tag not found.');
  }
  return { data: tag };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTag(
  tenantId: string,
  userId: string,
  data: CreateTagInput,
) {
  // Check unique name (race condition protection — DB unique constraint is the final guard)
  const existing = await repo.findByName(data.name, tenantId);
  if (existing !== null) {
    throw new ConflictError(`A tag named "${data.name}" already exists.`);
  }

  const tag = await repo.create(tenantId, userId, data);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Tag',
    entityId: tag.id,
    action: 'CREATE',
    afterData: tag as unknown as Record<string, unknown>,
  });

  return { data: tag };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateTag(
  id: string,
  tenantId: string,
  userId: string,
  data: UpdateTagInput,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Tag not found.');
  }

  // Check name uniqueness if name is being changed
  if (data.name !== undefined && data.name !== existing.name) {
    const duplicate = await repo.findByName(data.name, tenantId, id);
    if (duplicate !== null) {
      throw new ConflictError(`A tag named "${data.name}" already exists.`);
    }
  }

  const updated = await repo.update(id, tenantId, data);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Tag',
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

export async function deleteTag(
  id: string,
  tenantId: string,
  userId: string,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Tag not found.');
  }

  const deleted = await repo.softDelete(id, tenantId);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Tag',
    entityId: id,
    action: 'DELETE',
    beforeData: existing as unknown as Record<string, unknown>,
    afterData: deleted as unknown as Record<string, unknown>,
  });
}
