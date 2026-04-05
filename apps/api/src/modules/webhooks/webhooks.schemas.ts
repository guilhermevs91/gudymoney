import { z } from 'zod';

const VALID_EVENTS = [
  'transaction.created',
  'transaction.updated',
  'invoice.paid',
  'budget.exceeded',
  'import.completed',
] as const;

export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
  is_active: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  is_active: z.boolean().optional(),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type ValidEvent = (typeof VALID_EVENTS)[number];
