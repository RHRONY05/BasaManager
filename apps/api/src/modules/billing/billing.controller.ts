import type { Request, Response, NextFunction } from 'express';
import { BillingService, type BillingContext } from './billing.service.js';
import { getValidated } from '../../middleware/validate.js';
import type {
  RunBillingInput,
  IssueReadyBillsInput,
  AddAdjustmentInput,
  WaiveLateFeeInput,
  VoidBillInput,
  MeterReadingInput,
  GetReadingsQuery,
  ListBillsQuery,
} from '@bm/shared/api/billing';

export class BillingController {
  constructor(private readonly service: BillingService) {}

  private getContext(req: Request): BillingContext {
    return {
      orgId: req.org!.id,
      userId: req.user!.id,
      role: req.org!.role,
      membershipId: req.org!.membershipId,
      isAdmin: req.user!.isPlatformAdmin,
    };
  }

  runGeneration = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<RunBillingInput>(res, 'body');
      const result = await this.service.runGeneration(this.getContext(req), data);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  enterReading = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<MeterReadingInput>(res, 'body');
      const result = await this.service.enterReading(this.getContext(req), data);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getReadings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getValidated<GetReadingsQuery>(res, 'query');
      const result = await this.service.getReadings(this.getContext(req), query);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  issueBill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.issueBill(this.getContext(req), id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  issueReadyBills = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<IssueReadyBillsInput>(res, 'body');
      const result = await this.service.issueReadyBills(this.getContext(req), data);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  addAdjustment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const data = getValidated<AddAdjustmentInput>(res, 'body');
      const result = await this.service.addAdjustment(this.getContext(req), id, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  waiveLateFee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const data = getValidated<WaiveLateFeeInput>(res, 'body');
      const result = await this.service.waiveLateFee(this.getContext(req), id, data);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  voidBill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const data = getValidated<VoidBillInput>(res, 'body');
      const result = await this.service.voidBill(this.getContext(req), id, data);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  listBills = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getValidated<ListBillsQuery>(res, 'query') ?? {};
      const result = await this.service.listBills(this.getContext(req), query);
      res.json({ data: result.bills, page: { nextCursor: result.nextCursor } });
    } catch (err) {
      next(err);
    }
  };

  getBill = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.getBillById(this.getContext(req), id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getDues = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getDues(this.getContext(req));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
