import { Router } from 'express';
import type { Db } from '../../config/db';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env';
import { HealthController } from './health.controller';

export interface HealthRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createHealthRoutes(deps: HealthRouteDeps): Router {
  const router = Router();
  const controller = new HealthController(deps.env, deps.prisma, deps.redis);

  router.get('/health', controller.getHealth);
  router.get('/ready', controller.getReady);
  router.get('/public-config', controller.getPublicConfig);

  return router;
}
