import type { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import type { MembershipRole } from '@bm/shared/enums';
import { ApiError } from '../lib/ApiError';
import type { Db, TenantCtx } from '../config/db';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrgContext {
  id: string;
  role: MembershipRole;
  membershipId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      org?: OrgContext;
      tenantCtx?: TenantCtx;
    }
  }
}

/**
 * Middleware checking the X-Org-Id header, verifying the user's active membership in that org,
 * and populating req.org and req.tenantCtx.
 */
export function createRequireMembership(prisma: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthenticated('Authentication required');
      }

      const orgIdHeader = req.headers['x-org-id'];
      if (!orgIdHeader || typeof orgIdHeader !== 'string') {
        throw ApiError.badRequest(ErrorCode.VALIDATION_FAILED, 'X-Org-Id header is required');
      }

      if (!UUID_REGEX.test(orgIdHeader)) {
        throw ApiError.badRequest(ErrorCode.VALIDATION_FAILED, 'Invalid X-Org-Id format');
      }

      const orgId = orgIdHeader.toLowerCase();

      // Look up user's active membership in the organization under user-scoped transaction
      const membership = await prisma.$tx({ orgId: null, userId: req.user.id, role: null }, async (tx) => {
        return tx.membership.findFirst({
          where: {
            orgId,
            userId: req.user!.id,
          },
          select: {
            id: true,
            role: true,
            status: true,
          },
        });
      });

      if (!membership || membership.status === 'removed') {
        // Must return 404 NOT_FOUND for "exists but not yours" to never leak existence
        throw ApiError.notFound('Organization not found');
      }

      req.org = {
        id: orgId,
        role: membership.role as MembershipRole,
        membershipId: membership.id,
      };

      req.tenantCtx = {
        orgId,
        userId: req.user.id,
        role: membership.role,
        isAdmin: false,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware enforcing that the active membership role is among the allowed roles.
 */
export function requireRole(...allowedRoles: MembershipRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.org || !allowedRoles.includes(req.org.role)) {
      return next(ApiError.forbidden('You do not have permission to access this resource'));
    }
    next();
  };
}
