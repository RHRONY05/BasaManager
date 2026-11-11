import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { SslcommerzController } from './sslcommerz.controller.js';
import type { SslcommerzService } from './sslcommerz.service.js';

describe('SslcommerzController', () => {
  const mockService = {
    initPayment: vi.fn(),
    handleIpn: vi.fn(),
    handleReturn: vi.fn(),
    getIntent: vi.fn(),
  } as unknown as SslcommerzService;

  const controller = new SslcommerzController(mockService);

  const mockRes = (validated: { body?: unknown; query?: unknown } = {}) => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.redirect = vi.fn().mockReturnValue(res);
    res.locals = { validated };
    return res as Response;
  };

  const next: NextFunction = vi.fn();

  it('initPayment returns 201 with gatewayUrl and tranId', async () => {
    const req = {
      org: { id: 'org-1', role: 'tenant' },
      user: { id: 'u-1' },
    } as unknown as Request;
    const res = mockRes({
      body: { leaseId: 'lease-1', amountPoisha: 10000 },
    });
    vi.mocked(mockService.initPayment).mockResolvedValue({
      gatewayUrl: 'https://gateway.example.com',
      tranId: 'TRAN-123',
    });

    await controller.initPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      data: { gatewayUrl: 'https://gateway.example.com', tranId: 'TRAN-123' },
    });
  });

  it('handleIpn returns 200 with result', async () => {
    const req = {
      body: { tran_id: 'TRAN-123', val_id: 'VAL-123', status: 'VALID' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.handleIpn).mockResolvedValue({ status: 'confirmed' });

    await controller.handleIpn(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { status: 'confirmed' } });
  });

  it('handleReturn redirects 303 to redirectUrl on success', async () => {
    const req = {
      params: { result: 'success' },
      body: { tran_id: 'TRAN-123' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.handleReturn).mockResolvedValue({
      redirectUrl: 'http://localhost:4000/pay/result?tran=TRAN-123',
    });

    await controller.handleReturn(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(303, 'http://localhost:4000/pay/result?tran=TRAN-123');
  });

  it('handleReturn redirects on query params when body is empty', async () => {
    const req = {
      params: { result: 'fail' },
      body: {},
      query: { tran_id: 'TRAN-123' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.handleReturn).mockResolvedValue({
      redirectUrl: 'http://localhost:4000/pay/result?tran=TRAN-123',
    });

    await controller.handleReturn(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith(303, 'http://localhost:4000/pay/result?tran=TRAN-123');
  });

  it('handleReturn calls next with validation error on invalid result', async () => {
    const req = {
      params: { result: 'unknown' },
    } as unknown as Request;
    const res = mockRes();

    await controller.handleReturn(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('getIntent returns 200 with intent details', async () => {
    const req = {
      org: { id: 'org-1', role: 'tenant' },
      user: { id: 'u-1' },
      params: { tranId: 'TRAN-123' },
    } as unknown as Request;
    const res = mockRes();
    vi.mocked(mockService.getIntent).mockResolvedValue({
      id: 'pi-1',
      tranId: 'TRAN-123',
      amountPoisha: 10000,
      status: 'confirmed',
      paymentId: 'pay-1',
      receiptId: 'rec-1',
      createdAt: new Date().toISOString(),
    });

    await controller.getIntent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({ tranId: 'TRAN-123', status: 'confirmed' }),
    });
  });

  it('getIntent calls next with validation error when tranId missing', async () => {
    const req = {
      org: { id: 'org-1', role: 'tenant' },
      user: { id: 'u-1' },
      params: {},
    } as unknown as Request;
    const res = mockRes();

    await controller.getIntent(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
