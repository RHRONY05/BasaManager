import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createRequireMembership, requireRole } from './org';
import type { Db } from '../config/db';
import { ApiError } from '../lib/ApiError';

describe('org middleware', () => {
  it('rejects missing or invalid X-Org-Id header', async () => {
    const mockDb = {} as unknown as Db;
    const requireMembership = createRequireMembership(mockDb);

    const reqMissing = { headers: {} } as unknown as Request;
    const res = {} as Response;
    const nextMissing = vi.fn();
    await requireMembership(reqMissing, res, nextMissing);
    expect(nextMissing).toHaveBeenCalledWith(expect.any(ApiError));

    const reqInvalid = { headers: { 'x-org-id': 'not-a-uuid' } } as unknown as Request;
    const nextInvalid = vi.fn();
    await requireMembership(reqInvalid, res, nextInvalid);
    expect(nextInvalid).toHaveBeenCalledWith(expect.any(ApiError));
  });

  it('rejects unauthenticated user or nonexistent membership', async () => {
    const validOrgId = 'a0000000-0000-0000-0000-000000000001';
    const mockDb = {
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          membership: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        });
      }),
    } as unknown as Db;

    const requireMembership = createRequireMembership(mockDb);

    const req = {
      headers: { 'x-org-id': validOrgId },
      user: { id: 'u1' },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();

    await requireMembership(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
  });

  it('enforces requireRole', () => {
    const checkLandlord = requireRole('landlord');

    const reqForbidden = { org: { role: 'tenant' } } as unknown as Request;
    const res = {} as Response;
    const nextForbidden = vi.fn();
    checkLandlord(reqForbidden, res, nextForbidden);
    expect(nextForbidden).toHaveBeenCalledWith(expect.any(ApiError));

    const reqOk = { org: { role: 'landlord' } } as unknown as Request;
    const nextOk = vi.fn();
    checkLandlord(reqOk, res, nextOk);
    expect(nextOk).toHaveBeenCalledWith();
  });
});
