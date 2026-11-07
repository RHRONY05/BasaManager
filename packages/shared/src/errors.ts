import { z } from 'zod';

/**
 * Every error code the API can return (04-API.md "Conventions" + per-route error columns).
 * The UI shows `message`; the `code` drives special handling. Clients key off the code, never the
 * HTTP status (several codes share a status, e.g. 401).
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ORG_SUSPENDED: 'ORG_SUSPENDED',
  INTERNAL: 'INTERNAL',
  TOKEN_INVALID: 'TOKEN_INVALID',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  LANDLORD_MUST_TRANSFER: 'LANDLORD_MUST_TRANSFER',
  READING_REQUIRED: 'READING_REQUIRED',
  READING_LOWER_THAN_PREVIOUS: 'READING_LOWER_THAN_PREVIOUS',
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** HTTP status for each code. One code always maps to one status (table in 04-API.md). */
export const errorStatus = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ORG_SUSPENDED: 423,
  INTERNAL: 500,
  TOKEN_INVALID: 400,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  SESSION_REVOKED: 401,
  INVITE_EMAIL_MISMATCH: 403,
  LANDLORD_MUST_TRANSFER: 409,
  READING_REQUIRED: 409,
  READING_LOWER_THAN_PREVIOUS: 400,
  DUPLICATE_REFERENCE: 409,
  INVALID_TRANSITION: 409,
} as const satisfies Record<ErrorCode, number>;

// Object.values loses the tuple shape z.enum needs; the object is non-empty, so the cast is safe.
const errorCodeValues = Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]];

export const errorCodeSchema = z.enum(errorCodeValues);

export function isErrorCode(value: unknown): value is ErrorCode {
  return errorCodeSchema.safeParse(value).success;
}

/** One field problem. `path` is the dotted Zod path (`items.0.amountPoisha`); `''` means the whole input. */
export const errorDetailSchema = z
  .object({
    path: z.string(),
    message: z.string(),
  })
  .meta({ id: 'ErrorDetail' });

export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** Body of every non-2xx response. */
export const errorBodySchema = z
  .object({
    error: z.object({
      code: errorCodeSchema,
      message: z.string(),
      details: z.array(errorDetailSchema).optional(),
      requestId: z.string(),
    }),
  })
  .meta({ id: 'ErrorBody' });

export type ErrorBody = z.infer<typeof errorBodySchema>;

/** Converts Zod issues to `details` the same way on the api (validate middleware) and the web (forms). */
export function toErrorDetails(issues: readonly z.core.$ZodIssue[]): ErrorDetail[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
