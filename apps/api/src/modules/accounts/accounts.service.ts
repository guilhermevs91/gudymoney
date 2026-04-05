import { prisma } from '../../lib/prisma';
import { createAuditLog } from '../../lib/audit';
import { checkPlanLimit, FEATURE_KEYS } from '../../lib/plan-limits';
import {
  NotFoundError,
  PlanLimitError,
  ValidationError,
} from '../../lib/errors';
import type { PlanType } from '@prisma/client';
import * as repo from './accounts.repository';
import type {
  CreateAccountInput,
  UpdateAccountInput,
  ListAccountsQuery,
} from './accounts.schemas';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listAccounts(tenantId: string, query: ListAccountsQuery) {
  const accounts = await repo.findAll(tenantId, query.include_inactive);
  const accountsWithBalance = await Promise.all(
    accounts.map(async (acc) => {
      const balance = await repo.calculateBalance(acc.id, tenantId);
      return { ...acc, balance };
    }),
  );
  return { data: accountsWithBalance, total: accounts.length };
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

export async function getAccount(id: string, tenantId: string) {
  const account = await repo.findById(id, tenantId);
  if (account === null) {
    throw new NotFoundError('Account not found.');
  }
  return { data: account };
}

export async function getAccountWithBalance(id: string, tenantId: string) {
  const account = await repo.findById(id, tenantId);
  if (account === null) {
    throw new NotFoundError('Account not found.');
  }
  const balance = await repo.calculateBalance(id, tenantId);
  return { data: { ...account, balance } };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createAccount(
  tenantId: string,
  userId: string,
  plan: PlanType,
  data: CreateAccountInput,
) {
  // Plan enforcement
  const currentCount = await repo.countActiveAccounts(tenantId);
  const check = await checkPlanLimit(
    prisma,
    plan,
    FEATURE_KEYS.MAX_ACCOUNTS,
    currentCount,
  );
  if (!check.allowed) {
    throw new PlanLimitError(
      `Plan limit reached: maximum ${check.limit} accounts allowed (current: ${check.current}).`,
    );
  }

  const account = await repo.create(tenantId, userId, data);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Account',
    entityId: account.id,
    action: 'CREATE',
    afterData: account as unknown as Record<string, unknown>,
  });

  return { data: account };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateAccount(
  id: string,
  tenantId: string,
  userId: string,
  data: UpdateAccountInput,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Account not found.');
  }

  const updated = await repo.update(id, tenantId, data);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Account',
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

export async function deleteAccount(
  id: string,
  tenantId: string,
  userId: string,
) {
  const existing = await repo.findById(id, tenantId);
  if (existing === null) {
    throw new NotFoundError('Account not found.');
  }

  const hasTransactions = await repo.hasRealizedEntries(id, tenantId);
  if (hasTransactions) {
    throw new ValidationError(
      'Cannot delete an account that has realized transactions.',
    );
  }

  const deleted = await repo.softDelete(id, tenantId);

  await createAuditLog({
    prisma,
    tenantId,
    userId,
    entityType: 'Account',
    entityId: id,
    action: 'DELETE',
    beforeData: existing as unknown as Record<string, unknown>,
    afterData: deleted as unknown as Record<string, unknown>,
  });
}
