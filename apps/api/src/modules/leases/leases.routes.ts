import { Router } from 'express';
import { z } from 'zod';
import { idParam, uuidSchema } from '@bm/shared/api/common';
import {
  createLeaseSchema,
  getActiveLeaseQuerySchema,
  listLeasesQuerySchema,
  recordDepositSchema,
} from '@bm/shared/api/leases';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { createRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { createRequireUser } from '../../middleware/auth';
import { createRequireMembership, requireRole } from '../../middleware/org';
import { LeasesService } from './leases.service';
import { LeasesController } from './leases.controller';

export interface LeasesRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createLeasesRoutes(deps: LeasesRouteDeps): Router {
  const router = Router();
  const service = new LeasesService(deps.prisma);
  const controller = new LeasesController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // List leases (L sees all, C sees assigned)
  router.get(
    '/',
    requireRole('landlord', 'caretaker'),
    validate({ query: listLeasesQuerySchema }),
    controller.listLeases,
  );

  // Create lease (L only)
  router.post('/', requireRole('landlord'), validate({ body: createLeaseSchema }), controller.createLease);

  // Get active lease (T gets own active lease; L, C pass ?unitId=)
  router.get('/active', validate({ query: getActiveLeaseQuerySchema }), controller.getActiveLease);

  // Get lease detail (L, C, T)
  router.get('/:id', validate({ params: idParam }), controller.getLease);

  // Record deposit (L only)
  router.post(
    '/:id/deposit',
    requireRole('landlord'),
    validate({ params: idParam, body: recordDepositSchema }),
    controller.recordDeposit,
  );

  // Resend invite (L only)
  router.post(
    '/:id/resend-invite',
    requireRole('landlord'),
    validate({ params: idParam }),
    controller.resendInvite,
  );

  // Cancel pending lease (L only)
  router.post(
    '/:id/cancel',
    requireRole('landlord'),
    validate({ params: idParam }),
    controller.cancelPendingLease,
  );

  return router;
}

export function createTenantsRoutes(deps: LeasesRouteDeps): Router {
  const router = Router();
  const service = new LeasesService(deps.prisma);
  const controller = new LeasesController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Get tenant history (L only)
  router.get(
    '/:membershipId/history',
    requireRole('landlord'),
    validate({ params: z.object({ membershipId: uuidSchema }) }),
    controller.getTenantHistory,
  );

  return router;
}
