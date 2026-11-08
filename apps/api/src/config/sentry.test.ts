import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/node';
import { SENTRY_DATA_COLLECTION, initSentry, scrubEvent } from './sentry';

vi.mock('@sentry/node', () => ({ init: vi.fn() }));

describe('sentry privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scrubEvent removes cookies, headers and request bodies but keeps the rest', () => {
    const event = {
      message: 'boom',
      request: {
        url: '/api/x',
        cookies: { access: 'secret' },
        headers: { cookie: 'a=b' },
        data: { password: 'p' },
      },
    };
    const out = scrubEvent(event);
    expect(out.request).toEqual({ url: '/api/x' });
    expect(out.message).toBe('boom');
  });

  it('scrubEvent accepts an event without a request', () => {
    expect(scrubEvent({ message: 'x', request: undefined })).toEqual({ message: 'x', request: undefined });
  });

  it('initSentry passes every collection switch off and scrubs events', () => {
    const init = vi.mocked(Sentry.init);
    expect(
      initSentry({ dsn: 'https://k@example.ingest.sentry.io/1', release: 'abc', environment: 'test' }),
    ).toBe(true);
    const opts = init.mock.calls[0]![0]!;
    expect(opts.dataCollection).toEqual(SENTRY_DATA_COLLECTION);
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      urlQueryParams: false,
    });
    expect(opts.beforeSend).toBe(scrubEvent);
    expect(opts.release).toBe('abc');
  });

  it('initSentry stays off without a DSN', () => {
    const init = vi.mocked(Sentry.init);
    expect(initSentry({ dsn: undefined, release: 'abc', environment: 'test' })).toBe(false);
    expect(init).not.toHaveBeenCalled();
  });
});
