import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createPrisma, type Db } from '../src/config/db';
import { appUrl, workerUrl } from './helpers/env';
import { resetData, closeOwner, asApp, connectAs, pgErrorCode, q } from './helpers/pg';
import { makeOrg, makeBuilding, makeUnit, makeLease, type Org } from './helpers/factories';

let db: Db;
let A: Org;
let B: Org;
let bldA: string;
let bldB: string;

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
  bldA = await makeBuilding(A.id, { name: 'A Tower' });
  bldB = await makeBuilding(B.id, { name: 'B Tower' });
});

const ctxA = () => ({ orgId: A.id, userId: A.landlordUserId, role: 'landlord' as const });

describe('tenant isolation via db.$tx as bm_app (tenant-isolation.int.test.ts)', () => {
  it('findMany returns only the current org rows', async () => {
    const rows = await db.$tx(ctxA(), (tx) => tx.building.findMany());
    expect(rows.map((r) => r.id)).toEqual([bldA]);
  });

  it('findUnique of another org id returns null', async () => {
    const row = await db.$tx(ctxA(), (tx) => tx.building.findUnique({ where: { id: bldB } }));
    expect(row).toBeNull();
  });

  it('update of another org id touches nothing (throws not-found; updateMany count 0)', async () => {
    await expect(
      db.$tx(ctxA(), (tx) => tx.building.update({ where: { id: bldB }, data: { name: 'hacked' } })),
    ).rejects.toThrow();
    const res = await db.$tx(ctxA(), (tx) =>
      tx.building.updateMany({ where: { id: bldB }, data: { name: 'hacked' } }),
    );
    expect(res.count).toBe(0);
    const [row] = await q<{ name: string }>('select name from buildings where id = $1', [bldB]);
    expect(row!.name).toBe('B Tower');
  });

  it('delete of another org id touches nothing', async () => {
    await expect(db.$tx(ctxA(), (tx) => tx.building.delete({ where: { id: bldB } }))).rejects.toThrow();
    const res = await db.$tx(ctxA(), (tx) => tx.building.deleteMany({ where: { id: bldB } }));
    expect(res.count).toBe(0);
    expect(await q('select 1 from buildings where id = $1', [bldB])).toHaveLength(1);
  });

  it('create with another orgId is rejected by the WITH CHECK policy', async () => {
    await expect(
      db.$tx(ctxA(), (tx) =>
        tx.building.create({
          data: {
            orgId: B.id,
            name: 'Smuggled',
            address: 'x',
            area: 'x',
            city: 'x',
            lateFeeType: 'none',
            lateFeeValue: 0,
          },
        }),
      ),
    ).rejects.toThrow();
    expect(await q(`select 1 from buildings where name = 'Smuggled'`)).toHaveLength(0);
  });

  it('create with the own orgId works and is visible in the same context', async () => {
    const created = await db.$tx(ctxA(), (tx) =>
      tx.building.create({
        data: {
          orgId: A.id,
          name: 'A Two',
          address: 'x',
          area: 'x',
          city: 'x',
          lateFeeType: 'none',
          lateFeeValue: 0,
        },
      }),
    );
    const rows = await db.$tx(ctxA(), (tx) => tx.building.findMany());
    expect(rows.map((r) => r.id)).toContain(created.id);
    expect(rows).toHaveLength(2);
  });

  it('a row in org A cannot point at a row of org B (composite (org_id, x_id) foreign keys → 23503)', async () => {
    // Without the composite FK this insert succeeded: FK checks ignore RLS.
    const unitCode = await asApp(ctxA(), (c) =>
      pgErrorCode(
        c.query(
          `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
           values ($1, $2, 'X-1', 1, 'family_flat', 100, 'none')`,
          [A.id, bldB],
        ),
      ),
    );
    expect(unitCode).toBe('23503');

    // The reviewer's case: org A "leases" org B's unit, which would block B from ever leasing it.
    const unitB = await makeUnit(B.id, bldB);
    const leaseCode = await asApp(ctxA(), (c) =>
      pgErrorCode(
        c.query(
          `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, status, created_by)
           values ($1, $2, '2026-01-01', 100, 'active', $3)`,
          [A.id, unitB, A.landlordUserId],
        ),
      ),
    );
    expect(leaseCode).toBe('23503');
    await expect(makeLease(B.id, unitB, B.landlordUserId)).resolves.toBeTruthy();

    // Same through Prisma inside $tx.
    await expect(
      db.$tx(ctxA(), (tx) =>
        tx.unit.create({
          data: {
            orgId: A.id,
            buildingId: bldB,
            label: 'X-2',
            floor: 1,
            type: 'family_flat',
            defaultRentPoisha: 100n,
            electricityMode: 'none',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'P2003' });

    // Even the owner (no RLS at all) can't mix orgs: the constraint itself forbids it.
    expect(
      await pgErrorCode(
        q(
          `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
           values ($1, $2, 'X-3', 1, 'family_flat', 100, 'none')`,
          [A.id, bldB],
        ),
      ),
    ).toBe('23503');
  });

  it("a unique key on a FK column can't reveal org B's rows (org_id leads it, so the answer is 23503, not 23505)", async () => {
    // B's unit already has a live lease and a 'B-1' label. Before org_id led those uniques, org A naming
    // B's ids got 23505 ("taken"), which told A the row exists.
    const unitB = await makeUnit(B.id, bldB, { label: 'B-1' });
    await makeLease(B.id, unitB, B.landlordUserId);
    const leaseCode = await asApp(ctxA(), (c) =>
      pgErrorCode(
        c.query(
          `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, status, created_by)
           values ($1, $2, '2026-01-01', 100, 'active', $3)`,
          [A.id, unitB, A.landlordUserId],
        ),
      ),
    );
    expect(leaseCode).toBe('23503');
    const labelCode = await asApp(ctxA(), (c) =>
      pgErrorCode(
        c.query(
          `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
           values ($1, $2, 'B-1', 1, 'family_flat', 100, 'none')`,
          [A.id, bldB],
        ),
      ),
    );
    expect(labelCode).toBe('23503');
  });

  it("even BYPASSRLS bm_worker can't move a parent into another org: composite FKs are ON UPDATE NO ACTION", async () => {
    const unitA = await makeUnit(A.id, bldA);
    const worker = await connectAs(workerUrl());
    try {
      // With Prisma's default ON UPDATE CASCADE this succeeded and re-homed the unit (and its subtree) into B.
      expect(
        await pgErrorCode(worker.query('update buildings set org_id = $1 where id = $2', [B.id, bldA])),
      ).toBe('23503');
    } finally {
      await worker.end();
    }
    const [row] = await q<{ org_id: string }>('select org_id from buildings where id = $1', [bldA]);
    expect(row!.org_id).toBe(A.id);
    const [unit] = await q<{ org_id: string }>('select org_id from units where id = $1', [unitA]);
    expect(unit!.org_id).toBe(A.id);
  });

  it('notifications: in org A a user may write their own notification for org A or no org, never tagged org B', async () => {
    const insert = (orgId: string | null) =>
      asApp(ctxA(), (c) =>
        pgErrorCode(
          c.query(`insert into notifications (org_id, user_id, type, title) values ($1, $2, 'x', 'x')`, [
            orgId,
            A.landlordUserId,
          ]),
        ),
      );
    expect(await insert(B.id)).toBe('42501');
    expect(await insert(A.id)).toBeUndefined();
    expect(await insert(null)).toBeUndefined();
  });

  it('a raw $queryRaw with org A context cannot see org B rows', async () => {
    const rows = await db.$tx(ctxA(), (tx) => tx.$queryRaw<{ id: string }[]>`select id from buildings`);
    expect(rows.map((r) => r.id)).toEqual([bldA]);
    const none = await db.$tx(
      ctxA(),
      (tx) => tx.$queryRaw<{ id: string }[]>`select id from buildings where org_id = ${B.id}::uuid`,
    );
    expect(none).toEqual([]);
  });

  it('with NO context set, a plain bm_app connection sees 0 rows (policy compares to NULL)', async () => {
    const rows = await asApp(null, (c) => c.query('select * from buildings'));
    expect(rows.rowCount).toBe(0);
  });

  it('after a tenant transaction on the SAME connection, a context-less query still returns 0 rows (no uuid cast error)', async () => {
    // set_config(..., true) leaves an empty string, not NULL, once the setting existed on the session.
    // Policies must cope with '' (e.g. nullif(current_setting(..), '')::uuid) instead of raising 22P02.
    const c = await connectAs(appUrl());
    try {
      await c.query('begin');
      await c.query(`select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)`, [
        A.id,
        A.landlordUserId,
      ]);
      expect((await c.query('select id from buildings')).rowCount).toBe(1);
      await c.query('commit');
      const err = await pgErrorCode(c.query('select * from buildings'));
      expect(err).toBeUndefined();
      expect((await c.query('select * from buildings')).rowCount).toBe(0);
      expect((await c.query('select * from organizations')).rowCount).toBe(0);
    } finally {
      await c.end();
    }
  });

  it('organizations: a member context sees only its own org; an admin context may read all', async () => {
    const own = await asApp(ctxA(), (c) => c.query('select id from organizations'));
    expect(own.rows.map((r) => r.id)).toEqual([A.id]);
    const admin = await asApp({ orgId: null, userId: A.landlordUserId, role: null, isAdmin: true }, (c) =>
      c.query('select id from organizations order by name'),
    );
    expect(admin.rows.map((r) => r.id).sort()).toEqual([A.id, B.id].sort());
  });
});
