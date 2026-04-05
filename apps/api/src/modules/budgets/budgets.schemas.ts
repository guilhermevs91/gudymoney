import { z } from 'zod';

export const upsertBudgetSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  items: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
        planned_amount: z.number().nonnegative(),
        rollover_enabled: z.boolean().default(false),
      }),
    )
    .min(1),
});

export const getBudgetQuerySchema = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12),
});

export const createBudgetSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export const createBudgetItemSchema = z.object({
  category_id: z.string().uuid(),
  type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
  planned_amount: z.number().nonnegative(),
  rollover_enabled: z.boolean().default(false),
  apply_to_future: z.boolean().default(false),
});

export const updateBudgetItemSchema = z.object({
  planned_amount: z.number().nonnegative(),
  rollover_enabled: z.boolean().optional(),
  apply_to_future: z.boolean().default(false),
  // Number of future months to replicate (0 = only this month)
  replicate_months: z.coerce.number().int().min(0).max(60).default(0),
});

export const budgetSuggestionsQuerySchema = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12),
});

export const changeScopeSchema = z.object({
  budget_scope: z.enum(['TENANT', 'USER']),
});

export const futureExistsQuerySchema = z.object({
  category_id: z.string().uuid(),
  from_year: z.coerce.number().int().min(2020),
  from_month: z.coerce.number().int().min(1).max(12),
});

export type UpsertBudgetInput = z.infer<typeof upsertBudgetSchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;
export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemSchema>;
export type GetBudgetQuery = z.infer<typeof getBudgetQuerySchema>;
export type ChangeScopeInput = z.infer<typeof changeScopeSchema>;
export type FutureExistsQuery = z.infer<typeof futureExistsQuerySchema>;
export type BudgetSuggestionsQuery = z.infer<typeof budgetSuggestionsQuerySchema>;
