import type { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import { ApiError } from '../lib/ApiError';
import type { Db } from '../config/db';
import type { Env } from '../config/env';
import { COOKIE_ACCESS_NAME } from '../lib/cookies';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isPlatformAdmin: boolean;
  sessionId: string;
  familyId: string;
  emailVerified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware that requires a valid, unrevoked access token in cookie bm_at.
 * Sets req.user upon success.
 */
export function createRequireUser(prisma: Db, env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE_ACCESS_NAME];
      if (!token || typeof token !== 'string') {
        throw ApiError.unauthenticated('Authentication required');
      }

      const payload = await verifyAccessToken(token, env.JWT_SECRET || '');
      if (!payload) {
        throw ApiError.unauthenticated('Invalid or expired authentication token');
      }

      // Check session in database directly (Session model has no org_id, no RLS)
      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
      });

      if (!session || session.revokedAt !== null) {
        throw new ApiError(ErrorCode.SESSION_REVOKED, 'Session has been revoked');
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.deletedAt !== null) {
        throw ApiError.unauthenticated('User not found or deleted');
      }

      req.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        isPlatformAdmin: user.isPlatformAdmin,
        sessionId: session.id,
        familyId: session.familyId,
        emailVerified: user.emailVerifiedAt !== null,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Optional user middleware: parses bm_at if present, but does not throw if absent or invalid.
 */
export function createOptionalUser(prisma: Db, env: Env) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[COOKIE_ACCESS_NAME];
      if (!token || typeof token !== 'string') {
        return next();
      }

      const payload = await verifyAccessToken(token, env.JWT_SECRET || '');
      if (!payload) {
        return next();
      }

      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
      });

      if (!session || session.revokedAt !== null) {
        return next();
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.deletedAt !== null) {
        return next();
      }

      req.user = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        isPlatformAdmin: user.isPlatformAdmin,
        sessionId: session.id,
        familyId: session.familyId,
        emailVerified: user.emailVerifiedAt !== null,
      };

      next();
    } catch {
      next();
    }
  };
}
