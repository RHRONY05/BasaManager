import type { Request, Response } from 'express';
import type { Db } from '../../config/db';
import { pingDb } from '../../config/db';
import type { Redis } from 'ioredis';
import { pingRedis } from '../../config/redis';
import type { Env } from '../../config/env';
import type { HealthResponse, ReadyResponse, PublicConfigResponse } from '@bm/shared/api/health';

export class HealthController {
  constructor(
    private readonly env: Env,
    private readonly prisma: Db,
    private readonly redis: Redis,
  ) {}

  /**
   * GET /api/health (probe endpoint, bare body)
   */
  public getHealth = (_req: Request, res: Response): void => {
    const release = this.env.SENTRY_RELEASE || 'dev';
    const body: HealthResponse = {
      status: 'ok',
      release,
    };
    res.status(200).json(body);
  };

  /**
   * GET /api/ready (probe endpoint, bare body)
   * Answers 200 when DB and Redis answer within 1 second; otherwise 503 with the same bare shape.
   */
  public getReady = async (_req: Request, res: Response): Promise<void> => {
    const [dbOk, redisOk] = await Promise.all([pingDb(this.prisma, 1000), pingRedis(this.redis, 1000)]);

    const isReady = dbOk && redisOk;
    const body: ReadyResponse = {
      status: isReady ? 'ready' : 'not_ready',
      checks: {
        db: dbOk,
        redis: redisOk,
      },
    };

    res.status(isReady ? 200 : 503).json(body);
  };

  /**
   * GET /api/public-config (app route, enveloped)
   */
  public getPublicConfig = (_req: Request, res: Response): void => {
    const body: PublicConfigResponse = {
      data: {
        appEnv: this.env.APP_ENV,
        sentryDsn: this.env.SENTRY_DSN_WEB || null,
        vapidPublicKey: this.env.VAPID_PUBLIC_KEY || null,
      },
    };
    res.status(200).json(body);
  };
}
