import { z } from 'zod';

export const recordConsentSchema = z.object({
  purposes: z
    .array(z.enum(['service_processing', 'analytics', 'marketing']))
    .min(1),
  policy_version: z.string().default('1.0'),
});

export const revokeConsentSchema = z.object({
  purpose: z.enum(['service_processing', 'analytics', 'marketing']),
});

export const deleteAccountSchema = z.object({
  confirmation: z.literal('EXCLUIR MINHA CONTA'),
  password: z.string().min(1),
});

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type RevokeConsentInput = z.infer<typeof revokeConsentSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
