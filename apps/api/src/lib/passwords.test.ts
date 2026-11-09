import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  isCommonPassword,
  validatePassword,
} from './passwords';
import { ApiError } from './ApiError';

describe('passwords lib', () => {
  it('hashes and verifies a password with argon2id', async () => {
    const raw = 'Correct-Horse-Battery-Staple-99';
    const hash = await hashPassword(raw);
    expect(hash).toContain('$argon2id$');

    const ok = await verifyPassword(hash, raw);
    expect(ok).toBe(true);

    const bad = await verifyPassword(hash, 'wrong-password-1234');
    expect(bad).toBe(false);
  });

  it('detects common passwords from the common list', () => {
    expect(isCommonPassword('1234567890')).toBe(true);
    expect(isCommonPassword('password123')).toBe(true);
    expect(isCommonPassword('qwertyuiop')).toBe(true);
    expect(isCommonPassword('Unique-Not-Common-Pass-7788')).toBe(false);
  });

  it('validates password length and complexity', () => {
    expect(() => validatePassword('short', 'password')).toThrow(ApiError);
    expect(() => validatePassword('1234567890', 'password')).toThrow(ApiError);
    expect(() => validatePassword('Strong-Unique-Pass-2026', 'password')).not.toThrow();
  });
});
