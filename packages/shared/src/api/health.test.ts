import { describe, expect, it } from 'vitest';
import {
  healthResponseSchema,
  publicConfigResponseSchema,
  publicConfigSchema,
  readyResponseSchema,
} from './health';

describe('healthResponseSchema', () => {
  it('accepts ok with a release', () => {
    expect(healthResponseSchema.parse({ status: 'ok', release: 'abc123' })).toEqual({
      status: 'ok',
      release: 'abc123',
    });
  });

  it('rejects any other status', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', release: 'x' }).success).toBe(false);
  });
});

describe('readyResponseSchema', () => {
  it('accepts ready and not_ready', () => {
    expect(
      readyResponseSchema.safeParse({ status: 'ready', checks: { db: true, redis: true } }).success,
    ).toBe(true);
    expect(
      readyResponseSchema.safeParse({ status: 'not_ready', checks: { db: false, redis: true } }).success,
    ).toBe(true);
  });

  it('requires both checks', () => {
    expect(readyResponseSchema.safeParse({ status: 'ready', checks: { db: true } }).success).toBe(false);
  });
});

describe('publicConfigSchema', () => {
  it('accepts nulls for missing public keys', () => {
    const cfg = { appEnv: 'dev', sentryDsn: null, vapidPublicKey: null };
    expect(publicConfigSchema.parse(cfg)).toEqual(cfg);
  });

  it('rejects an unknown appEnv and undefined keys', () => {
    expect(
      publicConfigSchema.safeParse({ appEnv: 'local', sentryDsn: null, vapidPublicKey: null }).success,
    ).toBe(false);
    expect(publicConfigSchema.safeParse({ appEnv: 'prod' }).success).toBe(false);
  });

  it('is enveloped as { data } on the wire', () => {
    const body = {
      data: { appEnv: 'prod', sentryDsn: 'https://k@o1.ingest.sentry.io/1', vapidPublicKey: 'BPk' },
    };
    expect(publicConfigResponseSchema.parse(body)).toEqual(body);
    expect(publicConfigResponseSchema.safeParse(body.data).success).toBe(false);
  });
});
