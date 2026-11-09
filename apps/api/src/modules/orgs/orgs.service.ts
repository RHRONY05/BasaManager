import { randomBytes } from 'node:crypto';
import type { UpdateOrgRequest } from '@bm/shared/api/org';
import { ErrorCode } from '@bm/shared/errors';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';
import { sha256 } from '../../lib/tokens';
import { deliverOutboxNow } from '../../config/mailer';

export class OrgsService {
  constructor(private readonly prisma: Db) {}

  /**
   * Retrieves the current organisation details under tenant context.
   */
  async getOrg(tenantCtx: TenantCtx) {
    const org = await this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.organization.findUnique({
        where: { id: tenantCtx.orgId! },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      });
    });

    if (!org) {
      throw ApiError.notFound('Organization not found');
    }

    return org;
  }

  /**
   * Updates organization name under tenant context (landlord only).
   */
  async updateOrg(tenantCtx: TenantCtx, data: UpdateOrgRequest) {
    const org = await this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.organization.update({
        where: { id: tenantCtx.orgId! },
        data: {
          name: data.name.trim(),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      });
    });

    return org;
  }

  /**
   * Retrieves all members of the organization with user info and caretaker assigned buildings.
   */
  async getMembers(tenantCtx: TenantCtx) {
    const members = await this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.membership.findMany({
        where: { orgId: tenantCtx.orgId! },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              phone: true,
            },
          },
          caretakerBuildings: {
            select: {
              buildingId: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      status: m.status,
      user: {
        fullName: m.user.fullName,
        email: m.user.email,
        phone: m.user.phone,
      },
      ...(m.role === 'caretaker'
        ? { buildingIds: m.caretakerBuildings.map((cb) => cb.buildingId) }
        : {}),
      createdAt: m.createdAt,
    }));
  }

  /**
   * Invites a new caretaker to the organization with assigned buildings.
   */
  async inviteCaretaker(
    tenantCtx: TenantCtx,
    data: { email: string; role: 'caretaker'; buildingIds: string[] },
  ) {
    if (data.role !== 'caretaker') {
      throw ApiError.validation([
        { path: 'role', message: "Only role 'caretaker' can be invited via organization invites" },
      ]);
    }

    const email = data.email.toLowerCase().trim();

    return this.prisma.$tx(tenantCtx, async (tx) => {
      // Validate buildingIds if provided
      if (data.buildingIds && data.buildingIds.length > 0) {
        const bCount = await tx.building.count({
          where: {
            orgId: tenantCtx.orgId!,
            id: { in: data.buildingIds },
          },
        });
        if (bCount !== data.buildingIds.length) {
          throw ApiError.validation([
            {
              path: 'buildingIds',
              message: 'One or more building IDs are invalid or belong to another organization',
            },
          ]);
        }
      }

      // Check for active open invitation for this email and role
      const openInvite = await tx.invitation.findFirst({
        where: {
          orgId: tenantCtx.orgId!,
          email,
          role: 'caretaker',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: clock.now() },
        },
      });

      if (openInvite) {
        throw ApiError.conflict('An active invitation already exists for this email and role');
      }

      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(clock.now().getTime() + 7 * 24 * 3600 * 1000);

      const inv = await tx.invitation.create({
        data: {
          orgId: tenantCtx.orgId!,
          email,
          role: 'caretaker',
          buildingIds: data.buildingIds || [],
          tokenHash,
          expiresAt,
          invitedBy: tenantCtx.userId!,
        },
        select: {
          id: true,
          email: true,
          role: true,
          buildingIds: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      // Enqueue invite email outbox message
      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: tenantCtx.orgId!,
            type: 'invite.sent',
            payload: {
              invitationId: inv.id,
              email: inv.email,
              role: inv.role,
              buildingIds: inv.buildingIds,
              token: rawToken,
            },
          },
        ],
      });

      return { inv, rawToken };
    });

    await deliverOutboxNow([
      {
        type: 'invite.sent',
        payload: {
          invitationId: result.inv.id,
          email: result.inv.email,
          role: result.inv.role,
          buildingIds: result.inv.buildingIds,
          token: result.rawToken,
        },
      },
    ]).catch(() => {});

    return result.inv;
  }

  /**
   * Lists pending invitations for the current organization.
   */
  async getInvites(tenantCtx: TenantCtx) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      return tx.invitation.findMany({
        where: {
          orgId: tenantCtx.orgId!,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: clock.now() },
        },
        select: {
          id: true,
          email: true,
          role: true,
          buildingIds: true,
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Revokes a pending invitation.
   */
  async revokeInvite(tenantCtx: TenantCtx, inviteId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const inv = await tx.invitation.findFirst({
        where: {
          id: inviteId,
          orgId: tenantCtx.orgId!,
        },
      });

      if (!inv) {
        throw ApiError.notFound('Invitation not found');
      }

      await tx.invitation.update({
        where: { id: inviteId },
        data: { revokedAt: clock.now() },
      });

      return { success: true };
    });
  }

  /**
   * Updates assigned buildings for a caretaker.
   */
  async updateCaretakerBuildings(
    tenantCtx: TenantCtx,
    membershipId: string,
    data: { buildingIds: string[] },
  ) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const m = await tx.membership.findFirst({
        where: {
          id: membershipId,
          orgId: tenantCtx.orgId!,
        },
      });

      if (!m) {
        throw ApiError.notFound('Member not found');
      }

      if (m.role !== 'caretaker') {
        throw ApiError.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Building assignment is only applicable to caretakers',
        );
      }

      if (data.buildingIds && data.buildingIds.length > 0) {
        const bCount = await tx.building.count({
          where: {
            orgId: tenantCtx.orgId!,
            id: { in: data.buildingIds },
          },
        });
        if (bCount !== data.buildingIds.length) {
          throw ApiError.validation([
            {
              path: 'buildingIds',
              message: 'One or more building IDs do not belong to this organization',
            },
          ]);
        }
      }

      await tx.caretakerBuilding.deleteMany({
        where: {
          orgId: tenantCtx.orgId!,
          membershipId,
        },
      });

      for (const buildingId of data.buildingIds) {
        await tx.caretakerBuilding.create({
          data: {
            orgId: tenantCtx.orgId!,
            membershipId,
            buildingId,
          },
        });
      }

      return { membershipId, buildingIds: data.buildingIds };
    });
  }

  /**
   * Soft-removes a member from the organization (cannot remove landlord or tenant).
   */
  async removeMember(tenantCtx: TenantCtx, membershipId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const m = await tx.membership.findFirst({
        where: {
          id: membershipId,
          orgId: tenantCtx.orgId!,
        },
      });

      if (!m) {
        throw ApiError.notFound('Member not found');
      }

      if (m.role === 'landlord') {
        throw ApiError.badRequest(ErrorCode.VALIDATION_FAILED, 'Cannot remove the organization landlord');
      }

      if (m.role === 'tenant') {
        throw ApiError.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Cannot remove a tenant directly; end their active lease instead',
        );
      }

      await tx.membership.update({
        where: { id: membershipId },
        data: {
          status: 'removed',
          removedAt: clock.now(),
        },
      });

      await tx.caretakerBuilding.deleteMany({
        where: {
          orgId: tenantCtx.orgId!,
          membershipId,
        },
      });

      return { success: true };
    });
  }
}
