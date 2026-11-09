import type { Request, Response, NextFunction } from 'express';
import { getValidated } from '../../middleware/validate';
import type {
  SignupRequest,
  VerifyEmailRequest,
  LoginRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@bm/shared/api/auth';
import type { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<SignupRequest>(res, 'body') || req.body;
      const result = await this.authService.signup(data, req, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<VerifyEmailRequest>(res, 'body') || req.body;
      const result = await this.authService.verifyEmail(data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const result = await this.authService.resendVerification(user.id, user.email);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<LoginRequest>(res, 'body') || req.body;
      const result = await this.authService.login(data, req, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.refresh(req, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = req.user!.sessionId;
      const result = await this.authService.logout(sessionId, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const result = await this.authService.logoutAll(userId, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<ForgotPasswordRequest>(res, 'body') || req.body;
      const result = await this.authService.forgotPassword(data);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = getValidated<ResetPasswordRequest>(res, 'body') || req.body;
      const result = await this.authService.resetPassword(data, req, res);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  googleStart = (req: Request, res: Response, next: NextFunction) => {
    try {
      const invite = req.query.invite as string | undefined;
      const url = this.authService.googleStart(invite, res);
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  };

  googleCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetUrl = await this.authService.googleCallback(req, res);
      res.redirect(302, targetUrl);
    } catch (err) {
      next(err);
    }
  };
}
