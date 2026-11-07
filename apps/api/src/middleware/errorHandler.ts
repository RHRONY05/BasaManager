import type { ErrorRequestHandler, Request } from 'express';
import { z } from 'zod';
import { ErrorCode, toErrorDetails, type ErrorBody } from '@bm/shared/errors';
import { ApiError } from '../lib/ApiError';

/**
 * Global error handler middleware that formats all errors into the standard JSON error contract:
 * { error: { code, message, details?, requestId } }
 * Never leaks stack traces in the HTTP response body.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Safe assertion to retrieve request id from custom property or header
  const customReq = req as Request & { id?: string; log?: { error: (obj: unknown, msg: string) => void } };
  const requestId =
    customReq.id ||
    // Cast header to string if present
    (res.getHeader('X-Request-Id') as string | undefined) ||
    'unknown';

  if (err instanceof ApiError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && err.details.length > 0 ? { details: err.details } : {}),
        requestId,
      },
    };
    res.status(err.status).json(body);
    return;
  }

  if (err instanceof z.ZodError) {
    const body: ErrorBody = {
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: toErrorDetails(err.issues),
        requestId,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Log unknown/internal error with request context and stack trace
  if (customReq.log?.error) {
    customReq.log.error({ err, requestId }, 'Unhandled internal server error');
  }

  const body: ErrorBody = {
    error: {
      code: ErrorCode.INTERNAL,
      message: 'Something went wrong',
      requestId,
    },
  };
  res.status(500).json(body);
};
