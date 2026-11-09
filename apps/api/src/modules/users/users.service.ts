import { ErrorCode } from '@bm/shared/errors';
import type { UpdateMeRequest, ChangePasswordRequest } from '@bm/shared/api/auth';
import type { Db } from '../../config/db';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';
import { hashPassword, verifyPassword, validatePassword } from '../../lib/passwords';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UsersService {
  constructor(private readonly prisma: Db) {}

  /**
   * Retrieves profile of current user and all their active/removed memberships across orgs.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt !== null) {
      throw ApiError.unauthenticated('User not found');
    }

    // Read memberships across orgs under user-scoped context (ctx with orgId: null)
    const memberships = await this.prisma.$tx({ orgId: null, userId, role: null }, async (tx) => {
      return tx.membership.findMany({
        where: { userId },
        include: { org: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        emailVerified: user.emailVerifiedAt !== null,
      },
      memberships: memberships.map((m) => ({
        orgId: m.orgId,
        orgName: m.org.name,
        role: m.role,
        status: m.status,
      })),
    };
  }

  /**
   * Updates profile fields (fullName, phone).
   */
  async updateMe(userId: string, data: UpdateMeRequest) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
    });

    return {
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phone: updated.phone,
        emailVerified: updated.emailVerifiedAt !== null,
      },
    };
  }

  /**
   * Changes password and revokes all other session families.
   */
  async changePassword(userId: string, currentFamilyId: string, data: ChangePasswordRequest) {
    validatePassword(data.newPassword, 'newPassword');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid current password');
    }

    const isValid = await verifyPassword(user.passwordHash, data.currentPassword);
    if (!isValid) {
      throw new ApiError(ErrorCode.INVALID_CREDENTIALS, 'Invalid current password');
    }

    const newPasswordHash = await hashPassword(data.newPassword);
    const now = clock.now();

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Revoke all other session families
    await this.prisma.session.updateMany({
      where: {
        userId,
        familyId: { not: currentFamilyId },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: 'password_changed',
      },
    });

    return { ok: true };
  }

  /**
   * Lists devices (active unrotated sessions) of the user, marking the current session.
   */
  async listSessions(userId: string, currentSessionId: string, currentFamilyId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        rotatedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        familyId: true,
        userAgent: true,
        ip: true,
        createdAt: true,
      },
    });

    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      current: s.id === currentSessionId || s.familyId === currentFamilyId,
    }));
  }

  /**
   * Revokes a session family belonging to another device.
   */
  async revokeSession(userId: string, sessionId: string) {
    if (!UUID_REGEX.test(sessionId)) {
      throw ApiError.notFound('Session not found');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw ApiError.notFound('Session not found');
    }

    const now = clock.now();
    await this.prisma.session.updateMany({
      where: {
        familyId: session.familyId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: 'revoked_by_user',
      },
    });

    return { ok: true };
  }
}
