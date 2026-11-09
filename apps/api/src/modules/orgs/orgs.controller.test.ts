import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { OrgsController } from './orgs.controller';
import type { OrgsService } from './orgs.service';

const res = () =>
  ({ locals: {}, status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }) as unknown as Response;
const req = { body: { name: 'N' }, tenantCtx: { orgId: 'o1' } } as unknown as Request;

describe('OrgsController', () => {
  for (const m of ['getOrg', 'updateOrg'] as const) {
    it(`${m} returns data`, async () => {
      const svc = { [m]: vi.fn().mockResolvedValue({ r: m }) } as unknown as OrgsService;
      const r = res();
      await new OrgsController(svc)[m](req, r, vi.fn());
      expect(r.status).toHaveBeenCalledWith(200);
      expect(r.json).toHaveBeenCalledWith({ data: { r: m } });
    });
    it(`${m} forwards errors`, async () => {
      const err = new Error('x');
      const svc = { [m]: vi.fn().mockRejectedValue(err) } as unknown as OrgsService;
      const next = vi.fn();
      await new OrgsController(svc)[m](req, res(), next);
      expect(next).toHaveBeenCalledWith(err);
    });
  }
});
