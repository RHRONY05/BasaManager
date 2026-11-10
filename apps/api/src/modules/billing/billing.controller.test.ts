import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { BillingController } from './billing.controller';
import type { BillingService } from './billing.service';

describe('BillingController', () => {
  const mockService = {
    runGeneration: vi.fn(),
    enterReading: vi.fn(),
    getReadings: vi.fn(),
    issueBill: vi.fn(),
    issueReadyBills: vi.fn(),
    addAdjustment: vi.fn(),
    waiveLateFee: vi.fn(),
    voidBill: vi.fn(),
    listBills: vi.fn(),
    getBillById: vi.fn(),
    getDues: vi.fn(),
  } as unknown as BillingService;

  const controller = new BillingController(mockService);

  const mockRes = (validated: { body?: unknown; query?: unknown } = {}) => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.locals = { validated };
    return res as Response;
  };

  const next: NextFunction = vi.fn();

  const req = {
    org: { id: 'org-1', role: 'landlord', membershipId: 'mem-1' },
    user: { id: 'u-1', isPlatformAdmin: false },
    params: { id: 'bill-1' },
  } as unknown as Request;

  it('runGeneration returns 200 with result', async () => {
    const res = mockRes({ body: { buildingId: 'b-1', month: '2026-11' } });
    vi.mocked(mockService.runGeneration).mockResolvedValue({ created: 3, skipped: 1 });

    await controller.runGeneration(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { created: 3, skipped: 1 } });
  });

  it('enterReading returns 200 with result', async () => {
    const res = mockRes({ body: { unitId: 'u-1', month: '2026-11', reading: 1250 } });
    vi.mocked(mockService.enterReading).mockResolvedValue({
      id: 'r-1',
      unitId: 'u-1',
      reading: 1250,
      units: 50,
      amountPoisha: 45000,
    });

    await controller.enterReading(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      data: { id: 'r-1', unitId: 'u-1', reading: 1250, units: 50, amountPoisha: 45000 },
    });
  });

  it('getReadings returns 200 with list', async () => {
    const res = mockRes({ query: { buildingId: 'b-1', month: '2026-11' } });
    vi.mocked(mockService.getReadings).mockResolvedValue([] as never);

    await controller.getReadings(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: [] });
  });

  it('issueBill returns 200 with bill', async () => {
    const res = mockRes();
    vi.mocked(mockService.issueBill).mockResolvedValue({ id: 'bill-1', status: 'issued' } as never);

    await controller.issueBill(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'bill-1', status: 'issued' } });
  });

  it('issueReadyBills returns 200 with result', async () => {
    const res = mockRes({ body: { buildingId: 'b-1', month: '2026-11' } });
    vi.mocked(mockService.issueReadyBills).mockResolvedValue({ issued: 5, skipped: 2 });

    await controller.issueReadyBills(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { issued: 5, skipped: 2 } });
  });

  it('addAdjustment returns 201 with updated bill', async () => {
    const res = mockRes({ body: { amountPoisha: 50000, reason: 'Extra cleaning fee' } });
    vi.mocked(mockService.addAdjustment).mockResolvedValue({ id: 'bill-1', totalPoisha: 2050000 } as never);

    await controller.addAdjustment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'bill-1', totalPoisha: 2050000 } });
  });

  it('waiveLateFee returns 200 with updated bill', async () => {
    const res = mockRes({ body: { reason: 'Courtesy waiver' } });
    vi.mocked(mockService.waiveLateFee).mockResolvedValue({ id: 'bill-1', totalPoisha: 2000000 } as never);

    await controller.waiveLateFee(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'bill-1', totalPoisha: 2000000 } });
  });

  it('voidBill returns 200 with voided bill', async () => {
    const res = mockRes({ body: { reason: 'Created in error' } });
    vi.mocked(mockService.voidBill).mockResolvedValue({ id: 'bill-1', status: 'void' } as never);

    await controller.voidBill(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'bill-1', status: 'void' } });
  });

  it('listBills returns 200 with envelope and cursor', async () => {
    const res = mockRes({ query: {} });
    vi.mocked(mockService.listBills).mockResolvedValue({
      bills: [{ id: 'bill-1' }] as never,
      nextCursor: 'cursor-2',
    });

    await controller.listBills(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: 'bill-1' }], page: { nextCursor: 'cursor-2' } });
  });

  it('getBill returns 200 with bill', async () => {
    const res = mockRes();
    vi.mocked(mockService.getBillById).mockResolvedValue({ id: 'bill-1' } as never);

    await controller.getBill(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { id: 'bill-1' } });
  });

  it('getDues returns 200 with dues summary', async () => {
    const res = mockRes();
    vi.mocked(mockService.getDues).mockResolvedValue({ bills: [], creditPoisha: 0, totalPoisha: 0 });

    await controller.getDues(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: { bills: [], creditPoisha: 0, totalPoisha: 0 } });
  });

  it('forwards error to next middleware', async () => {
    const error = new Error('Database down');
    vi.mocked(mockService.getDues).mockRejectedValue(error);
    const res = mockRes();

    await controller.getDues(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
