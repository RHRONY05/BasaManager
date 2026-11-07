import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { Writable } from 'node:stream';
import { ErrorCode } from '@bm/shared/errors';
import { createApp } from './app';
import { createLogger } from './lib/logger';
import type { Db } from './config/db';
import type { Env } from './config/env';
import type { Redis } from 'ioredis';

const env = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  APP_URL: 'http://localhost:4000',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x@localhost/x',
  REDIS_URL: 'redis://localhost:6379/0',
  SSLCOMMERZ_SANDBOX: true,
  PAYMENTS_MOCK: false,
  COOKIE_SECURE: false,
  STORAGE_DRIVER: 'local',
  SENTRY_RELEASE: 'rel-1',
  SENTRY_DSN_WEB: 'https://sentry.example.com/1',
  VAPID_PUBLIC_KEY: 'vapid-pub',
} as Env;

const nullStream = new Writable({
  write(_chunk, _enc, cb) {
    cb();
  },
});

function build(opts: { db?: 'ok' | 'fail' | 'hang'; redis?: 'ok' | 'fail' } = {}) {
  const queryRaw = vi.fn(() => {
    if (opts.db === 'fail') return Promise.reject(new Error('db down'));
    if (opts.db === 'hang') return new Promise(() => {});
    return Promise.resolve([{ '?column?': 1 }]);
  });
  const prisma = { $queryRaw: queryRaw } as unknown as Db;
  const redis = {
    ping: () => (opts.redis === 'fail' ? Promise.reject(new Error('redis down')) : Promise.resolve('PONG')),
  } as unknown as Redis;
  return createApp({ env, prisma, redis, logger: createLogger({ level: 'info', destination: nullStream }) });
}

describe('createApp', () => {
  it('GET /api/health -> 200 bare body with release', async () => {
    const res = await request(build()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', release: 'rel-1' });
  });

  it('GET /api/ready -> 200 when db and redis answer', async () => {
    const res = await request(build()).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { db: true, redis: true } });
  });

  it('GET /api/ready -> 503 when the db query fails', async () => {
    const res = await request(build({ db: 'fail' })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { db: false, redis: true } });
  });

  it('GET /api/ready -> 503 when redis fails', async () => {
    const res = await request(build({ redis: 'fail' })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ db: true, redis: false });
  });

  it('GET /api/ready -> 503 within about a second when the db hangs', async () => {
    const started = Date.now();
    const res = await request(build({ db: 'hang' })).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.db).toBe(false);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('GET /api/public-config -> enveloped public values only', async () => {
    const res = await request(build()).get('/api/public-config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { appEnv: 'test', sentryDsn: 'https://sentry.example.com/1', vapidPublicKey: 'vapid-pub' },
    });
  });

  it('unknown route -> 404 NOT_FOUND with requestId equal to the header', async () => {
    const res = await request(build()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('echoes an incoming x-request-id and generates one otherwise', async () => {
    const app = build();
    const echoed = await request(app).get('/api/health').set('X-Request-Id', 'req-abc-123');
    expect(echoed.headers['x-request-id']).toBe('req-abc-123');
    const generated = await request(app).get('/api/health');
    expect(generated.headers['x-request-id']).toMatch(/\S+/);
  });

  it('sets helmet security headers and hides x-powered-by', async () => {
    const res = await request(build()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
