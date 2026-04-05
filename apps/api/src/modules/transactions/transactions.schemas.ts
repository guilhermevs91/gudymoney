import { z } from 'zod';

const isoDateOrDatetime = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

export const createTransactionSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    status: z.enum(['PREVISTO', 'REALIZADO']), // CANCELADO not allowed on create
    amount: z.number().positive(),
    description: z.string().min(1).max(500),
    date: isoDateOrDatetime,
    category_id: z.string().uuid().optional().nullable(),
    account_id: z.string().uuid().optional().nullable(),
    credit_card_id: z.string().uuid().optional().nullable(),
    credit_card_invoice_id: z.string().uuid().optional().nullable(),
    target_account_id: z.string().uuid().optional().nullable(), // for TRANSFER destination
    notes: z.string().max(1000).optional().nullable(),
    pix_key: z.string().max(500).optional().nullable(),
    tag_ids: z.array(z.string().uuid()).optional().default([]),
  })
  .refine(
    (data) => {
      if (data.type === 'INCOME' || data.type === 'EXPENSE') {
        return data.account_id != null || data.credit_card_id != null;
      }
      if (data.type === 'TRANSFER') {
        return data.account_id != null && data.target_account_id != null;
      }
      return true;
    },
    { message: 'Invalid account/card combination for transaction type' },
  );

export const updateTransactionSchema = z.object({
  status: z.enum(['PREVISTO', 'REALIZADO', 'CANCELADO']).optional(),
  description: z.string().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  date: isoDateOrDatetime.optional(),
  category_id: z.string().uuid().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  pix_key: z.string().max(500).optional().nullable(),
  tag_ids: z.array(z.string().uuid()).optional(),
  is_reconciled: z.boolean().optional(),
  // For recurrence transactions: 'this' = only this one, 'this_and_future' = this + all future
  recurrence_scope: z.enum(['this', 'this_and_future']).optional(),
});

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(2000).default(20),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  status: z.enum(['PREVISTO', 'REALIZADO', 'CANCELADO']).optional(),
  account_id: z.string().uuid().optional(),
  credit_card_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  tag_id: z.string().uuid().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  amount_min: z.coerce.number().optional(),
  amount_max: z.coerce.number().optional(),
  search: z.string().max(200).optional(), // text search in description
  is_reconciled: z.coerce.boolean().optional(),
  credit_card_invoice_id: z.string().uuid().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
