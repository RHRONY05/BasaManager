import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

const res = () =>
  ({ locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as unknown as Response;
const req = {
  body: { a: 1 },
  params: { id: 'sess1' },
  user: { id: 'u1', sessionId: 's1', familyId: 'f1' },
} as unknown as Request;

const methods = ['getMe', 'updateMe', 'changePassword', 'listSessions', 'revokeSession'] as const;

describe('UsersController', () => {
  for (const m of methods) {
    it(`${m} returns data`, async () => {
      const svc = { [m]: vi.fn().mockResolvedValue({ r: m }) } as unknown as UsersService;
      const r = res();
      const next = vi.fn();
      await new UsersController(svc)[m](req, r, next);
      expect(r.json).toHaveBeenCalledWith({ data: { r: m } });
      expect(next).not.toHaveBeenCalled();
    });
    it(`${m} forwards errors`, async () => {
      const err = new Error('bad');
      const svc = { [m]: vi.fn().mockRejectedValue(err) } as unknown as UsersService;
      const next = vi.fn();
      await new UsersController(svc)[m](req, res(), next);
      expect(next).toHaveBeenCalledWith(err);
    });
  }

  it('passes the right arguments to the service', async () => {
    const svc = {
      changePassword: vi.fn().mockResolvedValue({}),
      listSessions: vi.fn().mockResolvedValue([]),
      revokeSession: vi.fn().mockResolvedValue({}),
    } as unknown as UsersService;
    const c = new UsersController(svc);
    await c.changePassword(req, res(), vi.fn());
    await c.listSessions(req, res(), vi.fn());
    await c.revokeSession(req, res(), vi.fn());
    expect(svc.changePassword).toHaveBeenCalledWith('u1', 'f1', { a: 1 });
    expect(svc.listSessions).toHaveBeenCalledWith('u1', 's1', 'f1');
    expect(svc.revokeSession).toHaveBeenCalledWith('u1', 'sess1');
  });
});
