import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { Db, Tx, MembershipRole } from '../../config/db.js';
import { env } from '../../config/env.js';
import { clock } from '../../lib/clock.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { FileKind } from '@bm/shared/enums';
import { storage, verifyLocalSignature } from '../../config/storage/index.js';

export const ALLOWED_USER_UPLOAD_KINDS: readonly FileKind[] = [
  'payment_proof',
  'document',
  'maintenance_photo',
];

export async function detectMime(
  buffer: Buffer,
): Promise<{ mime: string; format: string; resourceType: 'image' | 'raw' }> {
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Executable files are not permitted');
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported file type');
  }

  if (detected.mime === 'image/jpeg') {
    return { mime: 'image/jpeg', format: 'jpg', resourceType: 'image' };
  }
  if (detected.mime === 'image/png') {
    return { mime: 'image/png', format: 'png', resourceType: 'image' };
  }
  if (detected.mime === 'image/webp') {
    return { mime: 'image/webp', format: 'webp', resourceType: 'image' };
  }
  if (detected.mime === 'application/pdf') {
    return { mime: 'application/pdf', format: 'pdf', resourceType: 'raw' };
  }

  throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Unsupported file type');
}

export async function processImage(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  thumbBuffer: Buffer;
  mime: string;
  format: string;
}> {
  try {
    // auto-rotate based on EXIF orientation, resize max 2000px, strips EXIF metadata
    const pipeline = sharp(buffer)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true });

    const metadata = await sharp(buffer).metadata();
    const format = metadata.format === 'png' ? 'png' : metadata.format === 'webp' ? 'webp' : 'jpeg';

    let processedBuffer: Buffer;
    if (format === 'png') {
      processedBuffer = await pipeline.png().toBuffer();
    } else if (format === 'webp') {
      processedBuffer = await pipeline.webp().toBuffer();
    } else {
      processedBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
    }

    // 400px thumbnail
    const thumbPipeline = sharp(processedBuffer).resize({
      width: 400,
      height: 400,
      fit: 'inside',
      withoutEnlargement: true,
    });

    let thumbBuffer: Buffer;
    if (format === 'png') {
      thumbBuffer = await thumbPipeline.png().toBuffer();
    } else if (format === 'webp') {
      thumbBuffer = await thumbPipeline.webp().toBuffer();
    } else {
      thumbBuffer = await thumbPipeline.jpeg({ quality: 80 }).toBuffer();
    }

    const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
    return {
      processedBuffer,
      thumbBuffer,
      mime,
      format: format === 'jpeg' ? 'jpg' : format,
    };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(ErrorCode.UNSUPPORTED_MEDIA_TYPE, 'Corrupt or unreadable image file');
  }
}

export class FilesService {
  constructor(
    private readonly prisma: Db,
    private readonly config?: { APP_ENV?: string; STORAGE_DRIVER?: string },
  ) {}

  async uploadFile(params: {
    orgId: string;
    userId: string;
    kind: FileKind;
    buffer: Buffer;
    originalFilename?: string;
    declaredMime?: string;
  }) {
    if (!ALLOWED_USER_UPLOAD_KINDS.includes(params.kind)) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Invalid or forbidden file kind for user upload');
    }

    const MAX_SIZE = 5 * 1024 * 1024;
    if (params.buffer.length > MAX_SIZE) {
      throw new ApiError(ErrorCode.PAYLOAD_TOO_LARGE, 'File exceeds 5 MB limit');
    }

    const { mime: initialMime, format: initialFormat, resourceType } = await detectMime(params.buffer);

    if (params.declaredMime) {
      const normDeclared =
        params.declaredMime.toLowerCase() === 'image/jpg' ? 'image/jpeg' : params.declaredMime.toLowerCase();
      const normDetected = initialMime.toLowerCase();
      if (normDeclared !== normDetected) {
        throw new ApiError(
          ErrorCode.UNSUPPORTED_MEDIA_TYPE,
          `Declared mimetype (${params.declaredMime}) does not match detected content (${initialMime})`,
        );
      }
    }

    let finalBuffer = params.buffer;
    let thumbBuffer: Buffer | undefined;
    let finalMime = initialMime;
    let finalFormat = initialFormat;

    if (resourceType === 'image') {
      const processed = await processImage(params.buffer);
      finalBuffer = processed.processedBuffer;
      thumbBuffer = processed.thumbBuffer;
      finalMime = processed.mime;
      finalFormat = processed.format;
    }

    const sha256 = crypto.createHash('sha256').update(finalBuffer).digest('hex');
    const fileId = crypto.randomUUID();
    const appEnv =
      this.config?.APP_ENV || process.env.APP_ENV || (process.env.NODE_ENV === 'test' ? 'test' : env.APP_ENV);
    const publicId = `basamanager/${appEnv}/org/${params.orgId}/${params.kind}/${fileId}`;

    await storage.save({
      buffer: finalBuffer,
      thumbBuffer,
      mime: finalMime,
      publicId,
      fileId,
      resourceType,
    });

