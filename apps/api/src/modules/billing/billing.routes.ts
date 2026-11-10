import { Router } from 'express';
import { idParam } from '@bm/shared/api/common';
import {
  runBillingSchema,
  listBillsQuerySchema,
  issueReadyBillsSchema,
  addAdjustmentSchema,
  waiveLateFeeSchema,
  voidBillSchema,
  meterReadingInputSchema,
  getReadingsQuerySchema,
} from '@bm/shared/api/billing';
import type { Db } from '../../config/db.js';
import type { Env } from '../../config/env.js';
import type { Redis } from '../../config/redis.js';
import { createRateLimiters } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createRequireUser } from '../../middleware/auth.js';
import { createRequireMembership, requireRole } from '../../middleware/org.js';
import { BillingService } from './billing.service.js';
import { BillingController } from './billing.controller.js';

export interface BillingRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createBillsRoutes(deps: BillingRouteDeps): Router {
  const router = Router();
  const service = new BillingService(deps.prisma);
  const controller = new BillingController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Issue ready bills (L only)
  router.post(
    '/issue-ready',
    requireRole('landlord'),
    validate({ body: issueReadyBillsSchema }),
    controller.issueReadyBills,
  );

  // List bills (L, C, T)
  router.get('/', validate({ query: listBillsQuerySchema }), controller.listBills);

  // Get bill detail (L, C, T)
  router.get('/:id', validate({ params: idParam }), controller.getBill);

  // Issue bill (L only)
  router.post('/:id/issue', requireRole('landlord'), validate({ params: idParam }), controller.issueBill);

  // Add adjustment (L only)
  router.post(
    '/:id/adjustments',
    requireRole('landlord'),
    validate({ params: idParam, body: addAdjustmentSchema }),
    controller.addAdjustment,
  );

  // Waive late fee (L only)
  router.post(
    '/:id/late-fee/waive',
    requireRole('landlord'),
    validate({ params: idParam, body: waiveLateFeeSchema }),
    controller.waiveLateFee,
  );

  // Void bill (L only)
  router.post(
    '/:id/void',
    requireRole('landlord'),
    validate({ params: idParam, body: voidBillSchema }),
    controller.voidBill,
  );

  return router;
}

export function createBillingRunRoutes(deps: BillingRouteDeps): Router {
  const router = Router();
  const service = new BillingService(deps.prisma);
  const controller = new BillingController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Run billing (L only)
  router.post(
    '/run',
    requireRole('landlord'),
    validate({ body: runBillingSchema }),
    controller.runGeneration,
  );

  return router;
}

export function createReadingsRoutes(deps: BillingRouteDeps): Router {
  const router = Router();
  const service = new BillingService(deps.prisma);
  const controller = new BillingController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Get readings grid (L, C)
  router.get(
    '/',
    requireRole('landlord', 'caretaker'),
    validate({ query: getReadingsQuerySchema }),
    controller.getReadings,
  );

  // Enter/update reading (L, C)
  router.put(
    '/',
    requireRole('landlord', 'caretaker'),
    validate({ body: meterReadingInputSchema }),
    controller.enterReading,
  );

  return router;
}

export function createDuesRoutes(deps: BillingRouteDeps): Router {
  const router = Router();
  const service = new BillingService(deps.prisma);
  const controller = new BillingController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  router.use(rateLimiters.generalLimiter);
  router.use(requireUser);
  router.use(requireMembership);

  // Get dues (T only)
  router.get('/', requireRole('tenant'), controller.getDues);

  return router;
}
