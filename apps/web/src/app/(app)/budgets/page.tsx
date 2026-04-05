'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatCurrency, formatMonth, currentYearMonth, flatCategoryOptions, filterCategoriesByType } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import type { Budget, BudgetItem, Category } from '@/types';

interface NavMonth {
  year: number;
  month: number;
}

function addMonths(nav: NavMonth, delta: number): NavMonth {
  const d = new Date(nav.year, nav.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function progressColor(pct: number): string {
  if (pct > 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-yellow-500';
  return 'bg-green-500';
}

interface ItemRowProps {
  item: BudgetItem;
  onEdit: (item: BudgetItem) => void;
  onDelete: (itemId: string) => void;
}

function BudgetItemRow({ item, onEdit, onDelete }: ItemRowProps) {
  const planned = Number(item.planned_amount);
  const actual = Number(item.actual_amount ?? 0);
  const pct = planned > 0 ? (actual / planned) * 100 : 0;
  const displayPct = Math.min(pct, 100);
  const isIncome = item.type === 'INCOME';
  // For income: green when close/above target; for expense: red when over
  const barColor = isIncome
    ? (pct >= 100 ? 'bg-green-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-muted-foreground')
    : progressColor(pct);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {item.category?.name ?? '—'}
          <span className={`text-xs px-1.5 py-0.5 rounded font-normal ${isIncome ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
            {isIncome ? 'Receita' : 'Despesa'}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(planned)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(actual)}</TableCell>
      <TableCell className="w-48">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${displayPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {Math.round(pct)}%
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Editar valor planejado"
            onClick={() => onEdit(item)}
            className="h-8 w-8"
          >
            ✎
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Remover categoria"
            onClick={() => onDelete(item.id)}
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            ✕
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function BudgetsPage() {
  const { toast } = useToast();
  const { year: cy, month: cm } = currentYearMonth();

  const [nav, setNav] = useState<NavMonth>({ year: cy, month: cm });
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [planBlocked, setPlanBlocked] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemType, setItemType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [itemPlanned, setItemPlanned] = useState('');
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Dialog de replicação ao editar
  const [replicateDialogOpen, setReplicateDialogOpen] = useState(false);
  const [replicateMonths, setReplicateMonths] = useState('0');
  const [pendingEditPayload, setPendingEditPayload] = useState<{ planned: number } | null>(null);

  // Modal de confirmação para edição com propagação futura (legado — mantido para compatibilidade)
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [itemExistsInFuture, setItemExistsInFuture] = useState(false);

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState(false);

  const loadBudget = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setPlanBlocked(false);
    try {
      let res = await api.get<{ data: Budget }>('/budgets', { year: y, month: m });
      if (!res.data) {
        res = await api.post<{ data: Budget }>('/budgets', { year: y, month: m });
      }
      const budgetData = res.data ?? null;
      setBudget(budgetData);

      // Auto-insert categories from transactions not yet in the budget
      if (budgetData) {
        try {
          const sugRes = await api.get<{ data: { category_id: string; category_name: string; type: 'INCOME' | 'EXPENSE'; actual_amount: number }[] }>(
            '/budgets/suggestions', { year: y, month: m }
          );
          // Deduplicate suggestions by category_id (keep highest actual_amount)
          const uniqueSuggestions = Object.values(
            sugRes.data.reduce<Record<string, typeof sugRes.data[0]>>((acc, s) => {
              if (!acc[s.category_id] || s.actual_amount > acc[s.category_id].actual_amount) {
                acc[s.category_id] = s;
              }
              return acc;
            }, {})
          );
          if (uniqueSuggestions.length > 0) {
            await Promise.all(uniqueSuggestions.map((s) =>
              api.post(`/budgets/${budgetData.id}/items`, {
                category_id: s.category_id,
                type: s.type,
                planned_amount: 0.01, // placeholder — usuário edita o valor
                apply_to_future: false,
              }).catch(() => {}) // ignora se já existir
            ));
            // Reload to show new items
            const refreshed = await api.get<{ data: Budget }>('/budgets', { year: y, month: m });
            setBudget(refreshed.data ?? budgetData);
          }
        } catch { /* silencia — sugestões são best-effort */ }
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        setPlanBlocked(true);
      }
      setBudget(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudget(nav.year, nav.month);
  }, [nav, loadBudget]);

  useEffect(() => {
    api.get<{ data: Category[] }>('/categories?flat=true').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  function openAddItem() {
    setEditingItem(null);
    setItemCategoryId('');
    setItemType('EXPENSE');
    setItemPlanned('');
    setApplyToFuture(false);
    setItemDialogOpen(true);
  }

  async function openEditItem(item: BudgetItem) {
    setEditingItem(item);
    setItemCategoryId(item.category_id);
    setItemType(item.type ?? 'EXPENSE');
    // Se o valor ainda é o placeholder (0,01), sugere o valor realizado do mês
    const planned = Number(item.planned_amount);
    const actual = Number(item.actual_amount ?? 0);
    const suggestedValue = planned <= 0.01 && actual > 0 ? actual : planned;
    setItemPlanned(String(suggestedValue));
    setApplyToFuture(false);
    setItemExistsInFuture(false);
    setItemDialogOpen(true);
    try {
      const res = await api.get<{ exists: boolean }>('/budgets/items/future-exists', {
        category_id: item.category_id,
        from_year: nav.year,
        from_month: nav.month,
      });
      setItemExistsInFuture(res.exists);
    } catch { /* silencia — botão simplesmente não aparece */ }
  }

  async function executeSaveItem(applyFuture: boolean) {
    if (!budget) return;
    setSavingItem(true);
    try {
      if (editingItem) {
        await api.patch(`/budgets/${budget.id}/items/${editingItem.id}`, {
          planned_amount: Number(itemPlanned),
          apply_to_future: applyFuture,
        });
        toast({ title: applyFuture ? 'Item atualizado nos próximos meses' : 'Item atualizado' });
      } else {
        await api.post(`/budgets/${budget.id}/items`, {
          category_id: itemCategoryId,
          type: itemType,
          planned_amount: Number(itemPlanned),
          apply_to_future: applyFuture,
        });
        toast({ title: applyFuture ? 'Categoria adicionada a este e aos próximos meses' : 'Categoria adicionada ao orçamento' });
      }
      setItemDialogOpen(false);
      loadBudget(nav.year, nav.month);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED') {
        setPlanBlocked(true);
        setItemDialogOpen(false);
      } else {
        toast({ title: 'Erro ao salvar item', variant: 'destructive' });
      }
    } finally {
      setSavingItem(false);
    }
  }

  async function handleSaveItem() {
    if (!budget) return;
    if (!itemPlanned || isNaN(Number(itemPlanned)) || Number(itemPlanned) <= 0) {
      toast({ title: 'Informe um valor planejado válido', variant: 'destructive' });
      return;
    }
    if (!editingItem && !itemCategoryId) {
      toast({ title: 'Selecione uma categoria', variant: 'destructive' });
      return;
    }

    // Ao editar, abre dialog de replicação
    if (editingItem) {
      setPendingEditPayload({ planned: Number(itemPlanned) });
      setItemDialogOpen(false);
      setReplicateDialogOpen(true);
      return;
    }

    await executeSaveItem(applyToFuture);
  }

  async function handleReplicateSave(months: number) {
    if (!budget || !editingItem || !pendingEditPayload) return;
    setSavingItem(true);
    try {
      await api.patch(`/budgets/${budget.id}/items/${editingItem.id}`, {
        planned_amount: pendingEditPayload.planned,
        apply_to_future: months > 0,
        replicate_months: months,
      });
      toast({ title: months > 0 ? `Valor replicado para os próximos ${months} meses` : 'Item atualizado' });
      setReplicateDialogOpen(false);
      setPendingEditPayload(null);
      loadBudget(nav.year, nav.month);
    } catch {
      toast({ title: 'Erro ao salvar item', variant: 'destructive' });
    } finally {
      setSavingItem(false);
    }
  }

  async function handleEditConfirm(applyFuture: boolean) {
    setEditConfirmOpen(false);
    await executeSaveItem(applyFuture);
  }

  async function openDeleteItem(itemId: string) {
    setDeleteItemId(itemId);
    setItemExistsInFuture(false);
    setDeleteConfirmOpen(true);
    const item = (budget?.budget_items ?? []).find((i) => i.id === itemId);
    if (item) {
      try {
        const res = await api.get<{ exists: boolean }>('/budgets/items/future-exists', {
          category_id: item.category_id,
          from_year: nav.year,
          from_month: nav.month,
        });
        setItemExistsInFuture(res.exists);
      } catch { /* silencia */ }
    }
  }

  async function handleDeleteItem(deleteFuture: boolean) {
    if (!budget || !deleteItemId) return;
    setDeletingItem(true);
    try {
      const qs = deleteFuture ? '?delete_future=true' : '';
      await api.delete(`/budgets/${budget.id}/items/${deleteItemId}${qs}`);
      toast({ title: deleteFuture ? 'Item removido deste e dos próximos meses' : 'Item removido' });
      setDeleteConfirmOpen(false);
      setDeleteItemId(null);
      loadBudget(nav.year, nav.month);
    } catch {
      toast({ title: 'Erro ao remover item', variant: 'destructive' });
    } finally {
      setDeletingItem(false);
    }
  }

  const usedCategoryIds = new Set((budget?.budget_items ?? []).map((i) => i.category_id));
  const availableCategories = editingItem
    ? categories
    : categories.filter((c) => !usedCategoryIds.has(c.id));

  const items = [...(budget?.budget_items ?? [])].sort((a, b) =>
    (a.category?.name ?? '').localeCompare(b.category?.name ?? '', 'pt-BR')
  );
  const expenseItems = items.filter((i) => i.type !== 'INCOME');
  const incomeItems = items.filter((i) => i.type === 'INCOME');
  const totalPlanned = expenseItems.reduce((s, i) => s + Number(i.planned_amount), 0);
  const totalActual = expenseItems.reduce((s, i) => s + Number(i.actual_amount ?? 0), 0);
  const totalIncomePlanned = incomeItems.reduce((s, i) => s + Number(i.planned_amount), 0);
  const totalIncomeActual = incomeItems.reduce((s, i) => s + Number(i.actual_amount ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Orçamento"
        description="Planeje suas despesas por categoria"
        actions={
          !loading && !planBlocked && (
            <Button onClick={openAddItem}>Adicionar Categoria</Button>
          )
        }
      />

      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="icon" onClick={() => setNav((n) => addMonths(n, -1))}>
          ←
        </Button>
        <span className="text-lg font-semibold min-w-[180px] text-center capitalize">
          {formatMonth(nav.year, nav.month)}
        </span>
        <Button variant="outline" size="icon" onClick={() => setNav((n) => addMonths(n, 1))}>
          →
        </Button>
      </div>

      {planBlocked ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="text-4xl">🔒</div>
          <h3 className="text-lg font-semibold">Recurso disponível no Plano Pago</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            O módulo de orçamento está disponível apenas para assinantes do plano pago.
            Faça upgrade para planejar suas despesas por categoria.
          </p>
          <Button onClick={() => window.location.href = '/settings/plan'}>
            Ver planos
          </Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-muted-foreground text-sm">
                Nenhuma categoria adicionada ao orçamento.
              </p>
              <Button onClick={openAddItem}>Adicionar Categoria</Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Planejado</TableHead>
                      <TableHead className="text-right">Realizado</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead className="text-right w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <BudgetItemRow
                        key={item.id}
                        item={item}
                        onEdit={openEditItem}
                        onDelete={openDeleteItem}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden space-y-2">
                {items.map((item) => {
                  const planned = Number(item.planned_amount);
                  const actual = Number(item.actual_amount ?? 0);
                  const pct = planned > 0 ? (actual / planned) * 100 : 0;
                  const displayPct = Math.min(pct, 100);
                  const isIncome = item.type === 'INCOME';
                  const barColor = isIncome
                    ? (pct >= 100 ? 'bg-green-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-muted-foreground')
                    : (pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500');

                  return (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: (item.category as { color?: string } | null)?.color ?? (isIncome ? '#22c55e' : '#ef4444') }}
                          />
                          <p className="text-sm font-medium truncate">{item.category?.name ?? '—'}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${isIncome ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {isIncome ? 'Receita' : 'Despesa'}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEditItem(item)} className="h-7 w-7">
                            ✎
                          </Button>
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => openDeleteItem(item.id)} className="h-7 w-7 text-destructive">
                            ✕
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Realizado / Planejado</p>
                          <p className="text-sm tabular-nums">
                            <span className={pct >= 100 ? (isIncome ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold') : 'font-semibold'}>
                              {formatCurrency(actual)}
                            </span>
                            <span className="text-muted-foreground text-xs"> / {formatCurrency(planned)}</span>
                          </p>
                        </div>
                        <span className={`text-sm font-bold tabular-nums ${pct >= 100 ? (isIncome ? 'text-green-500' : 'text-red-500') : 'text-muted-foreground'}`}>
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${displayPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {items.length > 0 && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {expenseItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Despesas</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Planejado</p>
                      <p className="text-lg font-bold">{formatCurrency(totalPlanned)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className={`text-lg font-bold ${totalActual > totalPlanned ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(totalActual)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={`text-lg font-bold ${totalPlanned - totalActual < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(totalPlanned - totalActual)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {incomeItems.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Receitas</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-6">
                    <div>
                      <p className="text-xs text-muted-foreground">Previsto</p>
                      <p className="text-lg font-bold">{formatCurrency(totalIncomePlanned)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Realizado</p>
                      <p className={`text-lg font-bold ${totalIncomeActual >= totalIncomePlanned ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                        {formatCurrency(totalIncomeActual)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Valor Planejado' : 'Adicionar Categoria'}</DialogTitle>
            <DialogDescription>
              {editingItem
                ? 'Atualize o valor planejado para esta categoria.'
                : 'Selecione uma categoria e defina o valor planejado.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={itemType} onValueChange={(v) => { setItemType(v as 'INCOME' | 'EXPENSE'); setItemCategoryId(''); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="INCOME">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!editingItem && (
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={itemCategoryId || '_none'} onValueChange={(v) => setItemCategoryId(v === '_none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Selecione...</SelectItem>
                    {filterCategoriesByType(flatCategoryOptions(availableCategories), itemType).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editingItem && (
              <div>
                <p className="text-sm font-medium">{editingItem.category?.name}</p>
              </div>
            )}

            <div className="space-y-1">
              <Label>Valor Planejado (R$)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={itemPlanned}
                onChange={(e) => setItemPlanned(e.target.value)}
                placeholder="0,00"
              />
            </div>

            {!editingItem && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="apply-to-future"
                  type="checkbox"
                  checked={applyToFuture}
                  onChange={(e) => setApplyToFuture(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <Label htmlFor="apply-to-future" className="cursor-pointer font-normal text-sm">
                  Adicionar aos próximos meses
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} disabled={savingItem}>
              Cancelar
            </Button>
            <Button onClick={handleSaveItem} disabled={savingItem}>
              {savingItem ? 'Salvando...' : editingItem ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de replicação ao editar item */}
      <Dialog open={replicateDialogOpen} onOpenChange={(open) => { if (!open) { setReplicateDialogOpen(false); setPendingEditPayload(null); } }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Replicar para outros meses?</DialogTitle>
            <DialogDescription>
              Deseja aplicar este valor planejado aos próximos meses também?
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="space-y-1">
              <Label>Quantos meses à frente?</Label>
              <Input
                type="number"
                min="0"
                max="60"
                value={replicateMonths}
                onChange={(e) => setReplicateMonths(e.target.value)}
                placeholder="Ex: 3"
              />
              <p className="text-xs text-muted-foreground">
                Digite 0 para salvar apenas este mês.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => handleReplicateSave(Math.max(0, Number(replicateMonths) || 0))}
              disabled={savingItem}
              className="w-full"
            >
              {savingItem ? 'Salvando...' : Number(replicateMonths) > 0 ? `Salvar e replicar por ${replicateMonths} meses` : 'Salvar'}
            </Button>
            <Button variant="outline" onClick={() => { setReplicateDialogOpen(false); setPendingEditPayload(null); }} disabled={savingItem} className="w-full">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { if (!open) { setDeleteConfirmOpen(false); setDeleteItemId(null); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Remover categoria do orçamento</DialogTitle>
            <DialogDescription>
              {itemExistsInFuture
                ? 'Esta categoria existe em meses futuros. Deseja remover apenas neste mês ou também nos próximos?'
                : 'Deseja remover esta categoria do orçamento? Esta ação não pode ser desfeita.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button variant="destructive" onClick={() => handleDeleteItem(false)} disabled={deletingItem}>
              {deletingItem ? 'Removendo...' : 'Remover só este mês'}
            </Button>
            {itemExistsInFuture && (
              <Button variant="destructive" onClick={() => handleDeleteItem(true)} disabled={deletingItem}>
                {deletingItem ? 'Removendo...' : 'Remover este e próximos meses'}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteItemId(null); }} disabled={deletingItem}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editConfirmOpen} onOpenChange={(open) => !open && setEditConfirmOpen(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Alterar orçamento</DialogTitle>
            <DialogDescription>
              {itemExistsInFuture
                ? 'Esta categoria existe em meses futuros. Deseja alterar apenas neste mês ou também nos próximos?'
                : 'Confirma a alteração do valor planejado para este mês?'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => handleEditConfirm(false)} disabled={savingItem}>
              {savingItem ? 'Salvando...' : 'Alterar só este mês'}
            </Button>
            {itemExistsInFuture && (
              <Button variant="outline" onClick={() => handleEditConfirm(true)} disabled={savingItem}>
                {savingItem ? 'Salvando...' : 'Alterar este e próximos meses'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditConfirmOpen(false)} disabled={savingItem}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
