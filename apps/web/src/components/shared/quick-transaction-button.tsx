'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import {
  flatCategoryOptions,
  filterCategoriesByType,
  todayISO,
} from '@/lib/utils';
import { CurrencyInput } from '@/components/shared/currency-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/components/ui/use-toast';
import type { Account, CreditCard, Category, TransactionType, TransactionStatus } from '@/types';

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

interface QuickTransactionButtonProps {
  /** Chamado após criar com sucesso — pode ser usado para recarregar dados da página */
  onCreated?: () => void;
  /** Renderiza apenas o botão redondo embutido no BottomNav (sem flutuante, sem desktop) */
  centerFab?: boolean;
}

export function QuickTransactionButton({ onCreated, centerFab = false }: QuickTransactionButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

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

  useEffect(() => {
    loadSupporting();
  }, [loadSupporting]);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildAutoDescription(): string {
    const date = form.date
      ? new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '';
    if (form.type === 'TRANSFER') {
      const origin = accounts.find((a) => a.id === form.account_id)?.name ?? 'Origem';
      const dest = accounts.find((a) => a.id === form.target_account_id)?.name ?? 'Destino';
      return `Trans ${origin} > ${dest} - ${date}`;
    }
    const allCats = flatCategoryOptions(categories);
    const cat = allCats.find((c) => c.id === form.category_id);
    if (cat) return `${cat.name} - ${date}`;
    return `${form.type === 'INCOME' ? 'Receita' : 'Despesa'} - ${date}`;
  }

  function handleOpen() {
    setForm(defaultForm());
    setOpen(true);
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
      type: form.type,
      status: form.status,
      description,
      amount: Number(form.amount),
      date: form.date,
      category_id: form.category_id || null,
      notes: form.notes.trim() || null,
      pix_key: form.pix_key.trim() || null,
    };

    if (form.type === 'TRANSFER') {
      payload.account_id = form.account_id || null;
      payload.target_account_id = form.target_account_id || null;
    } else if (form.credit_card_id) {
      payload.credit_card_id = form.credit_card_id;
    } else if (form.account_id) {
      payload.account_id = form.account_id;
    }

    setSaving(true);
    try {
      await api.post('/transactions', payload);
      toast({ title: 'Transação criada com sucesso!' });
      setOpen(false);
      onCreated?.();
    } catch {
      toast({ title: 'Erro ao criar transação', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {centerFab ? (
        /* Botão redondo embutido no BottomNav */
        <button
          onClick={handleOpen}
          className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-md flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
          aria-label="Nova transação"
        >
          <Plus className="h-6 w-6" />
        </button>
      ) : (
        /* Botão inline desktop — renderizado na topbar */
        <Button onClick={handleOpen} className="hidden md:flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nova Transação
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Nova Transação</DialogTitle>
            <DialogDescription>Preencha os dados para criar uma nova transação.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => {
                    setField('type', v as TransactionType);
                    setField('category_id', '');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOME">Receita</SelectItem>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                    <SelectItem value="TRANSFER">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setField('status', v as TransactionStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                <CurrencyInput value={form.amount} onChange={(v) => setField('amount', v)} />
              </div>
              <div className="space-y-1">
                <Label>Data</Label>
                <Input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select
                value={form.category_id || '_none'}
                onValueChange={(v) => setField('category_id', v === '_none' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {filterCategoriesByType(flatCategoryOptions(categories), form.type).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.type === 'TRANSFER' ? (
              <>
                <div className="space-y-1">
                  <Label>Conta origem</Label>
                  <Select
                    value={form.account_id || '_none'}
                    onValueChange={(v) => setField('account_id', v === '_none' ? '' : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione a conta de origem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Selecione...</SelectItem>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Conta destino</Label>
                  <Select
                    value={form.target_account_id || '_none'}
                    onValueChange={(v) => setField('target_account_id', v === '_none' ? '' : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione a conta de destino" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Selecione...</SelectItem>
                      {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Cartão de Crédito</Label>
                  <Select
                    value={form.credit_card_id || '_none'}
                    onValueChange={(v) => {
                      const val = v === '_none' ? '' : v;
                      setField('credit_card_id', val);
                      if (val) setField('account_id', '');
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhum cartão</SelectItem>
                      {cards.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {!form.credit_card_id && (
                  <div className="space-y-1">
                    <Label>Conta</Label>
                    <Select
                      value={form.account_id || '_none'}
                      onValueChange={(v) => setField('account_id', v === '_none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhuma conta</SelectItem>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
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
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar Transação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
