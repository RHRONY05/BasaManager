import crypto from 'node:crypto';
import type { Db, Tx, MembershipRole } from '../../config/db.js';
import { env } from '../../config/env.js';
import { clock } from '../../lib/clock.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { FileKind } from '@bm/shared/enums';
import { storage, verifyLocalSignature } from '../../config/storage/index.js';

export function detectMime(buffer: Buffer): { mime: string; format: string; resourceType: 'image' | 'raw' } {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Executable files are not permitted');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', format: 'png', resourceType: 'image' };
  }

  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', format: 'jpg', resourceType: 'image' };
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', format: 'webp', resourceType: 'image' };
  }

  // PDF: %PDF
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
    return { mime: 'application/pdf', format: 'pdf', resourceType: 'raw' };
  }

  throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported file type');
}

export class FilesService {
  constructor(private readonly prisma: Db) {}

  async uploadFile(params: {
    orgId: string;
    userId: string;
    kind: FileKind;
    buffer: Buffer;
    originalFilename?: string;
  }) {
    const MAX_SIZE = 5 * 1024 * 1024;
    if (params.buffer.length > MAX_SIZE) {
      throw new ApiError(ErrorCode.PAYLOAD_TOO_LARGE, 'File exceeds 5 MB limit');
    }

    const { mime, format, resourceType } = detectMime(params.buffer);
    const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');
    const fileId = crypto.randomUUID();
    const publicId = `basamanager/${env.APP_ENV}/org/${params.orgId}/${params.kind}/${fileId}`;

    await storage.save({
      buffer: params.buffer,
      mime,
      publicId,
      fileId,
      resourceType,
    });

    return await this.prisma.$tx(
      { orgId: params.orgId, userId: params.userId, role: null },
      async (tx: Tx) => {
        const file = await tx.file.create({
          data: {
            id: fileId,
            orgId: params.orgId,
            provider: env.STORAGE_DRIVER === 'cloudinary' ? 'cloudinary' : 'local',
            publicId,
            resourceType,
            format,
            mime,
            sizeBytes: params.buffer.length,
            sha256,
            kind: params.kind,
            uploadedBy: params.userId,
          },
        });

        return {
          fileId: file.id,
          publicId: file.publicId,
          kind: file.kind,
          sizeBytes: file.sizeBytes,
          mime: file.mime,
        };
      },
    );
  }

  async getFileSignedUrl(params: {
    fileId: string;
    orgId: string;
    userId: string;
    role: string;
    variant?: string;
  }) {
    return await this.prisma.$tx(
      { orgId: params.orgId, userId: params.userId, role: params.role as MembershipRole },
      async (tx: Tx) => {
        const file = await tx.file.findFirst({
          where: {
            id: params.fileId,
            orgId: params.orgId,
            deletedAt: null,
          },
        });

        if (!file) {
          throw ApiError.notFound('File not found');
        }

        // Permission checks
        if (params.role === 'caretaker' && file.kind === 'document') {
          throw ApiError.notFound('File not found');
        }

        if (params.role === 'tenant') {
          let allowed = false;
          if (file.uploadedBy === params.userId) {
            allowed = true;
          } else {
            // Check if file is payment proof or receipt on tenant's lease
            const tenantLeases = await tx.leaseTenant.findMany({
              where: {
                orgId: params.orgId,
                membership: {
                  userId: params.userId,
                  orgId: params.orgId,
                },
              },
              select: { leaseId: true },
            });
            const leaseIds = tenantLeases.map((l: { leaseId: string }) => l.leaseId);

            if (leaseIds.length > 0) {
              const paymentProof = await tx.payment.findFirst({
                where: {
                  orgId: params.orgId,
                  leaseId: { in: leaseIds },
                  proofFileId: file.id,
                },
              });
              if (paymentProof) {
                allowed = true;
              } else {
                const receiptFile = await tx.receipt.findFirst({
                  where: {
                    orgId: params.orgId,
                    fileId: file.id,
                    payment: {
                      leaseId: { in: leaseIds },
                    },
                  },
                });
                if (receiptFile) {
                  allowed = true;
                }
              }
            }
          }

          if (!allowed) {
            throw ApiError.notFound('File not found');
          }
        }

        return await storage.getSignedUrl({
          fileId: file.id,
          publicId: file.publicId,
          resourceType: file.resourceType as 'image' | 'raw',
          format: file.format,
          expiresInSeconds: 300,
        });
      },
    );
  }

  async serveLocalFile(params: { fileId: string; exp: string; sig: string }) {
    const expNum = Number(params.exp);
    if (!expNum || !params.sig) {
      throw ApiError.forbidden('Missing expiration or signature');
    }

    const now = clock.now().getTime();
    if (now > expNum) {
      throw ApiError.forbidden('Signed URL expired');
    }

    const secret = env.STORAGE_URL_SECRET || env.JWT_SECRET || 'local-storage-secret';
    if (!verifyLocalSignature(params.fileId, expNum, params.sig, secret)) {
      throw ApiError.forbidden('Invalid signature');
    }

    const result = await storage.readById(params.fileId);
    if (!result) {
      throw ApiError.notFound('File not found');
    }

    return result;
  }
}
