import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';

/** Field names that must never reach a log line. */
const SECRET_KEYS = ['password', 'newPassword', 'currentPassword', 'token', 'refreshToken'] as const;

/**
 * Redaction paths required by 02-ARCHITECTURE.md and brief V1.
 * pino has no deep wildcard, so each secret key is listed at top level, one level and two levels deep.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

/** Query keys whose values are credentials or signed-URL material. */
const SENSITIVE_QUERY_KEYS = new Set(['token', 'sig', 'signature', 'code', 'state', 'exp']);

/** Returns the request URL with the values of sensitive query keys replaced by [REDACTED]. */
export function redactUrl(url: string | undefined): string {
  if (!url) return '';
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  for (const key of new Set(params.keys())) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) params.set(key, '[REDACTED]');
  }
  return `${url.slice(0, queryStart)}?${params.toString()}`;
}

export interface CreateLoggerOptions {
  level?: string;
  isTest?: boolean;
  /** Where to write; defaults to stdout. Tests pass a stream to capture output. */
  destination?: DestinationStream;
}

/**
 * Creates a structured Pino logger writing JSON with standardized redaction.
 * Shared by the api and the worker so both redact the same fields.
 */
export function createLogger(options?: CreateLoggerOptions): Logger {
  const level = options?.level || (options?.isTest ? 'silent' : 'info');

  const config = {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return options?.destination ? pino(config, options.destination) : pino(config);
}