    const storageDriver =
      this.config?.STORAGE_DRIVER ||
      process.env.STORAGE_DRIVER ||
      (process.env.NODE_ENV === 'test' ? 'local' : env.STORAGE_DRIVER);

    try {
      return await this.prisma.$tx(
        { orgId: params.orgId, userId: params.userId, role: null },
        async (tx: Tx) => {
          const file = await tx.file.create({
            data: {
              id: fileId,
              orgId: params.orgId,
              provider: storageDriver === 'cloudinary' ? 'cloudinary' : 'local',
              publicId,
              resourceType,
              format: finalFormat,
              mime: finalMime,
              sizeBytes: finalBuffer.length,
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
    } catch (dbErr) {
      try {
        await storage.delete(publicId, resourceType);
      } catch {
        // Ignore deletion error
      }
      throw dbErr;
    }
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

        // Caretaker permission check: cannot see documents, and scoped to managed buildings
        if (params.role === 'caretaker') {
          if (file.kind === 'document') {
            throw ApiError.notFound('File not found');
          }

          const caretakerBuildings = await tx.caretakerBuilding.findMany({
            where: {
              orgId: params.orgId,
              membership: {
                userId: params.userId,
                orgId: params.orgId,
              },
            },
            select: { buildingId: true },
          });
          const buildingIds = caretakerBuildings.map((b: { buildingId: string }) => b.buildingId);

          if (file.kind === 'payment_proof') {
            const payment = await tx.payment.findFirst({
              where: {
                orgId: params.orgId,
                proofFileId: file.id,
                lease: {
                  unit: {
                    buildingId: { in: buildingIds },
                  },
                },
              },
            });
            if (!payment && file.uploadedBy !== params.userId) {
              const uploaderInBuilding = file.uploadedBy
                ? await tx.leaseTenant.findFirst({
                    where: {
                      orgId: params.orgId,
                      membership: {
                        userId: file.uploadedBy,
                        orgId: params.orgId,
                      },
                      lease: {
                        unit: {
                          buildingId: { in: buildingIds },
                        },
                      },
                    },
                  })
                : null;
              if (!uploaderInBuilding) {
                throw ApiError.notFound('File not found');
              }
            }
          } else if (file.kind === 'receipt_pdf') {
            const receipt = await tx.receipt.findFirst({
              where: {
                orgId: params.orgId,
                fileId: file.id,
                payment: {
                  lease: {
                    unit: {
                      buildingId: { in: buildingIds },
                    },
                  },
                },
              },
            });
            if (!receipt) {
              throw ApiError.notFound('File not found');
            }
          } else if (file.kind === 'maintenance_photo') {
            const event = await tx.maintenanceEvent.findFirst({
              where: {
                orgId: params.orgId,
                fileId: file.id,
                request: {
                  buildingId: { in: buildingIds },
                },
              },
            });
            if (!event && file.uploadedBy !== params.userId) {
              const uploaderInBuilding = file.uploadedBy
                ? await tx.leaseTenant.findFirst({
                    where: {
                      orgId: params.orgId,
                      membership: {
                        userId: file.uploadedBy,
                        orgId: params.orgId,
                      },
                      lease: {
                        unit: {
                          buildingId: { in: buildingIds },
                        },
                      },
                    },
                  })
                : null;
              if (!uploaderInBuilding) {
                throw ApiError.notFound('File not found');
              }
            }
          } else {
            // Any other file kind (statement_pdf, settlement_pdf, etc.)
            throw ApiError.notFound('File not found');
          }
        }

        // Tenant permission check: own files or linked payment/receipt on their leases
        if (params.role === 'tenant') {
          let allowed = false;
          if (file.uploadedBy === params.userId) {
            allowed = true;
          } else {
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

        const variant = params.variant === 'thumb' && file.resourceType === 'image' ? 'thumb' : undefined;

        return await storage.getSignedUrl({
          fileId: file.id,
          publicId: file.publicId,
          resourceType: file.resourceType as 'image' | 'raw',
          format: file.format,
          expiresInSeconds: 300,
          variant,
        });
      },
    );
  }

  async serveLocalFile(params: { fileId: string; exp: string; sig: string; variant?: string }) {
    const expNum = Number(params.exp);
    if (!expNum || !params.sig) {
      throw ApiError.forbidden('Missing expiration or signature');
    }

    const now = clock.now().getTime();
    if (now > expNum) {
      throw ApiError.forbidden('Signed URL expired');
    }

    const secret = env.STORAGE_URL_SECRET || env.JWT_SECRET || 'local-storage-secret-dev-only';
    const variant = params.variant === 'thumb' ? 'thumb' : undefined;

    if (!verifyLocalSignature(params.fileId, expNum, params.sig, secret, variant)) {
      throw ApiError.forbidden('Invalid signature');
    }

    const result = await storage.readById(params.fileId, variant);
    if (!result) {
      throw ApiError.notFound('File not found');
    }

    return result;
  }
}
