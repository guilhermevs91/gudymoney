import { z } from 'zod';

export const uploadImportSchema = z
  .object({
    account_id: z.string().uuid().optional(),
    credit_card_id: z.string().uuid().optional(),
    column_mapping: z.string().optional(), // JSON string for CSV mapping
  })
  .refine((d) => d.account_id !== undefined || d.credit_card_id !== undefined, {
    message: 'account_id or credit_card_id required',
  });

// CSV column mapping schema
// When a known preset is provided, date/amount/description are not required.
export const csvColumnMappingSchema = z
  .object({
    date: z.string().default(''),
    amount: z.string().default(''),
    description: z.string().default(''),
    preset: z
      .enum(['nubank', 'itau', 'bradesco', 'santander', 'bb', 'custom'])
      .optional(),
  })
  .refine(
    (d) => {
      // Custom preset or no preset: require explicit column names
      if (d.preset === 'custom' || d.preset === undefined) {
        return d.date.length > 0 && d.amount.length > 0 && d.description.length > 0;
      }
      return true; // known preset is enough
    },
    { message: 'Informe os nomes das colunas date, amount e description para o preset "custom".' },
  );

// ---------------------------------------------------------------------------
// Bradesco Invoice Import schemas
// ---------------------------------------------------------------------------

export const bradescoCardMappingSchema = z
  .object({
    last_four: z.string().length(4).regex(/^\d{4}$/),
    skip: z.boolean().optional().default(false),
    credit_card_id: z.string().uuid().optional().nullable(),
    create_card: z
      .object({
        name: z.string().min(1).max(100),
        brand: z.string().max(50).optional(),
        // Optional for additional/virtual cards — they inherit from parent
        limit_total: z.number().min(0).optional().nullable(),
        closing_day: z.number().int().min(1).max(28).optional().nullable(),
        due_day: z.number().int().min(1).max(28).optional().nullable(),
        parent_card_id: z.string().optional().nullable(), // uuid or __new__LAST4
      })
      .optional()
      .nullable(),
  })
  .refine(
    (d) => d.skip === true || d.credit_card_id != null || d.create_card != null,
    { message: 'Informe credit_card_id, create_card ou marque skip=true.' },
  );

export const bradescoImportSchema = z.object({
  card_mappings: z.array(bradescoCardMappingSchema).min(1),
});

export type BradescoCardMapping = z.infer<typeof bradescoCardMappingSchema>;
export type BradescoImportInput = z.infer<typeof bradescoImportSchema>;

export const reconcileSchema = z.object({
  import_item_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
});

export const listImportItemsQuerySchema = z.object({
  status: z.enum(['PENDING', 'MATCHED', 'IGNORED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const listImportsQuerySchema = z.object({
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type UploadImportInput = z.infer<typeof uploadImportSchema>;
export type ReconcileInput = z.infer<typeof reconcileSchema>;
export type ListImportItemsQuery = z.infer<typeof listImportItemsQuerySchema>;
export type ListImportsQuery = z.infer<typeof listImportsQuerySchema>;
export type CsvColumnMapping = z.infer<typeof csvColumnMappingSchema>;
