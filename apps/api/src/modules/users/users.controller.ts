import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type { UpdateMeRequest, ChangePasswordRequest } from '@bm/shared/api/auth';
import type { UsersService } from './users.service';

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await this.usersService.getMe(user.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const data = getValidated<UpdateMeRequest>(res, 'body') || req.body;
      const result = await this.usersService.updateMe(user.id, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const data = getValidated<ChangePasswordRequest>(res, 'body') || req.body;
      const result = await this.usersService.changePassword(user.id, user.familyId, data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  listSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await this.usersService.listSessions(user.id, user.sessionId, user.familyId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const sessionId = req.params.id as string;
      const result = await this.usersService.revokeSession(user.id, sessionId);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
