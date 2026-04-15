'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { CurrencyInput } from '@/components/shared/currency-input';
import {
  cn,
  formatDate,
  statusLabel,
  typeLabel,
  currentYearMonth,
  pad2,
  flatCategoryOptions,
  filterCategoriesByType,
} from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AmountBadge } from '@/components/shared/amount-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import type {
  Transaction,
  TransactionType,
  TransactionStatus,
  Account,
  CreditCard,
  Category,
} from '@/types';

type SortField = 'date' | 'description' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';

interface Filters {
  type: string;
  status: string;
  month: string;
  description: string;
  account_or_card: string;
  category_id: string;
}

interface FormData {
  type: TransactionType;
  status: TransactionStatus;
  description: string;
  amount: string;
  date: string;
  category_id: string;
  account_id: string;
  credit_card_id: string;
  target_account_id: string;
  notes: string;
  pix_key: string;
}

function todayISO() {
  return new Date().toISOString().split('T')[0]!;
}

function defaultForm(): FormData {
  return {
    type: 'EXPENSE',
    status: 'PREVISTO',
    description: '',
    amount: '',
    date: todayISO(),
    category_id: '',
    account_id: '',
    credit_card_id: '',
    target_account_id: '',
    notes: '',
    pix_key: '',
  };
}

function statusBadgeVariant(status: TransactionStatus) {
  if (status === 'REALIZADO') return 'default';
  if (status === 'PREVISTO') return 'secondary';
  return 'outline';
}

function statusBadgeClass(status: TransactionStatus) {
  if (status === 'REALIZADO') return 'bg-green-600 text-white hover:bg-green-700';
  if (status === 'PREVISTO') return 'bg-yellow-500 text-white hover:bg-yellow-600';
  return 'text-muted-foreground';
}

