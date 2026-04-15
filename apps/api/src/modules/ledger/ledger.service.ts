import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountBalance {
  account: {
    id: string;
    name: string;
    type: string;
    currency: string;
    initial_balance: Prisma.Decimal;
  };
  balance: {
    realized: Prisma.Decimal;
    projected: Prisma.Decimal;
  };
}

export interface TenantSummary {
  total_realized: Prisma.Decimal;
  total_projected: Prisma.Decimal;
  income_this_month: Prisma.Decimal;
  expense_this_month: Prisma.Decimal;
  income_projected: Prisma.Decimal;
  expense_projected: Prisma.Decimal;
}

// ---------------------------------------------------------------------------
// Balance calculation helpers
// ---------------------------------------------------------------------------

/**
 * Compute realized and projected balance for a single account.
 *
 * realized = initial_balance + sum(all-time REALIZADO entries)
 * projected = realized + sum(PREVISTO entries within the target month only)
 */
async function computeAccountBalance(
  accountId: string,
  initialBalance: Prisma.Decimal,
  monthStart: Date,
  monthEnd: Date,
): Promise<{ realized: Prisma.Decimal; projected: Prisma.Decimal }> {
  const realizedAgg = await prisma.ledgerEntry.findMany({
    where: {
      account_id: accountId,
      status: 'REALIZADO',
      deleted_at: null,
    },
    select: { type: true, amount: true },
  });

  // Only PREVISTO entries whose transaction falls within the target month
  const previstoAgg = await prisma.ledgerEntry.findMany({
    where: {
      account_id: accountId,
      status: 'PREVISTO',
      deleted_at: null,
      transaction: {
        date: { gte: monthStart, lte: monthEnd },
        deleted_at: null,
      },
    },
    select: { type: true, amount: true },
  });

  let realizedDelta = new Prisma.Decimal(0);
  for (const entry of realizedAgg) {
    if (entry.type === 'CREDIT') {
      realizedDelta = realizedDelta.add(entry.amount);
    } else {
      realizedDelta = realizedDelta.sub(entry.amount);
    }
  }

  let previstoeDelta = new Prisma.Decimal(0);
  for (const entry of previstoAgg) {
    if (entry.type === 'CREDIT') {
      previstoeDelta = previstoeDelta.add(entry.amount);
    } else {
      previstoeDelta = previstoeDelta.sub(entry.amount);
    }
  }

  const realized = initialBalance.add(realizedDelta);
  const projected = realized.add(previstoeDelta);

  return { realized, projected };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const ledgerService = {
  /**
   * Get realized and projected balance for a specific account.
   * Only non-INTERNAL accounts are exposed.
   */
  async getAccountBalance(
    accountId: string,
    tenantId: string,
  ): Promise<AccountBalance> {
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        tenant_id: tenantId,
        deleted_at: null,
        type: { not: 'INTERNAL' },
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        initial_balance: true,
      },
    });

    if (account === null) {
      throw new NotFoundError('Conta não encontrada.');
    }

    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dd = String(lastDay).padStart(2, '0');
    const monthStart = new Date(`${now.getFullYear()}-${mm}-01T00:00:00.000Z`);
    const monthEnd = new Date(`${now.getFullYear()}-${mm}-${dd}T23:59:59.999Z`);

    const balance = await computeAccountBalance(accountId, account.initial_balance, monthStart, monthEnd);

    return { account, balance };
  },

  /**
   * Summarize realized and projected balances across all non-INTERNAL accounts
   * for a tenant. Also computes income and expense totals for the current month.
   */
  async getTenantSummary(tenantId: string, year?: number, month?: number): Promise<TenantSummary> {
    // Fetch all non-INTERNAL accounts for the tenant
    const accounts = await prisma.account.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        is_active: true,
        type: { not: 'INTERNAL' },
      },
      select: { id: true, initial_balance: true },
    });

    // Determine target month upfront (used for both projected balance and income/expense)
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month != null ? month - 1 : now.getMonth(); // convert 1-based to 0-based
    const mm = String(targetMonth + 1).padStart(2, '0');
    const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const dd = String(lastDayOfMonth).padStart(2, '0');
    const monthStart = new Date(`${targetYear}-${mm}-01T00:00:00.000Z`);
    const monthEnd = new Date(`${targetYear}-${mm}-${dd}T23:59:59.999Z`);

    let totalRealized = new Prisma.Decimal(0);
    let totalProjected = new Prisma.Decimal(0);

    for (const account of accounts) {
      const balance = await computeAccountBalance(
        account.id,
        account.initial_balance,
        monthStart,
        monthEnd,
      );
      totalRealized = totalRealized.add(balance.realized);
      totalProjected = totalProjected.add(balance.projected);
    }

    const monthlyTransactions = await prisma.transaction.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        status: { in: ['REALIZADO', 'PREVISTO'] },
        date: { gte: monthStart, lte: monthEnd },
        type: { in: ['INCOME', 'EXPENSE'] },
      },
      select: { type: true, amount: true, status: true },
    });

    let incomeThisMonth = new Prisma.Decimal(0);
    let expenseThisMonth = new Prisma.Decimal(0);
    let incomeProjected = new Prisma.Decimal(0);
    let expenseProjected = new Prisma.Decimal(0);

    for (const tx of monthlyTransactions) {
      if (tx.status === 'REALIZADO') {
        if (tx.type === 'INCOME') incomeThisMonth = incomeThisMonth.add(tx.amount);
        if (tx.type === 'EXPENSE') expenseThisMonth = expenseThisMonth.add(tx.amount);
      }
      if (tx.type === 'INCOME') incomeProjected = incomeProjected.add(tx.amount);
      if (tx.type === 'EXPENSE') expenseProjected = expenseProjected.add(tx.amount);
    }

    // Deduct unpaid invoice balances from total_projected.
    // Invoices with status OPEN or CLOSED (but not PAID) represent money owed
    // that is not yet reflected in account ledger entries.
    const unpaidInvoices = await prisma.creditCardInvoice.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        status: { in: ['OPEN', 'CLOSED'] },
      },
      select: { total_amount: true, total_paid: true },
    });

    let pendingInvoiceTotal = new Prisma.Decimal(0);
    for (const inv of unpaidInvoices) {
      const outstanding = new Prisma.Decimal(inv.total_amount ?? 0).sub(
        new Prisma.Decimal(inv.total_paid ?? 0),
      );
      if (outstanding.gt(0)) {
        pendingInvoiceTotal = pendingInvoiceTotal.add(outstanding);
      }
    }

    return {
      total_realized: totalRealized,
      total_projected: totalProjected.sub(pendingInvoiceTotal),
      income_this_month: incomeThisMonth,
      expense_this_month: expenseThisMonth,
      income_projected: incomeProjected,
      expense_projected: expenseProjected,
    };
  },
};
