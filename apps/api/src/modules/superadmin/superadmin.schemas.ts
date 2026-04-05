import { z } from 'zod';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const superadminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Plan management
// ---------------------------------------------------------------------------

export const planPricingSchema = z.object({
  plan: z.enum(['FREE', 'PAID', 'DEV']),
  monthly_price: z.number().nonnegative().optional(),
  annual_price: z.number().nonnegative().optional(),
});

export const featureFlagSchema = z.object({
  plan: z.enum(['FREE', 'PAID', 'DEV']),
  feature_key: z.string(),
  feature_value: z.string(),
});

// ---------------------------------------------------------------------------
// Tenant management
// ---------------------------------------------------------------------------

export const tenantBlockSchema = z.object({
  reason: z.string().min(1),
});

export const updateTenantSchema = z.object({
  plan: z.enum(['FREE', 'PAID', 'DEV']).optional(),
  name: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const tenantListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
  plan: z.enum(['FREE', 'PAID', 'DEV']).optional(),
  blocked: z.coerce.boolean().optional(),
});

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SuperadminLoginInput = z.infer<typeof superadminLoginSchema>;
export type PlanPricingInput = z.infer<typeof planPricingSchema>;
export type FeatureFlagInput = z.infer<typeof featureFlagSchema>;
export type TenantBlockInput = z.infer<typeof tenantBlockSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type TenantListQuery = z.infer<typeof tenantListQuerySchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
