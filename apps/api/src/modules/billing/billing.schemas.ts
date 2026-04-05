import { z } from 'zod';

// ---------------------------------------------------------------------------
// Create subscription
// ---------------------------------------------------------------------------

export const createSubscriptionSchema = z.object({
  plan: z.enum(['monthly', 'annual']),
  payment_method: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']),
  credit_card_data: z
    .object({
      holder_name: z.string().min(1),
      number: z.string().length(16),
      expiry_month: z.string().length(2),
      expiry_year: z.string().length(4),
      cvv: z.string().min(3).max(4),
    })
    .optional(),
  credit_card_holder_info: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      cpf_cnpj: z.string().min(1),
      postal_code: z.string().min(1),
      address_number: z.string().min(1),
      phone: z.string().min(1),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
