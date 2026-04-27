'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CurrencyInput } from '@/components/shared/currency-input';
import { api } from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  invoiceStatusLabel,
  flatCategoryOptions,
  filterCategoriesByType,
} from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { ArrowLeft, Plus, CreditCard as CreditCardIcon, CheckCircle, Trash2, Pencil, ClipboardCheck, RotateCcw, Lock, LockOpen } from 'lucide-react';
import type { Account, Category, CreditCard, CreditCardInvoice, Transaction } from '@/types';

interface InvoicePayment {
  id: string;
  amount: number;
  paid_at: string;
  account_id: string;
  notes?: string | null;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OPEN: 'default',
  CLOSED: 'secondary',
  PAID: 'outline',
  PARTIAL: 'secondary',
};

/**
 * Detecta sufixo de parcela "(X/Y)" no final da descrição.
 * Retorna { prefix, index, total } ou null.
 */
function parseInstallmentSuffix(desc: string): { prefix: string; index: number; total: number } | null {
  const m = /^(.*)\s+\((\d+)\/(\d+)\)\s*$/.exec(desc);
  if (!m) return null;
  return { prefix: m[1]!, index: parseInt(m[2]!, 10), total: parseInt(m[3]!, 10) };
}

/** Format period_end as "Março 2026" — mês da fatura = mês do encerramento */
function invoiceMonthLabel(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(d.getUTCFullYear(), d.getUTCMonth(), 1),
  );
}

function todayISO() {
  return new Date().toISOString().split('T')[0]!;
}

