import { Router } from 'express';
import { idParam } from '@bm/shared/api/common';
import {
  createPaymentClaimSchema,
  recordPaymentSchema,
  rejectPaymentSchema,
  voidPaymentSchema,
  listPaymentsQuerySchema,
  initOnlinePaymentSchema,
  sslcommerzIpnSchema,
  paymentIntentParamSchema,
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
import { SslcommerzService } from './sslcommerz.service.js';
import { SslcommerzController } from './sslcommerz.controller.js';

export interface PaymentsRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function createPaymentsRoutes(deps: PaymentsRouteDeps): {
  paymentsRouter: Router;
  receiptsRouter: Router;
} {
  const service = new PaymentsService(deps.prisma);
  const controller = new PaymentsController(service);
  const sslcommerzService = new SslcommerzService(deps.prisma, deps.env);
  const sslcommerzController = new SslcommerzController(sslcommerzService);

  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  const paymentsRouter = Router();
  paymentsRouter.use(rateLimiters.generalLimiter);

  // ── Public SSLCommerz Webhooks & Callbacks (exempt from auth and CSRF) ──────
  paymentsRouter.post(
    '/sslcommerz/ipn',
    validate({ body: sslcommerzIpnSchema }),
    sslcommerzController.handleIpn,
  );
  paymentsRouter.post('/sslcommerz/return/:result', sslcommerzController.handleReturn);
  paymentsRouter.get('/sslcommerz/return/:result', sslcommerzController.handleReturn);

  // ── Mock SSLCommerz Gateway (dev / test mode only) ──────────────────────────
  if (deps.env.PAYMENTS_MOCK || process.env.PAYMENTS_MOCK === 'true') {
    paymentsRouter.get('/sslcommerz/mock-gateway', (req, res) => {
      const rawTranId = String(req.query.tran_id || '');
      const rawAmount = String(req.query.amount || '');
      const tranId = escapeHtml(rawTranId.replace(/[^A-Za-z0-9_-]/g, ''));
      const amount = escapeHtml(rawAmount.replace(/[^0-9.]/g, ''));
      res.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SSLCommerz Sandbox (Mock)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1rem; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 2rem; max-width: 420px; width: 100%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    h2 { margin-top: 0; color: #0f172a; font-size: 1.25rem; }
    p { margin: 0.5rem 0; color: #475569; font-size: 0.95rem; }
    .btn { display: block; width: 100%; padding: 0.75rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.75rem; text-align: center; }
    .btn-success { background: #16a34a; color: white; }
    .btn-fail { background: #dc2626; color: white; }
    .btn-cancel { background: #64748b; color: white; }
  </style>
</head>
<body>
  <div class="card">
    <h2>SSLCommerz Sandbox (Mock)</h2>
    <p><strong>Transaction ID:</strong> <span id="tran-id">${tranId}</span></p>
    <p><strong>Amount:</strong> ৳${amount} BDT</p>
    <form method="POST" action="/api/payments/sslcommerz/mock-complete">
      <input type="hidden" name="tran_id" value="${tranId}">
      <input type="hidden" name="amount" value="${amount}">
      <button type="submit" name="action" value="success" class="btn btn-success" id="mock-pay-success">
        Simulate Successful Payment
      </button>
      <button type="submit" name="action" value="fail" class="btn btn-fail" id="mock-pay-fail">
        Simulate Failed Payment
      </button>
      <button type="submit" name="action" value="cancel" class="btn btn-cancel" id="mock-pay-cancel">
        Cancel Payment
      </button>
    </form>
  </div>
</body>
</html>`);
    });

    paymentsRouter.post('/sslcommerz/mock-complete', async (req, res, next) => {
      try {
        const rawTranId = String(req.body.tran_id || '');
        const rawAmount = String(req.body.amount || '');
        const tranId = rawTranId.replace(/[^A-Za-z0-9_-]/g, '');
        const amount = rawAmount.replace(/[^0-9.]/g, '');
        const action = req.body.action;
        if (action === 'success') {
          await sslcommerzService.handleIpn({
            tran_id: tranId,
            val_id: `MOCK_VAL_${tranId}_${amount}`,
            amount: amount,
            status: 'VALID',
            currency: 'BDT',
          });
          res.redirect(303, `/api/payments/sslcommerz/return/success?tran_id=${encodeURIComponent(tranId)}`);
        } else if (action === 'fail') {
          res.redirect(303, `/api/payments/sslcommerz/return/fail?tran_id=${encodeURIComponent(tranId)}`);
        } else {
          res.redirect(303, `/api/payments/sslcommerz/return/cancel?tran_id=${encodeURIComponent(tranId)}`);
        }
      } catch (err) {
        next(err);
      }
    });
  }

  // ── Protected SSLCommerz Endpoints (tenant only) ───────────────────────────
  paymentsRouter.post(
    '/sslcommerz/init',
    requireUser,
    requireMembership,
    validate({ body: initOnlinePaymentSchema }),
    sslcommerzController.initPayment,
  );
  paymentsRouter.get(
    '/sslcommerz/intents/:tranId',
    requireUser,
    requireMembership,
    validate({ params: paymentIntentParamSchema }),
    sslcommerzController.getIntent,
  );

  // ── Protected Manual Payments Endpoints ─────────────────────────────────────
  const authPayments = Router();
  authPayments.use(requireUser);
  authPayments.use(requireMembership);

  authPayments.post('/claims', validate({ body: createPaymentClaimSchema }), controller.submitClaim);
  authPayments.post('/', validate({ body: recordPaymentSchema }), controller.recordPayment);
  authPayments.post('/:id/confirm', validate({ params: idParam }), controller.confirmPayment);
  authPayments.post(
    '/:id/reject',
    validate({ params: idParam, body: rejectPaymentSchema }),
    controller.rejectPayment,
  );
  authPayments.post(
    '/:id/void',
    validate({ params: idParam, body: voidPaymentSchema }),
    controller.voidPayment,
  );
  authPayments.get('/', validate({ query: listPaymentsQuerySchema }), controller.listPayments);

  paymentsRouter.use('/', authPayments);

  const receiptsRouter = Router();
  receiptsRouter.use(rateLimiters.generalLimiter);
  receiptsRouter.use(requireUser);
  receiptsRouter.use(requireMembership);

  receiptsRouter.get('/:id/download', validate({ params: idParam }), controller.getReceiptDownload);

  return { paymentsRouter, receiptsRouter };
}
