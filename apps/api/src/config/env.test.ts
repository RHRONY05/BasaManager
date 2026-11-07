import { describe, it, expect } from 'vitest';
import { loadEnv } from './env';

const baseValidEnv = {
  NODE_ENV: 'development',
  APP_ENV: 'dev',
  APP_URL: 'http://localhost:5173',
  PORT: '4000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://bm_app:bm_app_dev@localhost:5432/basamanager_dev',
  REDIS_URL: 'redis://:redis_dev@localhost:6379/0',
  SSLCOMMERZ_SANDBOX: 'true',
  PAYMENTS_MOCK: 'false',
  COOKIE_SECURE: 'false',
};

describe('loadEnv', () => {
  it('parses valid environment variables', () => {
    const parsed = loadEnv(baseValidEnv);
    expect(parsed.APP_ENV).toBe('dev');
    expect(parsed.PORT).toBe(4000);
    expect(parsed.DATABASE_URL).toBe(baseValidEnv.DATABASE_URL);
    expect(parsed.SSLCOMMERZ_SANDBOX).toBe(true);
    expect(parsed.PAYMENTS_MOCK).toBe(false);
  });

  it('refuses missing DATABASE_URL with a readable error listing the bad key', () => {
    const invalidEnv = { ...baseValidEnv, DATABASE_URL: '' };
    expect(() => loadEnv(invalidEnv)).toThrow(/DATABASE_URL/);
  });

  it('refuses PAYMENTS_MOCK=true when APP_ENV is prod', () => {
    const invalidEnv = {
      ...baseValidEnv,
      APP_ENV: 'prod',
      COOKIE_SECURE: 'true',
      PAYMENTS_MOCK: 'true',
    };
    expect(() => loadEnv(invalidEnv)).toThrow(/PAYMENTS_MOCK/);
  });

  it('refuses CLOCK_OVERRIDE when APP_ENV is staging', () => {
    const invalidEnv = {
      ...baseValidEnv,
      APP_ENV: 'staging',
      COOKIE_SECURE: 'true',
      CLOCK_OVERRIDE: '2026-11-08T00:00:00Z',
    };
    expect(() => loadEnv(invalidEnv)).toThrow(/CLOCK_OVERRIDE/);
  });

  it('allows CLOCK_OVERRIDE when APP_ENV is dev or test', () => {
    const devEnv = {
      ...baseValidEnv,
      APP_ENV: 'dev',
      CLOCK_OVERRIDE: '2026-11-08T00:00:00Z',
    };
    expect(loadEnv(devEnv).CLOCK_OVERRIDE).toBe('2026-11-08T00:00:00Z');

    const testEnv = {
      ...baseValidEnv,
      APP_ENV: 'test',
      CLOCK_OVERRIDE: '2026-11-08T00:00:00Z',
    };
    expect(loadEnv(testEnv).CLOCK_OVERRIDE).toBe('2026-11-08T00:00:00Z');
  });

  it('refuses a CLOCK_OVERRIDE that is not an ISO datetime', () => {
    for (const bad of ['yesterday', '2026-11-08', '2026-13-45T00:00:00Z', '2026-11-08 00:00:00']) {
      expect(() => loadEnv({ ...baseValidEnv, APP_ENV: 'dev', CLOCK_OVERRIDE: bad })).toThrow(
        /CLOCK_OVERRIDE/,
      );
    }
  });

  it('accepts CLOCK_OVERRIDE with an offset and treats empty as unset', () => {
    expect(
      loadEnv({ ...baseValidEnv, APP_ENV: 'dev', CLOCK_OVERRIDE: '2026-11-08T06:00:00+06:00' })
        .CLOCK_OVERRIDE,
    ).toBe('2026-11-08T06:00:00+06:00');
    expect(
      loadEnv({ ...baseValidEnv, APP_ENV: 'staging', COOKIE_SECURE: 'true', CLOCK_OVERRIDE: '' })
        .CLOCK_OVERRIDE,
    ).toBeUndefined();
  });

  it('refuses SSLCOMMERZ_SANDBOX=false in any environment', () => {
    const invalidEnv = {
      ...baseValidEnv,
      SSLCOMMERZ_SANDBOX: 'false',
    };
    expect(() => loadEnv(invalidEnv)).toThrow(/SSLCOMMERZ_SANDBOX/);
  });

  it('refuses COOKIE_SECURE=false when APP_ENV is prod or staging', () => {
    const invalidEnv = {
      ...baseValidEnv,
      APP_ENV: 'prod',
      COOKIE_SECURE: 'false',
    };
    expect(() => loadEnv(invalidEnv)).toThrow(/COOKIE_SECURE/);
  });

  it('accepts COOKIE_SECURE=true when APP_ENV is prod', () => {
    const validProdEnv = {
      ...baseValidEnv,
      APP_ENV: 'prod',
      COOKIE_SECURE: 'true',
    };
    const parsed = loadEnv(validProdEnv);
    expect(parsed.APP_ENV).toBe('prod');
    expect(parsed.COOKIE_SECURE).toBe(true);
  });
});

describe('lazy env proxy', () => {
  it('parses process.env on first access and exposes keys and descriptors', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    for (const [k, v] of Object.entries(baseValidEnv)) vi.stubEnv(k, v);
    try {
      const mod = await import('./env');
      expect(mod.env.PORT).toBe(4000);
      expect(Object.keys(mod.env)).toContain('DATABASE_URL');
      expect(Object.getOwnPropertyDescriptor(mod.env, 'APP_ENV')?.value).toBe('dev');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('throws a readable CONFIG ERROR on first access when process.env is invalid', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.stubEnv('APP_ENV', 'nonsense');
    vi.stubEnv('DATABASE_URL', '');
    try {
      const mod = await import('./env');
      expect(() => mod.env.PORT).toThrow(/CONFIG ERROR/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
