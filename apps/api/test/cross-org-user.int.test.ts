import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { createPrisma, findInvitationByTokenHash, TenantContextMissing, type Db } from '../src/config/db';
import { appUrl } from './helpers/env';
import { resetData, closeOwner, asApp, q } from './helpers/pg';
import { makeOrg, makeUser, makeMembership, makeBuilding, type Org } from './helpers/factories';

/**
 * User-scoped access without an org context (migration 20261108000400_user_scoped_access, 03 "RLS"):
 * own memberships across orgs, the orgs behind them, invitation lookup by token hash, and who may update an
 * organization row.
 */
let db: Db;
let A: Org;
let B: Org;
let C: Org;
let U: string;

beforeAll(() => {
  db = createPrisma(appUrl());
});
afterAll(async () => {
  await db.$disconnect();
  await closeOwner();
});
beforeEach(async () => {
  await resetData();
  A = await makeOrg({ name: 'Org A' });
  B = await makeOrg({ name: 'Org B' });
  C = await makeOrg({ name: 'Org C' });
  U = await makeUser({ fullName: 'U' });
  await makeMembership(A.id, U, 'tenant');
  // B already has an active landlord; U is B's landlord instead (the factory's landlord is removed first).
  await q(`update memberships set status = 'removed' where org_id = $1 and role = 'landlord'`, [B.id]);
  await makeMembership(B.id, U, 'landlord');
});

const userOnly = (userId: string) => ({ orgId: null, userId, role: null });

const sha256 = (token: string): Buffer => createHash('sha256').update(token).digest();

async function makeInvitation(org: Org, token: string, email = 'invitee@test.local'): Promise<string> {
  const rows = await q<{ id: string }>(
    `insert into invitations (org_id, email, role, token_hash, expires_at, invited_by)
     values ($1, $2, 'tenant', $3, now() + interval '7 days', $4) returning id`,
    [org.id, email, sha256(token), org.landlordUserId],
  );
  return rows[0]!.id;
}

describe('a user without an org context (cross-org-user.int.test.ts)', () => {
  it('sees exactly their own memberships in every org, and those orgs, not org C', async () => {
    const mems = await db.$tx(userOnly(U), (tx) =>
      tx.membership.findMany({ select: { orgId: true, role: true }, orderBy: { role: 'asc' } }),
    );
    expect(mems).toEqual([
      { orgId: B.id, role: 'landlord' },
      { orgId: A.id, role: 'tenant' },
    ]);
    const orgs = await db.$tx(userOnly(U), (tx) => tx.organization.findMany({ select: { id: true } }));
    expect(orgs.map((o) => o.id).sort()).toEqual([A.id, B.id].sort());
    expect(orgs.map((o) => o.id)).not.toContain(C.id);
  });

  it('memberships of other users in those orgs stay hidden', async () => {
    const mems = await db.$tx(userOnly(U), (tx) => tx.membership.findMany());
    expect(mems.every((m) => m.userId === U)).toBe(true);
  });

  it('another user sees none of them', async () => {
    const other = await makeUser();
    const res = await db.$tx(userOnly(other), async (tx) => ({
      mems: await tx.membership.count(),
      orgs: await tx.organization.count(),
    }));
    expect(res).toEqual({ mems: 0, orgs: 0 });
  });

  it('the user-only read is SELECT only: no membership update without the org context', async () => {
    const res = await db.$tx(userOnly(U), (tx) =>
      tx.membership.updateMany({ where: { userId: U }, data: { status: 'removed' } }),
    );
    expect(res.count).toBe(0);
  });

  it('a membership in another org does not open that org’s other tables', async () => {
    await makeBuilding(A.id);
    const rows = await db.$tx(userOnly(U), (tx) => tx.building.findMany());
    expect(rows).toEqual([]);
  });
});

