import { randomUUID } from 'node:crypto';
import { q } from './pg';

/**
 * Minimal raw-SQL fixtures (run as bm_owner, bypassing RLS). The real service-based factories arrive with
 * later tasks. Column names are the snake_case names of 03-DATABASE.md; `updated_at` and every column with a
 * default are omitted on purpose (the schema must give `updated_at` a database default).
 * All "who did it" columns (created_by, submitted_by, actor_id, uploaded_by, ...) reference `users.id`.
 */
const uniq = (): string => randomUUID().slice(0, 8);

type Row = { id: string };
const one = async (sql: string, params: unknown[]): Promise<string> => {
  const rows = await q<Row>(sql, params);
  return rows[0]!.id;
};

export async function makeUser(o: { email?: string; fullName?: string } = {}): Promise<string> {
  return one(`insert into users (email, full_name) values ($1, $2) returning id`, [
    o.email ?? `u-${uniq()}@test.local`,
    o.fullName ?? 'Test User',
  ]);
}

export type Org = { id: string; landlordUserId: string; landlordMembershipId: string };

/** An organisation with its owner user and the one active landlord membership. */
export async function makeOrg(o: { name?: string } = {}): Promise<Org> {
  const landlordUserId = await makeUser({ fullName: 'Landlord' });
  const name = o.name ?? `Org ${uniq()}`;
  const id = await one(
    `insert into organizations (name, slug, created_by) values ($1, $2, $3) returning id`,
    [name, `org-${uniq()}`, landlordUserId],
  );
  const landlordMembershipId = await makeMembership(id, landlordUserId, 'landlord');
  return { id, landlordUserId, landlordMembershipId };
}

export async function makeMembership(
  orgId: string,
  userId: string,
  role: 'landlord' | 'caretaker' | 'tenant',
  status: 'active' | 'removed' = 'active',
): Promise<string> {
  return one(`insert into memberships (org_id, user_id, role, status) values ($1, $2, $3, $4) returning id`, [
    orgId,
    userId,
    role,
    status,
  ]);
}

export async function makeBuilding(
  orgId: string,
  o: { name?: string; billDay?: number; dueDay?: number } = {},
): Promise<string> {
  return one(
    `insert into buildings (org_id, name, address, area, city, bill_day, due_day, late_fee_type, late_fee_value)
     values ($1, $2, 'Road 1', 'Khulshi', 'Chattogram', $3, $4, 'none', 0) returning id`,
    [orgId, o.name ?? `Building ${uniq()}`, o.billDay ?? 1, o.dueDay ?? 10],
  );
}

export async function makeUnit(
  orgId: string,
  buildingId: string,
  o: { label?: string } = {},
): Promise<string> {
  return one(
    `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
     values ($1, $2, $3, 1, 'family_flat', 1500000, 'submeter') returning id`,
    [orgId, buildingId, o.label ?? `U-${uniq()}`],
  );
}

export type LeaseStatus = 'pending' | 'active' | 'notice' | 'ended' | 'ended_with_dues';

export async function makeLease(
  orgId: string,
  unitId: string,
  createdBy: string,
  o: { status?: LeaseStatus; startDate?: string } = {},
): Promise<string> {
  return one(
    `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, household_size, status, created_by)
     values ($1, $2, $3, 1500000, 3000000, 3, $4, $5) returning id`,
    [orgId, unitId, o.startDate ?? '2026-01-01', o.status ?? 'active', createdBy],
  );
}

export async function makeBill(
  orgId: string,
  leaseId: string,
  o: { periodMonth?: string; totalPoisha?: number; paidPoisha?: number } = {},
): Promise<string> {
  return one(
    `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha)
     values ($1, $2, $3, '2026-03-10', 'draft', $4, $5) returning id`,
    [orgId, leaseId, o.periodMonth ?? '2026-03-01', o.totalPoisha ?? 1500000, o.paidPoisha ?? 0],
  );
}

export async function makePayment(
  orgId: string,
  leaseId: string,
  submittedBy: string,
  o: { method?: string; status?: string; reference?: string | null; amountPoisha?: number } = {},
): Promise<string> {
  return one(
    `insert into payments (org_id, lease_id, amount_poisha, method, status, reference, paid_on, submitted_by)
     values ($1, $2, $3, $4, $5, $6, '2026-03-05', $7) returning id`,
    [
      orgId,
      leaseId,
      o.amountPoisha ?? 500000,
      o.method ?? 'cash',
      o.status ?? 'confirmed',
      o.reference ?? null,
      submittedBy,
    ],
  );
}

export async function makeFile(orgId: string, uploadedBy: string, kind = 'document'): Promise<string> {
  return one(
    `insert into files (org_id, provider, public_id, resource_type, format, mime, size_bytes, sha256, kind, uploaded_by)
     values ($1, 'local', $2, 'raw', 'pdf', 'application/pdf', 1024, $3, $4, $5) returning id`,
    [orgId, `basamanager/test/org/${orgId}/${uniq()}`, 'a'.repeat(64), kind, uploadedBy],
  );
}

export async function makeDocument(orgId: string, leaseId: string, uploadedBy: string): Promise<string> {
  const fileId = await makeFile(orgId, uploadedBy);
  return one(
    `insert into documents (org_id, lease_id, kind, file_id, uploaded_by) values ($1, $2, 'agreement', $3, $4) returning id`,
    [orgId, leaseId, fileId, uploadedBy],
  );
}

export async function makeMaintenanceRequest(
  orgId: string,
  buildingId: string,
  unitId: string,
  leaseId: string,
  createdBy: string,
): Promise<string> {
  return one(
    `insert into maintenance_requests (org_id, building_id, unit_id, lease_id, created_by, category, priority, title, description, status)
     values ($1, $2, $3, $4, $5, 'plumbing', 'normal', 'Leak', 'Tap leaks', 'open') returning id`,
    [orgId, buildingId, unitId, leaseId, createdBy],
  );
}

/** Org with one building, one unit, one active lease: the usual starting point. */
export async function makeOrgWithLease(): Promise<
  Org & { buildingId: string; unitId: string; leaseId: string }
> {
  const org = await makeOrg();
  const buildingId = await makeBuilding(org.id);
  const unitId = await makeUnit(org.id, buildingId);
  const leaseId = await makeLease(org.id, unitId, org.landlordUserId);
  return { ...org, buildingId, unitId, leaseId };
}
