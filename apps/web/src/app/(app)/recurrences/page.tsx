'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, typeLabel, frequencyLabel, flatCategoryOptions, filterCategoriesByType } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import type {
  Recurrence,
  TransactionType,
  RecurrenceFrequency,
  Account,
  Category,
} from '@/types';

interface FormData {
  description: string;
  type: TransactionType;
  amount: string;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date: string;
  account_id: string;
  category_id: string;
}

function todayISO() {
  return new Date().toISOString().split('T')[0]!;
}

function defaultForm(): FormData {
  return {
    description: '',
    type: 'EXPENSE',
    amount: '',
    frequency: 'MONTHLY',
    start_date: todayISO(),
    end_date: '',
    account_id: '',
    category_id: '',
  };
}

function typeBadgeClass(type: TransactionType): string {
  if (type === 'INCOME') return 'bg-green-600 text-white hover:bg-green-700';
  if (type === 'EXPENSE') return 'bg-red-600 text-white hover:bg-red-700';
  return 'bg-blue-600 text-white hover:bg-blue-700';
}

export default function RecurrencesPage() {
  const { toast } = useToast();

  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadRecurrences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Recurrence[] }>('/recurrences');
      setRecurrences(res.data);
    } catch {
      toast({ title: 'Erro ao carregar recorrências', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRecurrences();
    api.get<{ data: Account[] }>('/accounts').then((r) => setAccounts(r.data.filter((a) => a.type !== 'INTERNAL'))).catch(() => {});
    api.get<{ data: Category[] }>('/categories?flat=true').then((r) => setCategories(r.data)).catch(() => {});
  }, [loadRecurrences]);

  function openNew() {
    setEditingId(null);
    setForm(defaultForm());
    setDialogOpen(true);
  }

  function openEdit(r: Recurrence) {
    setEditingId(r.id);
    setForm({
      description: r.description,
      type: r.type,
      amount: String(r.amount),
      frequency: r.frequency,
      start_date: r.start_date.split('T')[0]!,
      end_date: r.end_date ? r.end_date.split('T')[0]! : '',
      account_id: r.account?.id ?? '',
      category_id: r.category?.id ?? '',
    });
    setDialogOpen(true);
  }

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.description.trim()) {
      toast({ title: 'Informe a descrição', variant: 'destructive' });
      return;
    }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    if (!form.start_date) {
      toast({ title: 'Informe a data de início', variant: 'destructive' });
      return;
    }

    const payload: Record<string, unknown> = {
      description: form.description.trim(),
      type: form.type,
      amount: Number(form.amount),
      frequency: form.frequency,
      start_date: form.start_date,
    };
    if (form.end_date) payload.end_date = form.end_date;
    if (form.account_id) payload.account_id = form.account_id;
    if (form.category_id) payload.category_id = form.category_id;

    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/recurrences/${editingId}`, payload);
        toast({ title: 'Recorrência atualizada' });
      } else {
        await api.post('/recurrences', payload);
        toast({ title: 'Recorrência criada' });
      }
      setDialogOpen(false);
      loadRecurrences();
    } catch {
      toast({ title: 'Erro ao salvar recorrência', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/recurrences/${confirmDelete}`, { future_action: 'CANCEL' });
      toast({ title: 'Recorrência excluída' });
      setConfirmDelete(null);
      loadRecurrences();
    } catch {
      toast({ title: 'Erro ao excluir recorrência', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleActive(r: Recurrence) {
    setTogglingId(r.id);
    try {
      await api.patch(`/recurrences/${r.id}`, { is_active: !r.is_active });
      toast({ title: r.is_active ? 'Recorrência desativada' : 'Recorrência ativada' });
      loadRecurrences();
    } catch {
      toast({ title: 'Erro ao alterar status da recorrência', variant: 'destructive' });
    } finally {
      setTogglingId(null);
    }
  }

  const active = recurrences.filter((r) => r.is_active);
  const inactive = recurrences.filter((r) => !r.is_active);

  function RecurrenceTable({ items }: { items: Recurrence[] }) {
    if (items.length === 0) {
      return (
        <EmptyState
          title="Nenhuma recorrência encontrada"
          description="Crie uma nova recorrência para começar."
        />
      );
    }

    return (
      <>
        {/* Desktop table */}
        <div className="hidden md:block rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Frequência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right w-36">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.description}</TableCell>
                  <TableCell>
                    <Badge className={typeBadgeClass(r.type)}>{typeLabel(r.type)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{frequencyLabel(r.frequency)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(r.amount)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(r.start_date)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                    {r.end_date ? formatDate(r.end_date) : 'Sem fim'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.account?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(r)} className="h-8 w-8">✎</Button>
                      <Button variant="ghost" size="sm" title={r.is_active ? 'Desativar' : 'Ativar'} disabled={togglingId === r.id} onClick={() => handleToggleActive(r)} className="h-8 px-2 text-xs">
                        {r.is_active ? 'Desativar' : 'Ativar'}
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => setConfirmDelete(r.id)} className="h-8 w-8 text-destructive hover:text-destructive">✕</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2">
          {items.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium truncate">{r.description}</p>
                    <Badge className={`${typeBadgeClass(r.type)} text-[10px] px-1.5 py-0`}>{typeLabel(r.type)}</Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>{frequencyLabel(r.frequency)}</span>
                    <span>·</span>
                    <span>{formatDate(r.start_date)}</span>
                    {r.end_date && <><span>→</span><span>{formatDate(r.end_date)}</span></>}
                    {r.account?.name && <><span>·</span><span>{r.account.name}</span></>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(r.amount)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t">
                <Button variant="ghost" size="sm" disabled={togglingId === r.id} onClick={() => handleToggleActive(r)} className="h-7 px-2 text-xs">
                  {r.is_active ? 'Desativar' : 'Ativar'}
                </Button>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(r)} className="h-7 w-7">✎</Button>
                  <Button variant="ghost" size="icon" title="Excluir" onClick={() => setConfirmDelete(r.id)} className="h-7 w-7 text-destructive">✕</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Recorrências"
        description="Gerencie receitas e despesas que se repetem automaticamente"
        actions={<Button onClick={openNew}>Nova Recorrência</Button>}
      />

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="ativas">
          <TabsList className="mb-4">
            <TabsTrigger value="ativas">Ativas ({active.length})</TabsTrigger>
            <TabsTrigger value="inativas">Inativas ({inactive.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="ativas">
            <RecurrenceTable items={active} />
          </TabsContent>

          <TabsContent value="inativas">
            <RecurrenceTable items={inactive} />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Recorrência' : 'Nova Recorrência'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Altere os dados da recorrência.'
                : 'Preencha os dados para criar uma nova recorrência.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Ex: Aluguel"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => { setField('type', v as TransactionType); setField('category_id', ''); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Receita</SelectItem>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField('amount', e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Frequência</Label>
              <Select value={form.frequency} onValueChange={(v) => setField('frequency', v as RecurrenceFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Diária</SelectItem>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                  <SelectItem value="BIWEEKLY">Quinzenal</SelectItem>
                  <SelectItem value="MONTHLY">Mensal</SelectItem>
                  <SelectItem value="YEARLY">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setField('start_date', e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Data de Fim (opcional)</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setField('end_date', e.target.value)}
                  min={form.start_date}
                />
              </div>
            </div>

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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Criar Recorrência'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Excluir recorrência"
        description="Isso também removerá as transações previstas futuras vinculadas. Deseja continuar?"
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
