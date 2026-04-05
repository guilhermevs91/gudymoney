import { z } from 'zod';

export const createRecurrenceSchema = z
  .object({
    description: z.string().min(1).max(500),
    amount: z.number().positive(),
    type: z.enum(['INCOME', 'EXPENSE']),
    frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    category_id: z.string().uuid().optional().nullable(),
    account_id: z.string().uuid().optional().nullable(),
    credit_card_id: z.string().uuid().optional().nullable(),
  })
  .refine((d) => d.account_id != null || d.credit_card_id != null, {
    message: 'account_id or credit_card_id required',
  });

export const updateRecurrenceSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  amount: z.number().positive().optional(),
  is_active: z.boolean().optional(),
  category_id: z.string().uuid().optional().nullable(),
  scope: z.enum(['THIS', 'THIS_AND_FUTURE', 'ALL']).optional().default('ALL'),
  from_index: z.number().int().min(1).optional(),
});

export const cancelRecurrenceSchema = z.object({
  future_action: z.enum(['KEEP', 'CANCEL', 'CANCEL_FROM_INDEX']).optional().default('CANCEL'),
  from_index: z.number().int().min(1).optional(),
});

export const listRecurrencesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  is_active: z.coerce.boolean().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
});

export type CreateRecurrenceInput = z.infer<typeof createRecurrenceSchema>;
export type UpdateRecurrenceInput = z.infer<typeof updateRecurrenceSchema>;
export type CancelRecurrenceInput = z.infer<typeof cancelRecurrenceSchema>;
export type ListRecurrencesQuery = z.infer<typeof listRecurrencesQuerySchema>;
