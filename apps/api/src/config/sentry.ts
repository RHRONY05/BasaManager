import * as Sentry from '@sentry/node';

export interface SentryOptions {
  dsn: string | undefined;
  release: string | undefined;
  environment: string;
}

/** Strips everything that could carry personal data from an event before it leaves the process. */
export function scrubEvent<T extends { request?: { cookies?: unknown; headers?: unknown; data?: unknown } }>(
  event: T,
): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  return event;
}

/** The privacy settings passed to Sentry.init (exported so a test can assert every collection switch is off). */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} as const;

/**
 * Starts Sentry for a Node process (api or worker). No DSN = Sentry stays off (dev, tests).
 * Privacy (02-ARCHITECTURE.md Observability): no default PII, and cookies, headers and request bodies are
 * stripped before an event leaves the process. Returns whether Sentry is on.
 */
export function initSentry(options: SentryOptions): boolean {
  if (!options.dsn) return false;
  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,
    // Privacy: collect no user info, cookies, headers, bodies or query strings (user context = user id only, set later).
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    // Performance tracing stays off until V16: Sentry is initialised after Express is imported, so the automatic
    // HTTP/Express instrumentation would not be active anyway (it needs `node --import ./instrument` to load first).
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
  return true;
}

/** Reports an unexpected error. A no-op when Sentry was not started. */
export function captureError(err: unknown): void {
  Sentry.captureException(err);
}

/** Sends pending events; call before a process exits on purpose. */
export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  return Sentry.flush(timeoutMs);
}
