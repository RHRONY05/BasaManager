import type { ErrorRequestHandler, Request } from 'express';
import { z } from 'zod';
import { ErrorCode, errorStatus, toErrorDetails, type ErrorBody } from '@bm/shared/errors';
import { ApiError } from '../lib/ApiError';

/** Returns the numeric 4xx `status`/`statusCode` an error carries, or undefined. */
function getClientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  for (const value of [status, statusCode]) {
    if (typeof value === 'number' && value >= 400 && value < 500) return value;
  }
  return undefined;
}

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

  // body-parser (express.json) errors carry a `type` and a 4xx `status`; map the ones clients can cause.
  const parserType = (err as { type?: unknown } | null)?.type;
  if (parserType === 'entity.parse.failed') {
    const body: ErrorBody = {
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request body is not valid JSON',
        requestId,
      },
    };
    res.status(errorStatus.VALIDATION_FAILED).json(body);
    return;
  }

  if (parserType === 'entity.too.large') {
    const body: ErrorBody = {
      error: {
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body is too large',
        requestId,
      },
    };
    res.status(errorStatus.PAYLOAD_TOO_LARGE).json(body);
    return;
  }

  // Any other error that carries a 4xx status was caused by the client (bad `%` in the path, unsupported
  // charset/encoding 415, body-parser `entity.verify.failed`, ...). Answer 400 VALIDATION_FAILED with a fixed
  // message: the original message can echo client input. 415 maps here too so the code and status stay in
  // step with `errorStatus` (decided 2026-11-08: no separate UNSUPPORTED_MEDIA_TYPE code).
  const clientStatus = getClientErrorStatus(err);
  if (clientStatus !== undefined) {
    const body: ErrorBody = {
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request could not be processed',
        requestId,
      },
    };
    res.status(errorStatus.VALIDATION_FAILED).json(body);
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
