import type { RequestHandler } from 'express';
import { ApiError } from '../lib/ApiError';

/**
 * Catches unmatched routes and raises a 404 ApiError.
 */
export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Cannot ${req.method} ${req.originalUrl || req.url}`));
};
