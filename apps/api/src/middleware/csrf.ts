import type { RequestHandler } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import { ApiError } from '../lib/ApiError';
import type { Env } from '../config/env';
import { COOKIE_CSRF_NAME, COOKIE_ACCESS_NAME, COOKIE_REFRESH_NAME } from '../lib/cookies';

/**
 * CSRF middleware following 02-ARCHITECTURE.md and 04-API.md:
 * - Safe methods (GET, HEAD, OPTIONS) skip CSRF checks.
 * - Unsafe methods require Origin === env.APP_URL.
 * - If auth cookies (bm_at, bm_rt) or bm_csrf cookie are present,
 *   header X-CSRF-Token must equal cookie bm_csrf (double submit).
 */
export function createCsrfMiddleware(env: Env): RequestHandler {
  return (req, _res, next) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    // Exemption for external webhooks/IPN (e.g. SSLCommerz IPN)
    if (req.path === '/api/payments/sslcommerz/ipn') {
      return next();
    }

    // 1. Origin check: Origin must match APP_URL
    const origin = req.headers['origin'];
    if (!origin || origin !== env.APP_URL) {
      return next(new ApiError(ErrorCode.FORBIDDEN, 'Invalid or missing Origin header'));
    }

    // 2. Double-submit token check
    const csrfCookie = req.cookies?.[COOKIE_CSRF_NAME];
    const hasAuthCookie = Boolean(req.cookies?.[COOKIE_ACCESS_NAME] || req.cookies?.[COOKIE_REFRESH_NAME]);

    if (csrfCookie || hasAuthCookie) {
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return next(new ApiError(ErrorCode.FORBIDDEN, 'Invalid or missing CSRF token'));
      }
    }

    next();
  };
}
