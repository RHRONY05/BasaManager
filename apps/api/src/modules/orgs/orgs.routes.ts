import { Router } from 'express';
import { updateOrgRequestSchema } from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { createRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { createRequireUser } from '../../middleware/auth';
import { createRequireMembership, requireRole } from '../../middleware/org';
import { OrgsService } from './orgs.service';
import { OrgsController } from './orgs.controller';

export interface OrgsRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createOrgsRoutes(deps: OrgsRouteDeps): Router {
  const router = Router();
  const service = new OrgsService(deps.prisma);
  const controller = new OrgsController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  router.get('/', controller.getOrg);
  router.patch(
    '/',
    requireRole('landlord'),
    validate({ body: updateOrgRequestSchema }),
    controller.updateOrg,
  );

  return router;
}
