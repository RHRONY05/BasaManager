import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env.js';
import { clock } from '../../lib/clock.js';

function getEnvSafe(key: string, defaultVal = ''): string {
  try {
    return (env as unknown as Record<string, string>)[key] || defaultVal;
  } catch {
    return process.env[key] || defaultVal;
  }
}

export interface StorageDriver {
  save(params: {
    buffer: Buffer;
    thumbBuffer?: Buffer;
    mime: string;
    publicId: string;
    fileId?: string;
    resourceType: 'image' | 'raw';
  }): Promise<void>;
  getSignedUrl(params: {
    fileId: string;
    publicId: string;
    resourceType: 'image' | 'raw';
    format?: string;
    expiresInSeconds: number;
    variant?: 'thumb' | 'original';
  }): Promise<{ url: string; expiresAt: string }>;
  read(publicId: string): Promise<Buffer>;
  readById(fileId: string, variant?: 'thumb' | 'original'): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(publicId: string, resourceType: 'image' | 'raw'): Promise<void>;
}

export function createLocalSignature(
  fileId: string,
  expMs: number,
  secret: string,
  variant?: string,
): string {
  const payload = variant ? `${fileId}:${expMs}:${variant}` : `${fileId}:${expMs}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyLocalSignature(
  fileId: string,
  expMs: number,
  sig: string,
  secret: string,
  variant?: string,
): boolean {
  if (typeof sig !== 'string' || typeof secret !== 'string') return false;
  const expected = createLocalSignature(fileId, expMs, secret, variant);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
}

class LocalStorageDriver implements StorageDriver {
  private getBaseDir(): string {
    return getEnvSafe('STORAGE_LOCAL_DIR') || path.join(process.cwd(), '.data', 'uploads');
  }

  private getSecret(): string {
    const secret = getEnvSafe('STORAGE_URL_SECRET') || getEnvSafe('JWT_SECRET');
    if (!secret) {
      const appEnv = getEnvSafe('APP_ENV');
      if (appEnv === 'staging' || appEnv === 'prod') {
        throw new Error('STORAGE_URL_SECRET or JWT_SECRET must be configured in production/staging');
      }
      return 'local-storage-secret-dev-only';
    }
    return secret;
  }

  private filePath(subpath: string): string {
    const base = path.resolve(this.getBaseDir());
    const resolved = path.resolve(base, subpath);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async save(params: {
    buffer: Buffer;
    thumbBuffer?: Buffer;
    mime: string;
    publicId: string;
    fileId?: string;
    resourceType: 'image' | 'raw';
  }): Promise<void> {
    const fullPath = this.filePath(params.publicId);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.buffer);

    if (params.thumbBuffer) {
      await fs.writeFile(`${fullPath}_thumb`, params.thumbBuffer);
    }

    if (params.fileId) {
      const byIdDir = this.filePath('byId');
      await fs.mkdir(byIdDir, { recursive: true });
      await fs.writeFile(path.join(byIdDir, params.fileId), params.buffer);
      if (params.thumbBuffer) {
        await fs.writeFile(path.join(byIdDir, `${params.fileId}_thumb`), params.thumbBuffer);
      }
      await fs.writeFile(
        path.join(byIdDir, `${params.fileId}.meta.json`),
        JSON.stringify({
          mime: params.mime,
          publicId: params.publicId,
          fileId: params.fileId,
          hasThumb: !!params.thumbBuffer,
        }),
      );
    }
  }

  async getSignedUrl(params: {
    fileId: string;
    publicId: string;
    resourceType: 'image' | 'raw';
    format?: string;
    expiresInSeconds: number;
    variant?: 'thumb' | 'original';
  }): Promise<{ url: string; expiresAt: string }> {
    const expiresAtDate = new Date(clock.now().getTime() + params.expiresInSeconds * 1000);
    const expMs = expiresAtDate.getTime();
    const variant = params.variant === 'thumb' ? 'thumb' : undefined;
    const sig = createLocalSignature(params.fileId, expMs, this.getSecret(), variant);
    const variantQuery = variant ? `&variant=${variant}` : '';
    const url = `/api/files/local/${params.fileId}?exp=${expMs}&sig=${sig}${variantQuery}`;
    return {
      url,
      expiresAt: expiresAtDate.toISOString(),
    };
  }

  async read(publicId: string): Promise<Buffer> {
    const fullPath = this.filePath(publicId);
    return await fs.readFile(fullPath);
  }

  async readById(
    fileId: string,
    variant?: 'thumb' | 'original',
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(fileId)) {
      return null;
    }
    try {
      const byIdDir = this.filePath('byId');
      const metaPath = path.resolve(byIdDir, `${fileId}.meta.json`);
      if (!metaPath.startsWith(path.resolve(byIdDir) + path.sep)) {
        return null;
      }
      const metaRaw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaRaw);
      const targetFileName = variant === 'thumb' ? `${fileId}_thumb` : fileId;
      const targetFilePath = path.resolve(byIdDir, targetFileName);
      if (!targetFilePath.startsWith(path.resolve(byIdDir) + path.sep)) {
        return null;
      }
      const buffer = await fs.readFile(targetFilePath);
      return { buffer, mime: meta.mime };
    } catch {
      return null;
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      const fullPath = this.filePath(publicId);
      await fs.unlink(fullPath);
      try {
        await fs.unlink(`${fullPath}_thumb`);
      } catch {
        // Thumbnail unlink error ignored
      }
      try {
        const fileId = path.basename(publicId);
        const byIdDir = this.filePath('byId');
        await fs.unlink(path.join(byIdDir, fileId));
        await fs.unlink(path.join(byIdDir, `${fileId}.meta.json`));
        await fs.unlink(path.join(byIdDir, `${fileId}_thumb`));
      } catch {
        // byId unlink error ignored
      }
    } catch {
      // Ignore if already deleted
    }
  }
}

class CloudinaryStorageDriver implements StorageDriver {
  private configureCloudinary() {
    const cloudName = getEnvSafe('CLOUDINARY_CLOUD_NAME');
    const apiKey = getEnvSafe('CLOUDINARY_API_KEY');
    const apiSecret = getEnvSafe('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials are required when STORAGE_DRIVER=cloudinary');
    }
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  async save(params: {
    buffer: Buffer;
    thumbBuffer?: Buffer;
    mime: string;
    publicId: string;
    fileId?: string;
    resourceType: 'image' | 'raw';
  }): Promise<void> {
    this.configureCloudinary();

    await new Promise<void>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: params.publicId,
          resource_type: params.resourceType === 'image' ? 'image' : 'raw',
          type: 'authenticated',
          overwrite: true,
        },
        (error) => {
          if (error) reject(error);
          else resolve();
        },
      );
      uploadStream.end(params.buffer);
    });

    if (params.thumbBuffer) {
      await new Promise<void>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            public_id: `${params.publicId}_thumb`,
            resource_type: 'image',
            type: 'authenticated',
            overwrite: true,
          },
          (error) => {
            if (error) reject(error);
            else resolve();
          },
        );
        uploadStream.end(params.thumbBuffer);
      });
    }
  }

  async getSignedUrl(params: {
    fileId: string;
    publicId: string;
    resourceType: 'image' | 'raw';
    format?: string;
    expiresInSeconds: number;
    variant?: 'thumb' | 'original';
  }): Promise<{ url: string; expiresAt: string }> {
    this.configureCloudinary();

    const expiresAt = Math.floor(clock.now().getTime() / 1000) + params.expiresInSeconds;
    const targetPublicId = params.variant === 'thumb' ? `${params.publicId}_thumb` : params.publicId;

    const url = cloudinary.utils.private_download_url(targetPublicId, params.format || '', {
      resource_type: params.resourceType === 'image' ? 'image' : 'raw',
      type: 'authenticated',
      expires_at: expiresAt,
    });

    return {
      url,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  async read(publicId: string): Promise<Buffer> {
    this.configureCloudinary();
    const url = cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: Math.floor(clock.now().getTime() / 1000) + 60,
    });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cloudinary read failed with status ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async readById(): Promise<{ buffer: Buffer; mime: string } | null> {
    return null;
  }

  async delete(publicId: string, resourceType: 'image' | 'raw'): Promise<void> {
    this.configureCloudinary();
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === 'image' ? 'image' : 'raw',
      type: 'authenticated',
      invalidate: true,
    });
    if (resourceType === 'image') {
      try {
        await cloudinary.uploader.destroy(`${publicId}_thumb`, {
          resource_type: 'image',
          type: 'authenticated',
          invalidate: true,
        });
      } catch {
        // Thumbnail deletion failure ignored
      }
    }
  }
}

let instance: StorageDriver | null = null;
export function getStorage(): StorageDriver {
  if (!instance) {
    const driver = getEnvSafe('STORAGE_DRIVER', 'local');
    instance = driver === 'cloudinary' ? new CloudinaryStorageDriver() : new LocalStorageDriver();
  }
  return instance;
}

export const storage: StorageDriver = {
  save: (p) => getStorage().save(p),
  getSignedUrl: (p) => getStorage().getSignedUrl(p),
  read: (p) => getStorage().read(p),
  readById: (p, v) => getStorage().readById(p, v),
  delete: (p, r) => getStorage().delete(p, r),
};
