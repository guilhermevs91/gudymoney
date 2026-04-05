import type { ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';

const VALIDATION_ERROR = 'Validation error';
const VALIDATION_CODE = 'VALIDATION_ERROR';

/**
 * Validates `req.body` against the provided Zod schema.
 * On failure, returns 400 with field-level error details.
 * On success, replaces `req.body` with the parsed (coerced) data.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: VALIDATION_ERROR,
        code: VALIDATION_CODE,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}

/**
 * Validates `req.query` against the provided Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: VALIDATION_ERROR,
        code: VALIDATION_CODE,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    req.query = result.data as any;
    next();
  };
}

/**
 * Validates `req.params` against the provided Zod schema.
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: VALIDATION_ERROR,
        code: VALIDATION_CODE,
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}
