import type { Request, Response, NextFunction } from 'express';
import { PaymentsService, type PaymentContext } from './payments.service.js';
import { getValidated } from '../../middleware/validate.js';
import type {
  CreatePaymentClaimInput,
  RecordPaymentInput,
  RejectPaymentInput,
  VoidPaymentInput,
  ListPaymentsParsedQuery,
} from '@bm/shared/api/payments';

export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  private getContext(req: Request): PaymentContext {
    return {
      orgId: req.org!.id,
      userId: req.user!.id,
      role: req.org!.role,
      membershipId: req.org!.membershipId,
      isAdmin: req.user!.isPlatformAdmin,
    };
  }

  submitClaim = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<CreatePaymentClaimInput>(res, 'body');
      const result = await this.service.submitClaim(this.getContext(req), data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  recordPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<RecordPaymentInput>(res, 'body');
      const result = await this.service.recordPayment(this.getContext(req), data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  confirmPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId = req.params.id as string;
      const result = await this.service.confirmPayment(this.getContext(req), paymentId);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  rejectPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId = req.params.id as string;
      const body = req.body as RejectPaymentInput | undefined;
      const result = await this.service.rejectPayment(this.getContext(req), paymentId, body?.reason);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  voidPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentId = req.params.id as string;
      const body = req.body as VoidPaymentInput | undefined;
      const result = await this.service.voidPayment(this.getContext(req), paymentId, body?.reason);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  listPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getValidated<ListPaymentsParsedQuery>(res, 'query');
      const result = await this.service.listPayments(this.getContext(req), query);
      res.json({
        data: result.items,
        page: {
          nextCursor: result.nextCursor ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  getReceiptDownload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const receiptId = req.params.id as string;
      const result = await this.service.getReceiptDownload(this.getContext(req), receiptId);
      if ('status' in result && result.status === 'rendering') {
        res.status(202).json({ data: { status: 'rendering' } });
      } else {
        res.json({ data: result });
      }
    } catch (err) {
      next(err);
    }
  };
}
