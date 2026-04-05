import { z } from 'zod';

// ---------------------------------------------------------------------------
// Credit Card schemas
// ---------------------------------------------------------------------------

export const createCreditCardSchema = z.object({
  name: z.string().min(1).max(100),
  brand: z.string().max(50).optional(),
  last_four: z.string().length(4).regex(/^\d{4}$/).optional(),
  limit_total: z.number().positive(),
  closing_day: z.number().int().min(1).max(28),
  due_day: z.number().int().min(1).max(28),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  parent_card_id: z.string().uuid().optional().nullable(),
});

export const updateCreditCardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  brand: z.string().max(50).optional(),
  last_four: z.string().length(4).regex(/^\d{4}$/).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  is_active: z.boolean().optional(),
});
// Note: limit_total, closing_day, due_day cannot be changed after creation

// ---------------------------------------------------------------------------
// Invoice payment schema
// ---------------------------------------------------------------------------

export const payInvoiceSchema = z.object({
  amount: z.number().positive(),
  account_id: z.string().uuid(),
  paid_at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Invoice update schema
// ---------------------------------------------------------------------------

export const updateInvoiceSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

// ---------------------------------------------------------------------------
// Installment creation schema
// ---------------------------------------------------------------------------

export const createInstallmentSchema = z.object({
  credit_card_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  total_amount: z.number().positive(),
  total_installments: z.number().int().min(2).max(360),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional(),
  tag_ids: z.array(z.string().uuid()).optional().default([]),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof updateCreditCardSchema>;
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;
export type CreateInstallmentInput = z.infer<typeof createInstallmentSchema>;
