import { describe, it, expect, vi } from 'vitest';
import { BuildingsController } from './buildings.controller';
import type { BuildingsService } from './buildings.service';
import type { Request, Response } from 'express';

describe('BuildingsController', () => {
  const mockService = {
    listBuildings: vi.fn().mockResolvedValue([{ id: 'b-1', name: 'Green Villa' }]),
    getBuilding: vi.fn().mockResolvedValue({ id: 'b-1', name: 'Green Villa' }),
    createBuilding: vi.fn().mockResolvedValue({ id: 'b-1', name: 'Green Villa' }),
    updateBuilding: vi.fn().mockResolvedValue({ id: 'b-1', name: 'Updated' }),
    archiveBuilding: vi.fn().mockResolvedValue({ success: true }),
    listUnits: vi.fn().mockResolvedValue([{ id: 'u-1', label: '1A' }]),
    createUnit: vi.fn().mockResolvedValue({ id: 'u-1', label: '1A' }),
    updateUnit: vi.fn().mockResolvedValue({ id: 'u-1', label: '1A' }),
    archiveUnit: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as BuildingsService;

  const controller = new BuildingsController(mockService);

  const createReqRes = (overrides: Partial<Request> = {}) => {
    const req = {
      tenantCtx: { orgId: 'org-1', userId: 'u1', role: 'landlord' },
      org: { membershipId: 'mem-1' },
      params: {},
      body: {},
      ...overrides,
    } as unknown as Request;

    const res = {
      locals: {},
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn();

    return { req, res, next };
  };

  it('listBuildings calls service and returns 200 with data', async () => {
    const { req, res, next } = createReqRes();
    await controller.listBuildings(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'b-1', name: 'Green Villa' }] });
  });

  it('getBuilding calls service with param id and returns 200', async () => {
    const { req, res, next } = createReqRes({ params: { id: 'b-1' } });
    await controller.getBuilding(req, res, next);
    expect(mockService.getBuilding).toHaveBeenCalledWith(req.tenantCtx, 'b-1', 'mem-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('createBuilding returns 201', async () => {
    const { req, res, next } = createReqRes({ body: { name: 'Green Villa' } });
    await controller.createBuilding(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateBuilding returns 200', async () => {
    const { req, res, next } = createReqRes({ params: { id: 'b-1' }, body: { name: 'Updated' } });
    await controller.updateBuilding(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('archiveBuilding returns 200', async () => {
    const { req, res, next } = createReqRes({ params: { id: 'b-1' } });
    await controller.archiveBuilding(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('listUnits returns 200', async () => {
    const { req, res, next } = createReqRes({ params: { id: 'b-1' } });
    await controller.listUnits(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('createUnit returns 201', async () => {
    const { req, res, next } = createReqRes({
      params: { id: 'b-1' },
      body: {
        label: '1A',
        floor: 1,
        type: 'family_flat',
        defaultRentPoisha: 2000000,
        electricityMode: 'submeter',
      },
    });
    await controller.createUnit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updateUnit returns 200', async () => {
    const { req, res, next } = createReqRes({
      params: { id: 'u-1' },
      body: { label: '1A-Renamed' },
    });
    await controller.updateUnit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('archiveUnit returns 200', async () => {
    const { req, res, next } = createReqRes({ params: { id: 'u-1' } });
    await controller.archiveUnit(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards errors to next', async () => {
    const errorService = {
      listBuildings: vi.fn().mockRejectedValue(new Error('DB error')),
    } as unknown as BuildingsService;
    const errController = new BuildingsController(errorService);
    const { req, res, next } = createReqRes();
    await errController.listBuildings(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
