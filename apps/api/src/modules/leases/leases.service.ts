import type { CreateLeaseInput, ListLeasesQuery, RecordDepositInput } from '@bm/shared/api/leases';
import type { Db, TenantCtx } from '../../config/db';
import { deliverOutboxNow } from '../../config/mailer';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';
import { createLogger } from '../../lib/logger';
import { sha256, generateRandomToken } from '../../lib/tokens';
import type { LeaseStatus } from '@bm/shared/enums';
import { ErrorCode } from '@bm/shared/errors';

const logger = createLogger({ level: 'info' });

export interface RawLeaseCharge {
  id: string;
  name: string;
  amountPoisha: bigint | number;
}

export interface RawLeaseTenant {
  membershipId: string;
  isPrimary: boolean;
  createdAt: Date | string;
  membership?: {
    userId?: string;
    user?: {
      fullName?: string;
      email?: string;
    };
  };
}

export interface RawDepositEntry {
  amountPoisha: bigint | number;
  kind: string;
}

export interface RawLeaseData {
  id: string;
  orgId: string;
  unitId: string;
  status: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  noticeDate?: Date | string | null;
  monthlyRentPoisha: bigint | number;
  depositPoisha: bigint | number;
  householdSize: number;
  moveInReading?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  unit?: {
    id: string;
    label: string;
    floor: number | null;
    type: string;
    buildingId: string;
    building?: {
      name: string;
    };
  };
  charges?: RawLeaseCharge[];
  tenants?: RawLeaseTenant[];
  depositEntries?: RawDepositEntry[];
}

export function toLeaseDto(lease: RawLeaseData) {
  let depositHeldPoisha = 0;
  if (lease.depositEntries) {
    for (const d of lease.depositEntries) {
      const amt = Number(d.amountPoisha);
      if (d.kind === 'received') {
        depositHeldPoisha += amt;
      } else if (d.kind === 'refunded' || d.kind === 'applied_to_dues') {
        depositHeldPoisha -= amt;
      }
    }
  }

  const startDateStr =
    lease.startDate instanceof Date ? lease.startDate.toISOString().slice(0, 10) : String(lease.startDate);
  const endDateStr = lease.endDate
    ? lease.endDate instanceof Date
      ? lease.endDate.toISOString().slice(0, 10)
      : String(lease.endDate)
    : null;
  const noticeDateStr = lease.noticeDate
    ? lease.noticeDate instanceof Date
      ? lease.noticeDate.toISOString().slice(0, 10)
      : String(lease.noticeDate)
    : null;

  return {
    id: lease.id,
    orgId: lease.orgId,
    unitId: lease.unitId,
    unit: lease.unit
      ? {
          id: lease.unit.id,
          label: lease.unit.label,
          floor: lease.unit.floor ?? null,
          type: lease.unit.type,
          buildingId: lease.unit.buildingId,
          buildingName: lease.unit.building?.name ?? '',
        }
      : undefined,
    status: lease.status as LeaseStatus,
    startDate: startDateStr,
    endDate: endDateStr,
    noticeDate: noticeDateStr,
    monthlyRentPoisha: Number(lease.monthlyRentPoisha),
    depositPoisha: Number(lease.depositPoisha),
    depositHeldPoisha,
    householdSize: lease.householdSize,
    moveInReading: lease.moveInReading ?? null,
    charges: (lease.charges ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      amountPoisha: Number(c.amountPoisha),
    })),
    tenants: (lease.tenants ?? []).map((t) => ({
      membershipId: t.membershipId,
      userId: t.membership?.userId ?? '',
      fullName: t.membership?.user?.fullName ?? '',
      email: t.membership?.user?.email ?? '',
      isPrimary: t.isPrimary,
      joinedAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    })),
    creditPoisha: 0,
    duesPoisha: 0,
    createdAt: lease.createdAt instanceof Date ? lease.createdAt.toISOString() : String(lease.createdAt),
    updatedAt: lease.updatedAt instanceof Date ? lease.updatedAt.toISOString() : String(lease.updatedAt),
  };
}

export class LeasesService {
  constructor(private readonly prisma: Db) {}

