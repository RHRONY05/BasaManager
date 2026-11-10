import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type {
  CreateLeaseInput,
  GetActiveLeaseQuery,
  ListLeasesQuery,
  RecordDepositInput,
} from '@bm/shared/api/leases';
import type { LeasesService } from './leases.service';

export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  createLease = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<CreateLeaseInput>(res, 'body');
      const result = await this.leasesService.createLease(req.tenantCtx!, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  listLeases = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getValidated<ListLeasesQuery>(res, 'query') ?? {};
      const result = await this.leasesService.listLeases(req.tenantCtx!, query);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getLease = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.leasesService.getLease(req.tenantCtx!, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getActiveLease = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getValidated<GetActiveLeaseQuery>(res, 'query');
      const unitId = query?.unitId;
      const result = await this.leasesService.getActiveLease(req.tenantCtx!, unitId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  recordDeposit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const data = getValidated<RecordDepositInput>(res, 'body');
      const result = await this.leasesService.recordDeposit(req.tenantCtx!, id, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resendInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.leasesService.resendInvite(req.tenantCtx!, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getTenantHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membershipId = String(req.params.membershipId);
      const result = await this.leasesService.getTenantHistory(req.tenantCtx!, membershipId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  cancelPendingLease = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.leasesService.cancelPendingLease(req.tenantCtx!, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
