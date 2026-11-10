import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { LeasesController } from './leases.controller';
import type { LeasesService } from './leases.service';

describe('LeasesController', () => {
  const mockService = {
    createLease: vi.fn(),
    listLeases: vi.fn(),
    getLease: vi.fn(),
    getActiveLease: vi.fn(),
    recordDeposit: vi.fn(),
    resendInvite: vi.fn(),
    getTenantHistory: vi.fn(),
  } as unknown as LeasesService;

  const controller = new LeasesController(mockService);

  const mockRes = (validated: { body?: unknown; query?: unknown } = {}) => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.locals = { validated };
    return res as Response;
  };

  const next: NextFunction = vi.fn();

  it('createLease returns 201', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
    } as unknown as Request;
    const body = { unitId: 'unit-1', tenantEmail: 't@test.com' };
    const res = mockRes({ body });
    vi.mocked(mockService.createLease).mockResolvedValue({ id: 'lease-1' } as never);

    await controller.createLease(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'lease-1' } });
  });

  it('listLeases returns 200', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
    } as unknown as Request;
    const res = mockRes({ query: {} });
    vi.mocked(mockService.listLeases).mockResolvedValue([{ id: 'lease-1' }] as never);

    await controller.listLeases(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'lease-1' }] });
  });

  it('getLease returns 200', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
      params: { id: 'lease-1' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.getLease).mockResolvedValue({ id: 'lease-1' } as never);

    await controller.getLease(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'lease-1' } });
  });

  it('getActiveLease returns 200', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
    } as unknown as Request;
    const res = mockRes({ query: { unitId: 'unit-1' } });
    vi.mocked(mockService.getActiveLease).mockResolvedValue({ id: 'lease-1' } as never);

    await controller.getActiveLease(req, res, next);
    expect(mockService.getActiveLease).toHaveBeenCalledWith(req.tenantCtx, 'unit-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'lease-1' } });
  });

  it('recordDeposit returns 201', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
      params: { id: 'lease-1' },
    } as unknown as Request;
    const body = { kind: 'received', amountPoisha: 1000 };
    const res = mockRes({ body });
    vi.mocked(mockService.recordDeposit).mockResolvedValue({ id: 'dep-1' } as never);

    await controller.recordDeposit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'dep-1' } });
  });

  it('resendInvite returns 200', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
      params: { id: 'lease-1' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.resendInvite).mockResolvedValue({ resent: true } as never);

    await controller.resendInvite(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { resent: true } });
  });

  it('getTenantHistory returns 200', async () => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u-1', role: 'landlord' },
      params: { membershipId: 'mem-1' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.getTenantHistory).mockResolvedValue({ tenant: {} } as never);

    await controller.getTenantHistory(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { tenant: {} } });
  });
});