  async createLease(ctx: TenantCtx, data: CreateLeaseInput) {
    if (ctx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can create leases');
    }

    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    // Validate charges uniqueness
    if (data.charges && data.charges.length > 0) {
      const chargeNames = new Set<string>();
      for (const ch of data.charges) {
        if (chargeNames.has(ch.name.toLowerCase())) {
          throw ApiError.validation([{ path: 'charges', message: `Duplicate charge name: ${ch.name}` }]);
        }
        chargeNames.add(ch.name.toLowerCase());
      }
    }

    try {
      const result = await this.prisma.$tx(ctx, async (tx) => {
        // Verify unit exists in this org and building is not archived
        const unit = await tx.unit.findFirst({
          where: {
            orgId,
            id: data.unitId,
            archivedAt: null,
            building: { archivedAt: null },
          },
          include: { building: true },
        });

        if (!unit) {
          throw ApiError.notFound('Unit not found or building is archived');
        }

        // Verify no live lease exists on this unit
        const existingLive = await tx.lease.findFirst({
          where: {
            orgId,
            unitId: data.unitId,
            status: { in: ['pending', 'active', 'notice'] },
          },
        });

        if (existingLive) {
          throw ApiError.conflict('Unit already has an active or pending lease');
        }

        // Prevent staff members from being invited as tenants
        const normalizedEmail = data.tenantEmail.toLowerCase().trim();
        const existingStaffUser = await tx.user.findFirst({
          where: {
            email: normalizedEmail,
            memberships: {
              some: {
                orgId,
                status: 'active',
                role: { in: ['landlord', 'caretaker'] },
              },
            },
          },
        });
        if (existingStaffUser) {
          throw ApiError.conflict(
            'Cannot invite staff member (landlord or caretaker) as a tenant in this organisation',
          );
        }

        const openStaffInvite = await tx.invitation.findFirst({
          where: {
            orgId,
            email: normalizedEmail,
            role: 'caretaker',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: clock.now() },
          },
        });
        if (openStaffInvite) {
          throw ApiError.conflict('An active staff invitation already exists for this email');
        }

        // Auto-revoke any expired unrevoked tenant invites for this email
        await tx.invitation.updateMany({
          where: {
            orgId,
            email: normalizedEmail,
            role: 'tenant',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { lte: clock.now() },
          },
          data: { revokedAt: clock.now() },
        });

        const openTenantInvite = await tx.invitation.findFirst({
          where: {
            orgId,
            email: normalizedEmail,
            role: 'tenant',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: clock.now() },
          },
        });
        if (openTenantInvite) {
          throw ApiError.conflict('An active invitation already exists for this tenant email');
        }

        const now = clock.now();
        const lease = await tx.lease.create({
          data: {
            orgId,
            unitId: data.unitId,
            startDate: new Date(data.startDate),
            monthlyRentPoisha: BigInt(data.monthlyRentPoisha),
            depositPoisha: BigInt(data.depositPoisha ?? 0),
            householdSize: data.householdSize ?? 1,
            status: 'pending',
            moveInReading: data.moveInReading ?? null,
            createdBy: userId,
          },
        });

        if (data.charges && data.charges.length > 0) {
          await tx.leaseCharge.createMany({
            data: data.charges.map((ch) => ({
              orgId,
              leaseId: lease.id,
              name: ch.name,
              amountPoisha: BigInt(ch.amountPoisha),
            })),
          });
        }

        const inviteToken = generateRandomToken();
        const tokenHash = sha256(inviteToken);
        const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

        await tx.invitation.create({
          data: {
            orgId,
            email: data.tenantEmail.toLowerCase().trim(),
            role: 'tenant',
            leaseId: lease.id,
            tokenHash,
            expiresAt,
            invitedBy: userId,
          },
        });

        await tx.outboxMessage.createMany({
          data: [
            {
              orgId,
              type: 'invite.sent',
              payload: {
                email: data.tenantEmail.toLowerCase().trim(),
                token: inviteToken,
                role: 'tenant',
                leaseId: lease.id,
                tenantName: data.tenantName,
                invitedBy: userId,
              },
            },
          ],
        });

        const created = await tx.lease.findUnique({
          where: { id: lease.id },
          include: {
            unit: { include: { building: true } },
            charges: true,
            tenants: { include: { membership: { include: { user: true } } } },
            depositEntries: true,
          },
        });

        if (!created) {
          throw ApiError.notFound('Created lease not found');
        }

        return {
          lease: toLeaseDto(created),
          invite: {
            email: data.tenantEmail.toLowerCase().trim(),
            token: inviteToken,
            role: 'tenant',
            leaseId: lease.id,
            tenantName: data.tenantName,
            invitedBy: userId,
          },
        };
      });

      await deliverOutboxNow([
        {
          type: 'invite.sent',
          payload: result.invite,
        },
      ]).catch((err) => {
        logger.warn({ err }, 'Immediate delivery of lease tenant invite outbox failed; worker will retry');
      });