describe('app_find_invitation', () => {
  it('returns the row for the right hash and nothing for a wrong one, without any org context', async () => {
    const token = randomBytes(32).toString('base64url');
    const id = await makeInvitation(A, token);
    const found = await findInvitationByTokenHash(db, sha256(token));
    expect(found).toMatchObject({
      id,
      orgId: A.id,
      email: 'invitee@test.local',
      role: 'tenant',
      buildingIds: [],
      leaseId: null,
      acceptedAt: null,
      revokedAt: null,
      invitedBy: A.landlordUserId,
    });
    expect(found!.expiresAt).toBeInstanceOf(Date);
    expect(found).not.toHaveProperty('tokenHash');
    expect(await findInvitationByTokenHash(db, sha256('wrong-token'))).toBeNull();
  });

  it('works inside a user-only $tx too; bm_app still cannot select invitations directly', async () => {
    const token = 'tok-' + randomBytes(8).toString('hex');
    await makeInvitation(B, token);
    const viaTx = await db.$tx(userOnly(U), (tx) => findInvitationByTokenHash(tx, sha256(token)));
    expect(viaTx?.orgId).toBe(B.id);
    const direct = await asApp(null, (c) => c.query('select * from invitations'));
    expect(direct.rowCount).toBe(0);
    const directUser = await asApp(userOnly(U), (c) => c.query('select * from invitations'));
    expect(directUser.rowCount).toBe(0);
  });

  it('the function exposes no token hash column and is not executable by PUBLIC', async () => {
    const cols = await q<{ name: string }>(
      `select unnest(proargnames) as name from pg_proc where proname = 'app_find_invitation'`,
    );
    expect(cols.map((c) => c.name)).not.toContain('token_hash');
    const [grants] = await q<{ app: boolean; readonly: boolean }>(
      `select has_function_privilege('bm_app', 'app_find_invitation(bytea)', 'EXECUTE') as app,
              has_function_privilege('bm_readonly', 'app_find_invitation(bytea)', 'EXECUTE') as readonly`,
    );
    expect(grants).toEqual({ app: true, readonly: false });
  });
});

describe('who may change an organization row', () => {
  const rename = (ctx: Parameters<Db['$tx']>[0], orgId: string) =>
    db.$tx(ctx, (tx) => tx.organization.updateMany({ where: { id: orgId }, data: { name: 'Renamed' } }));

  it('a caretaker or tenant context cannot; the landlord context and the admin context can', async () => {
    const caretaker = await makeUser();
    await makeMembership(A.id, caretaker, 'caretaker');
    expect((await rename({ orgId: A.id, userId: caretaker, role: 'caretaker' }, A.id)).count).toBe(0);
    expect((await rename({ orgId: A.id, userId: U, role: 'tenant' }, A.id)).count).toBe(0);
    // a member-only read (member_orgs) gives no write either
    expect((await rename(userOnly(U), B.id)).count).toBe(0);
    expect((await q<{ name: string }>('select name from organizations where id = $1', [A.id]))[0]!.name).toBe(
      'Org A',
    );

    expect((await rename({ orgId: A.id, userId: A.landlordUserId, role: 'landlord' }, A.id)).count).toBe(1);
    expect((await rename({ orgId: null, userId: U, role: null, isAdmin: true }, C.id)).count).toBe(1);
  });

  it('nobody deletes an organization through bm_app (no delete policy)', async () => {
    const res = await db.$tx({ orgId: A.id, userId: A.landlordUserId, role: 'landlord' }, (tx) =>
      tx.organization.deleteMany({ where: { id: A.id } }),
    );
    expect(res.count).toBe(0);
    expect(await q('select 1 from organizations where id = $1', [A.id])).toHaveLength(1);
  });
});

describe('the TENANT_MODELS guard also covers db.$transaction', () => {
  it('rejects an org-model query inside an interactive db.$transaction', async () => {
    await expect(db.$transaction(async (tx) => tx.building.findMany())).rejects.toBeInstanceOf(
      TenantContextMissing,
    );
  });

  it('rejects an org-model query inside a batch db.$transaction([...])', async () => {
    await expect(db.$transaction([db.membership.count()])).rejects.toBeInstanceOf(TenantContextMissing);
  });

  it('non-tenant models still work inside db.$transaction', async () => {
    const n = await db.$transaction(async (tx) => tx.user.count());
    expect(n).toBeGreaterThan(0);
  });
});
