import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { FilesController } from './files.controller.js';
import type { FilesService } from './files.service.js';

describe('FilesController', () => {
  const mockService = {
    uploadFile: vi.fn(),
    getFileSignedUrl: vi.fn(),
    serveLocalFile: vi.fn(),
  } as unknown as FilesService;

  const controller = new FilesController(mockService);

  const mockRes = () => {
    const res: Partial<Response> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res as Response;
  };

  const next: NextFunction = vi.fn();

  it('upload returns 400 when no file is uploaded', async () => {
    const req = {
      file: undefined,
      body: { kind: 'payment_proof' },
    } as unknown as Request;
    const res = mockRes();

    await controller.upload(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('upload returns 400 when no kind is provided', async () => {
    const req = {
      file: { buffer: Buffer.from('abc'), originalname: 'test.png' },
      body: {},
    } as unknown as Request;
    const res = mockRes();

    await controller.upload(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('upload returns 201 on success', async () => {
    const req = {
      org: { id: 'org-1' },
      user: { id: 'u-1' },
      file: { buffer: Buffer.from('abc'), originalname: 'test.png' },
      body: { kind: 'payment_proof' },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(mockService.uploadFile).mockResolvedValue({
      fileId: 'f-1',
      publicId: 'p-1',
      kind: 'payment_proof',
      sizeBytes: 3,
      mime: 'image/png',
    });

    await controller.upload(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      data: expect.objectContaining({ fileId: 'f-1' }),
    });
  });

  it('getUrl returns 200 with signed URL', async () => {
    const req = {
      org: { id: 'org-1', role: 'landlord' },
      user: { id: 'u-1' },
      params: { id: 'f-1' },
      query: { variant: 'thumb' },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(mockService.getFileSignedUrl).mockResolvedValue({
      url: '/api/files/local/f-1?variant=thumb',
      expiresAt: '2026-11-11T00:00:00.000Z',
    });

    await controller.getUrl(req, res, next);
    expect(res.json).toHaveBeenCalledWith({
      data: { url: '/api/files/local/f-1?variant=thumb', expiresAt: '2026-11-11T00:00:00.000Z' },
    });
  });

  it('serveLocal sends buffer with headers', async () => {
    const req = {
      params: { id: 'f-1' },
      query: { exp: '12345', sig: 'sig123', variant: 'thumb' },
    } as unknown as Request;
    const res = mockRes();

    vi.mocked(mockService.serveLocalFile).mockResolvedValue({
      buffer: Buffer.from('content'),
      mime: 'image/jpeg',
    });

    await controller.serveLocal(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('content'));
  });
});
