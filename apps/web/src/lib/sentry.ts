import * as Sentry from '@sentry/react';
import type { PublicConfig } from '@bm/shared';

/** Strips cookies, headers and bodies from an event before it is sent. */
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

export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} as const;

/**
 * Starts Sentry in the browser. The DSN is not baked into the build: it comes from `/api/public-config`, so the
 * same image runs in staging and prod. The release (git SHA) is baked at build time (`VITE_RELEASE`) because the
 * source maps uploaded to Sentry in CI are keyed by it. No DSN = off.
 */
export function initSentry(config: Pick<PublicConfig, 'appEnv' | 'sentryDsn'>): boolean {
  if (!config.sentryDsn) return false;
  Sentry.init({
    dsn: config.sentryDsn,
    release: import.meta.env.VITE_RELEASE || undefined,
    environment: config.appEnv,
    // Privacy: collect no user info, cookies, headers, bodies or query strings (user context = user id only, set later).
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    tracesSampleRate: 0.1,
    beforeSend: scrubEvent,
  });
  return true;
}

/** Reports an error the UI caught (e.g. a route error boundary). A no-op when Sentry is off. */
export function captureError(err: unknown): void {
  Sentry.captureException(err);
}
