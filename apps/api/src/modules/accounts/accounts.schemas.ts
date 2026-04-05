import { z } from 'zod';

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['CHECKING', 'SAVINGS', 'WALLET']), // INTERNAL not allowed via API
  initial_balance: z.number().default(0),
  currency: z.string().length(3).default('BRL'),
  bank_name: z.string().max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

export const updateAccountSchema = createAccountSchema
  .partial()
  .omit({ type: true, initial_balance: true });

export const listAccountsQuerySchema = z.object({
  include_inactive: z.coerce.boolean().default(false),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;
