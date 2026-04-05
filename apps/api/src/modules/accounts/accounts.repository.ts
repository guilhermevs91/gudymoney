import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { CreateAccountInput, UpdateAccountInput } from './accounts.schemas';

// ---------------------------------------------------------------------------
// Count
// ---------------------------------------------------------------------------

export async function countActiveAccounts(tenantId: string): Promise<number> {
  return prisma.account.count({
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      is_active: true,
      type: { not: 'INTERNAL' },
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function findAll(tenantId: string, includeInactive = false) {
  return prisma.account.findMany({
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      type: { not: 'INTERNAL' },
      ...(includeInactive ? {} : { is_active: true }),
    },
    orderBy: { created_at: 'asc' },
  });
}

export async function findById(id: string, tenantId: string) {
  return prisma.account.findFirst({
    where: {
      id,
      tenant_id: tenantId,
      deleted_at: null,
      type: { not: 'INTERNAL' },
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function create(
  tenantId: string,
  userId: string,
  data: CreateAccountInput,
) {
  return prisma.account.create({
    data: {
      tenant_id: tenantId,
      created_by: userId,
      name: data.name,
      type: data.type,
      initial_balance: data.initial_balance,
      currency: data.currency,
      bank_name: data.bank_name ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
    },
  });
}

export async function update(
  id: string,
  tenantId: string,
  data: UpdateAccountInput,
) {
  const updateData: Prisma.AccountUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.bank_name !== undefined) updateData.bank_name = data.bank_name;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.icon !== undefined) updateData.icon = data.icon;

  return prisma.account.update({
    where: { id, tenant_id: tenantId },
    data: updateData,
  });
}

export async function softDelete(id: string, tenantId: string) {
  return prisma.account.update({
    where: { id, tenant_id: tenantId },
    data: { deleted_at: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Balance calculation
// ---------------------------------------------------------------------------

export async function calculateBalance(
  accountId: string,
  tenantId: string,
): Promise<{ realized: number; projected: number }> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, tenant_id: tenantId, deleted_at: null },
    select: { initial_balance: true },
  });

  const initialBalance = account?.initial_balance ?? 0;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      account_id: accountId,
      tenant_id: tenantId,
      deleted_at: null,
      status: { in: ['REALIZADO', 'PREVISTO'] },
    },
    select: { type: true, amount: true, status: true },
  });

  let realizedDelta = 0;
  let previstoeDelta = 0;

  for (const e of entries) {
    const val = Number(e.amount);
    const signed = e.type === 'CREDIT' ? val : -val;
    if (e.status === 'REALIZADO') realizedDelta += signed;
    else previstoeDelta += signed;
  }

  const realized = Number(initialBalance) + realizedDelta;
  const projected = realized + previstoeDelta;

  return { realized: Number(realized.toFixed(2)), projected: Number(projected.toFixed(2)) };
}

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

/** Returns true when the account has at least one REALIZADO ledger entry */
export async function hasRealizedEntries(
  accountId: string,
  tenantId: string,
): Promise<boolean> {
  const count = await prisma.ledgerEntry.count({
    where: {
      account_id: accountId,
      tenant_id: tenantId,
      deleted_at: null,
      status: 'REALIZADO',
    },
  });
  return count > 0;
}
