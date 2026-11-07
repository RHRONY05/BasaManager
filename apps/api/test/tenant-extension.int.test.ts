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
