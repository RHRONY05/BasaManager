import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { loadEnv, type Env } from '../src/config/env';
import { createPrisma, type Db } from '../src/config/db';
import { createRedis, type Redis } from '../src/config/redis';
import { createLogger } from '../src/lib/logger';
import { createApp } from '../src/app';
import type { Express } from 'express';
import { ErrorCode } from '@bm/shared/errors';

// Ensure .env.test is loaded in case vitest did not run globalSetup
const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // Ignore if already loaded
  }
}

describe('Ready & Health Integration (ready.int.test.ts)', () => {
  let env: Env;
  let prisma: Db;
  let redis: Redis;
  let app: Express;

  beforeAll(async () => {
    env = loadEnv();
    prisma = createPrisma(env.DATABASE_URL);
    redis = createRedis(env.REDIS_URL);
    const logger = createLogger({ isTest: true });
    app = createApp({ env, prisma, redis, logger });
  });

  afterAll(async () => {
    await Promise.allSettled([
      prisma?.$disconnect(),
      redis?.quit(),
    ]);
  });

  it('GET /api/health -> 200 with bare body', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      release: expect.any(String),
    });
  });

  it('GET /api/ready -> 200 with both checks true', async () => {
    const res = await request(app).get('/api/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ready',
      checks: {
        db: true,
        redis: true,
      },
    });
  });

  it('GET /api/ready with closed Redis port -> 503 not_ready within ~1.5 s', async () => {
    // Port 59999 is closed and unreachable
    const closedRedis = createRedis('redis://:redis_dev@127.0.0.1:59999/0');
    const logger = createLogger({ isTest: true });
    const degradedApp = createApp({
      env,
      prisma,
      redis: closedRedis,
      logger,
    });

    const start = Date.now();
    const res = await request(degradedApp).get('/api/ready');
    const duration = Date.now() - start;

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'not_ready',
      checks: {
        db: true,
        redis: false,
      },
    });

    // Verify ping timeout bound (~1000ms timeout + small overhead, well under 2.5s)
    expect(duration).toBeLessThan(2500);

    // Clean up closed port client
    await closedRedis.quit().catch(() => {});
    closedRedis.disconnect();
  });

  it('GET /api/nope -> 404 shared error body with requestId', async () => {
    const res = await request(app).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: expect.stringContaining('/api/nope'),
        requestId: expect.any(String),
      },
    });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });
});
