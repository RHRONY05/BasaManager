import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { detectMime, processImage, FilesService } from './files.service.js';
import { ApiError } from '../../lib/ApiError.js';
import type { Db } from '../../config/db.js';
import type { FileKind } from '@bm/shared/enums';

describe('FilesService & detectMime & processImage', () => {
  it('detects PNG, JPEG, WebP, PDF correctly', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
    expect(detectMime(png)).toEqual({ mime: 'image/png', format: 'png', resourceType: 'image' });

    const jpg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    expect(detectMime(jpg)).toEqual({ mime: 'image/jpeg', format: 'jpg', resourceType: 'image' });

    const webp = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .webp()
      .toBuffer();
    expect(detectMime(webp)).toEqual({ mime: 'image/webp', format: 'webp', resourceType: 'image' });

    const pdf = Buffer.from('%PDF-1.4 header');
    expect(detectMime(pdf)).toEqual({ mime: 'application/pdf', format: 'pdf', resourceType: 'raw' });
  });

  it('rejects executable files with 415 UNSUPPORTED_MEDIA_TYPE', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => detectMime(exe)).toThrow(ApiError);
    try {
      detectMime(exe);
    } catch (err) {
      expect((err as ApiError).status).toBe(415);
      expect((err as ApiError).message).toContain('Executable files');
    }
  });

  it('rejects unknown binary types with 415', () => {
    const random = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    expect(() => detectMime(random)).toThrow(ApiError);
    try {
      detectMime(random);
    } catch (err) {
      expect((err as ApiError).status).toBe(415);
    }
  });

  it('strips EXIF metadata and produces 400px thumbnail in processImage', async () => {
    // Generate image with EXIF metadata
    const source = await sharp({
      create: { width: 500, height: 500, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .withMetadata({
        exif: {
          IFD0: {
            Copyright: 'Secret Location GPS Data',
          },
        },
      })
      .jpeg()
      .toBuffer();

    const { processedBuffer, thumbBuffer, mime, format } = await processImage(source);
    expect(mime).toBe('image/jpeg');
    expect(format).toBe('jpg');

    // Verify EXIF is stripped
    const processedMeta = await sharp(processedBuffer).metadata();
    expect(processedMeta.exif).toBeUndefined();

    // Verify thumbnail dimensions (<= 400px)
    const thumbMeta = await sharp(thumbBuffer).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(400);
    expect(thumbMeta.height).toBeLessThanOrEqual(400);
  });

  describe('FilesService methods', () => {
    const mockTx = {
      file: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      caretakerBuilding: {
        findMany: vi.fn(),
      },
      payment: {
        findFirst: vi.fn(),
      },
      receipt: {
        findFirst: vi.fn(),
      },
      leaseTenant: {
        findMany: vi.fn(),
      },
    };

    const mockPrisma = {
      $tx: vi.fn().mockImplementation((_ctx, fn) => fn(mockTx)),
    } as unknown as Db;

    const service = new FilesService(mockPrisma);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('rejects uploads with forbidden kinds', async () => {
      const buf = Buffer.from('%PDF-1.4');
      await expect(
        service.uploadFile({
          orgId: 'org-1',
          userId: 'u-1',
          kind: 'receipt_pdf' as unknown as FileKind,
          buffer: buf,
        }),
      ).rejects.toThrow('Invalid or forbidden file kind for user upload');
    });

    it('rejects uploads exceeding 5 MB', async () => {
      const hugeBuf = Buffer.alloc(6 * 1024 * 1024);
      await expect(
        service.uploadFile({
          orgId: 'org-1',
          userId: 'u-1',
          kind: 'payment_proof',
          buffer: hugeBuf,
        }),
      ).rejects.toThrow('File exceeds 5 MB limit');
    });

    it('successfully uploads valid image with processing', async () => {
      const png = await sharp({
        create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
      })
        .png()
        .toBuffer();

      mockTx.file.create.mockResolvedValue({
        id: 'file-123',
        publicId: 'basamanager/test/org/org-1/payment_proof/file-123',
        kind: 'payment_proof',
        sizeBytes: png.length,
        mime: 'image/png',
      });

      const res = await service.uploadFile({
        orgId: 'org-1',
        userId: 'u-1',
        kind: 'payment_proof',
        buffer: png,
      });

      expect(res.fileId).toBe('file-123');
      expect(mockTx.file.create).toHaveBeenCalled();
    });

    it('getFileSignedUrl rejects caretaker accessing document', async () => {
      mockTx.file.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        kind: 'document',
        resourceType: 'raw',
        format: 'pdf',
      });

      await expect(
        service.getFileSignedUrl({
          fileId: 'f-1',
          orgId: 'org-1',
          userId: 'c-1',
          role: 'caretaker',
        }),
      ).rejects.toThrow('File not found');
    });

    it('getFileSignedUrl rejects caretaker for unassigned building payment proof', async () => {
      mockTx.file.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        kind: 'payment_proof',
        resourceType: 'image',
        format: 'jpg',
        uploadedBy: 'other-user',
      });
      mockTx.caretakerBuilding.findMany.mockResolvedValue([{ buildingId: 'b-assigned' }]);
      mockTx.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.getFileSignedUrl({
          fileId: 'f-1',
          orgId: 'org-1',
          userId: 'c-1',
          role: 'caretaker',
        }),
      ).rejects.toThrow('File not found');
    });

    it('getFileSignedUrl allows tenant accessing their own uploaded file', async () => {
      mockTx.file.findFirst.mockResolvedValue({
        id: 'f-1',
        orgId: 'org-1',
        kind: 'payment_proof',
        resourceType: 'image',
        format: 'jpg',
        publicId: 'basamanager/test/org/org-1/payment_proof/f-1',
        uploadedBy: 'tenant-1',
      });

      const res = await service.getFileSignedUrl({
        fileId: 'f-1',
        orgId: 'org-1',
        userId: 'tenant-1',
        role: 'tenant',
      });

      expect(res.url).toBeDefined();
    });

    it('serveLocalFile verifies expiration and signature', async () => {
      await expect(
        service.serveLocalFile({
          fileId: 'f-1',
          exp: String(Date.now() - 10000), // expired
          sig: 'some-sig',
        }),
      ).rejects.toThrow('Signed URL expired');
    });
  });
});
