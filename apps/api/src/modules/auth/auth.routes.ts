import { Router } from 'express';
import {
  signupRequestSchema,
  verifyEmailRequestSchema,
  loginRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
} from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import type { Redis } from '../../config/redis';
import { validate } from '../../middleware/validate';
import { createRequireUser } from '../../middleware/auth';
import { createRateLimiters } from '../../middleware/rateLimit';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

export interface AuthRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createAuthRoutes(deps: AuthRouteDeps): Router {
  const router = Router();
  const authService = new AuthService(deps.prisma, deps.env);
  const controller = new AuthController(authService);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const rateLimiters = createRateLimiters(deps.redis);

  router.post(
    '/signup',
    rateLimiters.authSensitiveLimiter,
    validate({ body: signupRequestSchema }),
    controller.signup,
  );
  router.post(
    '/verify-email',
    rateLimiters.authSensitiveLimiter,
    validate({ body: verifyEmailRequestSchema }),
    controller.verifyEmail,
  );
  router.post(
    '/resend-verification',
    rateLimiters.generalLimiter,
    requireUser,
    rateLimiters.resendVerificationLimiter,
    controller.resendVerification,
  );
  router.post('/login', rateLimiters.loginLimiter, validate({ body: loginRequestSchema }), controller.login);
  router.post('/refresh', rateLimiters.authSensitiveLimiter, controller.refresh);
  router.post('/logout', rateLimiters.generalLimiter, requireUser, controller.logout);
  router.post('/logout-all', rateLimiters.generalLimiter, requireUser, controller.logoutAll);
  router.post(
    '/forgot-password',
    rateLimiters.forgotPasswordLimiter,
    validate({ body: forgotPasswordRequestSchema }),
    controller.forgotPassword,
  );
  router.post(
    '/reset-password',
    rateLimiters.authSensitiveLimiter,
    validate({ body: resetPasswordRequestSchema }),
    controller.resetPassword,
  );
  router.get('/google/start', rateLimiters.generalLimiter, controller.googleStart);
  router.get('/google/callback', rateLimiters.generalLimiter, controller.googleCallback);

  return router;
}
