import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeBuilding, makeUnit, makeLease, type Org } from '../helpers/factories';
import { buildTestApp, resetAll, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';

describe('V6: caretaker building scope', () => {
  let ctx: TestCtx;
  let org: Org;
  let mine: string;
  let notMine: string;
  let myUnit: string;
  let theirUnit: string;
  let landlord: Actor;
  let caretaker: Actor;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg();
    mine = await makeBuilding(org.id, { name: 'Mine' });
    notMine = await makeBuilding(org.id, { name: 'NotMine' });
    myUnit = await makeUnit(org.id, mine, { label: 'M1' });
    theirUnit = await makeUnit(org.id, notMine, { label: 'N1' });
    await makeLease(org.id, myUnit, org.landlordUserId, { status: 'active' });
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [mine] });
  });

  it('GET /buildings lists ONLY the assigned buildings, with counts', async () => {
    const res = await caretaker.agent.get('/api/buildings');
    expect(res.status).toBe(200);
    const list = res.body.data as { id: string; unitCount: number; occupiedCount: number }[];
    expect(list.map((b) => b.id)).toEqual([mine]);
    expect(list[0]).toEqual(expect.objectContaining({ unitCount: 1, occupiedCount: 1 }));
    expect(JSON.stringify(res.body)).not.toContain('NotMine');
  });

  it('GET /buildings/:id works for an assigned building', async () => {
    const res = await caretaker.agent.get(`/api/buildings/${mine}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(mine);
  });

  it('GET /buildings/:id of an unassigned building is 404 NOT_FOUND, identical to a non-existent one', async () => {
    const res = await caretaker.agent.get(`/api/buildings/${notMine}`);
    const missing = await caretaker.agent.get('/api/buildings/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(missing.status).toBe(404);
    // requestId is unique per response; compare the rest of the error payload
    expect(res.body.error).toEqual({ ...missing.body.error, requestId: res.body.error.requestId });
  });

  it('GET /buildings/:id/units lists units for an assigned building, 404 for an unassigned one', async () => {
    const ok = await caretaker.agent.get(`/api/buildings/${mine}/units`);
    expect(ok.status).toBe(200);
    expect((ok.body.data as { id: string }[]).map((u) => u.id)).toEqual([myUnit]);
    const no = await caretaker.agent.get(`/api/buildings/${notMine}/units`);
    expect(no.status).toBe(404);
    expect(no.body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(JSON.stringify(no.body)).not.toContain(theirUnit);
  });

  it('write routes are 403 for a caretaker even on an assigned building (role beats scope)', async () => {
    const attempts = [
      caretaker.agent.patch(`/api/buildings/${mine}`).send({ name: 'x' }),
      caretaker.agent.post(`/api/buildings/${mine}/archive`),
      caretaker.agent.post(`/api/buildings/${mine}/units`).send({
        label: 'Q1',
        floor: 1,
        type: 'room',
        defaultRentPoisha: 1,
        electricityMode: 'none',
      }),
      caretaker.agent.patch(`/api/units/${myUnit}`).send({ defaultRentPoisha: 1 }),
      caretaker.agent.post(`/api/units/${myUnit}/archive`),
    ];
    for (const r of await Promise.all(attempts)) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe(ErrorCode.FORBIDDEN);
    }
  });

  it('a caretaker with no assignments sees an empty list', async () => {
    const none = await actorIn(ctx, org.id, 'caretaker');
    const res = await none.agent.get('/api/buildings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('reassignment takes effect on the next request (no re-login)', async () => {
    const put = await landlord.agent
      .put(`/api/org/members/${caretaker.membershipId}/buildings`)
      .send({ buildingIds: [notMine] });
    expect(put.status).toBe(200);
    expect((await caretaker.agent.get(`/api/buildings/${mine}`)).status).toBe(404);
    expect((await caretaker.agent.get(`/api/buildings/${notMine}`)).status).toBe(200);
    const list = await caretaker.agent.get('/api/buildings');
    expect((list.body.data as { id: string }[]).map((b) => b.id)).toEqual([notMine]);
  });

  it('a caretaker assigned in org A has no access to org B buildings (cross-org, 404)', async () => {
    const orgB = await makeOrg();
    const bB = await makeBuilding(orgB.id, { name: 'OrgB' });
    const res = await caretaker.agent.get(`/api/buildings/${bB}`);
    expect(res.status).toBe(404);
    expect((await caretaker.agent.get(`/api/buildings/${bB}/units`)).status).toBe(404);
  });

  it('an archived building drops out of the caretaker list but assignments are kept', async () => {
    await q(`update buildings set archived_at = now() where id=$1`, [mine]);
    const res = await caretaker.agent.get('/api/buildings');
    expect(res.body.data).toEqual([]);
    expect(await q(`select 1 from caretaker_buildings where building_id=$1`, [mine])).toHaveLength(1);
  });

  it('reassignment rejects archived buildings with 400 VALIDATION_FAILED', async () => {
    const archivedB = await makeBuilding(org.id, { name: 'Archived' });
    await q(`update buildings set archived_at = now() where id=$1`, [archivedB]);
    const res = await landlord.agent
      .put(`/api/org/members/${caretaker.membershipId}/buildings`)
      .send({ buildingIds: [archivedB] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('reassignment rejects removed members with 404 NOT_FOUND', async () => {
    await landlord.agent.delete(`/api/org/members/${caretaker.membershipId}`);
    const res = await landlord.agent
      .put(`/api/org/members/${caretaker.membershipId}/buildings`)
      .send({ buildingIds: [notMine] });
    expect(res.status).toBe(404);
  });

  it('inviting a caretaker with an archived building is rejected with 400', async () => {
    const archivedB = await makeBuilding(org.id, { name: 'ArchivedB' });
    await q(`update buildings set archived_at = now() where id=$1`, [archivedB]);
    const res = await landlord.agent.post('/api/org/invites').send({
      email: 'newcaretaker@example.com',
      role: 'caretaker',
      buildingIds: [archivedB],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('inviting an existing active member is rejected with 409 CONFLICT', async () => {
    const res = await landlord.agent.post('/api/org/invites').send({
      email: caretaker.email,
      role: 'caretaker',
      buildingIds: [mine],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
  });
});
