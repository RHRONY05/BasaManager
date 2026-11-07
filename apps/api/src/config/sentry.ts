import * as Sentry from '@sentry/node';

export interface SentryOptions {
  dsn: string | undefined;
  release: string | undefined;
  environment: string;
}

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
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
      }
      return event;
    },
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
