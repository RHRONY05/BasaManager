import { describe, expect, it, vi } from 'vitest';
import { SENTRY_DATA_COLLECTION, initSentry, scrubEvent } from './sentry';

vi.mock('@sentry/react', () => ({ init: vi.fn() }));

describe('web sentry privacy', () => {
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

  it('stays off without a DSN', () => {
    expect(initSentry({ appEnv: 'test', sentryDsn: null } as never)).toBe(false);
  });
});
