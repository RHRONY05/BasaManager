import type { Tx } from '../src/config/db';
import type { Db } from '../src/config/db';
import type { ElectricityMode, LateFeeType, MembershipRole, UnitType } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/passwords';

/**
 * Thin repository functions the dev seed uses while the real services don't exist yet (V4).
 * Each later task replaces the matching function here with a call to its service, so the seed also tests
 * the services (03-DATABASE.md "Seed"):
 *   V5 auth → upsertUser · V6 organisations/buildings/units/staff → createOrg, addMember, createBuilding,
 *   createUnit, assignCaretaker · V7 leases → leases + lease tenants · V8 billing → 3 months of bills ·
 *   V9 manual payments (every method, one pending claim) · V12 maintenance (5 requests) · V13 notices (2).
 * Org-owned writes go through `db.$tx` as bm_app, so RLS applies to the seed exactly as to the API.
 */

export async function upsertUser(
  db: Db,
  u: {
    email: string;
    fullName: string;
    password?: string;
    passwordHash?: string;
    phone?: string;
    isPlatformAdmin?: boolean;
  },
  now: Date,
): Promise<string> {
  let hash = u.passwordHash;
  if (!hash && u.password) {
    hash = await hashPassword(u.password);
  }

  const row = await db.user.upsert({
    where: { email: u.email },
    update: {},
    create: {
      email: u.email,
      fullName: u.fullName,
      passwordHash: hash ?? null,
      phone: u.phone ?? null,
      isPlatformAdmin: u.isPlatformAdmin ?? false,
      emailVerifiedAt: now,
    },
    select: { id: true },
  });
  return row.id;
}

export async function createOrg(
  tx: Tx,
  o: { id: string; name: string; slug: string; isDemo: boolean; createdBy: string },
): Promise<void> {
  await tx.organization.create({ data: o });
}

export async function addMember(
  tx: Tx,
  orgId: string,
  userId: string,
  role: MembershipRole,
): Promise<string> {
  const m = await tx.membership.create({ data: { orgId, userId, role }, select: { id: true } });
  return m.id;
}

export type BuildingInput = {
  name: string;
  address: string;
  area: string;
  city: string;
  lat: number;
  lng: number;
  billDay: number;
  dueDay: number;
  graceDays: number;
  lateFeeType: LateFeeType;
  lateFeeValue: number;
  electricityRatePoisha: number;
};

export async function createBuilding(tx: Tx, orgId: string, b: BuildingInput): Promise<string> {
  const row = await tx.building.create({ data: { orgId, ...b }, select: { id: true } });
  return row.id;
}

export type UnitInput = {
  label: string;
  floor: number;
  type: UnitType;
  rentPoisha: bigint;
  electricityMode: ElectricityMode;
  charges: { name: string; amountPoisha: bigint }[];
};

export async function createUnit(tx: Tx, orgId: string, buildingId: string, u: UnitInput): Promise<string> {
  const row = await tx.unit.create({
    data: {
      orgId,
      buildingId,
      label: u.label,
      floor: u.floor,
      type: u.type,
      defaultRentPoisha: u.rentPoisha,
      electricityMode: u.electricityMode,
      charges: { create: u.charges.map((c) => ({ orgId, name: c.name, amountPoisha: c.amountPoisha })) },
    },
    select: { id: true },
  });
  return row.id;
}

export async function assignCaretaker(
  tx: Tx,
  orgId: string,
  membershipId: string,
  buildingId: string,
): Promise<void> {
  await tx.caretakerBuilding.create({ data: { orgId, membershipId, buildingId } });
}

export type LeaseSeedInput = {
  unitId: string;
  tenantMembershipId: string;
  startDate: Date;
  monthlyRentPoisha: bigint;
  depositPoisha: bigint;
  householdSize: number;
  status: 'active';
  createdBy: string;
  charges: { name: string; amountPoisha: bigint }[];
};

export async function createLease(tx: Tx, orgId: string, l: LeaseSeedInput): Promise<string> {
  const lease = await tx.lease.create({
    data: {
      orgId,
      unitId: l.unitId,
      startDate: l.startDate,
      monthlyRentPoisha: l.monthlyRentPoisha,
      depositPoisha: l.depositPoisha,
      householdSize: l.householdSize,
      status: l.status,
      createdBy: l.createdBy,
      charges: {
        create: l.charges.map((c) => ({
          name: c.name,
          amountPoisha: c.amountPoisha,
        })),
      },
    },
    select: { id: true },
  });

  await tx.leaseTenant.create({
    data: {
      orgId,
      leaseId: lease.id,
      membershipId: l.tenantMembershipId,
      isPrimary: true,
    },
  });

  return lease.id;
}
