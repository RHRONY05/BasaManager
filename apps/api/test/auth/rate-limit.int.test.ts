import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ErrorCode } from '@bm/shared/errors';
import { createRateLimiters } from '../../src/middleware/rateLimit';
import { errorHandler } from '../../src/middleware/errorHandler';
import { buildTestApp, resetAll, type TestCtx } from '../helpers/auth';

describe('rate limiters: authSensitive and general return 429 after the limit', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  function appWith(limit: number) {
    const l = createRateLimiters(ctx.redis, { authSensitiveLimit: limit, generalLimit: limit });
    const app = express();
    app.post('/sensitive', l.authSensitiveLimiter, (_req, res) => res.json({ ok: true }));
    app.post('/general', l.generalLimiter, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    return app;
  }

  it.each(['/sensitive', '/general'])(
    '%s: allows the limit then answers RATE_LIMITED (429)',
    async (path) => {
      const app = appWith(3);
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post(path)).status).toBe(200);
      }
      const res = await request(app).post(path);
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    },
  );

  it('the two limiters count separately', async () => {
    const app = appWith(1);
    expect((await request(app).post('/sensitive')).status).toBe(200);
    expect((await request(app).post('/sensitive')).status).toBe(429);
    expect((await request(app).post('/general')).status).toBe(200);
  });
});