export default function CreditCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();

  const invoiceListRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<CreditCard | null>(null);
  const [invoices, setInvoices] = useState<CreditCardInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<CreditCardInvoice | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTxns, setLoadingTxns] = useState(false);

  // Pay dialog
  const [payDialog, setPayDialog] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payAlsoChildren, setPayAlsoChildren] = useState(false);
  const [paying, setPaying] = useState(false);

  // Delete transaction confirmation
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);

  // Invoice payments list
  const [invoicePayments, setInvoicePayments] = useState<InvoicePayment[]>([]);
  const [reversingPaymentId, setReversingPaymentId] = useState<string | null>(null);

  // New transaction dialog
  const [txDialog, setTxDialog] = useState(false);
  const [txDesc, setTxDesc] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(todayISO());
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [savingTx, setSavingTx] = useState(false);

  // Installment dialog
  const [instDialog, setInstDialog] = useState(false);
  const [instDesc, setInstDesc] = useState('');
  const [instTotal, setInstTotal] = useState('');
  const [instQty, setInstQty] = useState('2');
  const [instDate, setInstDate] = useState(todayISO());
  const [instCategoryId, setInstCategoryId] = useState('');
  const [instNotes, setInstNotes] = useState('');
  const [savingInst, setSavingInst] = useState(false);

  // Edit transaction dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Categorize scope dialog
  const [categorizeScopeDialog, setCategorizeScopeDialog] = useState(false);
  const [pendingCategorize, setPendingCategorize] = useState<{ txId: string; categoryId: string; otherPayload: Record<string, unknown> } | null>(null);

  // Delete invoice dialog
  const [deleteInvoiceDialog, setDeleteInvoiceDialog] = useState(false);
  const [deletingInvoice, setDeletingInvoice] = useState(false);

  // Edit invoice dialog
  const [editInvoiceDialog, setEditInvoiceDialog] = useState(false);
  const [editInvoicePeriodStart, setEditInvoicePeriodStart] = useState('');
  const [editInvoicePeriodEnd, setEditInvoicePeriodEnd] = useState('');
  const [editInvoiceDueDate, setEditInvoiceDueDate] = useState('');
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Check invoice dialog
  const [checkDialog, setCheckDialog] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Toggle: include child card transactions
  const [includeChildren, setIncludeChildren] = useState(true);

  const expenseCategories = filterCategoriesByType(flatCategoryOptions(categories), 'EXPENSE');

  async function loadCard() {
    const res = await api.get<{ data: CreditCard }>(`/credit-cards/${id}`);
    setCard(res.data);
  }

  async function loadInvoices(): Promise<CreditCardInvoice[]> {
    const res = await api.get<{ data: CreditCardInvoice[] }>(`/credit-cards/${id}/invoices`);
    const sorted = [...res.data].sort((a, b) => a.period_start.localeCompare(b.period_start));
    setInvoices(sorted);
    return sorted;
  }

  async function selectInvoice(invoice: CreditCardInvoice) {
    setSelectedInvoice(invoice);
    setLoadingTxns(true);
    try {
      const [txRes] = await Promise.all([
        api.get<{ data: Transaction[] }>(`/credit-cards/${id}/invoices/${invoice.id}/transactions`),
        loadInvoicePayments(invoice.id),
      ]);
      setTransactions(txRes.data);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTxns(false);
    }
  }

  // Scroll automático para o card da fatura selecionada
  useEffect(() => {
    if (!selectedInvoice || !invoiceListRef.current) return;
    const el = invoiceListRef.current.querySelector(`[data-invoice-id="${selectedInvoice.id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedInvoice?.id]);

  useEffect(() => {
    async function load() {
      try {
        const [cardRes, invoicesRes, accRes, catRes] = await Promise.all([
          api.get<{ data: CreditCard }>(`/credit-cards/${id}`),
          api.get<{ data: CreditCardInvoice[] }>(`/credit-cards/${id}/invoices`),
          api.get<{ data: Account[] }>('/accounts'),
          api.get<{ data: Category[] }>('/categories?flat=true'),
        ]);
        setCard(cardRes.data);
        setAccounts(accRes.data.filter((a) => a.type !== 'INTERNAL'));
        setCategories(catRes.data);

        const sorted = [...invoicesRes.data].sort((a, b) => a.period_start.localeCompare(b.period_start));
        setInvoices(sorted);

        // Default: fatura cujo período cobre hoje → OPEN → mais recente
        const today = new Date();
        const todayTime = today.getTime();
        const currentInvoice =
          sorted.find((i) => {
            const start = new Date(i.period_start).getTime();
            const end = new Date(i.period_end).getTime();
            return todayTime >= start && todayTime <= end;
          }) ??
          sorted.find((i) => {
            // Fatura cujo vencimento ainda não passou (mais próxima do presente)
            return new Date(i.due_date).getTime() >= todayTime;
          }) ??
          sorted.find((i) => i.status === 'OPEN') ??
          sorted[0];
        if (currentInvoice) await selectInvoice(currentInvoice);
      } catch {
        toast({ variant: 'destructive', title: 'Erro ao carregar cartão.' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function loadInvoicePayments(invoiceId: string) {
    try {
      const res = await api.get<{ data: InvoicePayment[] }>(`/credit-cards/${id}/invoices/${invoiceId}/payments`);
      setInvoicePayments(res.data);
    } catch {
      setInvoicePayments([]);
    }
  }

  async function handleReversePayment(paymentId: string) {
    if (!selectedInvoice) return;
    setReversingPaymentId(paymentId);
    try {
      await api.delete(`/credit-cards/${id}/invoices/${selectedInvoice.id}/payments/${paymentId}`);
      toast({ title: 'Pagamento estornado com sucesso.' });
      await loadInvoicePayments(selectedInvoice.id);
      await loadCard();
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice.id);
      if (updated) await selectInvoice(updated);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao estornar pagamento.',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setReversingPaymentId(null);
    }
  }

  async function handlePay() {
    if (!selectedInvoice) return;
    if (!payAccountId) {
      toast({ variant: 'destructive', title: 'Selecione a conta para débito.' });
      return;
    }
    setPaying(true);
    try {
      const paidAt = new Date().toISOString();
      const amount = parseFloat(payAmount);

      // Pay the principal invoice
      await api.post(`/credit-cards/${id}/invoices/${selectedInvoice.id}/pay`, {
        amount,
        account_id: payAccountId,
        paid_at: paidAt,
      });

      // If user opted to also pay child card invoices, pay each one
      const currentChildCards = card?.child_cards ?? [];
      if (payAlsoChildren && currentChildCards.length > 0) {
        await Promise.allSettled(
          currentChildCards.map(async (child) => {
            const childInvoicesRes = await api.get<{ data: { id: string; status: string; total_amount: number; total_paid: number }[] }>(
              `/credit-cards/${child.id}/invoices`
            );
            const openInvoices = childInvoicesRes.data.filter(
              (inv) => ['OPEN', 'PARTIAL', 'CLOSED'].includes(inv.status)
            );
            await Promise.allSettled(
              openInvoices.map((inv) => {
                const outstanding = Number(inv.total_amount) - Number(inv.total_paid);
                if (outstanding <= 0) return Promise.resolve();
                return api.post(`/credit-cards/${child.id}/invoices/${inv.id}/pay`, {
                  amount: outstanding,
                  account_id: payAccountId,
                  paid_at: paidAt,
                });
              })
            );
          })
        );
      }

      toast({ title: 'Pagamento registrado!' });
      setPayDialog(false);
      setPayAmount('');
      setPayAccountId('');
      setPayAlsoChildren(false);
      await loadCard();
      await loadInvoicePayments(selectedInvoice.id);
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice.id);
      if (updated) await selectInvoice(updated);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar pagamento.',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPaying(false);
    }
  }

  async function handleSaveTx() {
    if (!txDesc.trim() || !txAmount || !txDate) {
      toast({ variant: 'destructive', title: 'Preencha descrição, valor e data.' });
      return;
    }
    setSavingTx(true);
    try {
      const created = await api.post<{ data: Transaction }>('/transactions', {
        type: 'EXPENSE',
        status: 'REALIZADO',
        description: txDesc.trim(),
        amount: Number(txAmount),
        date: txDate,
        credit_card_id: id,
        ...(txCategoryId ? { category_id: txCategoryId } : {}),
        ...(txNotes.trim() ? { notes: txNotes.trim() } : {}),
      });
      toast({ title: 'Lançamento adicionado!' });
      setTxDialog(false);
      setTxDesc(''); setTxAmount(''); setTxDate(todayISO()); setTxCategoryId(''); setTxNotes('');
      await loadCard();
      const sorted = await loadInvoices();
      const targetInvoiceId = created.data?.credit_card_invoice_id;
      const targetInvoice = targetInvoiceId
        ? (sorted.find((i) => i.id === targetInvoiceId) ?? sorted[0]!)
        : (sorted.find((i) => i.id === selectedInvoice?.id) ?? sorted[0]!);
      await selectInvoice(targetInvoice);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao adicionar lançamento.' });
    } finally {
      setSavingTx(false);
    }
  }

  async function handleSaveInstallment() {
    if (!instDesc.trim() || !instTotal || !instQty || !instDate) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    const qty = parseInt(instQty);
    if (isNaN(qty) || qty < 2) {
      toast({ variant: 'destructive', title: 'Número de parcelas deve ser no mínimo 2.' });
      return;
    }
    setSavingInst(true);
    try {
      await api.post('/credit-cards/installments', {
        credit_card_id: id,
        description: instDesc.trim(),
        total_amount: Number(instTotal),
        total_installments: qty,
        purchase_date: instDate,
        ...(instCategoryId ? { category_id: instCategoryId } : {}),
        ...(instNotes.trim() ? { notes: instNotes.trim() } : {}),
      });
      toast({ title: `Compra parcelada em ${qty}x criada!` });
      setInstDialog(false);
      setInstDesc(''); setInstTotal(''); setInstQty('2'); setInstDate(todayISO());
      setInstCategoryId(''); setInstNotes('');
      await loadCard();
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice?.id);
      await selectInvoice(updated ?? sorted[0]!);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao criar parcelamento.', description: err instanceof Error ? err.message : undefined });
    } finally {
      setSavingInst(false);
    }
  }

  async function handleConfirmTransaction(txId: string) {
    const scrollY = window.scrollY;
    try {
      await api.patch(`/transactions/${txId}`, { status: 'REALIZADO' });
      toast({ title: 'Transação confirmada como realizada.' });
      if (selectedInvoice) await selectInvoice(selectedInvoice);
      requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao confirmar transação.' });
    }
  }

  async function handleDeleteTransaction(txId: string) {
    setDeleteTxId(txId);
  }

  async function confirmDeleteTransaction() {
    if (!deleteTxId) return;
    try {
      await api.delete(`/transactions/${deleteTxId}`);
      toast({ title: 'Transação removida.' });
      setDeleteTxId(null);
      await loadCard();
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice?.id);
      if (updated) await selectInvoice(updated);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao remover transação.' });
    }
  }

  function openEditDialog(t: Transaction) {
    setEditTx(t);
    setEditDesc(t.description);
    setEditAmount(String(Number(t.amount)));
    setEditDate(t.date.split('T')[0]!);
    setEditCategoryId(t.category?.id ?? '');
    setEditStatus(t.status);
    setEditNotes(t.notes ?? '');
    setEditDialog(true);
  }

  async function handleSaveEdit() {
    if (!editTx || !editDesc.trim() || !editAmount || !editDate) {
      toast({ variant: 'destructive', title: 'Preencha descrição, valor e data.' });
      return;
    }

    const categoryChanged = (editCategoryId || null) !== (editTx.category?.id ?? null) && editCategoryId;
    const otherPayload = {
      description: editDesc.trim(),
      date: editDate,
      status: editStatus,
      notes: editNotes.trim() || null,
    };

    // If category changed, ask scope before saving
    if (categoryChanged) {
      setPendingCategorize({ txId: editTx.id, categoryId: editCategoryId, otherPayload });
      setEditDialog(false);
      setCategorizeScopeDialog(true);
      return;
    }

    await doSaveEdit(editTx.id, { ...otherPayload, category_id: editCategoryId || null });
  }

  async function doSaveEdit(txId: string, payload: Record<string, unknown>) {
    setSavingEdit(true);
    try {
      await api.patch(`/transactions/${txId}`, payload);
      toast({ title: 'Lançamento atualizado.' });
      setEditDialog(false);
      setEditTx(null);
      await loadCard();
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice?.id);
      if (updated) await selectInvoice(updated);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar lançamento.' });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCategorizeScope(scope: 'none' | 'similar' | 'similar_and_rule') {
    if (!pendingCategorize) return;
    setSavingEdit(true);
    try {
      await api.patch(`/transactions/${pendingCategorize.txId}/categorize`, {
        category_id: pendingCategorize.categoryId,
        apply_to_similar: scope,
      });
      if (Object.keys(pendingCategorize.otherPayload).some((k) => pendingCategorize.otherPayload[k] !== undefined)) {
        await api.patch(`/transactions/${pendingCategorize.txId}`, pendingCategorize.otherPayload);
      }
      toast({ title: scope === 'similar_and_rule' ? 'Categoria aplicada e regra salva!' : 'Lançamento atualizado.' });
      setCategorizeScopeDialog(false);
      setPendingCategorize(null);
      setEditTx(null);
      await loadCard();
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice?.id);
      if (updated) await selectInvoice(updated);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao categorizar.' });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSaveInvoice() {
    if (!selectedInvoice) return;
    if (!editInvoicePeriodStart || !editInvoicePeriodEnd || !editInvoiceDueDate) {
      toast({ variant: 'destructive', title: 'Preencha todos os campos de data.' });
      return;
    }
    setSavingInvoice(true);
    try {
      await api.patch(`/credit-cards/${id}/invoices/${selectedInvoice.id}`, {
        period_start: editInvoicePeriodStart,
        period_end: editInvoicePeriodEnd,
        due_date: editInvoiceDueDate,
      });
      toast({ title: 'Fatura atualizada e lançamentos reprocessados.' });
      setEditInvoiceDialog(false);
      const sorted = await loadInvoices();
      const updated = sorted.find((i) => i.id === selectedInvoice.id);
      if (updated) await selectInvoice(updated);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar fatura.', description: err instanceof Error ? err.message : undefined });
    } finally {
      setSavingInvoice(false);
    }
  }

  async function handleCloseInvoice() {
    if (!selectedInvoice) return;
    try {
      const res = await api.post<{ data: CreditCardInvoice }>(`/credit-cards/${id}/invoices/${selectedInvoice.id}/close`, {});
      setSelectedInvoice(res.data);
      setInvoices((prev) => prev.map((inv) => (inv.id === res.data.id ? res.data : inv)));
      toast({ title: 'Fatura fechada com sucesso.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao fechar fatura.', description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleReopenInvoice() {
    if (!selectedInvoice) return;
    try {
      const res = await api.post<{ data: CreditCardInvoice }>(`/credit-cards/${id}/invoices/${selectedInvoice.id}/reopen`, {});
      setSelectedInvoice(res.data);
      setInvoices((prev) => prev.map((inv) => (inv.id === res.data.id ? res.data : inv)));
      toast({ title: 'Fatura reaberta com sucesso.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao reabrir fatura.', description: err instanceof Error ? err.message : undefined });
    }
  }

  async function handleDeleteInvoice() {
    if (!selectedInvoice) return;
    setDeletingInvoice(true);
    try {
      await api.delete(`/credit-cards/${id}/invoices/${selectedInvoice.id}`);
      toast({ title: 'Fatura e todos os lançamentos foram excluídos.' });
      setDeleteInvoiceDialog(false);
      setSelectedInvoice(null);
      setTransactions([]);
      await loadCard();
      await loadInvoices();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao excluir fatura.', description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeletingInvoice(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!card) return <p className="text-muted-foreground">Cartão não encontrado.</p>;

  const usedPct = Number(card.limit_total) > 0 ? (Number(card.limit_used) / Number(card.limit_total)) * 100 : 0;
  const childCards = card.child_cards ?? [];
  const visibleTransactions = childCards.length > 0 && !includeChildren
    ? transactions.filter((t) => t.credit_card_id === id)
    : transactions;

  // Total calculado a partir das transações visíveis (ignora total_amount do banco que pode estar desatualizado)
  const visibleActive = visibleTransactions.filter((t) => t.status !== 'CANCELADO');
  const invoiceDisplayTotal = visibleActive.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <PageHeader
        title={card.name}
        description={card.last_four ? `**** **** **** ${card.last_four}` : (card.brand ?? '')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        }
      />

      {/* Card summary */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm text-muted-foreground">Limite Total</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold truncate">{formatCurrency(Number(card.limit_total))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm text-muted-foreground">Utilizado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold text-red-600 dark:text-red-400 truncate">{formatCurrency(Number(card.limit_used))}</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(usedPct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{usedPct.toFixed(0)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 px-3 pt-3 md:px-6 md:pt-6 md:pb-2">
            <CardTitle className="text-xs md:text-sm text-muted-foreground">Disponível</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-6 md:pb-6">
            <p className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-400 truncate">{formatCurrency(Number(card.limit_available))}</p>
            <p className="text-xs text-muted-foreground mt-1 hidden md:block">
              Fecha dia {card.closing_day} · Vence dia {card.due_day}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cartões adicionais */}
      {childCards.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Cartões adicionais</p>
            <button
              onClick={() => setIncludeChildren((v) => !v)}
              className={`flex items-center gap-2 text-xs rounded-full px-3 py-1 border transition-colors ${
                includeChildren
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:bg-accent'
              }`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${includeChildren ? 'bg-primary-foreground' : 'bg-muted-foreground'}`} />
              {includeChildren ? 'Adicionais incluídos' : 'Só cartão principal'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {childCards.map((child) => {
              const childUsed = Number(child.limit_used ?? 0);
              const childPct = Number(card.limit_total) > 0 ? (childUsed / Number(card.limit_total)) * 100 : 0;
              return (
                <div
                  key={child.id}
                  className="flex items-center gap-3 rounded-md border px-4 py-3 bg-muted/30 min-w-[220px]"
                >
                  <div
                    className="w-1 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: child.color ?? '#ef4444' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{child.name}</p>
                    {child.last_four && (
                      <p className="text-xs text-muted-foreground">····{child.last_four}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(childUsed)}
                    </p>
                    <p className="text-xs text-muted-foreground">{childPct.toFixed(0)}% usado</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 md:grid md:grid-cols-4">
        {/* Invoice list */}
        <div className="md:col-span-1">
          <p className="text-sm font-medium text-muted-foreground mb-2">Faturas</p>
          {invoices.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma fatura encontrada.</p>
          )}
          {/* Mobile: horizontal scroll; Desktop: vertical list */}
          <div ref={invoiceListRef} className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-x-visible md:pb-0 md:space-y-2">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              data-invoice-id={inv.id}
              className={`group relative shrink-0 min-w-[150px] md:min-w-0 md:w-full text-left rounded-md border p-3 text-sm transition-colors hover:bg-accent cursor-pointer ${selectedInvoice?.id === inv.id ? 'border-primary bg-accent' : ''}`}
              onClick={() => selectInvoice(inv)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium capitalize">{invoiceMonthLabel(inv.period_end)}</span>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5 md:hidden md:group-hover:flex" onClick={(e) => e.stopPropagation()}>
                    {!card?.parent_card_id && (
                      <button
                        className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar fatura"
                        onClick={() => {
                          const toUTCDate = (iso: string) => {
                            const d = new Date(iso);
                            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                          };
                          selectInvoice(inv);
                          setEditInvoicePeriodStart(toUTCDate(inv.period_start));
                          setEditInvoicePeriodEnd(toUTCDate(inv.period_end));
                          setEditInvoiceDueDate(toUTCDate(inv.due_date));
                          setEditInvoiceDialog(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Excluir fatura"
                      onClick={() => {
                        selectInvoice(inv);
                        setDeleteInvoiceDialog(true);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <Badge variant={statusVariant[inv.status] ?? 'secondary'} className="text-xs">
                    {invoiceStatusLabel(inv.status)}
                  </Badge>
                </div>
              </div>
              <p className="text-muted-foreground text-xs">{formatCurrency(Number(inv.total_amount))}</p>
              <p className="text-muted-foreground text-xs">Vence {formatDate(inv.due_date)}</p>
            </div>
          ))}
          </div>
        </div>

        {/* Invoice detail */}
        <Card className="md:col-span-3">
          {selectedInvoice ? (
            <>
              <CardHeader className="p-3 md:p-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base capitalize">
                        {invoiceMonthLabel(selectedInvoice.period_end)}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(selectedInvoice.period_start)} – {formatDate(selectedInvoice.period_end)}
                        {' · '}Vence {formatDate(selectedInvoice.due_date)}
                      </p>
                      <p className="text-sm mt-1">
                        Total: <span className="font-medium">{formatCurrency(invoiceDisplayTotal)}</span>
                        {Number(selectedInvoice.total_paid) > 0 && (
                          <span className="text-muted-foreground"> · Pago: {formatCurrency(Number(selectedInvoice.total_paid))}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {selectedInvoice.status === 'OPEN' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCloseInvoice}
                        >
                          <Lock className="h-4 w-4 mr-1" />
                          Fechar Fatura
                        </Button>
                      )}
                      {selectedInvoice.status === 'CLOSED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleReopenInvoice}
                        >
                          <LockOpen className="h-4 w-4 mr-1" />
                          Reabrir Fatura
                        </Button>
                      )}
                      {['OPEN', 'CLOSED', 'PARTIAL'].includes(selectedInvoice.status) && (
                        <Button
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            setPayAmount(
                              (invoiceDisplayTotal - Number(selectedInvoice.total_paid)).toFixed(2),
                            );
                            setPayAccountId('');
                            setPayDialog(true);
                          }}
                        >
                          Pagar
                        </Button>
                      )}
                    </div>
                  </div>
                  {!['CLOSED', 'PAID'].includes(selectedInvoice.status) && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setTxDate(todayISO()); setTxDialog(true); }}>
                      <Plus className="h-4 w-4 mr-1" />
                      Lançamento
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setInstDate(todayISO()); setInstDialog(true); }}>
                      <CreditCardIcon className="h-4 w-4 mr-1" />
                      Parcelar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const preChecked = new Set(
                          visibleActive.filter((t) => t.is_reconciled).map((t) => t.id),
                        );
                        setCheckedIds(preChecked);
                        setCheckDialog(true);
                      }}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-1" />
                      Conferir
                    </Button>
                  </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-3 md:p-6">
                {/* Pagamentos registrados */}
                {invoicePayments.length > 0 && (
                  <div className="mb-4 rounded-md border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pagamentos registrados</p>
                    {invoicePayments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{formatCurrency(Number(payment.amount))}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {new Date(payment.paid_at).toLocaleDateString('pt-BR')}
                          </span>
                          {payment.notes && (
                            <span className="text-muted-foreground ml-2 text-xs">· {payment.notes}</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={reversingPaymentId === payment.id}
                          onClick={() => handleReversePayment(payment.id)}
                          title="Estornar pagamento"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          {reversingPaymentId === payment.id ? 'Estornando...' : 'Estornar'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {loadingTxns ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}
                  </div>
                ) : visibleTransactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhuma transação nesta fatura.
                  </p>
                ) : (() => {
                  const active = visibleTransactions.filter((t) => t.status !== 'CANCELADO');
                  const totalRealizado = active
                    .filter((t) => t.status === 'REALIZADO')
                    .reduce((s, t) => s + Number(t.amount), 0);
                  const totalPrevisto = active
                    .filter((t) => t.status === 'PREVISTO')
                    .reduce((s, t) => s + Number(t.amount), 0);
                  const totalGeral = totalRealizado + totalPrevisto;

                  return (
                    <>
                      {/* Desktop table */}
                      <div className="hidden md:block rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="w-[90px]">Data</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="w-[120px]">Categoria</TableHead>
                              <TableHead className="w-[110px]">Status</TableHead>
                              <TableHead className="text-right w-[120px]">Valor</TableHead>
                              <TableHead className="w-[88px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleTransactions.map((t) => {
                              const inst = parseInstallmentSuffix(t.description);
                              const isLastInst = inst !== null && inst.index === inst.total;
                              return (
                                <TableRow key={t.id} className={t.status === 'CANCELADO' ? 'opacity-50' : 'hover:bg-muted/30'}>
                                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDate(t.date)}</TableCell>
                                  <TableCell className={t.status === 'CANCELADO' ? 'line-through text-muted-foreground' : ''}>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="flex items-center gap-1.5">
                                        {inst ? (
                                          <>{inst.prefix}{' '}<span className={`font-semibold ${isLastInst ? 'text-red-500' : 'text-blue-500'}`}>({inst.index}/{inst.total})</span></>
                                        ) : t.description}
                                        {t.is_reconciled && <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                                      </span>
                                      {t.credit_card && t.credit_card.id !== id && (
                                        <span className="text-[10px] text-muted-foreground">{t.credit_card.name}{t.credit_card.last_four ? ` ····${t.credit_card.last_four}` : ''}</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{t.category?.name ?? '—'}</TableCell>
                                  <TableCell>
                                    <Badge variant={t.status === 'REALIZADO' ? 'default' : t.status === 'CANCELADO' ? 'destructive' : 'secondary'} className="text-xs">
                                      {t.status === 'REALIZADO' ? 'Realizado' : t.status === 'PREVISTO' ? 'Previsto' : 'Cancelado'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className={`text-right font-medium text-sm ${t.status === 'CANCELADO' ? 'line-through text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
                                    -{formatCurrency(Number(t.amount))}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1 justify-end">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Editar" onClick={() => openEditDialog(t)}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      {t.status === 'PREVISTO' && (
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700" title="Confirmar realizado" onClick={() => handleConfirmTransaction(t.id)}>
                                          <CheckCircle className="h-3.5 w-3.5" />
                                        </Button>
                                      )}
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" title="Excluir" onClick={() => handleDeleteTransaction(t.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                          <tfoot className="border-t bg-muted/40 text-sm font-medium">
                            {totalPrevisto > 0 && totalRealizado > 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-2 text-muted-foreground text-xs">
                                  Realizado: {formatCurrency(totalRealizado)} · Previsto: {formatCurrency(totalPrevisto)}
                                </td>
                                <td className="px-4 py-2 text-right text-red-600 dark:text-red-400 whitespace-nowrap">
                                  -{formatCurrency(totalGeral)}
                                </td>
                                <td />
                              </tr>
                            ) : (
                              <tr>
                                <td colSpan={4} className="px-4 py-2 text-muted-foreground text-xs">
                                  Total ({active.length} lançamento{active.length !== 1 ? 's' : ''})
                                </td>
                                <td className="px-4 py-2 text-right text-red-600 dark:text-red-400 font-semibold whitespace-nowrap">
                                  -{formatCurrency(totalGeral)}
                                </td>
                                <td />
                              </tr>
                            )}
                          </tfoot>
                        </Table>
                      </div>

                      {/* Mobile card list */}
                      <div className="md:hidden space-y-2">
                        {visibleTransactions.map((t) => {
                          const inst = parseInstallmentSuffix(t.description);
                          const isLastInst = inst !== null && inst.index === inst.total;
                          return (
                            <div key={t.id} className={`rounded-lg border bg-card p-3 ${t.status === 'CANCELADO' ? 'opacity-50' : ''}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-medium leading-snug ${t.status === 'CANCELADO' ? 'line-through text-muted-foreground' : ''}`}>
                                    {inst ? (
                                      <>{inst.prefix}{' '}<span className={`font-semibold ${isLastInst ? 'text-red-500' : 'text-blue-500'}`}>({inst.index}/{inst.total})</span></>
                                    ) : t.description}
                                    {t.is_reconciled && <CheckCircle className="inline h-3.5 w-3.5 text-green-500 ml-1 flex-shrink-0" />}
                                  </p>
                                  {t.credit_card && t.credit_card.id !== id && (
                                    <p className="text-[10px] text-muted-foreground">{t.credit_card.name}{t.credit_card.last_four ? ` ····${t.credit_card.last_four}` : ''}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                                    <span>{formatDate(t.date)}</span>
                                    {t.category?.name && <><span>·</span><span>{t.category.name}</span></>}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className={`text-sm font-semibold tabular-nums ${t.status === 'CANCELADO' ? 'line-through text-muted-foreground' : 'text-red-600 dark:text-red-400'}`}>
                                    -{formatCurrency(Number(t.amount))}
                                  </p>
                                  <Badge variant={t.status === 'REALIZADO' ? 'default' : t.status === 'CANCELADO' ? 'destructive' : 'secondary'} className="text-[10px] mt-1">
                                    {t.status === 'REALIZADO' ? 'Realizado' : t.status === 'PREVISTO' ? 'Previsto' : 'Cancelado'}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-0.5 mt-2 pt-2 border-t">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Editar" onClick={() => openEditDialog(t)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {t.status === 'PREVISTO' && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Confirmar realizado" onClick={() => handleConfirmTransaction(t.id)}>
                                    <CheckCircle className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => handleDeleteTransaction(t.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {/* Mobile total footer */}
                        <div className="rounded-lg border bg-muted/40 px-3 py-2 flex items-center justify-between text-sm font-medium">
                          <span className="text-muted-foreground text-xs">
                            {totalPrevisto > 0 && totalRealizado > 0
                              ? `Realizado: ${formatCurrency(totalRealizado)} · Previsto: ${formatCurrency(totalPrevisto)}`
                              : `${active.length} lançamento${active.length !== 1 ? 's' : ''}`}
                          </span>
                          <span className="text-red-600 dark:text-red-400 font-semibold tabular-nums">
                            -{formatCurrency(totalGeral)}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </>
          ) : (
            <CardContent className="py-16 flex flex-col items-center gap-4 text-center">
              <p className="text-muted-foreground text-sm">
                {invoices.length === 0
                  ? 'Nenhuma fatura ainda. Adicione um lançamento para criar a primeira fatura automaticamente.'
                  : 'Selecione uma fatura para ver os detalhes.'}
              </p>
              {!card?.parent_card_id && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setTxDate(todayISO()); setTxDialog(true); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Lançamento
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setInstDate(todayISO()); setInstDialog(true); }}
                  >
                    <CreditCardIcon className="h-4 w-4 mr-1" />
                    Parcelar
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Pay dialog */}
      <Dialog open={payDialog} onOpenChange={(o) => { if (!o) setPayDialog(false); }}>
        <DialogContent className="sm:max-w-[400px]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Pagar Fatura</DialogTitle>
            <DialogDescription>Registre o pagamento desta fatura.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {childCards.length > 0 && selectedInvoice && (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1">
                <p className="font-medium text-muted-foreground mb-1">Composição da fatura</p>
                <div className="flex justify-between">
                  <span>{card.name}{card.last_four ? ` ····${card.last_four}` : ''}</span>
                  <span>{formatCurrency(invoiceDisplayTotal)}</span>
                </div>
                {childCards.map((child) => (
                  <div key={child.id} className="flex justify-between text-muted-foreground">
                    <span>{child.name}{child.last_four ? ` ····${child.last_four}` : ''}</span>
                    <span>incluso</span>
                  </div>
                ))}
                <div className="flex justify-between font-medium border-t pt-1 mt-1">
                  <span>Total</span>
                  <span>{formatCurrency(invoiceDisplayTotal)}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Conta para débito</Label>
              <Select value={payAccountId || '_none'} onValueChange={(v) => setPayAccountId(v === '_none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Selecione...</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor pago (R$)</Label>
              <CurrencyInput value={payAmount} onChange={(v) => setPayAmount(v)} />
            </div>
            {childCards.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="pay-also-children"
                  type="checkbox"
                  checked={payAlsoChildren}
                  onChange={(e) => setPayAlsoChildren(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                />
                <Label htmlFor="pay-also-children" className="cursor-pointer font-normal text-sm">
                  Baixar também as faturas dos cartões adicionais
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(false)} disabled={paying}>Cancelar</Button>
            <Button onClick={handlePay} disabled={paying || !payAmount || !payAccountId}>
              {paying ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete transaction confirmation dialog */}
      <Dialog open={!!deleteTxId} onOpenChange={(o) => { if (!o) setDeleteTxId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Excluir lançamento</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTxId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDeleteTransaction}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New transaction dialog */}
      <Dialog open={txDialog} onOpenChange={(o) => { if (!o) setTxDialog(false); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
            <DialogDescription>
              Adicione uma despesa a este cartão. A fatura será definida automaticamente pela data.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="Ex: Supermercado" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor (R$) *</Label>
                <CurrencyInput value={txAmount} onChange={(v) => setTxAmount(v)} />
              </div>
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={txCategoryId || '_none'} onValueChange={(v) => setTxCategoryId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={txNotes} onChange={(e) => setTxNotes(e.target.value)} rows={2} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxDialog(false)} disabled={savingTx}>Cancelar</Button>
            <Button onClick={handleSaveTx} disabled={savingTx}>
              {savingTx ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installment dialog */}
      <Dialog open={instDialog} onOpenChange={(o) => { if (!o) setInstDialog(false); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Parcelar Compra</DialogTitle>
            <DialogDescription>
              O valor total será dividido em parcelas mensais e alocado nas faturas correspondentes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={instDesc} onChange={(e) => setInstDesc(e.target.value)} placeholder="Ex: Notebook Samsung" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor total (R$) *</Label>
                <CurrencyInput value={instTotal} onChange={(v) => setInstTotal(v)} />
              </div>
              <div className="space-y-1">
                <Label>Nº de parcelas *</Label>
                <Input type="number" min="2" max="360" step="1" value={instQty} onChange={(e) => setInstQty(e.target.value)} />
              </div>
            </div>
            {instTotal && instQty && Number(instQty) >= 2 && Number(instTotal) > 0 && (
              <p className="text-xs text-muted-foreground">
                {Number(instQty)}x de {formatCurrency(Number(instTotal) / Number(instQty))} (aprox.)
              </p>
            )}
            <div className="space-y-1">
              <Label>Data da compra *</Label>
              <Input type="date" value={instDate} onChange={(e) => setInstDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={instCategoryId || '_none'} onValueChange={(v) => setInstCategoryId(v === '_none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem categoria</SelectItem>
                  {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={instNotes} onChange={(e) => setInstNotes(e.target.value)} rows={2} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstDialog(false)} disabled={savingInst}>Cancelar</Button>
            <Button onClick={handleSaveInstallment} disabled={savingInst}>
              {savingInst ? 'Criando...' : 'Parcelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit transaction dialog */}
      <Dialog open={editDialog} onOpenChange={(o) => { if (!o) { setEditDialog(false); setEditTx(null); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
            <DialogDescription>Altere os dados do lançamento. O valor não pode ser alterado após criação.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>Descrição *</Label>
              <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <CurrencyInput
                  value={editAmount}
                  onChange={() => {}}
                  disabled
                  className="opacity-60 cursor-not-allowed"
                />
              </div>
              <div className="space-y-1">
                <Label>Data *</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PREVISTO">Previsto</SelectItem>
                    <SelectItem value="REALIZADO">Realizado</SelectItem>
                    <SelectItem value="CANCELADO">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={editCategoryId || '_none'} onValueChange={(v) => setEditCategoryId(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem categoria</SelectItem>
                    {expenseCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialog(false); setEditTx(null); }} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Check invoice dialog */}
      <Dialog open={checkDialog} onOpenChange={(o) => { if (!o) setCheckDialog(false); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Conferir Fatura</DialogTitle>
            <DialogDescription>
              Marque os lançamentos que já foram conferidos com o extrato do cartão.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            // Parcela >= 2 (ex: "2/10") vai para o fim; demais mantêm ordem por data desc
            const isLaterInstallment = (desc: string) => /\((\d+)\/\d+\)/.test(desc) && parseInt(desc.match(/\((\d+)\//)![1]) >= 2;
            const installmentTag = (desc: string): { before: string; tag: string; color: string } | null => {
              const m = desc.match(/^(.*?)(\((\d+)\/(\d+)\))(.*)$/);
              if (!m) return null;
              const idx = parseInt(m[3]);
              const total = parseInt(m[4]);
              return {
                before: m[1],
                tag: m[2],
                color: idx === total ? 'text-red-500' : 'text-blue-500',
              };
            };
            const active = visibleTransactions
              .filter((t) => t.status !== 'CANCELADO')
              .slice()
              .sort((a, b) => {
                const aLater = isLaterInstallment(a.description) ? 1 : 0;
                const bLater = isLaterInstallment(b.description) ? 1 : 0;
                if (aLater !== bLater) return aLater - bLater;
                return new Date(b.date).getTime() - new Date(a.date).getTime();
              });
            const checkedTotal = active
              .filter((t) => checkedIds.has(t.id))
              .reduce((s, t) => s + Number(t.amount), 0);
            const totalGeral = active.reduce((s, t) => s + Number(t.amount), 0);
            const allChecked = active.length > 0 && checkedIds.size === active.length;
            const diff = checkedTotal - totalGeral;

            return (
              <>
                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                  {/* Select all */}
                  <div className="flex items-center gap-2 py-2 border-b mb-1">
                    <input
                      type="checkbox"
                      id="check-all"
                      checked={allChecked}
                      onChange={async () => {
                        const targetState = !allChecked;
                        const next = targetState ? new Set(active.map((t) => t.id)) : new Set<string>();
                        setCheckedIds(next);
                        try {
                          await Promise.all(
                            active
                              .filter((t) => t.is_reconciled !== targetState)
                              .map((t) => api.patch(`/transactions/${t.id}`, { is_reconciled: targetState })),
                          );
                        } catch {
                          setCheckedIds(checkedIds);
                          toast({ variant: 'destructive', title: 'Erro ao salvar conferência.' });
                        }
                      }}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <label htmlFor="check-all" className="text-sm font-medium cursor-pointer select-none">
                      Selecionar todos ({active.length})
                    </label>
                  </div>

                  <div className="space-y-0.5">
                    {active.map((t) => {
                      const tag = installmentTag(t.description);
                      return (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/40 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checkedIds.has(t.id)}
                          onChange={async () => {
                            const nowChecked = !checkedIds.has(t.id);
                            const next = new Set(checkedIds);
                            if (nowChecked) next.add(t.id); else next.delete(t.id);
                            setCheckedIds(next);
                            try {
                              await api.patch(`/transactions/${t.id}`, { is_reconciled: nowChecked });
                            } catch {
                              // reverte se falhar
                              setCheckedIds(checkedIds);
                              toast({ variant: 'destructive', title: 'Erro ao salvar conferência.' });
                            }
                          }}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer flex-shrink-0"
                        />
                        <span className="flex-1 text-sm truncate">
                          {tag ? (
                            <>{tag.before}<span className={`font-semibold ${tag.color}`}>{tag.tag}</span></>
                          ) : t.description}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                          -{formatCurrency(Number(t.amount))}
                        </span>
                      </label>
                      );
                    })}
                  </div>
                </div>

                {/* Summary bar */}
                <div className="border-t pt-3 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conferido ({checkedIds.size}/{active.length})</span>
                    <span className="font-medium">{formatCurrency(checkedTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total da fatura</span>
                    <span className="font-medium">{formatCurrency(totalGeral)}</span>
                  </div>
                  {checkedIds.size > 0 && (
                    <div className={`flex justify-between text-sm font-semibold ${Math.abs(diff) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      <span>{Math.abs(diff) < 0.01 ? '✓ Conferido — valores batem!' : 'Diferença'}</span>
                      {Math.abs(diff) >= 0.01 && <span>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          <DialogFooter className="mt-2">
            <Button onClick={async () => { setCheckDialog(false); if (selectedInvoice) await selectInvoice(selectedInvoice); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete invoice confirmation dialog */}
      <Dialog open={deleteInvoiceDialog} onOpenChange={(o) => { if (!o) setDeleteInvoiceDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir Fatura</DialogTitle>
            <DialogDescription>
              {selectedInvoice && (
                <>
                  Tem certeza que deseja excluir a fatura de{' '}
                  <span className="font-semibold text-foreground capitalize">
                    {invoiceMonthLabel(selectedInvoice.period_end)}
                  </span>
                  ?<br /><br />
                  Esta ação irá apagar permanentemente todos os lançamentos, parcelas e pagamentos vinculados. Não pode ser desfeita.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDeleteInvoiceDialog(false)} disabled={deletingInvoice}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvoice} disabled={deletingInvoice}>
              {deletingInvoice ? 'Excluindo...' : 'Sim, excluir tudo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit invoice dialog */}
      <Dialog open={editInvoiceDialog} onOpenChange={(o) => { if (!o) setEditInvoiceDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Fatura</DialogTitle>
            <DialogDescription>
              Ajuste o período e o vencimento. Os lançamentos serão reprocessados automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Data de início</Label>
              <Input
                type="date"
                value={editInvoicePeriodStart}
                onChange={(e) => setEditInvoicePeriodStart(e.target.value)}
                max="2999-12-31"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de encerramento</Label>
              <Input
                type="date"
                value={editInvoicePeriodEnd}
                onChange={(e) => setEditInvoicePeriodEnd(e.target.value)}
                max="2999-12-31"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dia de vencimento</Label>
              <Input
                type="date"
                value={editInvoiceDueDate}
                onChange={(e) => setEditInvoiceDueDate(e.target.value)}
                max="2999-12-31"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditInvoiceDialog(false)} disabled={savingInvoice}>Cancelar</Button>
            <Button onClick={handleSaveInvoice} disabled={savingInvoice}>
              {savingInvoice ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={savingEdit}
              onClick={() => handleCategorizeScope('none')}>
              <div className="text-left">
                <p className="font-medium">Somente este lançamento</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica apenas nesta ocorrência</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={savingEdit}
              onClick={() => handleCategorizeScope('similar')}>
              <div className="text-left">
                <p className="font-medium">Todos os lançamentos iguais</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica a todos com o mesmo nome agora</p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3 px-4 w-full whitespace-normal text-left" disabled={savingEdit}
              onClick={() => handleCategorizeScope('similar_and_rule')}>
              <div className="text-left">
                <p className="font-medium">Todos os iguais + salvar regra automática</p>
                <p className="text-xs text-muted-foreground mt-0.5">Aplica agora e categoriza automaticamente novos lançamentos com este nome</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}