import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { FilesService } from './files.service.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { UploadFileBody, SignedUrlQuery, ServeLocalQuery } from '@bm/shared/api/files';

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
      const body = (res.locals?.validated?.body || req.body) as UploadFileBody;
      if (!body?.kind) {
        throw new ApiError(ErrorCode.VALIDATION_FAILED, 'kind is required');
      }

      const result = await this.service.uploadFile({
        orgId: req.org!.id,
        userId: req.user!.id,
        kind: body.kind,
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
      const params = (res.locals?.validated?.params || req.params) as { id: string };
      const query = (res.locals?.validated?.query || req.query) as SignedUrlQuery;

      const result = await this.service.getFileSignedUrl({
        fileId: params.id,
        orgId: req.org!.id,
        userId: req.user!.id,
        role: req.org!.role,
        variant: query?.variant,
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  serveLocal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = (res.locals?.validated?.params || req.params) as { id: string };
      const query = (res.locals?.validated?.query || req.query) as ServeLocalQuery;

      const result = await this.service.serveLocalFile({
        fileId: params.id,
        exp: query.exp,
        sig: query.sig,
        variant: query.variant,
      });

      res.setHeader('Content-Type', result.mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  };
}
