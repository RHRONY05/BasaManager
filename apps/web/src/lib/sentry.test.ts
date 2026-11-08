import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import { SENTRY_DATA_COLLECTION, initSentry, scrubEvent } from './sentry';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

describe('web sentry privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scrubEvent removes cookies, headers and bodies', () => {
    const out = scrubEvent({
      request: { url: '/x', cookies: { a: 'b' }, headers: { c: 'd' }, data: { p: 1 } },
    });
    expect(out.request).toEqual({ url: '/x' });
  });

  it('collects nothing personal by default', () => {
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      urlQueryParams: false,
    });
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([]);
  });

  it('passes every collection switch off and the scrubber to Sentry.init when a DSN is given', () => {
    expect(initSentry({ appEnv: 'test', sentryDsn: 'https://k@example.ingest.sentry.io/1' } as never)).toBe(
      true,
    );
    const opts = vi.mocked(Sentry.init).mock.calls[0]![0]!;
    expect(opts.dataCollection).toEqual(SENTRY_DATA_COLLECTION);
    expect(opts.beforeSend).toBe(scrubEvent);
  });

  it('stays off without a DSN', () => {
    expect(initSentry({ appEnv: 'test', sentryDsn: null } as never)).toBe(false);
  });
});
