import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeBuilding, makeUnit, makeLease, type Org } from '../helpers/factories';
import { buildTestApp, resetAll, newAgent, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';

const validBuilding = {
  name: 'Sunrise Tower',
  address: 'House 5, Road 3',
  area: 'Khulshi',
  city: 'Chattogram',
  lat: 22.3569,
  lng: 91.7832,
  billDay: 1,
  dueDay: 10,
  graceDays: 3,
  lateFeeType: 'flat',
  lateFeeValue: 50000,
  electricityRatePoisha: 1000,
};

const validUnit = {
  label: 'A1',
  floor: 1,
  type: 'family_flat',
  defaultRentPoisha: 1500000,
  electricityMode: 'submeter',
  charges: [
    { name: 'Gas', amountPoisha: 100000 },
    { name: 'Service', amountPoisha: 200000 },
  ],
};

describe('V6: buildings and units', () => {
  let ctx: TestCtx;
  let org: Org;
  let landlord: Actor;
  let caretaker: Actor;
  let tenant: Actor;
  let b1: string;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg();
    b1 = await makeBuilding(org.id, { name: 'B1' });
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [b1] });
    tenant = await actorIn(ctx, org.id, 'tenant');
  });

  describe('POST /api/buildings', () => {
    it('landlord creates a building in their org with all settings', async () => {
      const res = await landlord.agent.post('/api/buildings').send(validBuilding);
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual(
        expect.objectContaining({ name: 'Sunrise Tower', billDay: 1, dueDay: 10, graceDays: 3 }),
      );
      const row = await q<Record<string, unknown>>(`select * from buildings where id=$1`, [res.body.data.id]);
      expect(row[0]).toEqual(
        expect.objectContaining({
          org_id: org.id,
          bill_day: 1,
          due_day: 10,
          grace_days: 3,
          late_fee_type: 'flat',
          late_fee_value: 50000,
          electricity_rate_poisha: 1000,
          archived_at: null,
        }),
      );
    });

    it('lat/lng are optional', async () => {
      const { lat: _lat, lng: _lng, ...rest } = validBuilding;
      const res = await landlord.agent.post('/api/buildings').send(rest);
      expect(res.status).toBe(201);
    });

    it.each([
      ['billDay 0', { billDay: 0 }],
      ['billDay 29', { billDay: 29 }],
      ['dueDay 0', { dueDay: 0 }],
      ['dueDay 29', { dueDay: 29 }],
      ['graceDays -1', { graceDays: -1 }],
      ['lateFeeValue -1', { lateFeeValue: -1 }],
      ['electricityRatePoisha -1', { electricityRatePoisha: -1 }],
      ['unknown lateFeeType', { lateFeeType: 'weekly' }],
      ['empty name', { name: '' }],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_n, patch) => {
      const res = await landlord.agent.post('/api/buildings').send({ ...validBuilding, ...patch });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(await q(`select 1 from buildings where org_id=$1 and name <> 'B1'`, [org.id])).toHaveLength(0);
    });

    it.each(['caretaker', 'tenant'] as const)('%s gets 403 FORBIDDEN', async (who) => {
      const res = await { caretaker, tenant }[who].agent.post('/api/buildings').send(validBuilding);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('unauthenticated is 401', async () => {
      expect((await newAgent(ctx).post('/api/buildings').send(validBuilding)).status).toBe(401);
    });
  });

  describe('GET /api/buildings', () => {
    it('landlord sees all org buildings with unit and occupancy counts, and none from other orgs', async () => {
      const u1 = await makeUnit(org.id, b1, { label: 'A1' });
      await makeUnit(org.id, b1, { label: 'A2' });
      await makeLease(org.id, u1, org.landlordUserId, { status: 'active' });
      const b2 = await makeBuilding(org.id, { name: 'B2' });
      const other = await makeOrg();
      await makeBuilding(other.id, { name: 'Foreign' });

      const res = await landlord.agent.get('/api/buildings');
      expect(res.status).toBe(200);
      const list = res.body.data as { id: string; name: string; unitCount: number; occupiedCount: number }[];
      expect(list.map((b) => b.id).sort()).toEqual([b1, b2].sort());
      const first = list.find((b) => b.id === b1)!;
      expect(first.unitCount).toBe(2);
      expect(first.occupiedCount).toBe(1);
      expect(JSON.stringify(res.body)).not.toContain('Foreign');
    });

    it('archived buildings are not listed by default', async () => {
      const b2 = await makeBuilding(org.id, { name: 'Old' });
      await q(`update buildings set archived_at = now() where id=$1`, [b2]);
      const res = await landlord.agent.get('/api/buildings');
      expect((res.body.data as { id: string }[]).map((b) => b.id)).toEqual([b1]);
    });

    it('tenant sees only the building of their own lease', async () => {
      const b2 = await makeBuilding(org.id, { name: 'B2' });
      const u = await makeUnit(org.id, b2, { label: 'T1' });
      const lease = await makeLease(org.id, u, org.landlordUserId, { status: 'active' });
      await q(`insert into lease_tenants (org_id, lease_id, membership_id) values ($1,$2,$3)`, [
        org.id,
        lease,
        tenant.membershipId,
      ]);
      const res = await tenant.agent.get('/api/buildings');
      expect(res.status).toBe(200);
      expect((res.body.data as { id: string }[]).map((b) => b.id)).toEqual([b2]);
    });
  });

  describe('GET /api/buildings/:id', () => {
    it('landlord gets details; another org’s landlord gets 404 NOT_FOUND', async () => {
      const ok = await landlord.agent.get(`/api/buildings/${b1}`);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toEqual(expect.objectContaining({ id: b1, name: 'B1' }));
      const otherOrg = await makeOrg();
      const otherLandlord = await landlordOf(ctx, otherOrg);
      const res = await otherLandlord.agent.get(`/api/buildings/${b1}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('an unknown id is 404 and a malformed id is 400/404, never 500', async () => {
      expect((await landlord.agent.get('/api/buildings/00000000-0000-4000-8000-000000000000')).status).toBe(
        404,
      );
      expect([400, 404]).toContain((await landlord.agent.get('/api/buildings/not-a-uuid')).status);
    });
  });

  describe('PATCH /api/buildings/:id', () => {
    it('landlord updates billing settings', async () => {
      const res = await landlord.agent
        .patch(`/api/buildings/${b1}`)
        .send({ billDay: 5, dueDay: 15, graceDays: 2, lateFeeType: 'percent', lateFeeValue: 500 });
      expect(res.status).toBe(200);
      const row = await q<Record<string, unknown>>(`select * from buildings where id=$1`, [b1]);
      expect(row[0]).toEqual(
        expect.objectContaining({
          bill_day: 5,
          due_day: 15,
          grace_days: 2,
          late_fee_type: 'percent',
          late_fee_value: 500,
        }),
      );
    });

    it('rejects out-of-range values and changes nothing', async () => {
      const res = await landlord.agent.patch(`/api/buildings/${b1}`).send({ billDay: 31 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(
        (await q<{ bill_day: number }>(`select bill_day from buildings where id=$1`, [b1]))[0]!.bill_day,
      ).toBe(1);
    });

    it('caretaker (even assigned) gets 403 FORBIDDEN', async () => {
      const res = await caretaker.agent.patch(`/api/buildings/${b1}`).send({ name: 'Mine now' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('another org’s landlord gets 404 and nothing changes', async () => {
      const otherLandlord = await landlordOf(ctx, await makeOrg());
      const res = await otherLandlord.agent.patch(`/api/buildings/${b1}`).send({ name: 'Stolen' });
      expect(res.status).toBe(404);
      expect((await q<{ name: string }>(`select name from buildings where id=$1`, [b1]))[0]!.name).toBe('B1');
    });
  });

  describe('POST /api/buildings/:id/archive', () => {
    it('archives a building with no live leases', async () => {
      const res = await landlord.agent.post(`/api/buildings/${b1}/archive`);
      expect(res.status).toBe(200);
      expect(
        (await q<{ archived_at: Date | null }>(`select archived_at from buildings where id=$1`, [b1]))[0]!
          .archived_at,
      ).not.toBeNull();
    });

    it.each(['pending', 'active', 'notice'] as const)(
      '409 CONFLICT while a %s lease exists',
      async (status) => {
        const u = await makeUnit(org.id, b1, { label: 'L1' });
        await makeLease(org.id, u, org.landlordUserId, { status });
        const res = await landlord.agent.post(`/api/buildings/${b1}/archive`);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
        expect(
          (await q<{ archived_at: Date | null }>(`select archived_at from buildings where id=$1`, [b1]))[0]!
            .archived_at,
        ).toBeNull();
      },
    );

    it('an ended lease does not block archiving', async () => {
      const u = await makeUnit(org.id, b1, { label: 'L1' });
      await makeLease(org.id, u, org.landlordUserId, { status: 'ended' });
      expect((await landlord.agent.post(`/api/buildings/${b1}/archive`)).status).toBe(200);
    });

    it('caretaker gets 403', async () => {
      const res = await caretaker.agent.post(`/api/buildings/${b1}/archive`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('POST /api/buildings/:id/units', () => {
    it('landlord creates a unit with charges', async () => {
      const res = await landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit);
      expect(res.status).toBe(201);
      const unitId = res.body.data.id as string;
      const u = await q<Record<string, unknown>>(`select * from units where id=$1`, [unitId]);
      expect(u[0]).toEqual(
        expect.objectContaining({
          org_id: org.id,
          building_id: b1,
          label: 'A1',
          type: 'family_flat',
          electricity_mode: 'submeter',
        }),
      );
      expect(Number(u[0]!['default_rent_poisha'])).toBe(1500000);
      const ch = await q<{ name: string; amount_poisha: string }>(
        `select name, amount_poisha from unit_charges where unit_id=$1 order by name`,
        [unitId],
      );
      expect(ch.map((c) => [c.name, Number(c.amount_poisha)])).toEqual([
        ['Gas', 100000],
        ['Service', 200000],
      ]);
    });

    it('charges are optional', async () => {
      const { charges: _c, ...rest } = validUnit;
      expect((await landlord.agent.post(`/api/buildings/${b1}/units`).send(rest)).status).toBe(201);
    });

    it('duplicate label in the same building is 409 CONFLICT; same label in another building is fine', async () => {
      expect((await landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit)).status).toBe(201);
      const dup = await landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe(ErrorCode.CONFLICT);
      const b2 = await makeBuilding(org.id, { name: 'B2' });
      expect((await landlord.agent.post(`/api/buildings/${b2}/units`).send(validUnit)).status).toBe(201);
    });

    it('duplicate charge names or negative amounts are VALIDATION_FAILED / CONFLICT, nothing saved', async () => {
      const dup = await landlord.agent.post(`/api/buildings/${b1}/units`).send({
        ...validUnit,
        charges: [
          { name: 'Gas', amountPoisha: 1 },
          { name: 'Gas', amountPoisha: 2 },
        ],
      });
      expect([400, 409]).toContain(dup.status);
      const neg = await landlord.agent
        .post(`/api/buildings/${b1}/units`)
        .send({ ...validUnit, label: 'A9', charges: [{ name: 'Gas', amountPoisha: -5 }] });
      expect(neg.status).toBe(400);
      expect(await q(`select 1 from units where building_id=$1`, [b1])).toHaveLength(0);
    });

    it('rejects a bad type / electricityMode / negative rent', async () => {
      for (const patch of [{ type: 'castle' }, { electricityMode: 'solar' }, { defaultRentPoisha: -1 }]) {
        const res = await landlord.agent.post(`/api/buildings/${b1}/units`).send({ ...validUnit, ...patch });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });

    it('caretaker (even assigned) gets 403; a building of another org is 404', async () => {
      const c = await caretaker.agent.post(`/api/buildings/${b1}/units`).send(validUnit);
      expect(c.status).toBe(403);
      expect(c.body.error.code).toBe(ErrorCode.FORBIDDEN);
      const otherLandlord = await landlordOf(ctx, await makeOrg());
      expect((await otherLandlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit)).status).toBe(404);
    });

    it('two concurrent creates of the same label: exactly one wins', async () => {
      const results = await Promise.all(
        [1, 2].map(() => landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit)),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await q(`select 1 from units where building_id=$1 and label='A1'`, [b1])).toHaveLength(1);
    });
  });

  describe('GET /api/buildings/:id/units', () => {
    it('lists units with charges and current lease summary; excludes archived units', async () => {
      const created = await landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit);
      const unitId = created.body.data.id as string;
      const vacant = await makeUnit(org.id, b1, { label: 'V1' });
      await makeLease(org.id, unitId, org.landlordUserId, { status: 'active' });
      const gone = await makeUnit(org.id, b1, { label: 'Z9' });
      await q(`update units set archived_at = now() where id=$1`, [gone]);

      const res = await landlord.agent.get(`/api/buildings/${b1}/units`);
      expect(res.status).toBe(200);
      const list = res.body.data as {
        id: string;
        label: string;
        charges: { name: string; amountPoisha: number }[];
        lease: { status: string } | null;
      }[];
      expect(list.map((u) => u.label).sort()).toEqual(['A1', 'V1']);
      const a1 = list.find((u) => u.id === unitId)!;
      expect(a1.charges).toHaveLength(2);
      expect(a1.lease).toEqual(expect.objectContaining({ status: 'active' }));
      expect(list.find((u) => u.id === vacant)!.lease).toBeNull();
    });

    it('tenant gets 403', async () => {
      const res = await tenant.agent.get(`/api/buildings/${b1}/units`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('PATCH /api/units/:id and POST /api/units/:id/archive', () => {
    let unit: string;
    beforeEach(async () => {
      const res = await landlord.agent.post(`/api/buildings/${b1}/units`).send(validUnit);
      unit = res.body.data.id as string;
    });

    it('landlord updates fields and replaces charges', async () => {
      const res = await landlord.agent
        .patch(`/api/units/${unit}`)
        .send({ defaultRentPoisha: 1800000, charges: [{ name: 'Water', amountPoisha: 50000 }] });
      expect(res.status).toBe(200);
      const u = await q<{ default_rent_poisha: string }>(
        `select default_rent_poisha from units where id=$1`,
        [unit],
      );
      expect(Number(u[0]!.default_rent_poisha)).toBe(1800000);
      const ch = await q<{ name: string }>(`select name from unit_charges where unit_id=$1`, [unit]);
      expect(ch.map((c) => c.name)).toEqual(['Water']);
    });

    it('renaming to an existing label in the building is 409 CONFLICT', async () => {
      await makeUnit(org.id, b1, { label: 'B2' });
      const res = await landlord.agent.patch(`/api/units/${unit}`).send({ label: 'B2' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('caretaker gets 403; other org’s landlord gets 404', async () => {
      const c = await caretaker.agent.patch(`/api/units/${unit}`).send({ defaultRentPoisha: 1 });
      expect(c.status).toBe(403);
      expect(c.body.error.code).toBe(ErrorCode.FORBIDDEN);
      const otherLandlord = await landlordOf(ctx, await makeOrg());
      const o = await otherLandlord.agent.patch(`/api/units/${unit}`).send({ defaultRentPoisha: 1 });
      expect(o.status).toBe(404);
      expect(o.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('archives a vacant unit', async () => {
      const res = await landlord.agent.post(`/api/units/${unit}/archive`);
      expect(res.status).toBe(200);
      expect(
        (await q<{ archived_at: Date | null }>(`select archived_at from units where id=$1`, [unit]))[0]!
          .archived_at,
      ).not.toBeNull();
    });

    it.each(['pending', 'active', 'notice'] as const)(
      'archive is 409 CONFLICT with a %s lease',
      async (status) => {
        await makeLease(org.id, unit, org.landlordUserId, { status });
        const res = await landlord.agent.post(`/api/units/${unit}/archive`);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
        expect(
          (await q<{ archived_at: Date | null }>(`select archived_at from units where id=$1`, [unit]))[0]!
            .archived_at,
        ).toBeNull();
      },
    );

    it('caretaker cannot archive (403)', async () => {
      const res = await caretaker.agent.post(`/api/units/${unit}/archive`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });
});