export default function TransactionsPage() {
  const { toast } = useToast();
  const { year, month } = currentYearMonth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [filters, setFilters] = useState<Filters>({
    type: '',
    status: '',
    month: `${year}-${pad2(month)}`,
    description: '',
    account_or_card: '',
    category_id: '',
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecurrenceId, setEditingRecurrenceId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);

  const [recurrenceScopeDialog, setRecurrenceScopeDialog] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  const [categorizeScopeDialog, setCategorizeScopeDialog] = useState(false);
  const [pendingCategorize, setPendingCategorize] = useState<{ txId: string; categoryId: string; otherPayload: Record<string, unknown> } | null>(null);
  const [editingOriginalCategoryId, setEditingOriginalCategoryId] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const [bulkCategoryDialog, setBulkCategoryDialog] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadSupporting = useCallback(async () => {
    const [accRes, cardRes, catRes] = await Promise.allSettled([
      api.get<{ data: Account[] }>('/accounts'),
      api.get<{ data: CreditCard[] }>('/credit-cards'),
      api.get<{ data: Category[] }>('/categories?flat=true'),
    ]);
    if (accRes.status === 'fulfilled') setAccounts(accRes.value.data.filter((a) => a.type !== 'INTERNAL'));
    if (cardRes.status === 'fulfilled') setCards(cardRes.value.data.filter((c) => c.is_active));
    if (catRes.status === 'fulfilled') setCategories(catRes.value.data);
  }, []);

  const loadTransactions = useCallback(async (f: Filters) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('pageSize', '2000');
      if (f.type) params.set('type', f.type);
      if (f.status) params.set('status', f.status);
      const normalizedDesc = f.description.indexOf(',') !== -1
        ? f.description.replace(/\./g, '').replace(',', '.')
        : f.description;
      const isNumericSearch = f.description.trim() !== '' && !isNaN(parseFloat(normalizedDesc)) && parseFloat(normalizedDesc) > 0;
      if (f.month && !isNumericSearch) {
        const [y, m] = f.month.split('-');
        params.set('date_from', `${y}-${m}-01`);
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        params.set('date_to', `${y}-${m}-${pad2(lastDay)}`);
      }
      if (f.description) params.set('search', f.description);

      const res = await api.get<{ data: Transaction[] }>(
        `/transactions?${params.toString()}`
      );
      setTransactions(res.data);
    } catch {
      toast({ title: 'Erro ao carregar transações', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSupporting();
  }, [loadSupporting]);

  useEffect(() => {
    loadTransactions(filters);
  }, [filters, loadTransactions]);

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSortClick(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'date' ? 'desc' : 'asc');
    }
  }

  const filteredTransactions = transactions.filter((t) => {
    if (filters.account_or_card) {
      const id = filters.account_or_card;
      if (t.account_id !== id && t.credit_card_id !== id) return false;
    }
    if (filters.category_id === '_none' && t.category_id) return false;
    if (filters.category_id && filters.category_id !== '_none' && t.category_id !== filters.category_id) return false;
    return true;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'date') {
      cmp = a.date.localeCompare(b.date);
    } else if (sortField === 'description') {
      cmp = a.description.localeCompare(b.description, 'pt-BR');
    } else if (sortField === 'amount') {
      cmp = a.amount - b.amount;
    } else if (sortField === 'status') {
      cmp = a.status.localeCompare(b.status);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const selectedList = sortedTransactions.filter((t) => selectedIds.has(t.id));
  const totalIncome = sortedTransactions.filter((t) => t.type === 'INCOME' && t.status !== 'CANCELADO').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = sortedTransactions.filter((t) => t.type === 'EXPENSE' && t.status !== 'CANCELADO').reduce((s, t) => s + Number(t.amount), 0);
  const selectedIncome = selectedList.filter((t) => t.type === 'INCOME' && t.status !== 'CANCELADO').reduce((s, t) => s + Number(t.amount), 0);
  const selectedExpense = selectedList.filter((t) => t.type === 'EXPENSE' && t.status !== 'CANCELADO').reduce((s, t) => s + Number(t.amount), 0);
  const allVisibleSelected = sortedTransactions.length > 0 && sortedTransactions.every((t) => selectedIds.has(t.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((t) => t.id)));
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function openNew() {
    setEditingId(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id);
    setEditingRecurrenceId(t.recurrence_id ?? null);
    setEditingOriginalCategoryId(t.category_id ?? null);
    setForm({
      type: t.type,
      status: t.status,
      description: t.description,
      amount: String(t.amount),
      date: t.date.split('T')[0]!,
      category_id: t.category_id ?? '',
      account_id: t.account_id ?? '',
      credit_card_id: t.credit_card_id ?? '',
      target_account_id: '',
      notes: t.notes ?? '',
      pix_key: t.pix_key ?? '',
    });
    setDialogOpen(true);
  }

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildAutoDescription(): string {
    const date = form.date ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    if (form.type === 'TRANSFER') {
      const origin = accounts.find((a) => a.id === form.account_id)?.name ?? 'Origem';
      const dest = accounts.find((a) => a.id === form.target_account_id)?.name ?? 'Destino';
      return `Trans ${origin} > ${dest} - ${date}`;
    }
    const allCats = flatCategoryOptions(categories);
    const cat = allCats.find((c) => c.id === form.category_id);
    if (cat) return `${cat.label} - ${date}`;
    return `${form.type === 'INCOME' ? 'Receita' : 'Despesa'} - ${date}`;
  }

  async function handleSave() {
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    if (!form.date) {
      toast({ title: 'Informe a data', variant: 'destructive' });
      return;
    }

    const description = form.description.trim() || buildAutoDescription();

    const payload: Record<string, unknown> = {
      status: form.status,
      description,
      amount: Number(form.amount),
      date: form.date,
      category_id: form.category_id || null,
      notes: form.notes.trim() || null,
      pix_key: form.pix_key.trim() || null,
    };

    // These fields are only sent on create
    if (!editingId) {
      payload.type = form.type;
      if (form.type === 'TRANSFER') {
        payload.account_id = form.account_id || null;
        payload.target_account_id = form.target_account_id || null;
      } else if (form.credit_card_id) {
        payload.credit_card_id = form.credit_card_id;
      } else if (form.account_id) {
        payload.account_id = form.account_id;
      }
    }

    // If category changed on an existing transaction, ask categorize scope
    const newCategoryId = (form.category_id || null) as string | null;
    if (editingId && newCategoryId && newCategoryId !== editingOriginalCategoryId) {
      const otherPayload = { ...payload };
      delete otherPayload['category_id'];
      setPendingCategorize({ txId: editingId, categoryId: newCategoryId, otherPayload });
      setDialogOpen(false);
      setCategorizeScopeDialog(true);
      return;
    }

    // If editing a recurrence transaction, ask scope before saving
    if (editingId && editingRecurrenceId) {
      setPendingPayload(payload);
      setDialogOpen(false);
      setRecurrenceScopeDialog(true);
      return;
    }

    await doSave(editingId, payload);
  }

  async function handleCategorizeScopeTx(scope: 'none' | 'similar' | 'similar_and_rule') {
    if (!pendingCategorize) return;
    setSaving(true);
    try {
      await api.patch(`/transactions/${pendingCategorize.txId}/categorize`, {
        category_id: pendingCategorize.categoryId,
        apply_to_similar: scope,
      });
      const remaining = pendingCategorize.otherPayload;
      if (Object.keys(remaining).length > 0) {
        await api.patch(`/transactions/${pendingCategorize.txId}`, remaining);
      }
      toast({ title: scope === 'similar_and_rule' ? 'Categoria aplicada e regra salva!' : 'Transação atualizada.' });
      setCategorizeScopeDialog(false);
      setPendingCategorize(null);
      setDialogOpen(false);
      loadTransactions(filters);
    } catch {
      toast({ title: 'Erro ao categorizar transação', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function doSave(id: string | null, payload: Record<string, unknown>) {
    setSaving(true);
    try {
      if (id) {
        await api.patch(`/transactions/${id}`, payload);
        toast({ title: 'Transação atualizada' });
      } else {
        await api.post('/transactions', payload);
        toast({ title: 'Transação criada' });
      }
      setDialogOpen(false);
      setRecurrenceScopeDialog(false);
      setPendingPayload(null);
      loadTransactions(filters);
    } catch {
      toast({ title: 'Erro ao salvar transação', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/transactions/${confirmDelete}`);
      toast({ title: 'Transação excluída' });
      setConfirmDelete(null);
      loadTransactions(filters);
    } catch {
      toast({ title: 'Erro ao excluir transação', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmRealizado(id: string) {
    const scrollY = window.scrollY;
    setConfirmingId(id);
    try {
      await api.patch(`/transactions/${id}`, { status: 'REALIZADO' });
      toast({ title: 'Transação confirmada como realizada' });
      loadTransactions(filters);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    } catch {
      toast({ title: 'Erro ao confirmar transação', variant: 'destructive' });
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleRevertPrevisto(id: string) {
    const scrollY = window.scrollY;
    setConfirmingId(id);
    try {
      await api.patch(`/transactions/${id}`, { status: 'PREVISTO' });
      toast({ title: 'Transação revertida para previsto' });
      loadTransactions(filters);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    } catch {
      toast({ title: 'Erro ao reverter transação', variant: 'destructive' });
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleBulkCategorize(scope: 'none' | 'similar' | 'similar_and_rule') {
    if (!bulkCategoryId || bulkCategoryId === '_none') return;
    setBulkSaving(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          api.patch(`/transactions/${id}/categorize`, {
            category_id: bulkCategoryId,
            apply_to_similar: scope,
          })
        )
      );
      toast({ title: `Categoria aplicada em ${selectedIds.size} lançamento(s)!` });
      setBulkCategoryDialog(false);
      setBulkCategoryId('');
      setSelectedIds(new Set());
      loadTransactions(filters);
    } catch {
      toast({ title: 'Erro ao aplicar categoria', variant: 'destructive' });
    } finally {
      setBulkSaving(false);
    }
  }

  function accountOrCardName(t: Transaction): string {
    if (t.credit_card) return t.credit_card.name;
    if (t.account) return t.account.name;
    return '—';
  }

  return (
    <div>
      <PageHeader
        title="Transações"
        description="Gerencie suas receitas, despesas e transferências"
        actions={
          <Button onClick={openNew}>Nova Transação</Button>
        }
      />

      {/* Filters */}
      <div className="space-y-2 mb-4">
        {/* Month nav — full width on mobile */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-1">
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
              onClick={() => { const [y,m]=filters.month.split('-').map(Number); const d=new Date(y,m-2,1); handleFilterChange('month',`${d.getFullYear()}-${pad2(d.getMonth()+1)}`); }}>←</Button>
            <span className="text-sm font-medium flex-1 text-center capitalize">
              {new Date(filters.month + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
              onClick={() => { const [y,m]=filters.month.split('-').map(Number); const d=new Date(y,m,1); handleFilterChange('month',`${d.getFullYear()}-${pad2(d.getMonth()+1)}`); }}>→</Button>
          </div>
          <Button onClick={openNew} size="sm" className="shrink-0 md:hidden">+ Nova</Button>
        </div>

        {/* Filter grid — 2 cols on mobile, wrap on desktop */}
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
          <Select value={filters.type} onValueChange={(v) => handleFilterChange('type', v === '_all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os tipos</SelectItem>
              <SelectItem value="INCOME">Receita</SelectItem>
              <SelectItem value="EXPENSE">Despesa</SelectItem>
              <SelectItem value="TRANSFER">Transferência</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v === '_all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os status</SelectItem>
              <SelectItem value="PREVISTO">Previsto</SelectItem>
              <SelectItem value="REALIZADO">Realizado</SelectItem>
              <SelectItem value="CANCELADO">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.account_or_card || '_all'} onValueChange={(v) => handleFilterChange('account_or_card', v === '_all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Conta / Cartão" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas as contas</SelectItem>
              {accounts.length > 0 && (<>
                <SelectItem value="_header_acc" disabled className="text-xs text-muted-foreground font-semibold px-2">Contas</SelectItem>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </>)}
              {cards.length > 0 && (<>
                <SelectItem value="_header_card" disabled className="text-xs text-muted-foreground font-semibold px-2">Cartões</SelectItem>
                {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </>)}
            </SelectContent>
          </Select>

          <Select value={filters.category_id || '_all'} onValueChange={(v) => handleFilterChange('category_id', v === '_all' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas as categorias</SelectItem>
              <SelectItem value="_none">Sem categoria</SelectItem>
              {flatCategoryOptions(categories).map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input
            placeholder="Buscar..."
            value={filters.description}
            onChange={(e) => handleFilterChange('description', e.target.value)}
            className="col-span-2 md:w-56"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="Nenhuma transação encontrada"
          description="Ajuste os filtros ou crie uma nova transação."
          action={<Button onClick={openNew}>Nova Transação</Button>}
        />
      ) : (
        <>
          {/* Mobile summary bar */}
          <div className="md:hidden rounded-lg border bg-card p-3 mb-3">
            {selectedIds.size > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{selectedIds.size} selecionados</span>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Receitas</p>
                      <p className="text-sm font-semibold text-green-500">{selectedIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Despesas</p>
                      <p className="text-sm font-semibold text-red-500">{selectedExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground">Saldo</p>
                      <p className={cn('text-sm font-bold', (selectedIncome - selectedExpense) >= 0 ? 'text-green-500' : 'text-red-500')}>
                        {(selectedIncome - selectedExpense).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs text-muted-foreground underline shrink-0" onClick={() => setSelectedIds(new Set())}>Limpar</button>
                </div>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { setBulkCategoryId(''); setBulkCategoryDialog(true); }}>
                  Alterar categorias
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{sortedTransactions.length} lançamentos</span>
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Receitas</p>
                    <p className="text-sm font-semibold text-green-500">{totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Despesas</p>
                    <p className="text-sm font-semibold text-red-500">{totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">Saldo</p>
                    <p className={cn('text-sm font-bold', (totalIncome - totalExpense) >= 0 ? 'text-green-500' : 'text-red-500')}>
                      {(totalIncome - totalExpense).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4 items-start">
            {/* Summary sidebar — desktop only */}
            <div className="hidden md:block w-52 shrink-0 sticky top-4">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                {selectedIds.size > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {selectedIds.size} selecionados
                      </p>
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => setSelectedIds(new Set())}
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Receitas</p>
                        <p className="text-sm font-semibold text-green-500">
                          {selectedIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Despesas</p>
                        <p className="text-sm font-semibold text-red-500">
                          {selectedExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-0.5">Saldo</p>
                        <p className={cn('text-sm font-bold', (selectedIncome - selectedExpense) >= 0 ? 'text-green-500' : 'text-red-500')}>
                          {(selectedIncome - selectedExpense).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="w-full text-xs mt-1" onClick={() => { setBulkCategoryId(''); setBulkCategoryDialog(true); }}>
                      Alterar categorias
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Resumo do período
                    </p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Receitas</p>
                        <p className="text-sm font-semibold text-green-500">
                          {totalIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Despesas</p>
                        <p className="text-sm font-semibold text-red-500">
                          {totalExpense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-0.5">Saldo</p>
                        <p className={cn('text-sm font-bold', (totalIncome - totalExpense) >= 0 ? 'text-green-500' : 'text-red-500')}>
                          {(totalIncome - totalExpense).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{sortedTransactions.length} lançamentos</p>
                  </>
                )}
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block flex-1 rounded-md border min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 px-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => handleSortClick('date')}>
                      Data <SortIcon field="date" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('description')}>
                      Descrição <SortIcon field="description" />
                    </TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Conta / Cartão</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSortClick('status')}>
                      Status <SortIcon field="status" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSortClick('amount')}>
                      Valor <SortIcon field="amount" />
                    </TableHead>
                    <TableHead className="text-right w-32">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((t) => (
                    <TableRow key={t.id} className={selectedIds.has(t.id) ? 'bg-muted/50' : undefined}>
                      <TableCell className="px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={() => toggleSelectOne(t.id)}
                          className="cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(t.date)}</TableCell>
                      <TableCell className="font-medium">
                        {(() => {
                          const match = t.description.match(/^(.*?)\s*\((\d+)\/(\d+)\)$/);
                          if (!match) return t.description;
                          const [, base, cur, total] = match;
                          const isLast = cur === total;
                          return (
                            <span>
                              {base}{' '}
                              <span className={isLast ? 'text-red-500 font-semibold' : 'text-blue-500 font-semibold'}>
                                ({cur}/{total})
                              </span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.category?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {accountOrCardName(t)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{typeLabel(t.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadgeVariant(t.status)}
                          className={cn(statusBadgeClass(t.status))}
                        >
                          {statusLabel(t.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <AmountBadge amount={t.amount} type={t.type} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {t.status === 'PREVISTO' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Confirmar como realizado"
                              disabled={confirmingId === t.id}
                              onClick={() => handleConfirmRealizado(t.id)}
                              className="h-8 w-8 text-green-600 hover:text-green-700"
                            >
                              ✓
                            </Button>
                          )}
                          {t.status === 'REALIZADO' && !t.is_reconciled && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reverter para previsto"
                              disabled={confirmingId === t.id}
                              onClick={() => handleRevertPrevisto(t.id)}
                              className="h-8 w-8 text-yellow-600 hover:text-yellow-700"
                            >
                              ↩
                            </Button>
                          )}
                          {(!t.is_reconciled || t.credit_card_id) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar"
                                onClick={() => openEdit(t)}
                                className="h-8 w-8"
                              >
                                ✎
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir"
                                onClick={() => setConfirmDelete(t.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                ✕
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden flex-1 min-w-0 space-y-2">
              {sortedTransactions.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'rounded-lg border bg-card p-3',
                    selectedIds.has(t.id) && 'border-primary/50 bg-primary/5'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelectOne(t.id)}
                      className="cursor-pointer mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">
                          {(() => {
                            const match = t.description.match(/^(.*?)\s*\((\d+)\/(\d+)\)$/);
                            if (!match) return t.description;
                            const [, base, cur, total] = match;
                            const isLast = cur === total;
                            return (
                              <span>
                                {base}{' '}
                                <span className={isLast ? 'text-red-500 font-semibold' : 'text-blue-500 font-semibold'}>
                                  ({cur}/{total})
                                </span>
                              </span>
                            );
                          })()}
                        </p>
                        <AmountBadge amount={t.amount} type={t.type} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">{formatDate(t.date)}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{accountOrCardName(t)}</span>
                        {t.category?.name && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{t.category.name}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <Badge
                          variant={statusBadgeVariant(t.status)}
                          className={cn('text-xs', statusBadgeClass(t.status))}
                        >
                          {statusLabel(t.status)}
                        </Badge>
                        <div className="flex items-center gap-0.5">
                          {t.status === 'PREVISTO' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Confirmar"
                              disabled={confirmingId === t.id}
                              onClick={() => handleConfirmRealizado(t.id)}
                              className="h-7 w-7 text-green-600"
                            >
                              ✓
                            </Button>
                          )}
                          {t.status === 'REALIZADO' && !t.is_reconciled && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reverter"
                              disabled={confirmingId === t.id}
                              onClick={() => handleRevertPrevisto(t.id)}
                              className="h-7 w-7 text-yellow-600"
                            >
                              ↩
                            </Button>
                          )}
                          {(!t.is_reconciled || t.credit_card_id) && (
                            <>
                              <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(t)} className="h-7 w-7">
                                ✎
                              </Button>
                              <Button variant="ghost" size="icon" title="Excluir" onClick={() => setConfirmDelete(t.id)} className="h-7 w-7 text-destructive">
                                ✕
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Transação' : 'Nova Transação'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Altere os dados da transação.' : 'Preencha os dados para criar uma nova transação.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo</Label>
                {editingId ? (
                  <Input value={typeLabel(form.type)} disabled className="opacity-60" />
                ) : (
                  <Select value={form.type} onValueChange={(v) => { setField('type', v as TransactionType); setField('category_id', ''); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOME">Receita</SelectItem>
                      <SelectItem value="EXPENSE">Despesa</SelectItem>
                      <SelectItem value="TRANSFER">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v as TransactionStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PREVISTO">Previsto</SelectItem>
                    <SelectItem value="REALIZADO">Realizado</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Ex: Supermercado"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <CurrencyInput
                  value={form.amount}
                  onChange={(v) => setField('amount', v)}
                />
              </div>

              <div className="space-y-1">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setField('date', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={form.category_id || '_none'} onValueChange={(v) => setField('category_id', v === '_none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {filterCategoriesByType(flatCategoryOptions(categories), form.type).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingId && form.type === 'TRANSFER' && (
              <>
                <div className="space-y-1">
                  <Label>Conta origem</Label>
                  <Select value={form.account_id || '_none'} onValueChange={(v) => setField('account_id', v === '_none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta de origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Selecione...</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Conta destino</Label>
                  <Select value={form.target_account_id || '_none'} onValueChange={(v) => setField('target_account_id', v === '_none' ? '' : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta de destino" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Selecione...</SelectItem>
                      {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {!editingId && form.type !== 'TRANSFER' && (
              <>
                <div className="space-y-1">
                  <Label>Cartão de Crédito</Label>
                  <Select value={form.credit_card_id || '_none'} onValueChange={(v) => {
                    const val = v === '_none' ? '' : v;
                    setField('credit_card_id', val);
                    if (val) setField('account_id', '');
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum cartão</SelectItem>
                      {cards.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!form.credit_card_id && (
                  <div className="space-y-1">
                    <Label>Conta</Label>
                    <Select value={form.account_id || '_none'} onValueChange={(v) => setField('account_id', v === '_none' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma conta</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1">
              <Label>Chave Pix</Label>
              <Textarea
                value={form.pix_key}
                onChange={(e) => setField('pix_key', e.target.value)}
                placeholder="Cole aqui o Pix copia e cola (opcional)"
                rows={2}
              />
            </div>

            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Opcional"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Transação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir transação"
        description="Esta ação não pode ser desfeita. Deseja continuar?"
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
      />

      {/* Categorize scope dialog */}
      <Dialog open={categorizeScopeDialog} onOpenChange={(o) => { if (!o) { setCategorizeScopeDialog(false); setPendingCategorize(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar categoria</DialogTitle>
            <DialogDescription>
              Deseja aplicar esta categoria a outros lançamentos com o mesmo nome?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={saving}
              onClick={() => handleCategorizeScopeTx('none')}>
              <div className="text-left">
                <p className="font-medium">Somente este lançamento</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica apenas nesta ocorrência</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={saving}
              onClick={() => handleCategorizeScopeTx('similar')}>
              <div className="text-left">
                <p className="font-medium">Todos os lançamentos iguais</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica a todos com o mesmo nome agora</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={saving}
              onClick={() => handleCategorizeScopeTx('similar_and_rule')}>
              <div className="text-left">
                <p className="font-medium">Todos os iguais + salvar regra automática</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica agora e categoriza automaticamente novos lançamentos com este nome</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk categorize dialog */}
      <Dialog open={bulkCategoryDialog} onOpenChange={(o) => { if (!o) { setBulkCategoryDialog(false); setBulkCategoryId(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar categorias</DialogTitle>
            <DialogDescription>
              Selecione a categoria para aplicar nos {selectedIds.size} lançamento(s) selecionado(s).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={bulkCategoryId || '_none'} onValueChange={(v) => setBulkCategoryId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Selecione...</SelectItem>
                  {flatCategoryOptions(categories).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bulkCategoryId && bulkCategoryId !== '_none' && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-sm font-medium">Como aplicar?</p>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left"
                  disabled={bulkSaving}
                  onClick={() => handleBulkCategorize('none')}
                >
                  <div className="text-left">
                    <p className="font-medium">Somente os selecionados</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aplica apenas nos {selectedIds.size} lançamentos marcados</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left"
                  disabled={bulkSaving}
                  onClick={() => handleBulkCategorize('similar')}
                >
                  <div className="text-left">
                    <p className="font-medium">Selecionados + todos com mesmo nome</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aplica nos marcados e em todos os lançamentos com descrição igual</p>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left"
                  disabled={bulkSaving}
                  onClick={() => handleBulkCategorize('similar_and_rule')}
                >
                  <div className="text-left">
                    <p className="font-medium">Selecionados + mesmos nomes + regra automática</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Aplica agora e salva regra para categorizar automaticamente futuros lançamentos</p>
                  </div>
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkCategoryDialog(false); setBulkCategoryId(''); }} disabled={bulkSaving}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurrence scope dialog */}
      <Dialog open={recurrenceScopeDialog} onOpenChange={(o) => { if (!o) { setRecurrenceScopeDialog(false); setPendingPayload(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar recorrência</DialogTitle>
            <DialogDescription>
              Este lançamento faz parte de uma recorrência. O que deseja alterar?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Button
              variant="outline"
              className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left"
              disabled={saving}
              onClick={() => doSave(editingId, { ...pendingPayload!, recurrence_scope: 'this' })}
            >
              <div className="text-left">
                <p className="font-medium">Somente este lançamento</p>
                <p className="text-xs text-muted-foreground mt-0.5">Altera apenas esta ocorrência</p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left"
              disabled={saving}
              onClick={() => doSave(editingId, { ...pendingPayload!, recurrence_scope: 'this_and_future' })}
            >
              <div className="text-left">
                <p className="font-medium">Este e os próximos</p>
                <p className="text-xs text-muted-foreground mt-0.5">Altera esta ocorrência e todas as futuras</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
