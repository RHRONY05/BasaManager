import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { publicConfigResponseSchema } from '@bm/shared/api/health';
import { HealthController } from './health.controller';
import type { Db } from '../../config/db';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env';

describe('HealthController', () => {
  const mockEnv: Env = {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    APP_URL: 'http://localhost:4000',
    PORT: 4000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379/0',
    SSLCOMMERZ_SANDBOX: true,
    PAYMENTS_MOCK: false,
    COOKIE_SECURE: false,
    STORAGE_DRIVER: 'local',
    SENTRY_RELEASE: 'abc1234',
    SENTRY_DSN_WEB: 'https://sentry.example.com/123',
    VAPID_PUBLIC_KEY: 'test-vapid-public-key',
  };

  const createTestApp = (
    prisma: Db,
    redis: Redis,
    env: Env = mockEnv
  ) => {
    const app = express();
    const controller = new HealthController(env, prisma, redis);

    app.get('/api/health', controller.getHealth);
    app.get('/api/ready', controller.getReady);
    app.get('/api/public-config', controller.getPublicConfig);

    return app;
  };

  describe('GET /api/public-config', () => {
    it('returns enveloped public configuration matching schema', async () => {
      // Mock db and redis clients
      const mockPrisma = {} as Db;
      const mockRedis = {} as Redis;

      const app = createTestApp(mockPrisma, mockRedis);
      const res = await request(app).get('/api/public-config');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        data: {
          appEnv: 'test',
          sentryDsn: 'https://sentry.example.com/123',
          vapidPublicKey: 'test-vapid-public-key',
        },
      });

      // Strict validation against shared schema
      const parsed = publicConfigResponseSchema.parse(res.body);
      expect(parsed.data.appEnv).toBe('test');
    });

    it('returns null for missing optional public keys', async () => {
      const minimalEnv: Env = {
        ...mockEnv,
        SENTRY_DSN_WEB: undefined,
        VAPID_PUBLIC_KEY: undefined,
      };

      const mockPrisma = {} as Db;
      const mockRedis = {} as Redis;

      const app = createTestApp(mockPrisma, mockRedis, minimalEnv);
      const res = await request(app).get('/api/public-config');

      expect(res.status).toBe(200);
      expect(res.body.data.sentryDsn).toBeNull();
      expect(res.body.data.vapidPublicKey).toBeNull();

      expect(() => publicConfigResponseSchema.parse(res.body)).not.toThrow();
    });
  });

  describe('GET /api/health', () => {
    it('returns bare ok status with SENTRY_RELEASE', async () => {
      const mockPrisma = {} as Db;
      const mockRedis = {} as Redis;

      const app = createTestApp(mockPrisma, mockRedis);
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        release: 'abc1234',
      });
    });

    it('defaults release to dev when SENTRY_RELEASE is absent', async () => {
      const devEnv: Env = {
        ...mockEnv,
        SENTRY_RELEASE: undefined,
      };
      const mockPrisma = {} as Db;
      const mockRedis = {} as Redis;

      const app = createTestApp(mockPrisma, mockRedis, devEnv);
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        release: 'dev',
      });
    });
  });

  describe('GET /api/ready', () => {
    it('returns 200 ready when DB and Redis are healthy', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
      } as unknown as Db;
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
      } as unknown as Redis;

      const app = createTestApp(mockPrisma, mockRedis);
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

    it('returns 503 not_ready with bare body when Redis fails', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
      } as unknown as Db;
      const mockRedis = {
        ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
      } as unknown as Redis;

      const app = createTestApp(mockPrisma, mockRedis);
      const res = await request(app).get('/api/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'not_ready',
        checks: {
          db: true,
          redis: false,
        },
      });
    });

    it('returns 503 not_ready when DB query fails', async () => {
      const mockPrisma = {
        $queryRaw: vi.fn().mockRejectedValue(new Error('DB unreachable')),
      } as unknown as Db;
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
      } as unknown as Redis;

      const app = createTestApp(mockPrisma, mockRedis);
      const res = await request(app).get('/api/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        status: 'not_ready',
        checks: {
          db: false,
          redis: true,
        },
      });
    });
  });
});
