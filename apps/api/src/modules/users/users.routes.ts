import { Router } from 'express';
import { updateMeRequestSchema, changePasswordRequestSchema } from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { createRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { createRequireUser } from '../../middleware/auth';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

export interface UsersRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createUsersRoutes(deps: UsersRouteDeps): Router {
  const router = Router();
  const service = new UsersService(deps.prisma);
  const controller = new UsersController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);

  router.get('/', controller.getMe);
  router.patch('/', validate({ body: updateMeRequestSchema }), controller.updateMe);
  router.post('/change-password', validate({ body: changePasswordRequestSchema }), controller.changePassword);
  router.get('/sessions', controller.listSessions);
  router.delete('/sessions/:id', controller.revokeSession);

  return router;
}
