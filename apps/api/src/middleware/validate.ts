import type { RequestHandler, Response } from 'express';
import type { z } from 'zod';

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export interface ValidatedData {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

/**
 * Validates request body, query, and params using provided Zod schemas.
 * Because Express 5 makes `req.query` a read-only getter, parsed values are
 * safely stored in `res.locals.validated`.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, res, next) => {
    try {
      if (!res.locals.validated) {
        res.locals.validated = {} as ValidatedData;
      }

      if (schemas.params) {
        res.locals.validated.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        res.locals.validated.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        res.locals.validated.body = schemas.body.parse(req.body);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Typed helper to retrieve parsed validation results from `res.locals.validated`.
 */
export function getValidated<T = unknown>(res: Response, target: 'body' | 'query' | 'params'): T {
  // Safe cast of res.locals.validated slice to requested type
  return res.locals.validated?.[target] as T;
}
