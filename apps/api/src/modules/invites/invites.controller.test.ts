import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { InvitesController } from './invites.controller';
import type { InvitesService } from './invites.service';

const res = () =>
  ({ locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as unknown as Response;
const req = { body: { password: 'x' }, params: { token: 't1' }, user: undefined } as unknown as Request;

describe('InvitesController', () => {
  for (const m of ['preview', 'accept'] as const) {
    it(`${m} returns data`, async () => {
      const svc = { [m]: vi.fn().mockResolvedValue({ r: m }) } as unknown as InvitesService;
      const r = res();
      await new InvitesController(svc)[m](req, r, vi.fn());
      expect(r.json).toHaveBeenCalledWith({ data: { r: m } });
    });
    it(`${m} forwards errors`, async () => {
      const err = new Error('x');
      const svc = { [m]: vi.fn().mockRejectedValue(err) } as unknown as InvitesService;
      const next = vi.fn();
      await new InvitesController(svc)[m](req, res(), next);
      expect(next).toHaveBeenCalledWith(err);
    });
  }
});
