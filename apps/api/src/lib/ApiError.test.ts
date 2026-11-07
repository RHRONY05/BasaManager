import { describe, it, expect } from 'vitest';
import { ErrorCode, errorStatus } from '@bm/shared/errors';
import { ApiError } from './ApiError';

describe('ApiError', () => {
  it('correctly maps error codes to HTTP status codes', () => {
    for (const code of Object.values(ErrorCode)) {
      const err = new ApiError(code);
      expect(err.code).toBe(code);
      expect(err.status).toBe(errorStatus[code]);
      expect(err.name).toBe('ApiError');
    }
  });

  it('supports static factory methods', () => {
    const notFound = ApiError.notFound('Custom missing');
    expect(notFound.status).toBe(404);
    expect(notFound.code).toBe(ErrorCode.NOT_FOUND);
    expect(notFound.message).toBe('Custom missing');

    const validation = ApiError.validation([{ path: 'email', message: 'invalid email' }]);
    expect(validation.status).toBe(400);
    expect(validation.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(validation.details).toEqual([{ path: 'email', message: 'invalid email' }]);

    const unauth = ApiError.unauthenticated();
    expect(unauth.status).toBe(401);
    expect(unauth.code).toBe(ErrorCode.UNAUTHENTICATED);

    const forbidden = ApiError.forbidden();
    expect(forbidden.status).toBe(403);
    expect(forbidden.code).toBe(ErrorCode.FORBIDDEN);

    const conflict = ApiError.conflict();
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe(ErrorCode.CONFLICT);

    const internal = ApiError.internal();
    expect(internal.status).toBe(500);
    expect(internal.code).toBe(ErrorCode.INTERNAL);
  });
});
