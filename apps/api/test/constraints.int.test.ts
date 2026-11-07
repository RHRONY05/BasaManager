import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { resetData, closeOwner, q, pgErrorCode } from './helpers/pg';
import {
  makeOrg,
  makeOrgWithLease,
  makeUser,
  makeMembership,
  makeBuilding,
  makeUnit,
  makeLease,
  makeBill,
  makePayment,
} from './helpers/factories';

afterAll(closeOwner);
beforeEach(resetData);

const UNIQUE = '23505';
const CHECK = '23514';
const err = (sql: string, params: unknown[] = []) => pgErrorCode(q(sql, params));

describe('schema constraints later tasks rely on (constraints.int.test.ts)', () => {
  it('one live lease per unit: a second pending/active/notice lease is rejected', async () => {
    for (const live of ['pending', 'active', 'notice'] as const) {
      await resetData();
      const o = await makeOrgWithLease(); // one active lease
      const code = await pgErrorCode(makeLease(o.id, o.unitId, o.landlordUserId, { status: live }));
      expect(code, live).toBe(UNIQUE);
    }
  });

  it('ended leases do not block a new live lease, and several ended leases may coexist', async () => {
    const o = await makeOrg();
    const b = await makeBuilding(o.id);
    const u = await makeUnit(o.id, b);
    await makeLease(o.id, u, o.landlordUserId, { status: 'ended' });
    await makeLease(o.id, u, o.landlordUserId, { status: 'ended_with_dues' });
    await expect(makeLease(o.id, u, o.landlordUserId, { status: 'active' })).resolves.toBeTruthy();
  });

  it('bills: unique(lease_id, period_month)', async () => {
    const o = await makeOrgWithLease();
    await makeBill(o.id, o.leaseId, { periodMonth: '2026-03-01' });
    expect(await pgErrorCode(makeBill(o.id, o.leaseId, { periodMonth: '2026-03-01' }))).toBe(UNIQUE);
    await expect(makeBill(o.id, o.leaseId, { periodMonth: '2026-04-01' })).resolves.toBeTruthy();
  });

  it('bills: check (paid_poisha <= total_poisha)', async () => {
    const o = await makeOrgWithLease();
    expect(await pgErrorCode(makeBill(o.id, o.leaseId, { totalPoisha: 100, paidPoisha: 101 }))).toBe(CHECK);
    const ok = await makeBill(o.id, o.leaseId, {
      periodMonth: '2026-05-01',
      totalPoisha: 100,
      paidPoisha: 100,
    });
    expect(await err('update bills set paid_poisha = 101 where id = $1', [ok])).toBe(CHECK);
  });

  it('bill_lines: only one late_fee per bill; other kinds can repeat', async () => {
    const o = await makeOrgWithLease();
    const bill = await makeBill(o.id, o.leaseId);
    const line = (kind: string) =>
      err(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha) values ($1, $2, $3, 'x', 100)`,
        [o.id, bill, kind],
      );
    expect(await line('late_fee')).toBeUndefined();
    expect(await line('late_fee')).toBe(UNIQUE);
    expect(await line('adjustment')).toBeUndefined();
    expect(await line('adjustment')).toBeUndefined();
  });

  it('payments: the same bKash/Nagad reference cannot be claimed twice, unless the first was rejected', async () => {
    const o = await makeOrgWithLease();
    await makePayment(o.id, o.leaseId, o.landlordUserId, {
      method: 'bkash',
      status: 'pending_claim',
      reference: 'TRX1',
    });
    const dup = makePayment(o.id, o.leaseId, o.landlordUserId, {
      method: 'bkash',
      status: 'pending_claim',
      reference: 'TRX1',
    });
    expect(await pgErrorCode(dup)).toBe(UNIQUE);
    // same reference on another method is fine (the index is per method)
    await expect(
      makePayment(o.id, o.leaseId, o.landlordUserId, {
        method: 'nagad',
        status: 'pending_claim',
        reference: 'TRX1',
      }),
    ).resolves.toBeTruthy();
    // a rejected claim frees the reference
    await makePayment(o.id, o.leaseId, o.landlordUserId, {
      method: 'bkash',
      status: 'rejected',
      reference: 'TRX2',
    });
    await expect(
      makePayment(o.id, o.leaseId, o.landlordUserId, {
        method: 'bkash',
        status: 'pending_claim',
        reference: 'TRX2',
      }),
    ).resolves.toBeTruthy();
    // cash has no reference rule
    await makePayment(o.id, o.leaseId, o.landlordUserId, { method: 'cash', reference: 'R' });
    await expect(
      makePayment(o.id, o.leaseId, o.landlordUserId, { method: 'cash', reference: 'R' }),
    ).resolves.toBeTruthy();
  });

  it('receipt_counters: the 03 upsert returns 1 then 2 (and is per org and year)', async () => {
    const a = await makeOrg();
    const b = await makeOrg();
    const next = async (org: string, year: number) =>
      (
        await q<{ last_seq: number }>(
          `insert into receipt_counters (org_id, year, last_seq) values ($1, $2, 1)
           on conflict (org_id, year) do update set last_seq = receipt_counters.last_seq + 1
           returning last_seq`,
          [org, year],
        )
      )[0]!.last_seq;
    expect(await next(a.id, 2026)).toBe(1);
    expect(await next(a.id, 2026)).toBe(2);
    expect(await next(a.id, 2027)).toBe(1);
    expect(await next(b.id, 2026)).toBe(1);
  });

  it('buildings: bill_day and due_day must be 1..28, grace_days 0..15', async () => {
    const o = await makeOrg();
    expect(await pgErrorCode(makeBuilding(o.id, { billDay: 29 }))).toBe(CHECK);
    expect(await pgErrorCode(makeBuilding(o.id, { billDay: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(makeBuilding(o.id, { dueDay: 29 }))).toBe(CHECK);
    await expect(makeBuilding(o.id, { billDay: 28, dueDay: 28 })).resolves.toBeTruthy();
    const id = await makeBuilding(o.id);
    expect(await err('update buildings set grace_days = 16 where id = $1', [id])).toBe(CHECK);
    expect(await err('update buildings set grace_days = 15 where id = $1', [id])).toBeUndefined();
  });

  it('memberships: exactly one active landlord per org (removed ones do not count)', async () => {
    const o = await makeOrg(); // already has an active landlord
    const second = await makeUser();
    expect(await pgErrorCode(makeMembership(o.id, second, 'landlord'))).toBe(UNIQUE);
    await expect(makeMembership(o.id, second, 'landlord', 'removed')).resolves.toBeTruthy();
    const third = await makeUser();
    await expect(makeMembership(o.id, third, 'caretaker')).resolves.toBeTruthy();
    // same user twice in one org is also refused
    expect(await pgErrorCode(makeMembership(o.id, third, 'tenant'))).toBe(UNIQUE);
    // another org may have its own landlord
    await expect(makeOrg()).resolves.toBeTruthy();
  });

  it('meter_readings: period_month must be the 1st of a month; one reading per unit and month', async () => {
    const o = await makeOrg();
    const b = await makeBuilding(o.id);
    const u = await makeUnit(o.id, b);
    const reading = (month: string) =>
      err(
        `insert into meter_readings (org_id, unit_id, period_month, reading, meter_replaced, entered_by)
         values ($1, $2, $3, 100, false, $4)`,
        [o.id, u, month, o.landlordUserId],
      );
    expect(await reading('2026-03-15')).toBe(CHECK);
    expect(await reading('2026-03-01')).toBeUndefined();
    expect(await reading('2026-03-01')).toBe(UNIQUE);
  });
});
