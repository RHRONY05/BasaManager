import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../env.js';
import { clock } from '../../lib/clock.js';

export interface StorageDriver {
  save(params: {
    buffer: Buffer;
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
  }): Promise<{ url: string; expiresAt: string }>;
  read(publicId: string): Promise<Buffer>;
  readById(fileId: string): Promise<{ buffer: Buffer; mime: string } | null>;
  delete(publicId: string, resourceType: 'image' | 'raw'): Promise<void>;
}

export function createLocalSignature(fileId: string, expMs: number, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${fileId}:${expMs}`).digest('hex');
}

export function verifyLocalSignature(fileId: string, expMs: number, sig: string, secret: string): boolean {
  const expected = createLocalSignature(fileId, expMs, secret);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
}

class LocalStorageDriver implements StorageDriver {
  private getBaseDir(): string {
    return env.STORAGE_LOCAL_DIR || path.join(process.cwd(), '.data', 'uploads');
  }

  private getSecret(): string {
    return env.STORAGE_URL_SECRET || env.JWT_SECRET || 'local-storage-secret';
  }

  private filePath(subpath: string): string {
    return path.join(this.getBaseDir(), subpath);
  }

  async save(params: {
    buffer: Buffer;
    mime: string;
    publicId: string;
    fileId?: string;
    resourceType: 'image' | 'raw';
  }): Promise<void> {
    const fullPath = this.filePath(params.publicId);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, params.buffer);

    if (params.fileId) {
      const byIdDir = this.filePath('byId');
      await fs.mkdir(byIdDir, { recursive: true });
      await fs.writeFile(path.join(byIdDir, params.fileId), params.buffer);
      await fs.writeFile(
        path.join(byIdDir, `${params.fileId}.meta.json`),
        JSON.stringify({ mime: params.mime, publicId: params.publicId, fileId: params.fileId }),
      );
    }
  }

  async getSignedUrl(params: {
    fileId: string;
    publicId: string;
    resourceType: 'image' | 'raw';
    format?: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    const expiresAtDate = new Date(clock.now().getTime() + params.expiresInSeconds * 1000);
    const expMs = expiresAtDate.getTime();
    const sig = createLocalSignature(params.fileId, expMs, this.getSecret());
    const url = `/api/files/local/${params.fileId}?exp=${expMs}&sig=${sig}`;
    return {
      url,
      expiresAt: expiresAtDate.toISOString(),
    };
  }

  async read(publicId: string): Promise<Buffer> {
    const fullPath = this.filePath(publicId);
    return await fs.readFile(fullPath);
  }

  async readById(fileId: string): Promise<{ buffer: Buffer; mime: string } | null> {
    try {
      const byIdDir = this.filePath('byId');
      const metaRaw = await fs.readFile(path.join(byIdDir, `${fileId}.meta.json`), 'utf-8');
      const meta = JSON.parse(metaRaw);
      const buffer = await fs.readFile(path.join(byIdDir, fileId));
      return { buffer, mime: meta.mime };
    } catch {
      return null;
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      const fullPath = this.filePath(publicId);
      await fs.unlink(fullPath);
    } catch {
      // Ignore if already deleted
    }
  }
}

class CloudinaryStorageDriver implements StorageDriver {
  private localFallback = new LocalStorageDriver();

  private configureCloudinary() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  async save(params: {
    buffer: Buffer;
    mime: string;
    publicId: string;
    fileId?: string;
    resourceType: 'image' | 'raw';
  }): Promise<void> {
    await this.localFallback.save(params);
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      return;
    }
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
  }

  async getSignedUrl(params: {
    fileId: string;
    publicId: string;
    resourceType: 'image' | 'raw';
    format?: string;
    expiresInSeconds: number;
  }): Promise<{ url: string; expiresAt: string }> {
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      return this.localFallback.getSignedUrl(params);
    }
    this.configureCloudinary();

    const expiresAt = Math.floor(clock.now().getTime() / 1000) + params.expiresInSeconds;
    const url = cloudinary.utils.private_download_url(params.publicId, params.format || '', {
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
    return this.localFallback.read(publicId);
  }

  async readById(fileId: string): Promise<{ buffer: Buffer; mime: string } | null> {
    return this.localFallback.readById(fileId);
  }

  async delete(publicId: string, resourceType: 'image' | 'raw'): Promise<void> {
    await this.localFallback.delete(publicId);
    if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
      return;
    }
    this.configureCloudinary();

    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === 'image' ? 'image' : 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  }
}

let instance: StorageDriver | null = null;
export function getStorage(): StorageDriver {
  if (!instance) {
    instance = env.STORAGE_DRIVER === 'cloudinary' ? new CloudinaryStorageDriver() : new LocalStorageDriver();
  }
  return instance;
}

export const storage: StorageDriver = {
  save: (p) => getStorage().save(p),
  getSignedUrl: (p) => getStorage().getSignedUrl(p),
  read: (p) => getStorage().read(p),
  readById: (p) => getStorage().readById(p),
  delete: (p, r) => getStorage().delete(p, r),
};
