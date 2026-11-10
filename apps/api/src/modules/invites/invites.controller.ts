import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type { AcceptInviteRequest } from '@bm/shared/api/auth';
import type { InvitesService } from './invites.service';

export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  preview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.params.token as string;
      const result = await this.invitesService.preview(token, req.user);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  accept = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.params.token as string;
      const body = (getValidated<AcceptInviteRequest>(res, 'body') || req.body) as AcceptInviteRequest;
      const result = await this.invitesService.accept(token, body, req.user, req, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
