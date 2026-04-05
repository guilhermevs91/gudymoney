// =============================================================================
// Gudy Money — shared TypeScript types (web)
// =============================================================================

export type PlanType = 'FREE' | 'PAID';
export type MemberRole = 'ADMIN' | 'MEMBER';
export type AccountType = 'CHECKING' | 'SAVINGS' | 'WALLET' | 'INTERNAL';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'PREVISTO' | 'REALIZADO' | 'CANCELADO';
export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'PARTIAL';
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
export type BudgetScope = 'TENANT' | 'USER';

export interface AuthUser {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  role: MemberRole;
}

export interface Account {
  id: string;
  tenant_id: string;
  name: string;
  type: AccountType;
  initial_balance: number;
  currency: string;
  bank_name?: string;
  color?: string;
  icon?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  // computed
  balance?: { realized: number; projected: number };
}

export interface CreditCard {
  id: string;
  tenant_id: string;
  name: string;
  brand?: string;
  last_four?: string;
  limit_total: number;
  limit_used: number;
  limit_available: number;
  closing_day: number;
  due_day: number;
  parent_card_id?: string;
  color?: string;
  is_active: boolean;
  created_at: string;
  child_cards?: CreditCard[];
  current_invoice?: CreditCardInvoice | null;
}

export interface CreditCardInvoice {
  id: string;
  credit_card_id: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: InvoiceStatus;
  total_amount: number;
  total_paid: number;
  child_invoice_ids?: string[];
}

export type CategoryType = 'INCOME' | 'EXPENSE' | 'BOTH';

export interface Category {
  id: string;
  tenant_id: string;
  name: string;
  color?: string;
  icon?: string;
  parent_id?: string;
  is_system: boolean;
  type: CategoryType;
  subcategories?: Category[];
}

export interface Tag {
  id: string;
  tenant_id: string;
  name: string;
  color?: string;
}

export interface Transaction {
  id: string;
  tenant_id: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  description: string;
  date: string;
  category_id?: string;
  account_id?: string;
  credit_card_id?: string;
  credit_card_invoice_id?: string;
  recurrence_id?: string;
  installment_id?: string;
  recurrence_index?: number | null;
  is_reconciled: boolean;
  notes?: string;
  pix_key?: string;
  created_at: string;
  // relations
  category?: Category;
  account?: Account;
  credit_card?: { id: string; name: string; last_four: string; brand: string | null; parent_card_id?: string | null };
  tags?: Tag[];
  installment?: { id: string; total_installments: number } | null;
}

export interface Recurrence {
  id: string;
  tenant_id: string;
  description: string;
  amount: number;
  type: TransactionType;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  category?: Category;
  account?: Account;
  credit_card?: CreditCard;
}

export interface Budget {
  id: string;
  tenant_id: string;
  year: number;
  month: number;
  scope: BudgetScope;
  budget_items?: BudgetItem[];
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  category_id: string;
  type: 'INCOME' | 'EXPENSE';
  planned_amount: number;
  rollover_amount: number;
  category?: Category;
  // computed
  actual_amount?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at?: string;
  created_at: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role: MemberRole;
  user: { id: string; name: string; email: string };
}

export interface Invite {
  id: string;
  email: string;
  role: MemberRole;
  expires_at: string;
  accepted_at?: string;
}

export interface PlanFeature {
  id: string;
  plan: PlanType;
  feature_key: string;
  feature_value: string;
}

export interface LedgerSummary {
  total_realized: number;
  total_projected: number;
  income_this_month: number;
  expense_this_month: number;
  income_projected: number;
  expense_projected: number;
}

export interface AccountBalance {
  account: {
    id: string;
    name: string;
    type: string;
    currency: string;
    initial_balance: number;
  };
  balance: {
    realized: number;
    projected: number;
  };
}

export interface Import {
  id: string;
  tenant_id: string;
  format: 'OFX' | 'CSV' | 'TXT';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  filename: string;
  total_rows: number;
  processed_rows: number;
  matched_rows: number;
  error_message?: string;
  created_at: string;
}

export interface ImportItem {
  id: string;
  import_id: string;
  date: string;
  amount: number;
  description: string;
  status: 'PENDING' | 'MATCHED' | 'IGNORED';
  raw_data?: Record<string, string> | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  code: string;
}
