import { Router } from 'express';
import { acceptInviteRequestSchema } from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { createRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { createOptionalUser } from '../../middleware/auth';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';

export interface InvitesRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createInvitesRoutes(deps: InvitesRouteDeps): Router {
  const router = Router();
  const service = new InvitesService(deps.prisma, deps.env);
  const controller = new InvitesController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const optionalUser = createOptionalUser(deps.prisma, deps.env);

  router.use(rateLimiters.generalLimiter);
  router.get('/:token', controller.preview);
  router.post(
    '/:token/accept',
    optionalUser,
    validate({ body: acceptInviteRequestSchema }),
    controller.accept,
  );

  return router;
}
