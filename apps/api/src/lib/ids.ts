import crypto from 'node:crypto';

/**
 * Generates a new cryptographically random UUID for request tracing.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
