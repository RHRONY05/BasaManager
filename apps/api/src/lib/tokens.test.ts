import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  generateRandomToken,
  generateCsrfToken,
  sha256,
} from './tokens';

describe('tokens lib', () => {
  const secret = 'super-secret-key-that-is-at-least-32-characters-long';

  it('signs and verifies access JWT', async () => {
    const claims = { sub: 'user-1', sid: 'session-1', adm: false };
    const token = await signAccessToken(claims, secret, 900);
    expect(typeof token).toBe('string');

    const decoded = await verifyAccessToken(token, secret);
    expect(decoded?.sub).toBe('user-1');
    expect(decoded?.sid).toBe('session-1');
    expect(decoded?.adm).toBe(false);
  });

  it('returns null on wrong secret or malformed token', async () => {
    const claims = { sub: 'user-1', sid: 'session-1', adm: false };
    const token = await signAccessToken(claims, secret, 900);

    expect(await verifyAccessToken(token, 'different-secret-key-32-chars-long')).toBeNull();
    expect(await verifyAccessToken('malformed.jwt.token', secret)).toBeNull();
  });

  it('generates 32-byte base64url refresh tokens', () => {
    const token = generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('computes sha256 as Uint8Array', () => {
    const hash = sha256('hello-world');
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('generates random tokens and csrf tokens', () => {
    const t = generateRandomToken(16);
    expect(t.length).toBe(22);

    const csrf = generateCsrfToken();
    expect(csrf.length).toBeGreaterThanOrEqual(40);
  });
});
