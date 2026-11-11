import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { FilesService } from './files.service.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { FileKind } from '@bm/shared/enums';

const uploadMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single('file');

export function handleFileUploadMiddleware(req: Request, res: Response, next: NextFunction) {
  uploadMulter(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(ErrorCode.PAYLOAD_TOO_LARGE, 'File exceeds 5 MB limit'));
      }
      return next(err);
    }
    next();
  });
}

export class FilesController {
  constructor(private readonly service: FilesService) {}

  upload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ApiError(ErrorCode.VALIDATION_FAILED, 'No file uploaded');
      }
      const kind = req.body.kind as FileKind;
      if (!kind) {
        throw new ApiError(ErrorCode.VALIDATION_FAILED, 'kind is required');
      }

      const result = await this.service.uploadFile({
        orgId: req.org!.id,
        userId: req.user!.id,
        kind,
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
      });

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fileId = req.params.id as string;
      const variant = req.query.variant as string | undefined;

      const result = await this.service.getFileSignedUrl({
        fileId,
        orgId: req.org!.id,
        userId: req.user!.id,
        role: req.org!.role,
        variant,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  serveLocal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fileId = req.params.id as string;
      const exp = req.query.exp as string;
      const sig = req.query.sig as string;

      const result = await this.service.serveLocalFile({
        fileId,
        exp,
        sig,
      });

      res.setHeader('Content-Type', result.mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  };
}
