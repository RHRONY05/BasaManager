import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createRequireUser, createOptionalUser } from './auth';
import type { Db } from '../config/db';
import type { Env } from '../config/env';
import { ApiError } from '../lib/ApiError';
import { signAccessToken } from '../lib/tokens';

describe('auth middleware', () => {
  const secret = 'test-secret-at-least-32-chars-long-123456';
  const mockEnv = { JWT_SECRET: secret } as unknown as Env;

  it('rejects unauthenticated requests in requireUser', async () => {
    const mockDb = {} as unknown as Db;
    const requireUser = createRequireUser(mockDb, mockEnv);

    const req = { cookies: {} } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    await requireUser(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
  });

  it('populates req.user when valid token and session exist', async () => {
    const token = await signAccessToken({ sub: 'user-1', sid: 'session-1', adm: false }, secret);
    const mockDb = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          familyId: 'family-1',
          revokedAt: null,
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: new Date(),
          deletedAt: null,
        }),
      },
    } as unknown as Db;

    const requireUser = createRequireUser(mockDb, mockEnv);

    const req = { cookies: { bm_at: token } } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    await requireUser(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 'user-1',
        email: 'user@example.com',
        sessionId: 'session-1',
        familyId: 'family-1',
        emailVerified: true,
      }),
    );
  });

  it('allows optionalUser to proceed without cookie', async () => {
    const mockDb = {} as unknown as Db;
    const optionalUser = createOptionalUser(mockDb, mockEnv);

    const req = { cookies: {} } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    await optionalUser(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });
});
