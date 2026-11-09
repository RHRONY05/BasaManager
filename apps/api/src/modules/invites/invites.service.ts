import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ErrorCode } from '@bm/shared/errors';
import type { AcceptInviteRequest } from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';
import { hashPassword, validatePassword } from '../../lib/passwords';
import { sha256, generateRefreshToken, generateCsrfToken, signAccessToken } from '../../lib/tokens';
import { setAuthCookies } from '../../lib/cookies';
import { findInvitationByTokenHash } from '../../config/db';
import type { AuthenticatedUser } from '../../middleware/auth';

export class InvitesService {
  constructor(
    private readonly prisma: Db,
    private readonly env: Env,
  ) {}

  /**
   * Preview invitation details (org name, role, inviter name, masked email) without requiring auth.
   */
  async preview(token: string) {
    const tokenHash = sha256(token);
    const inv = await findInvitationByTokenHash(this.prisma, tokenHash);
    const now = clock.now();

    if (!inv || inv.acceptedAt !== null || inv.revokedAt !== null || inv.expiresAt <= now) {
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invalid or expired invitation');
    }

    // Query organization under landlord context
    const org = await this.prisma.$tx(
      { orgId: inv.orgId, userId: inv.invitedBy, role: 'landlord' },
      async (tx) => {
        return tx.organization.findUnique({
          where: { id: inv.orgId },
          select: { name: true },
        });
      },
    );

    const inviter = await this.prisma.user.findUnique({
      where: { id: inv.invitedBy },
      select: { fullName: true },
    });

    const [local, domain] = inv.email.split('@');
    const maskedEmail = `${local ? local[0] : ''}***@${domain || ''}`;

    return {
      orgName: org ? org.name : '',
      role: inv.role,
      inviterName: inviter ? inviter.fullName : '',
      email: maskedEmail,
    };
  }

  /**
   * Accepts invitation for logged-in or new user.
   */
  async accept(
    token: string,
    body: AcceptInviteRequest,
    currentUser: AuthenticatedUser | undefined,
    req: Request,
    res: Response,
  ) {
    const tokenHash = sha256(token);
    const inv = await findInvitationByTokenHash(this.prisma, tokenHash);
    const now = clock.now();

    if (!inv || inv.acceptedAt !== null || inv.revokedAt !== null || inv.expiresAt <= now) {
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invalid or expired invitation');
    }

    if (currentUser) {
      // User is already signed in: email must match invitation exactly
      if (currentUser.email.toLowerCase().trim() !== inv.email.toLowerCase().trim()) {
        throw new ApiError(
          ErrorCode.INVITE_EMAIL_MISMATCH,
          'Signed-in user email does not match the invitation email',
        );
      }

      await this.prisma.$tx({ orgId: inv.orgId, userId: currentUser.id, role: inv.role }, async (tx) => {
        const updated = await tx.invitation.updateMany({
          where: {
            id: inv.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });

        if (updated.count === 0) {
          throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invitation already accepted or expired');
        }

        const m = await tx.membership.create({
          data: {
            orgId: inv.orgId,
            userId: currentUser.id,
            role: inv.role,
            status: 'active',
          },
        });

        if (inv.role === 'caretaker' && inv.buildingIds && inv.buildingIds.length > 0) {
          for (const buildingId of inv.buildingIds) {
            await tx.caretakerBuilding.create({
              data: {
                orgId: inv.orgId,
                membershipId: m.id,
                buildingId,
              },
            });
          }
        }
      });

      return { accepted: true };
    }

    // New user registration flow
    if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
      throw ApiError.validation([{ path: 'fullName', message: 'Full name is required' }]);
    }

    if (!body.password) {
      throw ApiError.validation([{ path: 'password', message: 'Password is required' }]);
    }

    validatePassword(body.password, 'password');

    const userId = randomUUID();
    const passwordHash = await hashPassword(body.password);

    try {
      await this.prisma.user.create({
        data: {
          id: userId,
          email: inv.email.toLowerCase().trim(),
          fullName: body.fullName.trim(),
          passwordHash,
          emailVerifiedAt: now, // Verified through invitation link
        },
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'P2002') {
        throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invitation already accepted or expired');
      }
      throw err;
    }

    try {
      await this.prisma.$tx({ orgId: inv.orgId, userId, role: inv.role }, async (tx) => {
        const updated = await tx.invitation.updateMany({
          where: {
            id: inv.id,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { acceptedAt: now },
        });

        if (updated.count === 0) {
          throw new ApiError(ErrorCode.TOKEN_INVALID, 'Invitation already accepted or expired');
        }

        const m = await tx.membership.create({
          data: {
            orgId: inv.orgId,
            userId,
            role: inv.role,
            status: 'active',
          },
        });

        if (inv.role === 'caretaker' && inv.buildingIds && inv.buildingIds.length > 0) {
          for (const buildingId of inv.buildingIds) {
            await tx.caretakerBuilding.create({
              data: {
                orgId: inv.orgId,
                membershipId: m.id,
                buildingId,
              },
            });
          }
        }
      });
    } catch (err) {
      // If invitation was already accepted by concurrent request, cleanup created user
      await this.prisma.user.delete({ where: { id: userId } }).catch(() => {});
      throw err;
    }

    // Sign in newly created user
    const familyId = randomUUID();
    const refreshToken = generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
        userAgent: (req.headers['user-agent'] as string) || null,
        ip: (req.ip as string) || null,
      },
    });

    const accessToken = await signAccessToken(
      { sub: userId, sid: session.id, adm: false },
      this.env.JWT_SECRET || '',
    );
    const csrfToken = generateCsrfToken();
    setAuthCookies(res, this.env, { accessToken, refreshToken, csrfToken });

    return { accepted: true };
  }
}
