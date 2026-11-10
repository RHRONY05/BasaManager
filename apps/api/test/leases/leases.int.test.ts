import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import {
  makeOrg,
  makeBuilding,
  makeUnit,
  makeLease,
  makeBill,
  makePayment,
  type Org,
} from '../helpers/factories';
import { buildTestApp, resetAll, newAgent, sha256, uniqEmail, PASSWORD, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';

const PAST = '2020-01-01';
const FUTURE = '2099-01-01';
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('V7: leases, deposit ledger, tenant invites, tenant history', () => {
  let ctx: TestCtx;
  let org: Org;
  let bMine: string;
  let bOther: string;
  let unit: string;
  let unit2: string;
  let otherUnit: string;
  let landlord: Actor;
  let caretaker: Actor;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg();
    bMine = await makeBuilding(org.id, { name: 'Mine' });
    bOther = await makeBuilding(org.id, { name: 'Other' });
    unit = await makeUnit(org.id, bMine, { label: 'A1' });
    unit2 = await makeUnit(org.id, bMine, { label: 'A2' });
    otherUnit = await makeUnit(org.id, bOther, { label: 'B1' });
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [bMine] });
  });

  const body = (unitId: string, o: Record<string, unknown> = {}) => ({
    unitId,
    tenantEmail: uniqEmail('tenant'),
    tenantName: 'Nusrat Jahan',
    startDate: PAST,
    monthlyRentPoisha: 1500000,
    depositPoisha: 3000000,
    householdSize: 3,
    charges: [
      { name: 'Service', amountPoisha: 50000 },
      { name: 'Gas', amountPoisha: 80000 },
    ],
    ...o,
  });

  /** Latest `invite.sent` outbox row of the org (the API can only insert; the owner pool can read). */
  const invites = (orgId: string) =>
    q<{ payload: { token?: string; email?: string } }>(
      `select payload from outbox where org_id=$1 and type='invite.sent' order by created_at, id`,
      [orgId],
    );
  const lastToken = async (orgId = org.id): Promise<string> => {
    const rows = await invites(orgId);
    const token = rows[rows.length - 1]?.payload.token;
    if (!token) throw new Error('no invite.sent outbox row with a token');
    return token;
  };
  const acceptInvite = (token: string, name = 'Nusrat Jahan') =>
    newAgent(ctx).post(`/api/invites/${token}/accept`).send({ password: PASSWORD, fullName: name });

  /** Create a lease through the API as the landlord and return its id + the invite token. */
  async function createLease(o: Record<string, unknown> = {}, unitId = unit) {
    const res = await landlord.agent.post('/api/leases').send(body(unitId, o));
    if (res.status !== 201) throw new Error(`createLease failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { id: res.body.data.id as string, res, token: await lastToken() };
  }

  /** A tenant who is accepted onto `leaseId` (direct fixture; lease_tenants row + signed-in agent). */
  async function tenantOn(leaseId: string, isPrimary = true): Promise<Actor> {
    const t = await actorIn(ctx, org.id, 'tenant');
    await q(`insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1,$2,$3,$4)`, [
      org.id,
      leaseId,
      t.membershipId,
      isPrimary,
    ]);
    return t;
  }

  describe('POST /leases', () => {
    it('201: pending lease, lease_charges copied, invite.sent outbox row queued', async () => {
      const input = body(unit);
      const res = await landlord.agent.post('/api/leases').send(input);
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(
        expect.objectContaining({
          unitId: unit,
          status: 'pending',
          startDate: PAST,
          monthlyRentPoisha: 1500000,
          depositPoisha: 3000000,
          householdSize: 3,
        }),
      );
      const id = res.body.data.id as string;

      const charges = await q<{ name: string; amount_poisha: string }>(
        `select name, amount_poisha::text from lease_charges where lease_id=$1 order by name`,
        [id],
      );
      expect(charges).toEqual([
        { name: 'Gas', amount_poisha: '80000' },
        { name: 'Service', amount_poisha: '50000' },
      ]);

      const rows = await invites(org.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.payload.token).toBeTruthy();
      const inv = await q<{ email: string; role: string; lease_id: string; accepted_at: Date | null }>(
        `select email, role, lease_id, accepted_at from invitations where org_id=$1`,
        [org.id],
      );
      expect(inv).toEqual([{ email: input.tenantEmail, role: 'tenant', lease_id: id, accepted_at: null }]);
      // no tenant yet: the lease stays pending until the invite is accepted
      expect(await q(`select 1 from lease_tenants where lease_id=$1`, [id])).toHaveLength(0);
    });

    it('stores the move-in reading when given', async () => {
      const res = await landlord.agent.post('/api/leases').send(body(unit, { moveInReading: 1234 }));
      expect(res.status).toBe(201);
      const r = await q<{ move_in_reading: number }>(`select move_in_reading from leases where id=$1`, [
        res.body.data.id,
      ]);
      expect(r[0]!.move_in_reading).toBe(1234);
    });

    it.each(['pending', 'active', 'notice'] as const)(
      '409 CONFLICT when the unit already has a %s lease',
      async (status) => {
        await makeLease(org.id, unit, org.landlordUserId, { status });
        const res = await landlord.agent.post('/api/leases').send(body(unit));
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
        expect(await q(`select 1 from leases where unit_id=$1`, [unit])).toHaveLength(1);
        expect(await invites(org.id)).toHaveLength(0);
      },
    );

    it.each(['ended', 'ended_with_dues'] as const)('allows a new lease after a %s one', async (status) => {
      await makeLease(org.id, unit, org.landlordUserId, { status });
      const res = await landlord.agent.post('/api/leases').send(body(unit));
      expect(res.status).toBe(201);
    });

    it('two concurrent creates on one unit: exactly one 201, the other 409 CONFLICT, one lease row', async () => {
      const results = await Promise.all([
        landlord.agent.post('/api/leases').send(body(unit)),
        landlord.agent.post('/api/leases').send(body(unit)),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.error.code).toBe(ErrorCode.CONFLICT);
      expect(await q(`select 1 from leases where unit_id=$1`, [unit])).toHaveLength(1);
      expect(await invites(org.id)).toHaveLength(1); // the loser rolled back its outbox row too
    });

    it('404 NOT_FOUND for a unit that does not exist or belongs to another org', async () => {
      const orgB = await makeOrg();
      const uB = await makeUnit(orgB.id, await makeBuilding(orgB.id));
      for (const id of [MISSING, uB]) {
        const res = await landlord.agent.post('/api/leases').send(body(id));
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      }
      expect(await q(`select 1 from leases where org_id=$1`, [orgB.id])).toHaveLength(0);
    });

    it.each([
      ['non-integer rent', { monthlyRentPoisha: 1500000.5 }],
      ['negative rent', { monthlyRentPoisha: -1 }],
      ['negative deposit', { depositPoisha: -5 }],
      ['zero household', { householdSize: 0 }],
      ['bad email', { tenantEmail: 'not-an-email' }],
      ['bad date', { startDate: '01/02/2026' }],
      ['missing tenant name', { tenantName: undefined }],
      ['fractional charge', { charges: [{ name: 'Service', amountPoisha: 10.5 }] }],
    ])('400 VALIDATION_FAILED for %s', async (_n, patch) => {
      const res = await landlord.agent.post('/api/leases').send(body(unit, patch));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(await q(`select 1 from leases where org_id=$1`, [org.id])).toHaveLength(0);
    });

    it('caretaker and tenant get 403 FORBIDDEN and nothing is created', async () => {
      const tenant = await actorIn(ctx, org.id, 'tenant');
      for (const a of [caretaker, tenant]) {
        const res = await a.agent.post('/api/leases').send(body(unit2));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      }
      expect(await q(`select 1 from leases where org_id=$1`, [org.id])).toHaveLength(0);
    });

    it('throws 409 CONFLICT if tenantEmail belongs to an active staff member', async () => {
      const res = await landlord.agent.post('/api/leases').send(body(unit, { tenantEmail: caretaker.email }));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
      expect(res.body.error.message).toContain('Cannot invite staff member');
    });

    it('401 without a session', async () => {
      const res = await newAgent(ctx).post('/api/leases').send(body(unit));
      expect(res.status).toBe(401);
    });
  });

  describe('GET /leases', () => {
    let mineLease: string;
    let otherLease: string;
    beforeEach(async () => {
      mineLease = await makeLease(org.id, unit, org.landlordUserId, { status: 'active' });
      otherLease = await makeLease(org.id, otherUnit, org.landlordUserId, { status: 'pending' });
    });
    const ids = (r: { body: { data: { id: string }[] } }) => r.body.data.map((l) => l.id).sort();

    it('landlord sees every lease of the org, and none of another org', async () => {
      const orgB = await makeOrg();
      const uB = await makeUnit(orgB.id, await makeBuilding(orgB.id));
      const leaseB = await makeLease(orgB.id, uB, orgB.landlordUserId);
      const res = await landlord.agent.get('/api/leases');
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([mineLease, otherLease].sort());
      expect(JSON.stringify(res.body)).not.toContain(leaseB);
    });

    it('filters by status and by buildingId', async () => {
      const byStatus = await landlord.agent.get('/api/leases?status=pending');
      expect(ids(byStatus)).toEqual([otherLease]);
      const byBuilding = await landlord.agent.get(`/api/leases?buildingId=${bMine}`);
      expect(ids(byBuilding)).toEqual([mineLease]);
      const both = await landlord.agent.get(`/api/leases?buildingId=${bMine}&status=pending`);
      expect(both.body.data).toEqual([]);
    });

    it('caretaker sees only leases in assigned buildings, even when filtering for another', async () => {
      const res = await caretaker.agent.get('/api/leases');
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([mineLease]);
      const forced = await caretaker.agent.get(`/api/leases?buildingId=${bOther}`);
      expect(forced.status).toBe(200);
      expect(forced.body.data).toEqual([]);
      expect(JSON.stringify(forced.body)).not.toContain(otherLease);
    });

    it('tenant gets 403 FORBIDDEN', async () => {
      const t = await tenantOn(mineLease);
      const res = await t.agent.get('/api/leases');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('an invalid status filter is 400 VALIDATION_FAILED', async () => {
      const res = await landlord.agent.get('/api/leases?status=bogus');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('GET /leases/:id', () => {
    let leaseId: string;
    let tenant: Actor;
    beforeEach(async () => {
      leaseId = await makeLease(org.id, unit, org.landlordUserId, { status: 'active' });
      await q(
        `insert into lease_charges (org_id, lease_id, name, amount_poisha) values ($1,$2,'Service',50000)`,
        [org.id, leaseId],
      );
      await q(
        `insert into deposit_entries (org_id, lease_id, kind, amount_poisha, recorded_by)
         values ($1,$2,'received',3000000,$3), ($1,$2,'refunded',500000,$3), ($1,$2,'applied_to_dues',250000,$3)`,
        [org.id, leaseId, org.landlordUserId],
      );
      tenant = await tenantOn(leaseId);
    });

    it('landlord gets lease, unit summary, charges, tenants and deposit held', async () => {
      const res = await landlord.agent.get(`/api/leases/${leaseId}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.id).toBe(leaseId);
      expect(d.status).toBe('active');
      expect(d.unit).toEqual(expect.objectContaining({ id: unit, label: 'A1' }));
      expect(d.charges).toEqual([expect.objectContaining({ name: 'Service', amountPoisha: 50000 })]);
      expect(d.tenants).toEqual([
        expect.objectContaining({ membershipId: tenant.membershipId, isPrimary: true }),
      ]);
      expect(d.depositHeldPoisha).toBe(2250000); // 3,000,000 - 500,000 - 250,000
    });

    it('caretaker: assigned building 200, unassigned 404 identical to a non-existent lease', async () => {
      expect((await caretaker.agent.get(`/api/leases/${leaseId}`)).status).toBe(200);
      const otherLease = await makeLease(org.id, otherUnit, org.landlordUserId);
      const no = await caretaker.agent.get(`/api/leases/${otherLease}`);
      const missing = await caretaker.agent.get(`/api/leases/${MISSING}`);
      expect(no.status).toBe(404);
      expect(no.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(missing.status).toBe(404);
      expect(no.body.error).toEqual({ ...missing.body.error, requestId: no.body.error.requestId });
    });

    it('tenant: own lease 200 (any tenant on it), another tenant’s lease 404', async () => {
      expect((await tenant.agent.get(`/api/leases/${leaseId}`)).status).toBe(200);
      const second = await tenantOn(leaseId, false);
      expect((await second.agent.get(`/api/leases/${leaseId}`)).status).toBe(200);

      const otherLease = await makeLease(org.id, unit2, org.landlordUserId, { status: 'active' });
      const res = await tenant.agent.get(`/api/leases/${otherLease}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('cross-org: 404 for the landlord of another org', async () => {
      const orgB = await makeOrg();
      const llB = await landlordOf(ctx, orgB);
      const res = await llB.agent.get(`/api/leases/${leaseId}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('a malformed id is 400 VALIDATION_FAILED or 404, never 500', async () => {
      const res = await landlord.agent.get('/api/leases/not-a-uuid');
      expect([400, 404]).toContain(res.status);
    });
  });

  describe('POST /leases/:id/deposit', () => {
    let leaseId: string;
    beforeEach(async () => {
      leaseId = await makeLease(org.id, unit, org.landlordUserId, { status: 'active' });
    });
    const heldOf = async () => {
      const res = await landlord.agent.get(`/api/leases/${leaseId}`);
      return res.body.data.depositHeldPoisha as number;
    };

    it('records entries and held = received - refunded - applied_to_dues', async () => {
      const post = (kind: string, amountPoisha: number, note?: string) =>
        landlord.agent.post(`/api/leases/${leaseId}/deposit`).send({ kind, amountPoisha, note });
      expect((await post('received', 3000000, 'cash at move-in')).status).toBe(201);
      expect(await heldOf()).toBe(3000000);
      expect((await post('applied_to_dues', 400000)).status).toBe(201);
      expect((await post('refunded', 600000)).status).toBe(201);
      expect(await heldOf()).toBe(2000000);

      const rows = await q<{ kind: string; amount_poisha: string; note: string | null; recorded_by: string }>(
        `select kind, amount_poisha::text, note, recorded_by from deposit_entries where lease_id=$1 order by created_at`,
        [leaseId],
      );
      expect(rows.map((r) => [r.kind, r.amount_poisha])).toEqual([
        ['received', '3000000'],
        ['applied_to_dues', '400000'],
        ['refunded', '600000'],
      ]);
      expect(rows[0]!.note).toBe('cash at move-in');
      expect(rows.every((r) => r.recorded_by === landlord.userId)).toBe(true);
    });

    it.each([
      ['zero', 0],
      ['negative', -100],
      ['fractional', 10.5],
      ['a string', '100'],
    ])('400 VALIDATION_FAILED for amount %s', async (_n, amountPoisha) => {
      const res = await landlord.agent
        .post(`/api/leases/${leaseId}/deposit`)
        .send({ kind: 'received', amountPoisha });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(await q(`select 1 from deposit_entries where lease_id=$1`, [leaseId])).toHaveLength(0);
    });

    it('400 VALIDATION_FAILED for an unknown kind', async () => {
      const res = await landlord.agent
        .post(`/api/leases/${leaseId}/deposit`)
        .send({ kind: 'gift', amountPoisha: 1 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('404 for a lease of another org or a missing lease', async () => {
      const orgB = await makeOrg();
      const uB = await makeUnit(orgB.id, await makeBuilding(orgB.id));
      const leaseB = await makeLease(orgB.id, uB, orgB.landlordUserId);
      for (const id of [leaseB, MISSING]) {
        const res = await landlord.agent
          .post(`/api/leases/${id}/deposit`)
          .send({ kind: 'received', amountPoisha: 1 });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      }
      expect(await q(`select 1 from deposit_entries where org_id=$1`, [orgB.id])).toHaveLength(0);
    });

    it('caretaker and tenant get 403 FORBIDDEN and nothing is recorded', async () => {
      const t = await tenantOn(leaseId);
      for (const a of [caretaker, t]) {
        const res = await a.agent
          .post(`/api/leases/${leaseId}/deposit`)
          .send({ kind: 'received', amountPoisha: 100 });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      }
      expect(await q(`select 1 from deposit_entries where lease_id=$1`, [leaseId])).toHaveLength(0);
    });

    it('rejects recording deposit on an ended lease with 409 CONFLICT', async () => {
      const endedLease = await makeLease(org.id, unit, org.landlordUserId, { status: 'ended' });
      const res = await landlord.agent.post(`/api/leases/${endedLease}/deposit`).send({
        kind: 'received',
        amountPoisha: 100000,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('rejects refund exceeding held deposit balance with 400', async () => {
      await landlord.agent.post(`/api/leases/${leaseId}/deposit`).send({
        kind: 'received',
        amountPoisha: 100000,
      });
      const res = await landlord.agent.post(`/api/leases/${leaseId}/deposit`).send({
        kind: 'refunded',
        amountPoisha: 200000,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('cannot exceed held deposit balance');
    });
  });

  describe('POST /leases/:id/resend-invite', () => {
    it('resends invite using recent email even if earlier invite was revoked', async () => {
      const { id, token } = await createLease();
      // Revoke the open invite
      await q(`update invitations set revoked_at=now() where lease_id=$1`, [id]);
      const res = await landlord.agent.post(`/api/leases/${id}/resend-invite`);
      expect(res.status).toBe(200);
      expect(res.body.data.resent).toBe(true);
      const newToken = await lastToken();
      expect(newToken).not.toBe(token);
    });
    it('revokes the old invite, creates a new one and queues a fresh outbox message', async () => {
      const { id, token: oldToken } = await createLease();
      const res = await landlord.agent.post(`/api/leases/${id}/resend-invite`);
      expect(res.status).toBeLessThan(300);
      expect(res.status).toBeGreaterThanOrEqual(200);

      const rows = await q<{ revoked_at: Date | null; accepted_at: Date | null; token_hash: Buffer }>(
        `select revoked_at, accepted_at, token_hash from invitations where lease_id=$1 order by created_at`,
        [id],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]!.revoked_at).not.toBeNull();
      expect(rows[1]!.revoked_at).toBeNull();
      expect(rows[1]!.accepted_at).toBeNull();

      const newToken = await lastToken();
      expect(newToken).not.toBe(oldToken);
      expect(rows[1]!.token_hash.equals(sha256(newToken))).toBe(true);
      expect(await invites(org.id)).toHaveLength(2);

      // the old link is dead, the new one works
      const old = await newAgent(ctx).get(`/api/invites/${oldToken}`);
      expect(old.status).toBe(400);
      expect(old.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
      expect((await newAgent(ctx).get(`/api/invites/${newToken}`)).status).toBe(200);
    });

    it('409 CONFLICT once the lease is no longer pending (invite already accepted)', async () => {
      const { id, token } = await createLease();
      expect((await acceptInvite(token)).status).toBe(200);
      const res = await landlord.agent.post(`/api/leases/${id}/resend-invite`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('404 for a missing lease or another org’s lease', async () => {
      const { id } = await createLease();
      const orgB = await makeOrg();
      const llB = await landlordOf(ctx, orgB);
      expect((await llB.agent.post(`/api/leases/${id}/resend-invite`)).status).toBe(404);
      expect((await landlord.agent.post(`/api/leases/${MISSING}/resend-invite`)).status).toBe(404);
    });

    it('caretaker and tenant get 403 FORBIDDEN and no new invite is created', async () => {
      const { id } = await createLease();
      const t = await tenantOn(id);
      for (const a of [caretaker, t]) {
        const res = await a.agent.post(`/api/leases/${id}/resend-invite`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      }
      expect(await q(`select 1 from invitations where lease_id=$1`, [id])).toHaveLength(1);
      expect(await invites(org.id)).toHaveLength(1);
    });
  });

  describe('POST /invites/:token/accept (tenant invites)', () => {
    it('creates a tenant membership + primary lease_tenants row and activates a started lease', async () => {
      const input = body(unit, { startDate: PAST });
      const created = await landlord.agent.post('/api/leases').send(input);
      expect(created.status).toBe(201);
      const id = created.body.data.id as string;
      const res = await acceptInvite(await lastToken(), 'Nusrat Jahan');
      expect(res.status).toBe(200);

      const m = await q<{ id: string; role: string; status: string }>(
        `select m.id, m.role, m.status from memberships m join users u on u.id=m.user_id
          where m.org_id=$1 and u.email=$2`,
        [org.id, input.tenantEmail],
      );
      expect(m).toEqual([expect.objectContaining({ role: 'tenant', status: 'active' })]);
      const lt = await q<{ membership_id: string; is_primary: boolean }>(
        `select membership_id, is_primary from lease_tenants where lease_id=$1`,
        [id],
      );
      expect(lt).toEqual([{ membership_id: m[0]!.id, is_primary: true }]);
      const lease = await q<{ status: string }>(`select status from leases where id=$1`, [id]);
      expect(lease[0]!.status).toBe('active');
    });

    it('a lease starting in the future stays pending after acceptance', async () => {
      const { id, token } = await createLease({ startDate: FUTURE });
      expect((await acceptInvite(token)).status).toBe(200);
      const lease = await q<{ status: string }>(`select status from leases where id=$1`, [id]);
      expect(lease[0]!.status).toBe('pending');
      expect(await q(`select 1 from lease_tenants where lease_id=$1`, [id])).toHaveLength(1);
    });

    it('the new tenant can read their lease and no other', async () => {
      const { id, token } = await createLease();
      const other = await makeLease(org.id, unit2, org.landlordUserId, { status: 'active' });
      const agent = newAgent(ctx);
      const acc = await agent
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'N J' });
      expect(acc.status).toBe(200);
      agent.set('X-Org-Id', org.id);
      expect((await agent.get(`/api/leases/${id}`)).status).toBe(200);
      expect((await agent.get(`/api/leases/${other}`)).status).toBe(404);
    });

    it('a second invite on the same lease adds a NON-primary tenant', async () => {
      const { id, token } = await createLease();
      expect((await acceptInvite(token)).status).toBe(200);
      // another tenant is invited to the same (now active) lease
      const email = uniqEmail('second');
      const extra = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      await q(
        `insert into invitations (org_id, email, role, lease_id, token_hash, expires_at, invited_by)
         values ($1,$2,'tenant',$3,$4,$5,$6)`,
        [org.id, email, id, sha256(extra), new Date(Date.now() + 86_400_000), org.landlordUserId],
      );
      expect((await acceptInvite(extra, 'Second Person')).status).toBe(200);

      const rows = await q<{ is_primary: boolean }>(
        `select is_primary from lease_tenants where lease_id=$1 order by is_primary desc`,
        [id],
      );
      expect(rows.map((r) => r.is_primary)).toEqual([true, false]);
      const lease = await q<{ status: string }>(`select status from leases where id=$1`, [id]);
      expect(lease[0]!.status).toBe('active');
    });

    it('a used or revoked tenant invite is TOKEN_INVALID and links nothing', async () => {
      const { id, token } = await createLease();
      expect((await acceptInvite(token)).status).toBe(200);
      const again = await acceptInvite(token);
      expect(again.status).toBe(400);
      expect(again.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
      expect(await q(`select 1 from lease_tenants where lease_id=$1`, [id])).toHaveLength(1);
    });

    it('two concurrent accepts of one tenant invite: exactly one wins, one lease_tenants row', async () => {
      const { id, token } = await createLease();
      const rs = await Promise.all([acceptInvite(token), acceptInvite(token)]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await q(`select 1 from lease_tenants where lease_id=$1`, [id])).toHaveLength(1);
    });

    it('rejects tenant invite acceptance if user is already a staff member (prevents role demotion)', async () => {
      const { id, token } = await createLease({}, otherUnit);
      await q(`update invitations set email = $1 where lease_id = $2`, [caretaker.email, id]);

      // Caretaker tries to accept this tenant invite with their signed-in agent
      const res = await caretaker.agent.post(`/api/invites/${token}/accept`).send({});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
      expect(res.body.error.message).toContain('Cannot accept tenant invite');

      // Verify caretaker role was not demoted
      const m = await q<{ role: string }>(`select role from memberships where id=$1`, [
        caretaker.membershipId,
      ]);
      expect(m[0]!.role).toBe('caretaker');
    });
  });

  describe('GET /leases/active', () => {
    it('tenant gets own active lease', async () => {
      const { id, token } = await createLease();
      const agent = newAgent(ctx);
      await agent
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'Active Tenant' });
      agent.set('X-Org-Id', org.id);

      const res = await agent.get('/api/leases/active');
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it('landlord gets active lease for a unit via ?unitId=', async () => {
      const { id } = await createLease();
      const res = await landlord.agent.get(`/api/leases/active?unitId=${unit}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it('returns 400 for invalid unitId UUID', async () => {
      const res = await landlord.agent.get('/api/leases/active?unitId=not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('returns 404 when no active lease exists', async () => {
      const res = await landlord.agent.get(`/api/leases/active?unitId=${unit2}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('GET /tenants/:membershipId/history', () => {
    let tenant: Actor;
    let past: string;
    let current: string;
    beforeEach(async () => {
      past = await makeLease(org.id, unit, org.landlordUserId, { status: 'ended', startDate: '2024-01-01' });
      current = await makeLease(org.id, unit2, org.landlordUserId, {
        status: 'active',
        startDate: '2025-06-01',
      });
      tenant = await tenantOn(current);
      await q(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1,$2,$3,true)`,
        [org.id, past, tenant.membershipId],
      );
      await makeBill(org.id, past, { periodMonth: '2024-02-01', totalPoisha: 1000000 });
      await makeBill(org.id, current, { periodMonth: '2025-07-01', totalPoisha: 1500000 });
      await makePayment(org.id, current, tenant.userId, { amountPoisha: 700000 });
    });

    it('landlord gets the tenant, current and past leases, bills and payments', async () => {
      const res = await landlord.agent.get(`/api/tenants/${tenant.membershipId}/history`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.tenant).toEqual(
        expect.objectContaining({ membershipId: tenant.membershipId, email: tenant.email }),
      );
      expect((d.leases as { id: string }[]).map((l) => l.id).sort()).toEqual([past, current].sort());
      expect(d.leases.find((l: { id: string }) => l.id === past).status).toBe('ended');
      expect(d.leases.find((l: { id: string }) => l.id === current).status).toBe('active');
      expect(d.bills).toHaveLength(2);
      expect(d.payments).toHaveLength(1);
      expect(d.payments[0]).toEqual(expect.objectContaining({ amountPoisha: 700000 }));
    });

    it('does not include another tenant’s leases, bills or payments', async () => {
      const otherLease = await makeLease(org.id, otherUnit, org.landlordUserId, { status: 'active' });
      await makeBill(org.id, otherLease, { periodMonth: '2025-08-01', totalPoisha: 9999999 });
      const stranger = await tenantOn(otherLease);
      await makePayment(org.id, otherLease, stranger.userId, { amountPoisha: 424242 });
      const res = await landlord.agent.get(`/api/tenants/${tenant.membershipId}/history`);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(otherLease);
      expect(text).not.toContain('424242');
      expect(text).not.toContain(stranger.email);
    });

    it('caretaker and tenant (even for themselves) get 403 FORBIDDEN', async () => {
      for (const a of [caretaker, tenant]) {
        const res = await a.agent.get(`/api/tenants/${tenant.membershipId}/history`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      }
    });

    it('404 for a missing membership, a non-tenant membership, and another org’s tenant', async () => {
      const orgB = await makeOrg();
      const tB = (await actorIn(ctx, orgB.id, 'tenant')).membershipId;
      for (const id of [MISSING, caretaker.membershipId, tB]) {
        const res = await landlord.agent.get(`/api/tenants/${id}/history`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });
});
