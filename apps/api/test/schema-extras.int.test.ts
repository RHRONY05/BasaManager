import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createPrisma, TENANT_MODELS, type Db } from '../src/config/db';
import { appUrl, workerUrl } from './helpers/env';
import { resetData, closeOwner, asApp, pgErrorCode, q } from './helpers/pg';
import { makeOrg, makeOrgWithLease, makeBuilding } from './helpers/factories';
import { createQueryCounter } from '../../../tests/helpers/queryCounter';

/**
 * Architect's checks for the parts of 03 the test-designer's files don't cover: the outbox write-only
 * policy, the admin views, the derived tenant-model list and the query counter on a real database.
 */
const counter = createQueryCounter();
let db: Db;
beforeAll(() => {
  db = createPrisma(appUrl(), { onQuery: counter.onQuery });
});
afterAll(async () => {
  await db.$disconnect();
  await closeOwner();
});
beforeEach(resetData);

describe('outbox is write-only for bm_app', () => {
  it('createMany inside $tx inserts for the own org or no org; bm_worker reads it', async () => {
    const o = await makeOrg();
    const ctx = { orgId: o.id, userId: o.landlordUserId, role: 'landlord' as const };
    const res = await db.$tx(ctx, (tx) =>
      tx.outboxMessage.createMany({
        data: [
          { orgId: o.id, type: 'bill.issued', payload: { billId: 'x' } },
          { orgId: null, type: 'user.welcome', payload: {} },
        ],
      }),
    );
    expect(res.count).toBe(2);
    const seen = await asApp(null, (c) => c.query('select type from outbox order by type'), workerUrl());
    expect(seen.rows.map((r) => r.type)).toEqual(['bill.issued', 'user.welcome']);
  });

  it('bm_app cannot insert for another org, nor select, update or delete outbox rows', async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const ctx = { orgId: a.id, userId: a.landlordUserId, role: 'landlord' as const };
    await expect(
      db.$tx(ctx, (tx) => tx.outboxMessage.createMany({ data: [{ orgId: b.id, type: 't', payload: {} }] })),
    ).rejects.toThrow();
    for (const sql of ['select * from outbox', `update outbox set attempts = 1`, 'delete from outbox']) {
      expect(await asApp(ctx, (c) => pgErrorCode(c.query(sql))), sql).toBe('42501');
    }
  });
});

describe('admin views', () => {
  it('admin_org_overview shows every org with counts in admin context only', async () => {
    const o = await makeOrgWithLease();
    await makeOrg();
    const admin = { orgId: null, userId: o.landlordUserId, role: null, isAdmin: true };
    const rows = await db.$tx(admin, (tx) =>
      tx.$queryRaw<
        { id: string; building_count: number; unit_count: number; active_lease_count: number }[]
      >`select id, building_count, unit_count, active_lease_count from admin_org_overview`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === o.id)).toMatchObject({
      building_count: 1,
      unit_count: 1,
      active_lease_count: 1,
    });
    const member = { orgId: o.id, userId: o.landlordUserId, role: 'landlord' as const };
    const none = await db.$tx(member, (tx) => tx.$queryRaw<unknown[]>`select * from admin_org_overview`);
    expect(none).toEqual([]);
  });

  it('admin_health lists job runs and failed outbox rows in admin context; bm_app cannot write views', async () => {
    const o = await makeOrg();
    await q(`insert into job_runs (job, status) values ('generateBills', 'ok')`);
    await q(`insert into outbox (org_id, type, payload, status, attempts) values ($1, 'x', '{}', 'failed', 5)`, [
      o.id,
    ]);
    const admin = { orgId: null, userId: o.landlordUserId, role: null, isAdmin: true };
    const rows = await db.$tx(admin, (tx) =>
      tx.$queryRaw<{ kind: string }[]>`select kind from admin_health order by kind`,
    );
    expect(rows.map((r) => r.kind)).toEqual(['job_run', 'outbox_failed']);
    const grants = await q<{ view: string; sel: boolean; ins: boolean; del: boolean }>(
      `select v as view, has_table_privilege('bm_app', v, 'SELECT') as sel,
              has_table_privilege('bm_app', v, 'INSERT') as ins, has_table_privilege('bm_app', v, 'DELETE') as del
         from unnest(array['admin_health', 'admin_org_overview']) v`,
    );
    for (const g of grants) expect(g, g.view).toMatchObject({ sel: true, ins: false, del: false });
  });
});

describe('tenant model list and query counter', () => {
  it('is derived from the schema: every org_id model plus Organization, no identity tables', () => {
    for (const m of ['Organization', 'Building', 'Bill', 'Document', 'Notification', 'OutboxMessage']) {
      expect(TENANT_MODELS.has(m), m).toBe(true);
    }
    for (const m of ['User', 'Session', 'AuthToken', 'OauthAccount', 'JobRun', 'PushSubscription']) {
      expect(TENANT_MODELS.has(m), m).toBe(false);
    }
    expect(TENANT_MODELS.size).toBe(27);
  });

  it('counts real Prisma statements; a findMany is one statement whatever the row count', async () => {
    const o = await makeOrg();
    const ctx = { orgId: o.id, userId: o.landlordUserId, role: 'landlord' as const };
    for (let i = 0; i < 5; i++) await makeBuilding(o.id);
    const five = await counter.measure(() => db.$tx(ctx, (tx) => tx.building.findMany()));
    for (let i = 0; i < 45; i++) await makeBuilding(o.id);
    const fifty = await counter.measure(() => db.$tx(ctx, (tx) => tx.building.findMany()));
    expect(five.result).toHaveLength(5);
    expect(fifty.result).toHaveLength(50);
    expect(five.count).toBe(1);
    expect(fifty.count).toBe(five.count);
  });
});
