import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import type { Express } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import { loadEnv } from '../src/config/env';
import { createPrisma, type Db } from '../src/config/db';
import { createRedis, type Redis } from '../src/config/redis';
import { createLogger } from '../src/lib/logger';
import { createApp } from '../src/app';

const envTestPath = path.resolve(process.cwd(), '.env.test');
if (fs.existsSync(envTestPath)) {
  try {
    process.loadEnvFile(envTestPath);
  } catch {
    // Already loaded
  }
}

// The JSON parser runs before routing, so any POST path exercises it (no business route needed yet).
describe('Body parser errors (body-errors.int.test.ts)', () => {
  let prisma: Db;
  let redis: Redis;
  let app: Express;

  beforeAll(() => {
    const env = loadEnv();
    prisma = createPrisma(env.DATABASE_URL);
    redis = createRedis(env.REDIS_URL);
    app = createApp({ env, prisma, redis, logger: createLogger({ isTest: true }) });
  });

  afterAll(async () => {
    await Promise.allSettled([prisma?.$disconnect(), redis?.quit()]);
  });

  it('malformed JSON -> 400 VALIDATION_FAILED', async () => {
    const res = await request(app).post('/api/anything').set('Content-Type', 'application/json').send('{bad');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('body over 100 kB -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(101 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
  });
});
