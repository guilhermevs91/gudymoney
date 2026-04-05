import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Global Express error-handling middleware (must have 4 parameters).
 * - Uses `err.statusCode` when present, otherwise defaults to 500.
 * - Returns `{ error, code }` JSON.
 * - Never exposes stack traces in production.
 * - Logs full error details to console.error in non-production environments.
 */
export function errorsMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_SERVER_ERROR';
  const message = err.message ?? 'Internal server error.';

  if (env.NODE_ENV !== 'production') {
    console.error('[Error]', err);
  } else {
    // In production log only the essential info without the stack trace
    console.error(`[Error] ${statusCode} ${code}: ${message}`);
  }

  res.status(statusCode).json({
    error: statusCode >= 500 && env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : message,
    code,
  });
}
