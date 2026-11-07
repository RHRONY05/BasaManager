import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ErrorCode,
  errorBodySchema,
  errorCodeSchema,
  errorStatus,
  isErrorCode,
  toErrorDetails,
} from './errors';

describe('ErrorCode', () => {
  it('maps every code to itself', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('has a status for exactly the known codes', () => {
    expect(Object.keys(errorStatus).sort()).toEqual(Object.keys(ErrorCode).sort());
  });

  it('uses the statuses from 04-API.md', () => {
    expect(errorStatus).toEqual({
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
    });
  });

  it('narrows unknown values with isErrorCode', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true);
    expect(isErrorCode('not_found')).toBe(false);
    expect(isErrorCode(404)).toBe(false);
    expect(errorCodeSchema.options).toHaveLength(Object.keys(ErrorCode).length);
  });
});

describe('errorBodySchema', () => {
  it('accepts a minimal error body', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-1' } };
    expect(errorBodySchema.parse(body)).toEqual(body);
  });

  it('accepts details', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Check the highlighted fields.',
        details: [{ path: 'email', message: 'Invalid email' }],
        requestId: 'req-2',
      },
    };
    expect(errorBodySchema.safeParse(body).success).toBe(true);
  });

  it('rejects unknown codes and a missing requestId', () => {
    expect(
      errorBodySchema.safeParse({ error: { code: 'NOPE', message: 'x', requestId: 'r' } }).success,
    ).toBe(false);
    expect(errorBodySchema.safeParse({ error: { code: 'INTERNAL', message: 'x' } }).success).toBe(
      false,
    );
  });
});

describe('toErrorDetails', () => {
  it('joins nested paths with dots and keeps messages', () => {
    const schema = z.object({
      email: z.email(),
      items: z.array(z.object({ amountPoisha: z.number().int() })),
    });
    const result = schema.safeParse({ email: 'nope', items: [{ amountPoisha: 1.5 }] });
    expect(result.success).toBe(false);
    if (result.success) return;
    const details = toErrorDetails(result.error.issues);
    expect(details.map((d) => d.path)).toEqual(['email', 'items.0.amountPoisha']);
    for (const d of details) expect(d.message.length).toBeGreaterThan(0);
  });

  it('uses an empty path for whole-input problems', () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(toErrorDetails(result.error.issues)[0]?.path).toBe('');
  });
});
