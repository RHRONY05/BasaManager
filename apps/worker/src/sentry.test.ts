import { describe, expect, it } from 'vitest';
import { initSentry } from '@bm/api/config/sentry';

describe('initSentry', () => {
  it('stays off without a DSN', () => {
    expect(initSentry({ dsn: undefined, release: 'abc', environment: 'test' })).toBe(false);
  });
});
