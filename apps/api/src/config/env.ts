import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z
    .string()
    .optional()
    .default('3001')
    .transform((val) => parseInt(val, 10)),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  SUPERADMIN_JWT_SECRET: z.string().min(1, 'SUPERADMIN_JWT_SECRET is required'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ASAAS_BASE_URL: z.string().optional().default('https://sandbox.asaas.com/api/v3'),
  ASAAS_API_KEY: z.string().optional().default(''),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .optional()
    .default('development'),
  TZ: z.string().optional().default('America/Sao_Paulo'),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const isProduction = process.env['NODE_ENV'] === 'production';

    // In production, throw immediately on any missing required variable
    if (isProduction) {
      console.error('Invalid environment configuration:', formatted);
      throw new Error(
        `Missing or invalid environment variables: ${JSON.stringify(formatted, null, 2)}`
      );
    }

    // In non-production, warn but only throw if a truly required variable is absent
    const missingRequired = result.error.issues.filter(
      (issue) =>
        issue.path.some((p) =>
          ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUPERADMIN_JWT_SECRET'].includes(String(p))
        ) && issue.code === 'too_small'
    );

    if (missingRequired.length > 0) {
      console.warn(
        'Warning: Some required environment variables are missing. Make sure to provide them before using features that depend on them.',
        formatted
      );
    }
  }

  // Use defaults for missing optional values so the app can still start during local dev
  return envSchema.parse({
    PORT: process.env['PORT'] ?? '3001',
    DATABASE_URL: process.env['DATABASE_URL'] ?? '',
    JWT_SECRET: process.env['JWT_SECRET'] ?? '',
    JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'] ?? '',
    SUPERADMIN_JWT_SECRET: process.env['SUPERADMIN_JWT_SECRET'] ?? '',
    GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'],
    ASAAS_BASE_URL: process.env['ASAAS_BASE_URL'],
    ASAAS_API_KEY: process.env['ASAAS_API_KEY'],
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
    TZ: process.env['TZ'] ?? 'America/Sao_Paulo',
  });
}

export const env = parseEnv();

export type Env = typeof env;
