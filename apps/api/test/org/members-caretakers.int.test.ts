import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeBuilding, makeMembership, type Org } from '../helpers/factories';
import {
  buildTestApp,
  resetAll,
  newAgent,
  loginAs,
  insertUser,
  insertInvitation,
  uniqEmail,
  PASSWORD,
  type TestCtx,
} from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';

describe('V6: organisation, members, caretaker invites', () => {
  let ctx: TestCtx;
  let org: Org;
  let b1: string;
  let b2: string;
  let landlord: Actor;
  let caretaker: Actor;
  let tenant: Actor;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg({ name: 'Green View Apartments' });
    b1 = await makeBuilding(org.id, { name: 'B1' });
    b2 = await makeBuilding(org.id, { name: 'B2' });
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [b1] });
    tenant = await actorIn(ctx, org.id, 'tenant');
  });

  const inviteOf = (o: Partial<Parameters<typeof insertInvitation>[0]> = {}) =>
    insertInvitation({
      orgId: org.id,
      invitedBy: org.landlordUserId,
      email: uniqEmail(),
      role: 'caretaker',
      ...o,
    });

  describe('GET/PATCH /api/org', () => {
    it.each(['landlord', 'caretaker', 'tenant'] as const)('%s can read the org', async (who) => {
      const a = { landlord, caretaker, tenant }[who];
      const res = await a.agent.get('/api/org');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({ id: org.id, name: 'Green View Apartments', status: expect.any(String) }),
      );
      expect(res.body.data.slug).toBeTruthy();
    });

    it('unauthenticated is 401', async () => {
      expect((await newAgent(ctx).get('/api/org')).status).toBe(401);
    });

    it('landlord renames the org', async () => {
      const res = await landlord.agent.patch('/api/org').send({ name: 'Blue View' });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Blue View');
      const row = await q<{ name: string }>(`select name from organizations where id=$1`, [org.id]);
      expect(row[0]!.name).toBe('Blue View');
    });

    it.each(['caretaker', 'tenant'] as const)('%s cannot rename: 403 FORBIDDEN', async (who) => {
      const res = await { caretaker, tenant }[who].agent.patch('/api/org').send({ name: 'Hacked' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('rejects an empty name (VALIDATION_FAILED)', async () => {
      const res = await landlord.agent.patch('/api/org').send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('GET /api/org/members', () => {
    it('landlord sees members with role, status, user and caretaker buildingIds', async () => {
      const res = await landlord.agent.get('/api/org/members');
      expect(res.status).toBe(200);
      const list = res.body.data as {
        id: string;
        userId: string;
        role: string;
        status: string;
        user: { fullName: string; email: string };
        buildingIds?: string[];
      }[];
      expect(list.map((m) => m.role).sort()).toEqual(['caretaker', 'landlord', 'tenant']);
      const c = list.find((m) => m.role === 'caretaker')!;
      expect(c).toEqual(
        expect.objectContaining({ id: caretaker.membershipId, userId: caretaker.userId, status: 'active' }),
      );
      expect(c.user.email).toBe(caretaker.email);
      expect(c.user.fullName).toBeTruthy();
      expect(c.buildingIds).toEqual([b1]);
    });

    it("does not leak another org's members", async () => {
      const other = await makeOrg();
      const stranger = await insertUser();
      await makeMembership(other.id, stranger.id, 'caretaker');
      const res = await landlord.agent.get('/api/org/members');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(stranger.email);
    });

    it.each(['caretaker', 'tenant'] as const)('%s gets 403', async (who) => {
      const res = await { caretaker, tenant }[who].agent.get('/api/org/members');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('POST/GET/DELETE /api/org/invites', () => {
    it('creates a caretaker invitation and an outbox invite.sent', async () => {
      const email = uniqEmail('care');
      const res = await landlord.agent
        .post('/api/org/invites')
        .send({ email, role: 'caretaker', buildingIds: [b1, b2] });
      expect(res.status).toBe(201);
      const inv = await q<{ role: string; building_ids: string[]; invited_by: string }>(
        `select role, building_ids, invited_by from invitations where org_id=$1 and email=$2`,
        [org.id, email],
      );
      expect(inv).toHaveLength(1);
      expect(inv[0]!.role).toBe('caretaker');
      expect([...inv[0]!.building_ids].sort()).toEqual([b1, b2].sort());
      expect(inv[0]!.invited_by).toBe(landlord.userId);
      expect(JSON.stringify(res.body)).not.toMatch(/token_?hash/i);
      expect(await q(`select 1 from outbox where type='invite.sent'`)).toHaveLength(1);
    });

    it('a second open invite for the same email+role is 409 CONFLICT', async () => {
      const email = uniqEmail('care');
      const body = { email, role: 'caretaker', buildingIds: [b1] };
      expect((await landlord.agent.post('/api/org/invites').send(body)).status).toBe(201);
      const dup = await landlord.agent.post('/api/org/invites').send(body);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe(ErrorCode.CONFLICT);
      expect(await q(`select 1 from invitations where org_id=$1 and email=$2`, [org.id, email])).toHaveLength(
        1,
      );
    });

    it('rejects role tenant, a bad email, and buildings of another org', async () => {
      const bad = await landlord.agent
        .post('/api/org/invites')
        .send({ email: uniqEmail(), role: 'tenant', buildingIds: [b1] });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      const badEmail = await landlord.agent
        .post('/api/org/invites')
        .send({ email: 'nope', role: 'caretaker', buildingIds: [b1] });
      expect(badEmail.status).toBe(400);
      const other = await makeOrg();
      const foreign = await makeBuilding(other.id);
      const res = await landlord.agent
        .post('/api/org/invites')
        .send({ email: uniqEmail(), role: 'caretaker', buildingIds: [foreign] });
      expect([400, 404]).toContain(res.status);
      expect(await q(`select 1 from invitations where org_id=$1`, [org.id])).toHaveLength(0);
    });

    it.each(['caretaker', 'tenant'] as const)('%s cannot invite, list or revoke: 403', async (who) => {
      const a = { caretaker, tenant }[who];
      const { id } = await inviteOf();
      const post = await a.agent
        .post('/api/org/invites')
        .send({ email: uniqEmail(), role: 'caretaker', buildingIds: [b1] });
      expect(post.status).toBe(403);
      expect(post.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect((await a.agent.get('/api/org/invites')).status).toBe(403);
      expect((await a.agent.delete(`/api/org/invites/${id}`)).status).toBe(403);
    });

    it('lists only pending invitations of this org', async () => {
      const pending = await inviteOf({ email: uniqEmail('p') });
      await inviteOf({ revokedAt: new Date() });
      await inviteOf({ acceptedAt: new Date() });
      const other = await makeOrg();
      await insertInvitation({
        orgId: other.id,
        invitedBy: other.landlordUserId,
        email: uniqEmail('o'),
        role: 'caretaker',
      });
      const res = await landlord.agent.get('/api/org/invites');
      expect(res.status).toBe(200);
      expect((res.body.data as { id: string }[]).map((i) => i.id)).toEqual([pending.id]);
    });

    it('revokes an invite (revoked_at set) and its token stops working', async () => {
      const { id, token } = await inviteOf({ buildingIds: [b1] });
      const res = await landlord.agent.delete(`/api/org/invites/${id}`);
      expect([200, 204]).toContain(res.status);
      const row = await q<{ revoked_at: Date | null }>(`select revoked_at from invitations where id=$1`, [
        id,
      ]);
      expect(row[0]!.revoked_at).not.toBeNull();
      const acc = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'X Y' });
      expect(acc.status).toBe(400);
      expect(acc.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
    });

    it("revoking another org's invite is 404 NOT_FOUND", async () => {
      const other = await makeOrg();
      const { id } = await insertInvitation({
        orgId: other.id,
        invitedBy: other.landlordUserId,
        email: uniqEmail(),
        role: 'caretaker',
      });
      const res = await landlord.agent.delete(`/api/org/invites/${id}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      const row = await q<{ revoked_at: Date | null }>(`select revoked_at from invitations where id=$1`, [
        id,
      ]);
      expect(row[0]!.revoked_at).toBeNull();
    });

    it('after revoking, a fresh invite for the same email is allowed', async () => {
      const email = uniqEmail('care');
      const body = { email, role: 'caretaker', buildingIds: [b1] };
      expect((await landlord.agent.post('/api/org/invites').send(body)).status).toBe(201);
      const id = (await q<{ id: string }>(`select id from invitations where email=$1`, [email]))[0]!.id;
      await landlord.agent.delete(`/api/org/invites/${id}`);
      expect((await landlord.agent.post('/api/org/invites').send(body)).status).toBe(201);
    });
  });

  describe('PUT /api/org/members/:membershipId/buildings', () => {
    const assigned = async (membershipId: string) =>
      (
        await q<{ building_id: string }>(
          `select building_id from caretaker_buildings where membership_id=$1`,
          [membershipId],
        )
      ).map((r) => r.building_id);

    it("replaces the caretaker's assigned buildings", async () => {
      const res = await landlord.agent
        .put(`/api/org/members/${caretaker.membershipId}/buildings`)
        .send({ buildingIds: [b2] });
      expect(res.status).toBe(200);
      expect(await assigned(caretaker.membershipId)).toEqual([b2]);
    });

    it('an empty list unassigns everything', async () => {
      const res = await landlord.agent
        .put(`/api/org/members/${caretaker.membershipId}/buildings`)
        .send({ buildingIds: [] });
      expect(res.status).toBe(200);
      expect(await assigned(caretaker.membershipId)).toEqual([]);
    });

    it('rejects buildings of another org and non-caretaker targets, changing nothing', async () => {
      const other = await makeOrg();
      const foreign = await makeBuilding(other.id);
      const r1 = await landlord.agent
        .put(`/api/org/members/${caretaker.membershipId}/buildings`)
        .send({ buildingIds: [foreign] });
      expect([400, 404]).toContain(r1.status);
      const r2 = await landlord.agent
        .put(`/api/org/members/${tenant.membershipId}/buildings`)
        .send({ buildingIds: [b1] });
      expect([400, 404, 409]).toContain(r2.status);
      expect(await assigned(caretaker.membershipId)).toEqual([b1]);
      expect(await assigned(tenant.membershipId)).toEqual([]);
    });

    it("a caretaker cannot change assignments (403); another org's membership is 404", async () => {
      const r = await caretaker.agent
        .put(`/api/org/members/${caretaker.membershipId}/buildings`)
        .send({ buildingIds: [b1, b2] });
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe(ErrorCode.FORBIDDEN);
      const other = await makeOrg();
      const om = await makeMembership(other.id, (await insertUser()).id, 'caretaker');
      const r2 = await landlord.agent.put(`/api/org/members/${om}/buildings`).send({ buildingIds: [] });
      expect(r2.status).toBe(404);
      expect(r2.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('DELETE /api/org/members/:membershipId', () => {
    it('soft-removes a caretaker: status removed, removed_at set, assignments dropped, row kept', async () => {
      const res = await landlord.agent.delete(`/api/org/members/${caretaker.membershipId}`);
      expect([200, 204]).toContain(res.status);
      const m = await q<{ status: string; removed_at: Date | null }>(
        `select status, removed_at from memberships where id=$1`,
        [caretaker.membershipId],
      );
      expect(m).toEqual([{ status: 'removed', removed_at: expect.any(Date) }]);
      expect(
        await q(`select 1 from caretaker_buildings where membership_id=$1`, [caretaker.membershipId]),
      ).toHaveLength(0);
    });

    it('a removed caretaker loses access to buildings', async () => {
      await landlord.agent.delete(`/api/org/members/${caretaker.membershipId}`);
      const res = await caretaker.agent.get('/api/buildings');
      expect([401, 403, 404]).toContain(res.status);
    });

    it('cannot remove the landlord or a tenant; another org caretaker is 404', async () => {
      const r1 = await landlord.agent.delete(`/api/org/members/${landlord.membershipId}`);
      expect([400, 403, 409]).toContain(r1.status);
      const r2 = await landlord.agent.delete(`/api/org/members/${tenant.membershipId}`);
      expect([400, 403, 409]).toContain(r2.status);
      const other = await makeOrg();
      const om = await makeMembership(other.id, (await insertUser()).id, 'caretaker');
      const r3 = await landlord.agent.delete(`/api/org/members/${om}`);
      expect(r3.status).toBe(404);
      const st = await q<{ status: string }>(`select status from memberships where id = any($1)`, [
        [landlord.membershipId, tenant.membershipId, om],
      ]);
      expect(st.every((s) => s.status === 'active')).toBe(true);
    });

    it('caretaker and tenant get 403', async () => {
      const r = await caretaker.agent.delete(`/api/org/members/${caretaker.membershipId}`);
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect((await tenant.agent.delete(`/api/org/members/${caretaker.membershipId}`)).status).toBe(403);
    });
  });

  describe('POST /api/invites/:token/accept (caretaker invites)', () => {
    it('a new user gets an active caretaker membership with the invited buildings', async () => {
      const email = uniqEmail('newcare');
      const { token } = await inviteOf({ email, buildingIds: [b1, b2] });
      const res = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'New Care' });
      expect(res.status).toBe(200);
      const m = await q<{ id: string; role: string; status: string }>(
        `select m.id, m.role, m.status from memberships m join users u on u.id=m.user_id where m.org_id=$1 and u.email=$2`,
        [org.id, email],
      );
      expect(m).toEqual([expect.objectContaining({ role: 'caretaker', status: 'active' })]);
      const cb = await q<{ building_id: string }>(
        `select building_id from caretaker_buildings where membership_id=$1`,
        [m[0]!.id],
      );
      expect(cb.map((r) => r.building_id).sort()).toEqual([b1, b2].sort());
    });

    it('a removed member accepting a new invite is reactivated (same row) with the new buildings', async () => {
      await landlord.agent.delete(`/api/org/members/${caretaker.membershipId}`);
      const { token } = await inviteOf({ email: caretaker.email, buildingIds: [b2] });
      const agent = (await loginAs(newAgent(ctx), caretaker.email, caretaker.password)).set(
        'X-Org-Id',
        org.id,
      );
      const res = await agent.post(`/api/invites/${token}/accept`).send({});
      expect(res.status).toBe(200);
      const m = await q<{ id: string; status: string; removed_at: Date | null }>(
        `select id, status, removed_at from memberships where org_id=$1 and user_id=$2`,
        [org.id, caretaker.userId],
      );
      expect(m).toEqual([{ id: caretaker.membershipId, status: 'active', removed_at: null }]);
      const cb = await q<{ building_id: string }>(
        `select building_id from caretaker_buildings where membership_id=$1`,
        [caretaker.membershipId],
      );
      expect(cb.map((r) => r.building_id)).toEqual([b2]);
    });
  });
});
