import type { Request, Response, NextFunction } from 'express';
import { SslcommerzService } from './sslcommerz.service.js';
import type { InitOnlinePaymentInput, SslcommerzIpnInput } from '@bm/shared/api/payments';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';

export class SslcommerzController {
  constructor(private readonly service: SslcommerzService) {}

  initPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = (res.locals.validated?.body || req.body) as InitOnlinePaymentInput;
      const result = await this.service.initPayment(
        {
          orgId: req.org!.id,
          userId: req.user!.id,
          role: req.org?.role ?? null,
        },
        input,
      );

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  handleIpn = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const body = (res.locals.validated?.body || _req.body) as SslcommerzIpnInput;
      const result = await this.service.handleIpn(body);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  handleReturn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = req.params.result;
      if (!result || (result !== 'success' && result !== 'fail' && result !== 'cancel')) {
        throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Invalid return result parameter');
      }

      const payload =
        req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0 ? req.body : req.query;
      const outcome = await this.service.handleReturn(result, payload);
      res.redirect(303, outcome.redirectUrl);
    } catch (err) {
      next(err);
    }
  };

  getIntent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawTranId = req.params.tranId;
      const tranId = Array.isArray(rawTranId) ? rawTranId[0] : rawTranId;
      if (!tranId || typeof tranId !== 'string') {
        throw new ApiError(ErrorCode.VALIDATION_FAILED, 'tranId parameter is required');
      }

      const result = await this.service.getIntent(
        {
          orgId: req.org!.id,
          userId: req.user!.id,
          role: req.org?.role ?? null,
        },
        tranId,
      );

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
