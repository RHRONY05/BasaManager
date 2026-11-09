import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  adm: boolean;
}

/**
 * Returns SHA-256 digest of input as a Uint8Array (32 bytes).
 */
export function sha256(data: string | Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = createHash('sha256').update(data).digest();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) as Uint8Array<ArrayBuffer>;
}

/**
 * Generates an opaque random token (base64url string, default 32 bytes = 43 chars).
 */
export function generateRandomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Generates a fresh 32-byte refresh token.
 */
export function generateRefreshToken(): string {
  return generateRandomToken(32);
}

/**
 * Generates a fresh CSRF token.
 */
export function generateCsrfToken(): string {
  return generateRandomToken(32);
}

/**
 * Signs an HS256 access JWT (15-min TTL by default).
 */
export async function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  ttlSeconds = 900,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({
    sub: payload.sub,
    sid: payload.sid,
    adm: payload.adm,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}

/**
 * Verifies an HS256 access JWT, returning null if invalid or expired.
 */
export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenPayload | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      return null;
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      adm: Boolean(payload.adm),
    };
  } catch {
    return null;
  }
}
