'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrency, formatMonth, currentYearMonth } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { LedgerSummary, Account, Budget, BudgetItem } from '@/types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface NavMonth { year: number; month: number }

function addMonths(nav: NavMonth, delta: number): NavMonth {
  const d = new Date(nav.year, nav.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

interface ProjectionPoint { month: string; income: number; expense: number; balance?: number }

interface DashboardData {
  summary: LedgerSummary | null;
  accounts: Account[];
  budgetItems: BudgetItem[];
  projection: ProjectionPoint[];
}

export default function DashboardPage() {
  const { year: cy, month: cm } = currentYearMonth();
  const [nav, setNav] = useState<NavMonth>({ year: cy, month: cm });
  const [data, setData] = useState<DashboardData>({ summary: null, accounts: [], budgetItems: [], projection: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    async function load() {
      try {
        const [summaryRes, accountsRes, budgetRes, projectionRes] = await Promise.allSettled([
          api.get<LedgerSummary>(`/ledger/summary?year=${nav.year}&month=${nav.month}`),
          api.get<{ data: Account[] }>('/accounts'),
          api.get<{ data: Budget }>(`/budgets?year=${nav.year}&month=${nav.month}`),
          api.get<{ data: ProjectionPoint[] }>(`/transactions/projection?year=${nav.year}&month=${nav.month}`),
        ]);

        setData({
          summary: summaryRes.status === 'fulfilled' ? summaryRes.value : null,
          accounts:
            accountsRes.status === 'fulfilled'
              ? accountsRes.value.data.filter((a) => a.type !== 'INTERNAL')
              : [],
          budgetItems:
            budgetRes.status === 'fulfilled' ? (budgetRes.value.data?.budget_items ?? []) : [],
          projection:
            projectionRes.status === 'fulfilled' ? projectionRes.value.data : [],
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [nav]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const { summary, accounts, budgetItems, projection } = data;

  const totalRealized = accounts.reduce((s, a) => s + Number(a.balance?.realized ?? 0), 0);
  const totalProjected = Number(summary?.total_projected ?? 0);

  // Compute cumulative balance projection: starts from current realized balance
  let runningBalance = totalRealized;
  const projectionWithBalance: ProjectionPoint[] = projection.map((p) => {
    runningBalance = runningBalance + p.income - p.expense;
    return { ...p, balance: runningBalance };
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setNav((n) => addMonths(n, -1))}>←</Button>
            <span className="text-sm font-medium min-w-[140px] text-center capitalize">{formatMonth(nav.year, nav.month)}</span>
            <Button variant="outline" size="icon" onClick={() => setNav((n) => addMonths(n, 1))}>→</Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3 lg:grid-cols-6 mb-6">
        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Saldo Realizado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className={`text-lg md:text-2xl font-bold truncate ${totalRealized >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(totalRealized)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Saldo Projetado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className={`text-lg md:text-2xl font-bold truncate ${totalProjected >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(totalProjected)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Receitas Projetadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold truncate text-emerald-500 dark:text-emerald-400">
              {formatCurrency(Number(summary?.income_projected ?? 0))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Receitas Realizadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold truncate text-green-600 dark:text-green-400">
              {formatCurrency(Number(summary?.income_this_month ?? 0))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Despesas Projetadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold truncate text-orange-500 dark:text-orange-400">
              {formatCurrency(Number(summary?.expense_projected ?? 0))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Despesas Realizadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold truncate text-red-600 dark:text-red-400">
              {formatCurrency(Number(summary?.expense_this_month ?? 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Accounts */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Contas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
            ) : (
              accounts.map((acc) => (
                <div key={acc.id} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{acc.name}</p>
                    <p className="text-xs text-muted-foreground">{acc.bank_name ?? acc.type}</p>
                  </div>
                  <p
                    className={`text-sm font-medium tabular-nums ${Number(acc.balance?.realized ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                  >
                    {formatCurrency(Number(acc.balance?.realized ?? 0))}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Budget progress */}
        <Card className="md:col-span-2 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Orçamento — {formatMonth(nav.year, nav.month)}</CardTitle>
              {budgetItems.length > 5 && (
                <span className="text-xs text-muted-foreground">{budgetItems.length} categorias</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {budgetItems.length === 0 ? (
              <p className="text-sm text-muted-foreground px-6 pb-4">Sem orçamento para este mês.</p>
            ) : (
              <div className="overflow-y-auto overflow-x-hidden max-h-[300px] px-4 md:px-6 pb-4 space-y-0 scrollbar-thin">
                {[...budgetItems]
                  .sort((a, b) => Number(b.planned_amount) - Number(a.planned_amount))
                  .map((item) => {
                    const isIncome = item.type === 'INCOME';
                    const planned = Number(item.planned_amount);
                    const actual = Number(item.actual_amount ?? 0);
                    const pct = planned > 0 ? (actual / planned) * 100 : 0;
                    const displayPct = Math.min(pct, 100);
                    const catColor = (item.category as { color?: string } | null)?.color ?? (isIncome ? '#22c55e' : '#ef4444');
                    const barBg = pct >= 100
                      ? (isIncome ? '#22c55e' : '#ef4444')
                      : pct >= 80 ? '#eab308' : catColor;

                    return (
                      <div key={item.id} className="py-2.5 border-b last:border-b-0">
                        <div className="flex items-center justify-between mb-1.5 gap-2 min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium min-w-0 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                            <span className="truncate">{item.category?.name ?? 'Categoria'}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0 text-[11px] tabular-nums">
                            <span className={`font-bold w-8 text-right ${pct >= 100 ? (isIncome ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                              {Math.round(pct)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${displayPct}%`, backgroundColor: barBg }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projection chart */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Projeção de Gastos — próximos 6 meses</CardTitle>
          <p className="text-xs text-muted-foreground">Inclui lançamentos previstos e realizados (exclui cancelados)</p>
        </CardHeader>
        <CardContent>
          {projection.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de projeção.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={projectionWithBalance} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) =>
                    v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`
                  }
                  width={60}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === 'income' ? 'Receitas' : name === 'expense' ? 'Despesas' : 'Saldo Projetado',
                  ]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend formatter={(v) => v === 'income' ? 'Receitas' : v === 'expense' ? 'Despesas' : 'Saldo Projetado'} />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#gradIncome)"
                  dot={{ r: 4, fill: '#22c55e' }}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fill="url(#gradExpense)"
                  dot={{ r: 4, fill: '#ef4444' }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  fill="url(#gradBalance)"
                  dot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
