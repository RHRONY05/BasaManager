import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as dbModule from '../src/config/db';
import { createPrisma, type Db } from '../src/config/db';
import { appUrl } from './helpers/env';
import { resetData, closeOwner } from './helpers/pg';
import { makeOrg, makeBuilding } from './helpers/factories';

let db: Db;

beforeAll(() => {
  db = createPrisma(appUrl());
});
afterAll(async () => {
  await db.$disconnect();
  await closeOwner();
});
beforeEach(resetData);

type Settings = { org_id: string; user_id: string; role: string; is_admin: string };
const readSettings = (tx: Pick<Db, '$queryRaw'>) =>
  tx.$queryRaw<Settings[]>`select current_setting('app.org_id', true) as org_id,
                                  current_setting('app.user_id', true) as user_id,
                                  current_setting('app.role', true) as role,
                                  current_setting('app.is_admin', true) as is_admin`;

describe('tenant extension (tenant-extension.int.test.ts)', () => {
  it('exports TenantContextMissing as an Error subclass', () => {
    const Ctor = (dbModule as Record<string, unknown>)['TenantContextMissing'] as
      (new (...a: never[]) => Error) | undefined;
    expect(typeof Ctor).toBe('function');
    expect(Ctor!.prototype).toBeInstanceOf(Error);
  });

  it('an org model queried outside $tx throws TenantContextMissing', async () => {
    const org = await makeOrg();
    await makeBuilding(org.id);
    const TenantContextMissing = (dbModule as Record<string, unknown>)['TenantContextMissing'] as new (
      ...a: never[]
    ) => Error;
    await expect(db.building.findMany()).rejects.toBeInstanceOf(TenantContextMissing);
    await expect(db.bill.findMany()).rejects.toBeInstanceOf(TenantContextMissing);
    await expect(db.membership.count()).rejects.toBeInstanceOf(TenantContextMissing);
  });

  it('non-org tables can be queried outside $tx', async () => {
    const org = await makeOrg();
    const users = await db.user.findMany();
    expect(users.map((u) => u.id)).toContain(org.landlordUserId);
    await expect(db.session.findMany()).resolves.toEqual([]);
    await expect(db.authToken.findMany()).resolves.toEqual([]);
    await expect(db.oauthAccount.findMany()).resolves.toEqual([]);
    await expect(db.jobRun.findMany()).resolves.toEqual([]);
    await expect(db.pushSubscription.findMany()).resolves.toEqual([]);
    await expect(db.notificationPreference.findMany()).resolves.toEqual([]);
  });

  it('a non-tenant model whose include/select/where/data reaches a tenant relation throws outside $tx', async () => {
    const org = await makeOrg();
    const reaches = async (p: Promise<unknown>, relation: string) => {
      const err = await p.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(dbModule.TenantContextMissing);
      expect((err as dbModule.TenantContextMissing).relation).toBe(relation);
    };
    await reaches(db.user.findMany({ include: { memberships: true } }), 'memberships');
    await reaches(
      db.user.findMany({ select: { id: true, orgsCreated: { select: { id: true } } } }),
      'orgsCreated',
    );
    await reaches(db.user.findMany({ select: { _count: { select: { memberships: true } } } }), 'memberships');
    await reaches(db.user.findMany({ where: { memberships: { some: { orgId: org.id } } } }), 'memberships');
    await reaches(
      db.user.findMany({ where: { AND: [{ fullName: 'x' }, { notifications: { none: {} } }] } }),
      'notifications',
    );
    // nested through a non-tenant relation: session → user → memberships
    await reaches(
      db.session.findMany({ include: { user: { include: { memberships: true } } } }),
      'user.memberships',
    );
    // nested write: creating a user together with a membership
    await reaches(
      db.user.create({
        data: {
          email: 'nested@test.local',
          fullName: 'Nested',
          memberships: { create: { orgId: org.id, role: 'tenant' } },
        },
      }),
      'memberships',
    );
    // nothing was written by the rejected nested create
    expect(await db.user.count({ where: { email: 'nested@test.local' } })).toBe(0);
  });

  it('non-tenant relations, false flags and scalar values still work outside $tx', async () => {
    const org = await makeOrg();
    const users = await db.user.findMany({
      where: { id: org.landlordUserId, sessions: { none: {} } },
      include: { sessions: true, oauthAccounts: { select: { id: true } }, memberships: false },
    });
    expect(users).toHaveLength(1);
    expect(users[0]!.sessions).toEqual([]);
    // a JSON value whose keys look like relation names is data, not a relation
    const run = await db.jobRun.create({
      data: { job: 'x', details: { memberships: true, org: { id: 1 } } },
    });
    expect(run.details).toEqual({ memberships: true, org: { id: 1 } });
  });

  it('the same nested include works inside $tx (RLS decides what it returns)', async () => {
    const org = await makeOrg();
    const users = await db.$tx({ orgId: org.id, userId: org.landlordUserId, role: 'landlord' }, (tx) =>
      tx.user.findMany({ where: { id: org.landlordUserId }, include: { memberships: true } }),
    );
    expect(users[0]!.memberships.map((m) => m.orgId)).toEqual([org.id]);
  });

  it('$tx sets app.org_id, app.user_id, app.role and app.is_admin for the transaction', async () => {
    const org = await makeOrg();
    const [s] = await db.$tx({ orgId: org.id, userId: org.landlordUserId, role: 'landlord' }, (tx) =>
      readSettings(tx),
    );
    expect(s).toEqual({ org_id: org.id, user_id: org.landlordUserId, role: 'landlord', is_admin: 'false' });

    const [adm] = await db.$tx({ orgId: null, userId: org.landlordUserId, role: null, isAdmin: true }, (tx) =>
      readSettings(tx),
    );
    expect(adm!.is_admin).toBe('true');
    expect(adm!.org_id ?? '').toBe('');
    expect(adm!.role ?? '').toBe('');
  });

  it('$tx returns the callback result and rolls back everything when the callback throws', async () => {
    const org = await makeOrg();
    const ctx = { orgId: org.id, userId: org.landlordUserId, role: 'landlord' as const };
    await expect(
      db.$tx(ctx, async (tx) => {
        await tx.building.create({
          data: {
            orgId: org.id,
            name: 'Ghost',
            address: 'x',
            area: 'x',
            city: 'x',
            lateFeeType: 'none',
            lateFeeValue: 0,
          },
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.$tx(ctx, (tx) => tx.building.findMany());
    expect(rows).toEqual([]);
    expect(await db.$tx(ctx, async () => 42)).toBe(42);
  });

  it('settings do not leak into the next transaction on the same pooled connection', async () => {
    const org = await makeOrg();
    const ctx = { orgId: org.id, userId: org.landlordUserId, role: 'landlord' as const };
    // Many sequential transactions through a small pool reuse connections; none may see a stale context.
    for (let i = 0; i < 10; i++) {
      await db.$tx(ctx, (tx) => readSettings(tx));
      const [next] = await db.$queryRaw<Settings[]>`select current_setting('app.org_id', true) as org_id,
                                                           current_setting('app.user_id', true) as user_id,
                                                           current_setting('app.role', true) as role`;
      expect(next!.org_id ?? '').toBe('');
      expect(next!.user_id ?? '').toBe('');
      expect(next!.role ?? '').toBe('');
    }
  });

  it('concurrent $tx calls with different orgs never see each other', async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const ba = await makeBuilding(a.id);
    const bb = await makeBuilding(b.id);
    const run = (o: typeof a, want: string) =>
      db.$tx({ orgId: o.id, userId: o.landlordUserId, role: 'landlord' }, async (tx) => {
        await new Promise((r) => setTimeout(r, 20));
        const rows = await tx.building.findMany();
        expect(rows.map((r) => r.id)).toEqual([want]);
      });
    await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? run(a, ba) : run(b, bb))));
  });
});
