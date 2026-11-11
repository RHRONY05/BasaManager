import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { PaymentsController } from './payments.controller.js';
import type { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  const mockService = {
    submitClaim: vi.fn(),
    recordPayment: vi.fn(),
    confirmPayment: vi.fn(),
    rejectPayment: vi.fn(),
    voidPayment: vi.fn(),
    listPayments: vi.fn(),
    getReceiptDownload: vi.fn(),
  } as unknown as PaymentsService;

  const controller = new PaymentsController(mockService);

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
    params: { id: 'pay-1' },
  } as unknown as Request;

  it('submitClaim returns 201 with created payment', async () => {
    const res = mockRes({
      body: { leaseId: 'l-1', amountPoisha: 10000, method: 'bkash', paidOn: '2026-11-11' },
    });
    vi.mocked(mockService.submitClaim).mockResolvedValue({ id: 'pay-1', status: 'pending_claim' } as never);

    await controller.submitClaim(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'pay-1' }) });
  });

  it('recordPayment returns 201 with confirmed payment', async () => {
    const res = mockRes({
      body: { leaseId: 'l-1', amountPoisha: 10000, method: 'cash', paidOn: '2026-11-11' },
    });
    vi.mocked(mockService.recordPayment).mockResolvedValue({ id: 'pay-2', status: 'confirmed' } as never);

    await controller.recordPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'pay-2' }) });
  });

  it('confirmPayment returns 200 with confirmed payment', async () => {
    const res = mockRes();
    vi.mocked(mockService.confirmPayment).mockResolvedValue({ id: 'pay-1', status: 'confirmed' } as never);

    await controller.confirmPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'pay-1' }) });
  });

  it('rejectPayment returns 200 with rejected payment', async () => {
    const res = mockRes({ body: { reason: 'Invalid reference' } });
    vi.mocked(mockService.rejectPayment).mockResolvedValue({ id: 'pay-1', status: 'rejected' } as never);

    await controller.rejectPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'pay-1' }) });
  });

  it('voidPayment returns 200 with voided payment', async () => {
    const res = mockRes({ body: { reason: 'Duplicate entry' } });
    vi.mocked(mockService.voidPayment).mockResolvedValue({ id: 'pay-1', status: 'void' } as never);

    await controller.voidPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ data: expect.objectContaining({ id: 'pay-1' }) });
  });

  it('listPayments returns 200 with payments and nextCursor pagination', async () => {
    const res = mockRes({ query: { limit: 10 } });
    vi.mocked(mockService.listPayments).mockResolvedValue({
      items: [{ id: 'pay-1' }] as never,
      nextCursor: 'pay-2',
    });

    await controller.listPayments(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: 'pay-1' }],
      page: { nextCursor: 'pay-2' },
    });
  });

  it('getReceiptDownload returns 200 when ready', async () => {
    const res = mockRes();
    vi.mocked(mockService.getReceiptDownload).mockResolvedValue({
      downloadUrl: 'https://storage/receipt.pdf',
    });

    await controller.getReceiptDownload(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      data: { downloadUrl: 'https://storage/receipt.pdf' },
    });
  });

  it('getReceiptDownload returns 202 when rendering', async () => {
    const res = mockRes();
    vi.mocked(mockService.getReceiptDownload).mockResolvedValue({
      status: 'rendering',
    });

    await controller.getReceiptDownload(req, res, next);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({
      data: { status: 'rendering' },
    });
  });
});
