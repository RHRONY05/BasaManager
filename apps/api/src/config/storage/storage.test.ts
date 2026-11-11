import { describe, it, expect } from 'vitest';
import { createLocalSignature, verifyLocalSignature, getStorage } from './index.js';

describe('Storage configuration & LocalStorageDriver', () => {
  const secret = 'test-secret-12345';

  it('creates and verifies local signatures correctly', () => {
    const fileId = 'file-abc-123';
    const expMs = Date.now() + 60000;

    const sig = createLocalSignature(fileId, expMs, secret);
    expect(sig).toHaveLength(64);

    expect(verifyLocalSignature(fileId, expMs, sig, secret)).toBe(true);
    expect(verifyLocalSignature('other-file', expMs, sig, secret)).toBe(false);
    expect(verifyLocalSignature(fileId, expMs + 10, sig, secret)).toBe(false);
    expect(verifyLocalSignature(fileId, expMs, 'invalid-sig', secret)).toBe(false);
  });

  it('supports variant in signatures', () => {
    const fileId = 'file-abc-123';
    const expMs = Date.now() + 60000;

    const sigThumb = createLocalSignature(fileId, expMs, secret, 'thumb');
    const sigOriginal = createLocalSignature(fileId, expMs, secret);

    expect(sigThumb).not.toEqual(sigOriginal);
    expect(verifyLocalSignature(fileId, expMs, sigThumb, secret, 'thumb')).toBe(true);
    expect(verifyLocalSignature(fileId, expMs, sigThumb, secret)).toBe(false);
  });

  it('prevents path traversal in local storage driver', async () => {
    const driver = getStorage();
    await expect(
      driver.save({
        buffer: Buffer.from('hello'),
        mime: 'text/plain',
        publicId: '../../etc/passwd',
        resourceType: 'raw',
      }),
    ).rejects.toThrow('Path traversal detected');
  });

  it('saves, reads, signs and deletes local files', async () => {
    const driver = getStorage();
    const fileId = `test-${Date.now()}`;
    const publicId = `basamanager/test/org/org-1/document/${fileId}`;
    const buffer = Buffer.from('file-contents-test');
    const thumbBuffer = Buffer.from('thumb-contents-test');

    await driver.save({
      buffer,
      thumbBuffer,
      mime: 'image/png',
      publicId,
      fileId,
      resourceType: 'image',
    });

    // Read by publicId
    const readBuf = await driver.read(publicId);
    expect(readBuf.toString()).toEqual('file-contents-test');

    // Read by fileId
    const readOriginal = await driver.readById(fileId);
    expect(readOriginal).not.toBeNull();
    expect(readOriginal?.buffer.toString()).toEqual('file-contents-test');
    expect(readOriginal?.mime).toEqual('image/png');

    // Read by fileId (thumb)
    const readThumb = await driver.readById(fileId, 'thumb');
    expect(readThumb).not.toBeNull();
    expect(readThumb?.buffer.toString()).toEqual('thumb-contents-test');

    // Signed URLs
    const signedOriginal = await driver.getSignedUrl({
      fileId,
      publicId,
      resourceType: 'image',
      expiresInSeconds: 300,
    });
    expect(signedOriginal.url).toContain(`/api/files/local/${fileId}?exp=`);

    const signedThumb = await driver.getSignedUrl({
      fileId,
      publicId,
      resourceType: 'image',
      expiresInSeconds: 300,
      variant: 'thumb',
    });
    expect(signedThumb.url).toContain(`variant=thumb`);

    // Delete
    await driver.delete(publicId, 'image');
    const afterDelete = await driver.readById(fileId);
    expect(afterDelete).toBeNull();
  });
});
