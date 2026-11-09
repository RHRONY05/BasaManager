import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type {
  UpdateOrgRequest,
  InviteCaretakerRequest,
  UpdateCaretakerBuildingsRequest,
} from '@bm/shared/api/org';
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

  getMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orgsService.getMembers(req.tenantCtx!);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  inviteCaretaker = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<InviteCaretakerRequest>(res, 'body') || req.body;
      const result = await this.orgsService.inviteCaretaker(req.tenantCtx!, data);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getInvites = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.orgsService.getInvites(req.tenantCtx!);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  revokeInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.orgsService.revokeInvite(req.tenantCtx!, id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateCaretakerBuildings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membershipId = String(req.params.membershipId);
      const data = getValidated<UpdateCaretakerBuildingsRequest>(res, 'body') || req.body;
      const result = await this.orgsService.updateCaretakerBuildings(req.tenantCtx!, membershipId, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const membershipId = String(req.params.membershipId);
      const result = await this.orgsService.removeMember(req.tenantCtx!, membershipId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
