import { describe, it, expect, vi } from 'vitest';
import { InvitesService } from './invites.service';
import type { Db } from '../../config/db';
import { ApiError } from '../../lib/ApiError';
import type { Env } from '../../config/env';
import type { Request, Response } from 'express';

describe('InvitesService', () => {
  const mockEnv = {
    JWT_SECRET: 'test-secret-at-least-32-chars-long-123456',
    COOKIE_SECURE: false,
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_DAYS: 30,
  } as unknown as Env;

  it('throws ApiError on preview when token is not found or expired', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as Db;

    const service = new InvitesService(mockDb, mockEnv);
    await expect(service.preview('invalid-token')).rejects.toThrow(ApiError);
  });

  it('allows signed-in user to accept invite if email matches', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'inv-1',
          org_id: 'org-1',
          email: 'matching@test.local',
          role: 'tenant',
          invited_by: 'u-landlord',
          accepted_at: null,
          revoked_at: null,
          expires_at: new Date(Date.now() + 86400000),
          building_ids: [],
        },
      ]),
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          invitation: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          membership: {
            create: vi.fn().mockResolvedValue({ id: 'm-1' }),
          },
        });
      }),
    } as unknown as Db;

    const service = new InvitesService(mockDb, mockEnv);
    const currentUser = { id: 'u-1', email: 'matching@test.local' } as any;

    const res = await service.accept(
      'token-123',
      {} as any,
      currentUser,
      {} as Request,
      {} as Response,
    );
    expect(res.accepted).toBe(true);
  });

  it('rejects signed-in user if email does not match', async () => {
    const mockDb = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'inv-1',
          org_id: 'org-1',
          email: 'matching@test.local',
          role: 'tenant',
          invited_by: 'u-landlord',
          accepted_at: null,
          revoked_at: null,
          expires_at: new Date(Date.now() + 86400000),
        },
      ]),
    } as unknown as Db;

    const service = new InvitesService(mockDb, mockEnv);
    const currentUser = { id: 'u-1', email: 'different@test.local' } as any;

    await expect(
      service.accept('token-123', {} as any, currentUser, {} as Request, {} as Response),
    ).rejects.toThrow(ApiError);
  });
});
