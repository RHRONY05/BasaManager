import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type { UpdateOrgRequest } from '@bm/shared/api/auth';
import type { OrgsService } from './orgs.service';

export class OrgsController {
  constructor(private readonly orgsService: OrgsService) {}

  getOrg = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orgsService.getOrg(req.tenantCtx!);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateOrg = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<UpdateOrgRequest>(res, 'body') || req.body;
      const result = await this.orgsService.updateOrg(req.tenantCtx!, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
