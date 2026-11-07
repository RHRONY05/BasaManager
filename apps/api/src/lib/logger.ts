import pino from 'pino';
import type { Logger } from 'pino';

/**
 * Redaction paths required by 02-ARCHITECTURE.md and brief V1.
 * Masks credentials, session cookies, auth tokens, and sensitive headers.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.refreshToken',
];

export interface CreateLoggerOptions {
  level?: string;
  isTest?: boolean;
}

/**
 * Creates a structured Pino logger writing JSON to stdout with standardized redaction.
 */
export function createLogger(options?: CreateLoggerOptions): Logger {
  const level = options?.level || (options?.isTest ? 'silent' : 'info');

  return pino({
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
