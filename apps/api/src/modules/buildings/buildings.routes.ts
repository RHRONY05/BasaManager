import { Router } from 'express';
import { idParam } from '@bm/shared/api/common';
import {
  createBuildingRequestSchema,
  updateBuildingRequestSchema,
  createUnitRequestSchema,
  updateUnitRequestSchema,
} from '@bm/shared/api/buildings';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { createRateLimiters } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { createRequireUser } from '../../middleware/auth';
import { createRequireMembership, requireRole } from '../../middleware/org';
import { BuildingsService } from './buildings.service';
import { BuildingsController } from './buildings.controller';

export interface BuildingsRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createBuildingsRoutes(deps: BuildingsRouteDeps): Router {
  const router = Router();
  const service = new BuildingsService(deps.prisma);
  const controller = new BuildingsController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // List buildings (L sees all, C sees assigned, T sees own)
  router.get('/', controller.listBuildings);

  // Create building (Landlord only)
  router.post(
    '/',
    requireRole('landlord'),
    validate({ body: createBuildingRequestSchema }),
    controller.createBuilding,
  );

  // Get building detail
  router.get('/:id', validate({ params: idParam }), controller.getBuilding);

  // Update building (Landlord only)
  router.patch(
    '/:id',
    requireRole('landlord'),
    validate({ params: idParam, body: updateBuildingRequestSchema }),
    controller.updateBuilding,
  );

  // Archive building (Landlord only)
  router.post(
    '/:id/archive',
    requireRole('landlord'),
    validate({ params: idParam }),
    controller.archiveBuilding,
  );

  // Units under building
  router.get(
    '/:id/units',
    requireRole('landlord', 'caretaker'),
    validate({ params: idParam }),
    controller.listUnits,
  );

  router.post(
    '/:id/units',
    requireRole('landlord'),
    validate({ params: idParam, body: createUnitRequestSchema }),
    controller.createUnit,
  );

  return router;
}

export function createUnitsRoutes(deps: BuildingsRouteDeps): Router {
  const router = Router();
  const service = new BuildingsService(deps.prisma);
  const controller = new BuildingsController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Update unit (Landlord only)
  router.patch(
    '/:id',
    requireRole('landlord'),
    validate({ params: idParam, body: updateUnitRequestSchema }),
    controller.updateUnit,
  );

  // Archive unit (Landlord only)
  router.post('/:id/archive', requireRole('landlord'), validate({ params: idParam }), controller.archiveUnit);

  return router;
}
