import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema } from '@bm/shared/api/common';
import {
  updateOrgRequestSchema,
  inviteCaretakerRequestSchema,
  updateCaretakerBuildingsRequestSchema,
} from '@bm/shared/api/org';
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

  // Read org details (landlord, caretaker, tenant)
  router.get('/', controller.getOrg);

  // Landlord-only org management
  router.patch(
    '/',
    requireRole('landlord'),
    validate({ body: updateOrgRequestSchema }),
    controller.updateOrg,
  );

  // Members
  router.get('/members', requireRole('landlord'), controller.getMembers);

  router.put(
    '/members/:membershipId/buildings',
    requireRole('landlord'),
    validate({
      params: z.object({ membershipId: uuidSchema }),
      body: updateCaretakerBuildingsRequestSchema,
    }),
    controller.updateCaretakerBuildings,
  );

  router.delete(
    '/members/:membershipId',
    requireRole('landlord'),
    validate({ params: z.object({ membershipId: uuidSchema }) }),
    controller.removeMember,
  );

  // Caretaker Invites
  router.post(
    '/invites',
    requireRole('landlord'),
    validate({ body: inviteCaretakerRequestSchema }),
    controller.inviteCaretaker,
  );

  router.get('/invites', requireRole('landlord'), controller.getInvites);

  router.delete(
    '/invites/:id',
    requireRole('landlord'),
    validate({ params: z.object({ id: uuidSchema }) }),
    controller.revokeInvite,
  );

  return router;
}
