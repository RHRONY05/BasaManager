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
 */
export async function activateDueLeases(prisma: Db, now: Date = clock.now()): Promise<number> {
  const todayDhaka = getDhakaDateString(now);

  return await prisma.$tx(
    {
      orgId: null,
      userId: '00000000-0000-0000-0000-000000000000',
      role: null,
      isAdmin: true,
    },
    async (tx) => {
      const leases = await tx.$queryRaw<Array<{ id: string; org_id: string; start_date: Date }>>`
        SELECT l.id, l.org_id, l.start_date
        FROM leases l
        WHERE l.status = 'pending'
          AND EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.lease_id = l.id)
          AND (l.start_date AT TIME ZONE 'Asia/Dhaka')::date <= ${todayDhaka}::date
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
}
