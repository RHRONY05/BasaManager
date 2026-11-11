import { z } from 'zod';
import { fileKindSchema } from '../enums';

export const fileParamsSchema = z.object({
  id: z.string().uuid(),
});
export type FileParams = z.infer<typeof fileParamsSchema>;

export const signedUrlQuerySchema = z.object({
  variant: z.enum(['thumb', 'original']).optional(),
});
export type SignedUrlQuery = z.infer<typeof signedUrlQuerySchema>;

export const serveLocalQuerySchema = z.object({
  exp: z.string().regex(/^\d+$/),
  sig: z.string().min(1),
  variant: z.enum(['thumb', 'original']).optional(),
});
export type ServeLocalQuery = z.infer<typeof serveLocalQuerySchema>;

export const uploadFileBodySchema = z.object({
  kind: fileKindSchema,
});
export type UploadFileBody = z.infer<typeof uploadFileBodySchema>;

export const uploadFileResponseSchema = z.object({
  fileId: z.string().uuid(),
  publicId: z.string(),
  kind: fileKindSchema,
  sizeBytes: z.number().int(),
  mime: z.string(),
  url: z.string().optional(),
});
export type UploadFileResponse = z.infer<typeof uploadFileResponseSchema>;

export const signedUrlResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
});
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;
