import { clock, getDhakaDateString } from '../../lib/clock';
import type { Tx, Db } from '../../config/db';

export interface LinkTenantInviteInfo {
  id: string;
  orgId: string;
  leaseId?: string | null;
}

/**
 * Associates a tenant membership with their lease upon accepting an invitation.
 * Activates the lease immediately if the lease startDate has arrived in Asia/Dhaka.
 */
export async function linkTenantToLease(
  tx: Tx,
  inv: LinkTenantInviteInfo,
  membershipId: string,
  now: Date = clock.now(),
): Promise<void> {
  if (!inv.leaseId) {
    return;
  }

  // Check if primary tenant already exists on this lease
  const existingPrimary = await tx.leaseTenant.findFirst({
    where: {
      orgId: inv.orgId,
      leaseId: inv.leaseId,
      isPrimary: true,
    },
  });
  const isPrimary = !existingPrimary;

  await tx.leaseTenant.create({
    data: {
      orgId: inv.orgId,
      leaseId: inv.leaseId,
      membershipId,
      isPrimary,
    },
  });

  const lease = await tx.lease.findUnique({
    where: { id: inv.leaseId },
  });

  if (lease && lease.status === 'pending') {
    const todayDhaka = getDhakaDateString(now);
    const startDhaka = getDhakaDateString(lease.startDate);

    if (startDhaka <= todayDhaka) {
      await tx.lease.update({
        where: { id: lease.id },
        data: { status: 'active' },
      });
    }
  }
}

/**
 * Daily job / scheduled task to activate any accepted pending leases
 * whose start date has arrived in Asia/Dhaka.
 * Follows 03-DATABASE.md convention: iterates per-org using db.$tx({ orgId })
 * so RLS is cleanly set and respected across all roles and environments.
 */
export async function activateDueLeases(
  prisma: Db,
  now: Date = clock.now(),
  targetOrgId?: string | null,
  logger?: { error: (obj: unknown, msg?: string) => void },
): Promise<number> {
  const todayDhaka = getDhakaDateString(now);

  const activateForOrg = async (orgId: string): Promise<number> => {
    return await prisma.$tx(
      {
        orgId,
        userId: '00000000-0000-0000-0000-000000000000',
        role: null,
        isAdmin: true,
      },
      async (tx) => {
        const leases = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT l.id
          FROM leases l
          WHERE l.status = 'pending'
            AND EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id = l.id)
            AND l.start_date <= ${todayDhaka}::date
        `;

        let activated = 0;
        for (const l of leases) {
          await tx.$executeRaw`
            UPDATE leases
            SET status = 'active'
            WHERE id = ${l.id}::uuid
          `;
          activated++;
        }
        return activated;
      },
    );
  };

  if (targetOrgId) {
    return await activateForOrg(targetOrgId);
  }

  // Find all active organizations (accessible with app.is_admin = true)
  const orgs = await prisma.$tx(
    {
      orgId: null,
      userId: '00000000-0000-0000-0000-000000000000',
      role: null,
      isAdmin: true,
    },
    async (tx) => {
      return await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM organizations WHERE status = 'active'
      `;
    },
  );

  let totalActivated = 0;
  for (const org of orgs) {
    try {
      totalActivated += await activateForOrg(org.id);
    } catch (err) {
      if (logger) {
        logger.error({ err, orgId: org.id }, 'activateDueLeases failed for org');
      }
    }
  }
  return totalActivated;
}
