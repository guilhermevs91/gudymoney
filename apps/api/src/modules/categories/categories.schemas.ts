import { z } from 'zod';

const categoryTypeSchema = z.enum(['INCOME', 'EXPENSE', 'BOTH']).default('BOTH');

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  parent_id: z.string().uuid().optional().nullable(),
  type: categoryTypeSchema.optional(),
});

export const updateCategorySchema = createCategorySchema.partial().omit({ parent_id: true });

export const listCategoriesQuerySchema = z.object({
  include_deleted: z.coerce.boolean().default(false),
  parent_id: z.string().uuid().optional().nullable(),
  flat: z.coerce.boolean().default(false),
  type: z.enum(['INCOME', 'EXPENSE', 'BOTH']).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
