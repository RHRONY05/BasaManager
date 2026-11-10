import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeBuilding, makeUnit, makeLease, type Org } from '../helpers/factories';
import { buildTestApp, resetAll, newAgent, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';

/**
 * Interface (V8 brief): `month` in request bodies/queries is 'YYYY-MM'. Success bodies are `{ data: ... }`:
 *  - POST /billing/run        -> 200 { data: { created, skipped } }
 *  - PUT  /readings           -> 200 { data: {...} }
 *  - POST /bills/:id/issue    -> 200 { data: bill }  (id, status, totalPoisha, paidPoisha, balancePoisha)
 *  - POST /bills/issue-ready  -> 200 { data: { issued, skipped } }
 *  - POST /bills/:id/adjustments -> 201 { data: bill }
 *  - POST /bills/:id/late-fee/waive -> 200 { data: bill }
 *  - POST /bills/:id/void     -> 200 { data: bill }
 *  - GET  /dues               -> 200 { data: { bills: [{ id, periodMonth, balancePoisha }], creditPoisha, totalPoisha } }
 */
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('V8: billing endpoints', () => {
  let ctx: TestCtx;
  let org: Org;
  let building: string;
  let unitFlat: string; // electricity_mode none
  let unitMeter: string; // submeter
  let leaseFlat: string;
  let leaseMeter: string;
  let landlord: Actor;
  let caretaker: Actor;
  let tenantMeter: Actor;
  let tenantFlat: Actor;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg();
    building = await makeBuilding(org.id, { billDay: 1, dueDay: 10 });
    await q(`update buildings set electricity_rate_poisha = 900, grace_days = 2 where id = $1`, [building]);
    unitFlat = await makeUnit(org.id, building, { label: 'F1' });
    unitMeter = await makeUnit(org.id, building, { label: 'M1' });
    await q(`update units set electricity_mode = 'none' where id = $1`, [unitFlat]);
    leaseFlat = await makeLease(org.id, unitFlat, org.landlordUserId, { startDate: '2026-01-01' });
    leaseMeter = await makeLease(org.id, unitMeter, org.landlordUserId, { startDate: '2026-01-01' });
    await q(`update leases set move_in_reading = 1000 where id = $1`, [leaseMeter]);
    for (const l of [leaseFlat, leaseMeter]) {
      await q(
        `insert into lease_charges (org_id, lease_id, name, amount_poisha) values ($1,$2,'Service',100000)`,
        [org.id, l],
      );
    }
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [building] });
    tenantMeter = await actorIn(ctx, org.id, 'tenant');
    tenantFlat = await actorIn(ctx, org.id, 'tenant');
    for (const [l, t] of [
      [leaseMeter, tenantMeter],
      [leaseFlat, tenantFlat],
    ] as const) {
      await q(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1,$2,$3,true)`,
        [org.id, l, t.membershipId],
      );
    }
  });

  const run = (month = '2026-03', agent = landlord.agent) =>
    agent.post('/api/billing/run').send({ buildingId: building, month });
  const billOf = async (leaseId: string, month = '2026-03-01') => {
    const rows = await q<{
      id: string;
      status: string;
      needs_reading: boolean;
      total_poisha: string;
      paid_poisha: string;
    }>(
      `select id, status, needs_reading, total_poisha::text, paid_poisha::text from bills where lease_id=$1 and period_month=$2`,
      [leaseId, month],
    );
    return rows[0];
  };
  /** A ready draft bill for the flat lease: rent 1,500,000 + Service 100,000 = 1,600,000 poisha. */
  async function draftFlat(): Promise<string> {
    expect((await run()).status).toBe(200);
    return (await billOf(leaseFlat))!.id;
  }
  const setCredit = (leaseId: string, poisha: number) =>
    q(`insert into credit_entries (org_id, lease_id, amount_poisha, kind) values ($1,$2,$3,'overpayment')`, [
      org.id,
      leaseId,
      poisha,
    ]);
  const creditSum = async (leaseId: string) =>
    (
      await q<{ s: string }>(
        `select coalesce(sum(amount_poisha),0)::text as s from credit_entries where lease_id=$1`,
        [leaseId],
      )
    )[0]!.s;

  describe('POST /billing/run', () => {
    it('200: creates one draft per active lease with rent + fixed charge lines', async () => {
      const res = await run();
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ created: 2, skipped: 0 });
      const flat = await billOf(leaseFlat);
      expect(flat).toMatchObject({ status: 'draft', needs_reading: false, total_poisha: '1600000' });
      const lines = await q<{ kind: string; amount_poisha: string }>(
        `select kind, amount_poisha::text from bill_lines where bill_id=$1 order by kind::text`,
        [flat!.id],
      );
      expect(lines).toEqual([
        { kind: 'fixed_charge', amount_poisha: '100000' },
        { kind: 'rent', amount_poisha: '1500000' },
      ]);
      const due = await q<{ d: string }>(
        `select to_char(due_date,'YYYY-MM-DD') as d from bills where id=$1`,
        [flat!.id],
      );
      expect(due[0]!.d).toBe('2026-03-10');
    });

    it('is idempotent: running several times (even concurrently) leaves exactly one bill per lease', async () => {
      const results = await Promise.all([run(), run(), run()]);
      for (const r of results) expect(r.status).toBe(200);
      const rows = await q<{ n: string }>(
        `select count(*)::text as n from bills where period_month='2026-03-01'`,
      );
      expect(rows[0]!.n).toBe('2');
      expect((await run()).body.data).toEqual({ created: 0, skipped: 2 });
    });

    it('submeter unit: draft with needs_reading = true, total = rent + fixed charges (no electricity yet)', async () => {
      await run();
      expect(await billOf(leaseMeter)).toMatchObject({
        status: 'draft',
        needs_reading: true,
        total_poisha: '1600000',
      });
    });

    it('skips leases that are not active', async () => {
      await q(`update leases set status='ended' where id=$1`, [leaseFlat]);
      expect((await run()).body.data).toEqual({ created: 1, skipped: 0 });
      expect(await billOf(leaseFlat)).toBeUndefined();
    });

    it('prorates a lease that starts mid-month (18 Mar 2026, D=31: 14/31)', async () => {
      await q(`update leases set start_date='2026-03-18' where id=$1`, [leaseFlat]);
      await run();
      // rent 1,500,000 x 14/31 = 677,419 -> 677,400 ; service 100,000 x 14/31 = 45,161 -> 45,200
      expect((await billOf(leaseFlat))!.total_poisha).toBe(String(677400 + 45200));
    });

    it('403 for caretaker and tenant, 404 for a building of another org', async () => {
      expect((await run('2026-03', caretaker.agent)).status).toBe(403);
      expect((await run('2026-03', tenantFlat.agent)).status).toBe(403);
      const other = await makeOrg();
      const ob = await makeBuilding(other.id);
      const res = await landlord.agent.post('/api/billing/run').send({ buildingId: ob, month: '2026-03' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('400 VALIDATION_FAILED for a malformed month', async () => {
      const res = await run('March');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('PUT /readings', () => {
    const put = (o: Record<string, unknown> = {}, agent = landlord.agent) =>
      agent.put('/api/readings').send({ unitId: unitMeter, month: '2026-03', reading: 1155, ...o });

    beforeEach(async () => {
      await run();
    });

    it('200 (landlord): stores the reading, adds the electricity line, clears needs_reading', async () => {
      // prev = move-in reading 1,000 (first bill of the lease): 155 units x 900 = 139,500
      const res = await put();
      expect(res.status).toBe(200);
      const b = await billOf(leaseMeter);
      expect(b).toMatchObject({
        needs_reading: false,
        status: 'draft',
        total_poisha: String(1600000 + 139500),
      });
      const lines = await q<{ amount_poisha: string; meta: { prev: number; curr: number } }>(
        `select amount_poisha::text, meta from bill_lines where bill_id=$1 and kind='electricity'`,
        [b!.id],
      );
      expect(lines).toHaveLength(1);
      expect(lines[0]!.amount_poisha).toBe('139500');
      expect(lines[0]!.meta).toMatchObject({ prev: 1000, curr: 1155 });
    });

    it('200 (assigned caretaker) can enter a reading', async () => {
      expect((await put({}, caretaker.agent)).status).toBe(200);
    });

    it('re-entering a reading before issue replaces the electricity line (no duplicates)', async () => {
      await put();
      expect((await put({ reading: 1200 })).status).toBe(200);
      const b = await billOf(leaseMeter);
      const lines = await q<{ amount_poisha: string }>(
        `select amount_poisha::text from bill_lines where bill_id=$1 and kind='electricity'`,
        [b!.id],
      );
      expect(lines).toEqual([{ amount_poisha: '180000' }]);
      expect(b!.total_poisha).toBe(String(1600000 + 180000));
    });

    it('400 READING_LOWER_THAN_PREVIOUS below the previous reading without meterReplaced', async () => {
      const res = await put({ reading: 900 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.READING_LOWER_THAN_PREVIOUS);
      expect((await billOf(leaseMeter))!.needs_reading).toBe(true);
    });

    it('200 when meterReplaced = true with newMeterStart: units = reading - newMeterStart', async () => {
      const res = await put({ reading: 45, meterReplaced: true, newMeterStart: 0 });
      expect(res.status).toBe(200);
      expect((await billOf(leaseMeter))!.total_poisha).toBe(String(1600000 + 45 * 900));
    });

    it('409 once the bill is issued (readings are editable only until issue)', async () => {
      await put();
      const id = (await billOf(leaseMeter))!.id;
      expect((await landlord.agent.post(`/api/bills/${id}/issue`)).status).toBe(200);
      const res = await put({ reading: 1300 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('403 for a tenant; 404 for a unit of another org; caretaker of another building is refused', async () => {
      expect((await put({}, tenantMeter.agent)).status).toBe(403);
      const other = await makeOrg();
      const ob = await makeBuilding(other.id);
      const ou = await makeUnit(other.id, ob);
      const res = await put({ unitId: ou });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      const b2 = await makeBuilding(org.id, { name: 'Other' });
      const c2 = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [b2] });
      expect([403, 404]).toContain((await put({}, c2.agent)).status);
    });
  });

  describe('POST /bills/:id/issue', () => {
    it('200: draft -> issued, outbox bill.issued written', async () => {
      const id = await draftFlat();
      const res = await landlord.agent.post(`/api/bills/${id}/issue`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id,
        status: 'issued',
        totalPoisha: 1600000,
        paidPoisha: 0,
        balancePoisha: 1600000,
      });
      const ob = await q<{ payload: { billId?: string } }>(
        `select payload from outbox where org_id=$1 and type='bill.issued'`,
        [org.id],
      );
      expect(ob).toHaveLength(1);
      expect(ob[0]!.payload.billId).toBe(id);
    });

    it('409 READING_REQUIRED while a submeter bill still needs its reading', async () => {
      await run();
      const id = (await billOf(leaseMeter))!.id;
      const res = await landlord.agent.post(`/api/bills/${id}/issue`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.READING_REQUIRED);
      expect((await billOf(leaseMeter))!.status).toBe('draft');
    });

    it('applies existing lease credit: partly -> partially_paid with the balance reduced', async () => {
      const id = await draftFlat();
      await setCredit(leaseFlat, 300000);
      const res = await landlord.agent.post(`/api/bills/${id}/issue`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'partially_paid',
        paidPoisha: 300000,
        balancePoisha: 1300000,
      });
      expect(await creditSum(leaseFlat)).toBe('0');
    });

    it('applies existing lease credit: enough credit -> paid, the remainder stays as credit', async () => {
      const id = await draftFlat();
      await setCredit(leaseFlat, 2000000);
      const res = await landlord.agent.post(`/api/bills/${id}/issue`);
      expect(res.body.data).toMatchObject({ status: 'paid', paidPoisha: 1600000, balancePoisha: 0 });
      expect(await creditSum(leaseFlat)).toBe('400000');
    });

    it('409 CONFLICT when the bill is not a draft (already issued)', async () => {
      const id = await draftFlat();
      await landlord.agent.post(`/api/bills/${id}/issue`);
      const res = await landlord.agent.post(`/api/bills/${id}/issue`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    it('403 for caretaker and tenant; 404 for unknown id', async () => {
      const id = await draftFlat();
      for (const a of [caretaker, tenantFlat]) {
        const res = await a.agent.post(`/api/bills/${id}/issue`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      }
      expect((await landlord.agent.post(`/api/bills/${MISSING}/issue`)).status).toBe(404);
    });
  });

  describe('POST /bills/issue-ready', () => {
    it('issues drafts without missing readings and leaves the rest', async () => {
      await run();
      const res = await landlord.agent
        .post('/api/bills/issue-ready')
        .send({ buildingId: building, month: '2026-03' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ issued: 1, skipped: 1 });
      expect((await billOf(leaseFlat))!.status).toBe('issued');
      expect((await billOf(leaseMeter))!.status).toBe('draft');
    });

    it('403 for caretaker', async () => {
      await run();
      const res = await caretaker.agent
        .post('/api/bills/issue-ready')
        .send({ buildingId: building, month: '2026-03' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /bills/:id/adjustments', () => {
    it('201: signed adjustment line on a draft bill updates the total', async () => {
      const id = await draftFlat();
      const res = await landlord.agent
        .post(`/api/bills/${id}/adjustments`)
        .send({ amountPoisha: -50000, reason: 'Goodwill discount' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ totalPoisha: 1550000 });
      const lines = await q<{ amount_poisha: string; reason: string }>(
        `select amount_poisha::text, reason from bill_lines where bill_id=$1 and kind='adjustment'`,
        [id],
      );
      expect(lines).toEqual([{ amount_poisha: '-50000', reason: 'Goodwill discount' }]);
    });

    it('201 on an issued bill (positive charge raises total and balance)', async () => {
      const id = await draftFlat();
      await landlord.agent.post(`/api/bills/${id}/issue`);
      const res = await landlord.agent
        .post(`/api/bills/${id}/adjustments`)
        .send({ amountPoisha: 25000, reason: 'Repair' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ totalPoisha: 1625000, balancePoisha: 1625000 });
    });

    it('409 CONFLICT on a paid or void bill', async () => {
      const id = await draftFlat();
      await q(`update bills set status='paid', paid_poisha=total_poisha where id=$1`, [id]);
      const paid = await landlord.agent
        .post(`/api/bills/${id}/adjustments`)
        .send({ amountPoisha: 100, reason: 'x' });
      expect(paid.status).toBe(409);
      expect(paid.body.error.code).toBe(ErrorCode.CONFLICT);
      await q(`update bills set status='void', paid_poisha=0 where id=$1`, [id]);
      const voided = await landlord.agent
        .post(`/api/bills/${id}/adjustments`)
        .send({ amountPoisha: 100, reason: 'x' });
      expect(voided.status).toBe(409);
    });

    it('400 for a missing reason or a zero amount; 403 for caretaker', async () => {
      const id = await draftFlat();
      for (const body of [
        { amountPoisha: 100 },
        { amountPoisha: 0, reason: 'x' },
        { amountPoisha: 100, reason: '' },
      ]) {
        const res = await landlord.agent.post(`/api/bills/${id}/adjustments`).send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
      const res = await caretaker.agent
        .post(`/api/bills/${id}/adjustments`)
        .send({ amountPoisha: 100, reason: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /bills/:id/late-fee/waive', () => {
    async function billWithLateFee(): Promise<string> {
      const id = await draftFlat();
      await landlord.agent.post(`/api/bills/${id}/issue`);
      await q(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha) values ($1,$2,'late_fee','Late fee',80000)`,
        [org.id, id],
      );
      await q(
        `update bills set total_poisha = total_poisha + 80000, late_fee_applied_at = now() where id=$1`,
        [id],
      );
      return id;
    }

    it('200: the late-fee line becomes 0 with the reason and the total drops', async () => {
      const id = await billWithLateFee();
      const res = await landlord.agent.post(`/api/bills/${id}/late-fee/waive`).send({ reason: 'Bank delay' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ totalPoisha: 1600000 });
      const line = await q<{ amount_poisha: string; reason: string }>(
        `select amount_poisha::text, reason from bill_lines where bill_id=$1 and kind='late_fee'`,
        [id],
      );
      expect(line).toEqual([{ amount_poisha: '0', reason: 'Bank delay' }]);
    });

    it('400 without a reason; 404 when the bill has no late fee', async () => {
      const id = await billWithLateFee();
      expect((await landlord.agent.post(`/api/bills/${id}/late-fee/waive`).send({})).status).toBe(400);
      const plain = await draftFlat(); // second run is idempotent: this is the same bill; strip its fee line
      await q(`delete from bill_lines where bill_id=$1 and kind='late_fee'`, [plain]);
      const res = await landlord.agent.post(`/api/bills/${plain}/late-fee/waive`).send({ reason: 'x' });
      expect(res.status).toBe(404);
    });

    it('403 for caretaker', async () => {
      const id = await billWithLateFee();
      const res = await caretaker.agent.post(`/api/bills/${id}/late-fee/waive`).send({ reason: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('POST /bills/:id/void', () => {
    it('200: voids a bill that has no payments', async () => {
      const id = await draftFlat();
      await landlord.agent.post(`/api/bills/${id}/issue`);
      const res = await landlord.agent.post(`/api/bills/${id}/void`).send({ reason: 'Issued by mistake' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id, status: 'void' });
      expect((await billOf(leaseFlat))!.status).toBe('void');
    });

    it('409 CONFLICT when a payment has been allocated to it', async () => {
      const id = await draftFlat();
      await landlord.agent.post(`/api/bills/${id}/issue`);
      const pay = await q<{ id: string }>(
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, submitted_by)
         values ($1,$2,500000,'cash','confirmed','2026-03-05',$3) returning id`,
        [org.id, leaseFlat, org.landlordUserId],
      );
      await q(
        `insert into payment_allocations (org_id, payment_id, bill_id, amount_poisha) values ($1,$2,$3,500000)`,
        [org.id, pay[0]!.id, id],
      );
      const res = await landlord.agent.post(`/api/bills/${id}/void`).send({ reason: 'oops' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.CONFLICT);
      expect((await billOf(leaseFlat))!.status).not.toBe('void');
    });

    it('403 for caretaker', async () => {
      const id = await draftFlat();
      const res = await caretaker.agent.post(`/api/bills/${id}/void`).send({ reason: 'x' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('GET /dues (tenant)', () => {
    it('200: unpaid bills oldest first, plus credit and total', async () => {
      for (const m of ['2026-03', '2026-04', '2026-05']) await run(m);
      for (const m of ['2026-05-01', '2026-03-01', '2026-04-01']) {
        await landlord.agent.post(`/api/bills/${(await billOf(leaseFlat, m))!.id}/issue`);
      }
      await q(
        `update bills set status='paid', paid_poisha=total_poisha where lease_id=$1 and period_month='2026-04-01'`,
        [leaseFlat],
      );
      await setCredit(leaseFlat, 100000); // added after issue, so it stays as credit
      const res = await tenantFlat.agent.get('/api/dues');
      expect(res.status).toBe(200);
      const months = res.body.data.bills.map((b: { periodMonth: string }) => b.periodMonth.slice(0, 7));
      expect(months).toEqual(['2026-03', '2026-05']);
      expect(res.body.data.creditPoisha).toBe(100000);
      expect(res.body.data.totalPoisha).toBe(3200000);
    });

    it('does not include other tenants bills', async () => {
      await run();
      await landlord.agent.post(`/api/bills/${(await billOf(leaseFlat))!.id}/issue`);
      const res = await tenantMeter.agent.get('/api/dues');
      expect(res.status).toBe(200);
      expect(res.body.data.bills).toEqual([]);
    });
  });

  describe('role scoping and isolation', () => {
    it('tenant cannot read another tenants bill (404 NOT_FOUND) but can read their own', async () => {
      await run();
      const flatId = (await billOf(leaseFlat))!.id;
      await landlord.agent.post(`/api/bills/${flatId}/issue`);
      const other = await tenantMeter.agent.get(`/api/bills/${flatId}`);
      expect(other.status).toBe(404);
      expect(other.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect((await tenantFlat.agent.get(`/api/bills/${flatId}`)).status).toBe(200);
    });

    it('cross-org: a landlord of another org gets 404 on every bill action', async () => {
      const id = await draftFlat();
      const other = await makeOrg();
      const ll2 = await landlordOf(ctx, other);
      const calls: Array<[string, string, Record<string, unknown> | undefined]> = [
        ['get', `/api/bills/${id}`, undefined],
        ['post', `/api/bills/${id}/issue`, {}],
        ['post', `/api/bills/${id}/void`, { reason: 'x' }],
        ['post', `/api/bills/${id}/adjustments`, { amountPoisha: 100, reason: 'x' }],
        ['post', `/api/bills/${id}/late-fee/waive`, { reason: 'x' }],
      ];
      for (const [method, path, body] of calls) {
        const req = method === 'get' ? ll2.agent.get(path) : ll2.agent.post(path).send(body ?? {});
        const res = await req;
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      }
      expect((await billOf(leaseFlat))!.status).toBe('draft');
    });

    it('401 for anonymous callers', async () => {
      const anon = newAgent(ctx);
      expect((await anon.get('/api/bills')).status).toBe(401);
      expect((await anon.get('/api/dues')).status).toBe(401);
    });
  });
});
