import { Router } from 'express';
import { idParam } from '@bm/shared/api/common';
import {
  createPaymentClaimSchema,
  recordPaymentSchema,
  rejectPaymentSchema,
  voidPaymentSchema,
  listPaymentsQuerySchema,
} from '@bm/shared/api/payments';
import type { Db } from '../../config/db.js';
import type { Env } from '../../config/env.js';
import type { Redis } from '../../config/redis.js';
import { createRateLimiters } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createRequireUser } from '../../middleware/auth.js';
import { createRequireMembership } from '../../middleware/org.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';

export interface PaymentsRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createPaymentsRoutes(deps: PaymentsRouteDeps): {
  paymentsRouter: Router;
  receiptsRouter: Router;
} {
  const service = new PaymentsService(deps.prisma);
  const controller = new PaymentsController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  const paymentsRouter = Router();
  paymentsRouter.use(rateLimiters.generalLimiter);
  paymentsRouter.use(requireUser);
  paymentsRouter.use(requireMembership);

  paymentsRouter.post('/claims', validate({ body: createPaymentClaimSchema }), controller.submitClaim);
  paymentsRouter.post('/', validate({ body: recordPaymentSchema }), controller.recordPayment);
  paymentsRouter.post('/:id/confirm', validate({ params: idParam }), controller.confirmPayment);
  paymentsRouter.post(
    '/:id/reject',
    validate({ params: idParam, body: rejectPaymentSchema }),
    controller.rejectPayment,
  );
  paymentsRouter.post(
    '/:id/void',
    validate({ params: idParam, body: voidPaymentSchema }),
    controller.voidPayment,
  );
  paymentsRouter.get('/', validate({ query: listPaymentsQuerySchema }), controller.listPayments);

  const receiptsRouter = Router();
  receiptsRouter.use(rateLimiters.generalLimiter);
  receiptsRouter.use(requireUser);
  receiptsRouter.use(requireMembership);

  receiptsRouter.get('/:id/download', validate({ params: idParam }), controller.getReceiptDownload);

  return { paymentsRouter, receiptsRouter };
}
