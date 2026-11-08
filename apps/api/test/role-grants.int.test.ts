import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readonlyUrl, workerUrl } from './helpers/env';
import { resetData, closeOwner, asApp, q, pgErrorCode } from './helpers/pg';
import {
  makeOrgWithLease,
  makeOrg,
  makeBuilding,
  makeBill,
  makePayment,
  makeMaintenanceRequest,
} from './helpers/factories';

afterAll(closeOwner);
beforeEach(resetData);

const HISTORY_TABLES = [
  'payments',
  'bill_lines',
  'payment_allocations',
  'receipts',
  'maintenance_events',
  'credit_entries',
] as const;

async function setup() {
  const o = await makeOrgWithLease();
  const billId = await makeBill(o.id, o.leaseId);
  const paymentId = await makePayment(o.id, o.leaseId, o.landlordUserId);
  const requestId = await makeMaintenanceRequest(o.id, o.buildingId, o.unitId, o.leaseId, o.landlordUserId);
  const ctx = { orgId: o.id, userId: o.landlordUserId, role: 'landlord' as const };
  return { o, billId, paymentId, requestId, ctx };
}

describe('database role grants (role-grants.int.test.ts)', () => {
  it.each(HISTORY_TABLES)(
    'bm_app cannot DELETE from %s (42501) even with a valid org context',
    async (table) => {
      const { ctx } = await setup();
      const code = await asApp(ctx, (c) => pgErrorCode(c.query(`delete from ${table}`)));
      expect(code).toBe('42501');
    },
  );

  it('bm_app cannot DELETE a specific existing history row either', async () => {
    const { ctx, paymentId } = await setup();
    const code = await asApp(ctx, (c) =>
      pgErrorCode(c.query('delete from payments where id = $1', [paymentId])),
    );
    expect(code).toBe('42501');
    expect(await q('select 1 from payments where id = $1', [paymentId])).toHaveLength(1);
  });

  it('bm_app can SELECT and INSERT into every history table in context', async () => {
    const { o, billId, paymentId, requestId, ctx } = await setup();
    const inserts: Record<(typeof HISTORY_TABLES)[number], [string, unknown[]]> = {
      payments: [
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, submitted_by)
         values ($1, $2, 100, 'cash', 'confirmed', '2026-03-06', $3)`,
        [o.id, o.leaseId, o.landlordUserId],
      ],
      bill_lines: [
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha) values ($1, $2, 'rent', 'Rent', 100)`,
        [o.id, billId],
      ],
      payment_allocations: [
        `insert into payment_allocations (org_id, payment_id, bill_id, amount_poisha) values ($1, $2, $3, 100)`,
        [o.id, paymentId, billId],
      ],
      receipts: [
        `insert into receipts (org_id, payment_id, number, status) values ($1, $2, 'BM-2026-000001', 'valid')`,
        [o.id, paymentId],
      ],
      maintenance_events: [
        `insert into maintenance_events (org_id, request_id, actor_id, kind) values ($1, $2, $3, 'created')`,
        [o.id, requestId, o.landlordUserId],
      ],
      credit_entries: [
        `insert into credit_entries (org_id, lease_id, amount_poisha, kind) values ($1, $2, 100, 'overpayment')`,
        [o.id, o.leaseId],
      ],
    };
    for (const table of HISTORY_TABLES) {
      const [sql, params] = inserts[table];
      await asApp(ctx, async (c) => {
        await c.query(sql, params);
        const res = await c.query(`select * from ${table}`);
        expect(res.rowCount, table).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('bm_app can UPDATE and DELETE ordinary tables (buildings) in context', async () => {
    const { o, ctx } = await setup();
    const extra = await makeBuilding(o.id, { name: 'Disposable' });
    await asApp(ctx, async (c) => {
      expect((await c.query(`update buildings set name = 'Renamed' where id = $1`, [extra])).rowCount).toBe(
        1,
      );
      expect((await c.query('delete from buildings where id = $1', [extra])).rowCount).toBe(1);
    });
  });

  it('bm_app is NOBYPASSRLS, bm_worker is BYPASSRLS, bm_owner owns the tables and is superuser', async () => {
    const roles = await q<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
      `select rolname, rolbypassrls, rolsuper from pg_roles
        where rolname in ('bm_owner','bm_app','bm_worker','bm_readonly')`,
    );
    const by = Object.fromEntries(roles.map((r) => [r.rolname, r]));
    // The admin views run with their owner's rights; a non-superuser owner would make them return 0 counts
    // silently (03 "Database roles"), so this must fail loudly instead.
    expect(by['bm_owner'], 'bm_owner must be superuser').toMatchObject({ rolsuper: true });
    expect(by['bm_app']).toMatchObject({ rolbypassrls: false, rolsuper: false });
    expect(by['bm_worker']).toMatchObject({ rolbypassrls: true, rolsuper: false });
    expect(by['bm_readonly']).toMatchObject({ rolbypassrls: false, rolsuper: false });
    const owners = await q<{ tableowner: string }>(
      `select distinct tableowner from pg_tables where schemaname = 'public' and tablename in ('buildings','payments','users')`,
    );
    expect(owners.map((r) => r.tableowner)).toEqual(['bm_owner']);
  });

  it('only bm_owner writes _prisma_migrations; bm_app/bm_worker have no access, bm_readonly may read', async () => {
    const [p] = await q<Record<string, boolean>>(
      `select has_table_privilege('bm_app', '_prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as app,
              has_table_privilege('bm_worker', '_prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as worker,
              has_table_privilege('bm_readonly', '_prisma_migrations', 'SELECT') as ro_select,
              has_table_privilege('bm_readonly', '_prisma_migrations', 'INSERT,UPDATE,DELETE') as ro_write`,
    );
    expect(p).toEqual({ app: false, worker: false, ro_select: true, ro_write: false });
    expect(await asApp(null, (c) => pgErrorCode(c.query('delete from _prisma_migrations')))).toBe('42501');
  });

  it('bm_worker sees both orgs buildings without any context', async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    await makeBuilding(a.id);
    await makeBuilding(b.id);
    const res = await asApp(null, (c) => c.query('select org_id from buildings'), workerUrl());
    expect(res.rows.map((r) => r.org_id).sort()).toEqual([a.id, b.id].sort());
  });

  it('bm_worker keeps the no-delete rule on history tables too', async () => {
    const { o } = await setup();
    for (const table of HISTORY_TABLES) {
      const code = await asApp(null, (c) => pgErrorCode(c.query(`delete from ${table}`)), workerUrl());
      expect(code, table).toBe('42501');
    }
    expect(o.id).toBeTruthy();
  });

  it('bm_readonly can SELECT but not INSERT, UPDATE or DELETE', async () => {
    const { o } = await setup();
    const sel = await asApp(null, (c) => c.query('select count(*)::int as n from buildings'), readonlyUrl());
    expect(sel.rows[0].n).toBeGreaterThanOrEqual(0); // allowed (RLS may hide rows; the grant is what matters)
    const users = await asApp(null, (c) => c.query('select count(*)::int as n from users'), readonlyUrl());
    expect(users.rows[0].n).toBeGreaterThan(0);

    const ins = await asApp(
      null,
      (c) =>
        pgErrorCode(
          c.query(
            `insert into buildings (org_id, name, address, area, city, late_fee_type, late_fee_value)
             values ($1, 'x', 'x', 'x', 'x', 'none', 0)`,
            [o.id],
          ),
        ),
      readonlyUrl(),
    );
    expect(ins).toBe('42501');
    const upd = await asApp(
      null,
      (c) => pgErrorCode(c.query(`update users set full_name = 'x'`)),
      readonlyUrl(),
    );
    expect(upd).toBe('42501');
    const del = await asApp(
      null,
      (c) => pgErrorCode(c.query(`delete from users where id = $1`, [randomUUID()])),
      readonlyUrl(),
    );
    expect(del).toBe('42501');
  });
});
