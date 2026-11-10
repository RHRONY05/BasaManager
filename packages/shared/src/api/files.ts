import { z } from 'zod';
import { fileKindSchema } from '../enums';

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