      return result.lease;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'P2002') {
        const meta = (err as { meta?: { target?: string[] | string } }).meta;
        const targetStr = Array.isArray(meta?.target) ? meta.target.join(' ') : String(meta?.target ?? '');
        if (targetStr.includes('invitation') || targetStr.includes('email')) {
          throw ApiError.conflict('An open invitation already exists for this email address');
        }
        throw ApiError.conflict('Unit already has an active or pending lease');
      }
      throw err;
    }
  }

  async listLeases(ctx: TenantCtx, query: ListLeasesQuery) {
    if (ctx.role === 'tenant') {
      throw ApiError.forbidden('Tenants cannot list leases across the organization');
    }

    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    return this.prisma.$tx(ctx, async (tx) => {
      let allowedBuildingIds: string[] | null = null;

      if (ctx.role === 'caretaker') {
        const caretakerAssignments = await tx.caretakerBuilding.findMany({
          where: {
            orgId,
            membership: { userId, status: 'active' },
          },
          select: { buildingId: true },
        });
        allowedBuildingIds = caretakerAssignments.map((cb) => cb.buildingId);

        // If caretaker filters by a building they are not assigned to, return empty list
        if (query.buildingId && !allowedBuildingIds.includes(query.buildingId)) {
          return [];
        }
      }

      const whereClause: Prisma.LeaseWhereInput = {
        orgId,
      };

      if (query.status) {
        whereClause.status = query.status;
      }

      if (query.buildingId) {
        whereClause.unit = { buildingId: query.buildingId };
      } else if (allowedBuildingIds !== null) {
        whereClause.unit = { buildingId: { in: allowedBuildingIds } };
      }

      const leases = await tx.lease.findMany({
        where: whereClause,
        include: {
          unit: { include: { building: true } },
          charges: true,
          tenants: { include: { membership: { include: { user: true } } } },
          depositEntries: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return leases.map(toLeaseDto);
    });
  }

  async getLease(ctx: TenantCtx, leaseId: string) {
    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    return this.prisma.$tx(ctx, async (tx) => {
      const lease = await tx.lease.findFirst({
        where: {
          orgId,
          id: leaseId,
        },
        include: {
          unit: { include: { building: true } },
          charges: true,
          tenants: { include: { membership: { include: { user: true } } } },
          depositEntries: true,
        },
      });

      if (!lease) {
        throw ApiError.notFound('Lease not found');
      }

      // Role scoping checks
      if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findFirst({
          where: {
            orgId,
            buildingId: lease.unit.buildingId,
            membership: { userId, status: 'active' },
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Lease not found');
        }
      } else if (ctx.role === 'tenant') {
        const isTenantOnLease = lease.tenants.some((lt) => lt.membership.userId === userId);
        if (!isTenantOnLease) {
          throw ApiError.notFound('Lease not found');
        }
      }

      return toLeaseDto(lease);
    });
  }

  async getActiveLease(ctx: TenantCtx, unitId?: string) {
    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    return this.prisma.$tx(ctx, async (tx) => {
      let lease;
      if (ctx.role === 'tenant') {
        const leaseTenant = await tx.leaseTenant.findFirst({
          where: {
            orgId,
            membership: { userId, status: 'active' },
            lease: { status: { in: ['pending', 'active', 'notice'] } },
          },
          include: {
            lease: {
              include: {
                unit: { include: { building: true } },
                charges: true,
                tenants: { include: { membership: { include: { user: true } } } },
                depositEntries: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!leaseTenant) {
          throw ApiError.notFound('No active lease found');
        }
        lease = leaseTenant.lease;
      } else {
        if (!unitId) {
          throw ApiError.validation([{ path: 'unitId', message: 'unitId is required' }]);
        }
        lease = await tx.lease.findFirst({
          where: {
            orgId,
            unitId,
            status: { in: ['pending', 'active', 'notice'] },
          },
          include: {
            unit: { include: { building: true } },
            charges: true,
            tenants: { include: { membership: { include: { user: true } } } },
            depositEntries: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!lease) {
          throw ApiError.notFound('No active lease found for this unit');
        }

        if (ctx.role === 'caretaker') {
          const assignment = await tx.caretakerBuilding.findFirst({
            where: {
              orgId,
              buildingId: lease.unit.buildingId,
              membership: { userId, status: 'active' },
            },
          });
          if (!assignment) {
            throw ApiError.notFound('No active lease found for this unit');
          }
        }
      }

      return toLeaseDto(lease);
    });
  }

  async recordDeposit(ctx: TenantCtx, leaseId: string, data: RecordDepositInput) {
    if (ctx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can record deposits');
    }

    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    return this.prisma.$tx(ctx, async (tx) => {
      // Row lock the lease
      const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status FROM "leases"
        WHERE "org_id" = ${orgId}::uuid AND "id" = ${leaseId}::uuid
        FOR UPDATE
      `;

      const lease = locked?.[0];
      if (!lease) {
        throw ApiError.notFound('Lease not found');
      }

      if (lease.status === 'ended' || lease.status === 'ended_with_dues') {
        throw ApiError.conflict('Cannot record deposit on an ended lease');
      }

      // Check balance if refunding or applying
      const existingEntries = await tx.depositEntry.findMany({
        where: { orgId, leaseId },
        select: { kind: true, amountPoisha: true },
      });
      let currentHeld = 0n;
      for (const e of existingEntries) {
        if (e.kind === 'received') currentHeld += e.amountPoisha;
        else if (e.kind === 'refunded' || e.kind === 'applied_to_dues') currentHeld -= e.amountPoisha;
      }

      const amountBigInt = BigInt(data.amountPoisha);
      if (data.kind === 'refunded' || data.kind === 'applied_to_dues') {
        if (currentHeld - amountBigInt < 0n) {
          throw ApiError.badRequest(
            ErrorCode.VALIDATION_FAILED,
            'Refund or applied amount cannot exceed held deposit balance',
          );
        }
      }

      const entry = await tx.depositEntry.create({
        data: {
          orgId,
          leaseId,
          kind: data.kind,
          amountPoisha: amountBigInt,
          note: data.note ?? null,
          recordedBy: userId,
        },
      });

      return {
        id: entry.id,
        kind: entry.kind,
        amountPoisha: Number(entry.amountPoisha),
        note: entry.note,
        createdAt: entry.createdAt,
      };
    });
  }

  async resendInvite(ctx: TenantCtx, leaseId: string) {
    if (ctx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can resend invitations');
    }

    const orgId = ctx.orgId!;
    const userId = ctx.userId;

    const result = await this.prisma.$tx(ctx, async (tx) => {
      const lease = await tx.lease.findFirst({
        where: {
          orgId,
          id: leaseId,
        },
      });

      if (!lease) {
        throw ApiError.notFound('Lease not found');
      }

      if (lease.status !== 'pending') {
        throw ApiError.conflict('Lease is no longer pending invitation');
      }

      let email: string;
      const openInv = await tx.invitation.findFirst({
        where: {
          orgId,
          leaseId,
          revokedAt: null,
          acceptedAt: null,
        },
      });

      if (openInv) {
        email = openInv.email;
      } else {
        const accepted = await tx.invitation.findFirst({
          where: {
            orgId,
            leaseId,
            acceptedAt: { not: null },
          },
        });
        if (accepted) {
          throw ApiError.conflict('Invitation has already been accepted');
        }

        const recentInv = await tx.invitation.findFirst({
          where: {
            orgId,
            leaseId,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!recentInv || !recentInv.email) {
          throw ApiError.conflict('No invitation found to resend');
        }
        email = recentInv.email;
      }

      const now = clock.now();

      // Revoke old invitation
      await tx.invitation.updateMany({
        where: {
          orgId,
          leaseId,
          revokedAt: null,
          acceptedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      const inviteToken = generateRandomToken();
      const tokenHash = sha256(inviteToken);
      const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

      await tx.invitation.create({
        data: {
          orgId,
          email,
          role: 'tenant',
          leaseId,
          tokenHash,
          expiresAt,
          invitedBy: userId,
        },
      });

      await tx.outboxMessage.createMany({
        data: [
          {
            orgId,
            type: 'invite.sent',
            payload: {
              email,
              token: inviteToken,
              role: 'tenant',
              leaseId,
              invitedBy: userId,
            },
          },
        ],
      });

      return {
        email,
        token: inviteToken,
        role: 'tenant',
        leaseId,
        invitedBy: userId,
      };
    });

    await deliverOutboxNow([
      {
        type: 'invite.sent',
        payload: {
          email: result.email,
          token: result.token,
          role: result.role,
          leaseId: result.leaseId,
          invitedBy: result.invitedBy,
        },
      },
    ]).catch((err) => {
      logger.warn({ err }, 'Immediate delivery of lease tenant invite outbox failed; worker will retry');
    });

    return { resent: true };
  }

  async getTenantHistory(ctx: TenantCtx, membershipId: string) {
    if (ctx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can view tenant history');
    }

    const orgId = ctx.orgId!;

    return this.prisma.$tx(ctx, async (tx) => {
      const member = await tx.membership.findFirst({
        where: {
          orgId,
          id: membershipId,
          role: 'tenant',
        },
        include: { user: true },
      });

      if (!member) {
        throw ApiError.notFound('Tenant membership not found');
      }

      const leaseTenants = await tx.leaseTenant.findMany({
        where: {
          orgId,
          membershipId,
        },
        include: {
          lease: {
            include: {
              unit: { include: { building: true } },
              charges: true,
              tenants: { include: { membership: { include: { user: true } } } },
              depositEntries: true,
            },
          },
        },
        orderBy: { lease: { startDate: 'desc' } },
      });

      const leases = leaseTenants.map((lt) => toLeaseDto(lt.lease));
      const leaseIds = leases.map((l) => l.id);

      const bills =
        leaseIds.length > 0
          ? await tx.bill.findMany({
              where: {
                orgId,
                leaseId: { in: leaseIds },
              },
              orderBy: { periodMonth: 'desc' },
            })
          : [];

      const payments =
        leaseIds.length > 0
          ? await tx.payment.findMany({
              where: {
                orgId,
                leaseId: { in: leaseIds },
              },
              include: { receipt: true },
              orderBy: { createdAt: 'desc' },
            })
          : [];

      return {
        tenant: {
          membershipId: member.id,
          userId: member.userId,
          fullName: member.user.fullName,
          email: member.user.email,
          status: member.status,
          createdAt: member.createdAt.toISOString(),
        },
        leases,
        bills: bills.map((b) => ({
          id: b.id,
          leaseId: b.leaseId,
          periodMonth: b.periodMonth.toISOString().slice(0, 10),
          totalPoisha: Number(b.totalPoisha),
          status: b.status,
          dueDate: b.dueDate.toISOString().slice(0, 10),
        })),
        payments: payments.map((p) => ({
          id: p.id,
          leaseId: p.leaseId,
          amountPoisha: Number(p.amountPoisha),
          method: p.method,
          status: p.status,
          receiptNumber: p.receipt?.number ?? null,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    });
  }

  /**
   * Cancels a pending lease (e.g. if created with wrong email or before move-in).
   * Marks lease status as 'ended' and revokes the associated open invitation.
   * Guarded against concurrent activation, held deposits, and already-linked tenants.
   */
  async cancelPendingLease(tenantCtx: TenantCtx, leaseId: string) {
    if (tenantCtx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can cancel leases');
    }

    const orgId = tenantCtx.orgId!;
    return this.prisma.$tx(tenantCtx, async (tx) => {
      // 1. Revoke the open invitations for this lease first.
      // This locks invitation rows and waits for any in-flight accept to finish.
      await tx.invitation.updateMany({
        where: {
          orgId,
          leaseId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: clock.now() },
      });

      // 2. Reject if any invitation for this lease was already accepted
      const acceptedInvite = await tx.invitation.findFirst({
        where: {
          orgId,
          leaseId,
          acceptedAt: { not: null },
        },
      });
      if (acceptedInvite) {
        throw ApiError.conflict('Cannot cancel lease that already has an accepted tenant');
      }

      // 3. Lock the lease row with SELECT ... FOR UPDATE inside tenant context transaction.
      // This lines cancel up behind any in-flight recordDeposit or status change.
      const lockedRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status
        FROM leases
        WHERE id = ${leaseId}::uuid AND org_id = ${orgId}::uuid
        FOR UPDATE
      `;
      if (!lockedRows || lockedRows.length === 0) {
        throw ApiError.notFound('Lease not found');
      }
      const lease = lockedRows[0]!;
      if (lease.status !== 'pending') {
        throw ApiError.conflict('Only pending leases can be cancelled without a move-out settlement');
      }

      // 4. Reject if any tenant has already accepted/linked to this lease
      const tenantCount = await tx.leaseTenant.count({
        where: { leaseId, orgId },
      });
      if (tenantCount > 0) {
        throw ApiError.conflict('Cannot cancel lease that already has an accepted tenant');
      }

      // 5. Reject if deposit held is above 0
      const depositEntries = await tx.depositEntry.findMany({
        where: { leaseId, orgId },
      });
      let held = 0n;
      for (const e of depositEntries) {
        if (e.kind === 'received') held += e.amountPoisha;
        else if (e.kind === 'applied_to_dues' || e.kind === 'refunded') held -= e.amountPoisha;
      }
      if (held > 0n) {
        throw ApiError.conflict('Cannot cancel lease with held deposit. Settle or refund deposit first');
      }

      // 6. Transition lease status to 'ended'
      await tx.lease.update({
        where: { id: leaseId },
        data: { status: 'ended' },
      });

      return { success: true, message: 'Pending lease cancelled' };
    });
  }
}
