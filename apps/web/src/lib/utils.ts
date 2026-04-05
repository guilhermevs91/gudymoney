import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as BRL currency. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Format an ISO date string as dd/MM/yyyy.
 *  Uses UTC components to avoid timezone-shift (dates stored as T00:00:00Z). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Format a year+month as "Janeiro 2024". */
export function formatMonth(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Return today's date as YYYY-MM-DD. */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]!;
}

/** Return the current year and month as { year, month }. */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Pad a number to 2 digits. */
export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Map a TransactionStatus to a human-readable label. */
export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PREVISTO: 'Previsto',
    REALIZADO: 'Realizado',
    CANCELADO: 'Cancelado',
  };
  return map[status] ?? status;
}

/** Map a TransactionType to a human-readable label. */
export function typeLabel(type: string): string {
  const map: Record<string, string> = {
    INCOME: 'Receita',
    EXPENSE: 'Despesa',
    TRANSFER: 'Transferência',
  };
  return map[type] ?? type;
}

/** Map a RecurrenceFrequency to a human-readable label. */
export function frequencyLabel(freq: string): string {
  const map: Record<string, string> = {
    DAILY: 'Diária',
    WEEKLY: 'Semanal',
    BIWEEKLY: 'Quinzenal',
    MONTHLY: 'Mensal',
    YEARLY: 'Anual',
  };
  return map[freq] ?? freq;
}

/** Map an AccountType to a human-readable label. */
export function accountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupança',
    WALLET: 'Carteira',
    INTERNAL: 'Virtual (Cartão)',
  };
  return map[type] ?? type;
}

/**
 * Given a flat category list (with parent_id), return a sorted array of
 * { id, label } where subcategories appear as "Pai > Filho".
 * Use with /categories?flat=true.
 */
export function flatCategoryOptions(
  cats: Array<{ id: string; name: string; parent_id?: string | null; type?: string }>,
): Array<{ id: string; label: string; type: string }> {
  const nameById = new Map(cats.map((c) => [c.id, c.name]));
  return cats
    .map((c) => ({
      id: c.id,
      type: c.type ?? 'BOTH',
      label: c.parent_id ? `${nameById.get(c.parent_id) ?? '?'} > ${c.name}` : c.name,
      sort: c.parent_id ? `${nameById.get(c.parent_id) ?? ''}\x01${c.name}` : c.name,
    }))
    .sort((a, b) => a.sort.localeCompare(b.sort, 'pt-BR'))
    .map(({ id, label, type }) => ({ id, label, type }));
}

/**
 * Filters flatCategoryOptions to only show categories compatible with a given transaction type.
 * INCOME → INCOME + BOTH; EXPENSE → EXPENSE + BOTH; TRANSFER → all
 */
export function filterCategoriesByType(
  options: Array<{ id: string; label: string; type: string }>,
  transactionType: string,
): Array<{ id: string; label: string; type: string }> {
  if (transactionType === 'TRANSFER') return options;
  if (transactionType === 'INCOME') return options.filter((c) => c.type === 'INCOME' || c.type === 'BOTH');
  if (transactionType === 'EXPENSE') return options.filter((c) => c.type === 'EXPENSE' || c.type === 'BOTH');
  return options;
}

/** Map an InvoiceStatus to a human-readable label. */
export function invoiceStatusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: 'Aberta',
    CLOSED: 'Fechada',
    PAID: 'Paga',
    PARTIAL: 'Parcial',
  };
  return map[status] ?? status;
}
