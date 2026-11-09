import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { ApiError } from './ApiError';

let cachedCommonPasswords: Set<string> | null = null;

function getCommonPasswords(): Set<string> {
  if (cachedCommonPasswords !== null) {
    return cachedCommonPasswords;
  }

  const set = new Set<string>();
  try {
    const filePath = fileURLToPath(new URL('../modules/auth/common-passwords.txt', import.meta.url));
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim().toLowerCase();
        if (trimmed.length > 0) {
          set.add(trimmed);
        }
      }
    }
  } catch {
    // If reading fails, keep fallback set
  }

  // Fallback defaults to ensure core common patterns are always present
  set.add('1234567890');
  set.add('password123');
  set.add('qwertyuiop');

  cachedCommonPasswords = set;
  return set;
}

/**
 * Checks whether a password is in the common passwords list or contains only digits.
 */
export function isCommonPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return true;
  }
  return getCommonPasswords().has(normalized);
}

/**
 * Validates password strength:
 * - Minimum 10 characters
 * - Not in the top-10k common password list
 * Throws ApiError.validation if invalid.
 */
export function validatePassword(password: string, field = 'password'): void {
  if (!password || password.length < 10) {
    throw ApiError.validation([{ path: field, message: 'Password must be at least 10 characters long' }]);
  }

  if (isCommonPassword(password)) {
    throw ApiError.validation([{ path: field, message: 'Password is too common or weak' }]);
  }
}

/**
 * Hashes a password using argon2id with production parameters:
 * m=19456 (19 MiB), t=2, p=1
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

/**
 * Verifies a password against an argon2 hash.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
