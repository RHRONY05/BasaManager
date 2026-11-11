import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeBuilding, makeUnit, makeLease, makeBill, type Org } from '../helpers/factories';
import { buildTestApp, resetAll, newAgent, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';
import { jobs, type JobContext } from '../../../worker/src/jobs/index';

/** Interface and gateway URLs: see .agent/briefs/V10-tests.md. The gateway is a stubbed global fetch. */
const INIT_URL = 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
const VALIDATE_URL = 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';
const QUERY_URL = 'https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php';
const GATEWAY_PAGE = 'https://sandbox.sslcommerz.com/EasyCheckOut/testcdeabc';

type Scenario =
  | 'valid'
  | 'invalid'
  | 'mismatch'
  | 'timeout'
  | 'declined-then-valid'
  | 'query-error'
  | 'query-empty'
  | 'foreign-val-id'
  | 'currency-mismatch'
  | 'only-declined';

describe('V10: SSLCommerz online payments', () => {
  let ctx: TestCtx;
  let org: Org;
  let lease: string;
  let lease2: string;
  let landlord: Actor;
  let tenant: Actor;
  let tenant2: Actor;
  let scenario: Scenario;
  let validationCalls: number;
  let initBodies: URLSearchParams[];
  const realFetch = globalThis.fetch;

  beforeAll(() => {
    process.env['SSLCOMMERZ_STORE_ID'] = 'teststore001';
    process.env['SSLCOMMERZ_STORE_PASSWORD'] = 'teststore001@ssl';
    process.env['SSLCOMMERZ_SANDBOX'] = 'true';
    process.env['PAYMENTS_MOCK'] = 'false';
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());

  /** What the gateway reports for a tran_id: the amount is read from our own intent row. */
  async function gatewayView(tranId: string, valId: string) {
    if (scenario === 'invalid') {
      return {
        status: 'INVALID_TRANSACTION',
      };
    }
    if (scenario === 'foreign-val-id') {
      return {
        status: 'VALID',
        tran_id: 'BM-ATTACKER-FOREIGN-999999',
        val_id: valId,
        amount: '5000.00',
        currency: 'BDT',
        currency_type: 'BDT',
      };
    }
    const rows = await q<{ amount_poisha: string }>(
      `select amount_poisha::text from payment_intents where tran_id=$1`,
      [tranId],
    );
    const poisha = Number(rows[0]?.amount_poisha ?? 0);
    const amount = ((scenario === 'mismatch' ? poisha - 100000 : poisha) / 100).toFixed(2);
    return {
      status: 'VALID',
      tran_id: tranId,
      val_id: valId,
      amount,
      currency: 'BDT',
      currency_type: 'BDT',
    };
  }

  beforeEach(async () => {
    await resetAll(ctx);
    scenario = 'valid';
    validationCalls = 0;
    initBodies = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: { body?: unknown }) => {
      const url = String(input instanceof Request ? input.url : input);
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.startsWith(INIT_URL)) {
        initBodies.push(new URLSearchParams(String(init?.body ?? '')));
        return json({ status: 'SUCCESS', GatewayPageURL: GATEWAY_PAGE, sessionkey: 'SESSKEY123' });
      }
      if (url.startsWith(VALIDATE_URL)) {
        validationCalls++;
        if (scenario === 'timeout') throw new Error('network timeout');
        const valId = new URL(url).searchParams.get('val_id')!;
        const tranId = valId.replace(/^val-/, '');
        return json(await gatewayView(tranId, valId));
      }
      if (url.startsWith(QUERY_URL)) {
        if (scenario === 'query-error') {
          return json({
            APIConnect: 'FAILED',
            no_of_trans_found: 0,
          });
        }
        if (scenario === 'query-empty') {
          return json({
            APIConnect: 'DONE',
            no_of_trans_found: 0,
            element: [],
          });
        }
        const tranId = new URL(url).searchParams.get('tran_id')!;
        if (scenario === 'currency-mismatch') {
          return json({
            APIConnect: 'DONE',
            no_of_trans_found: 1,
            element: [
              {
                status: 'VALID',
                tran_id: tranId,
                val_id: `val-usd-${tranId}`,
                amount: '5000.00',
                currency_type: 'USD',
              },
            ],
          });
        }
        if (scenario === 'only-declined') {
          return json({
            APIConnect: 'DONE',
            no_of_trans_found: 1,
            element: [
              {
                status: 'FAILED',
                tran_id: tranId,
                val_id: `val-failed-${tranId}`,
                amount: '5000.00',
              },
            ],
          });
        }
        if (scenario === 'declined-then-valid') {
          return json({
            APIConnect: 'DONE',
            no_of_trans_found: 2,
            element: [
              {
                status: 'FAILED',
                tran_id: tranId,
                val_id: `val-failed-${tranId}`,
                amount: '5000.00',
              },
              await gatewayView(tranId, `val-${tranId}`),
            ],
          });
        }
        return json({
          APIConnect: 'DONE',
          no_of_trans_found: 1,
          element: [await gatewayView(tranId, `val-${tranId}`)],
        });
      }
      return realFetch(input as Parameters<typeof fetch>[0], init as Parameters<typeof fetch>[1]);
    });

    org = await makeOrg();
    const building = await makeBuilding(org.id);
    const u1 = await makeUnit(org.id, building, { label: 'A1' });
    const u2 = await makeUnit(org.id, building, { label: 'A2' });
    lease = await makeLease(org.id, u1, org.landlordUserId);
    lease2 = await makeLease(org.id, u2, org.landlordUserId);
    landlord = await landlordOf(ctx, org);
    tenant = await actorIn(ctx, org.id, 'tenant');
    tenant2 = await actorIn(ctx, org.id, 'tenant');
    for (const [l, t] of [
      [lease, tenant],
      [lease2, tenant2],
    ] as const) {
      await q(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1,$2,$3,true)`,
        [org.id, l, t.membershipId],
      );
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── helpers ────────────────────────────────────────────────────────────────────────────────────
  async function issuedBill(leaseId: string, month: string, total: number): Promise<string> {
    const id = await makeBill(org.id, leaseId, { periodMonth: month, totalPoisha: total });
    await q(`update bills set status='issued', issued_at=now() where id=$1`, [id]);
    return id;
  }
  const bill = async (id: string) =>
    (
      await q<{ status: string; paid: string }>(
        `select status, paid_poisha::text as paid from bills where id=$1`,
        [id],
      )
    )[0]!;
  const count = async (table: string) =>
    Number((await q<{ n: string }>(`select count(*)::text as n from ${table}`))[0]!.n);
  const intentRow = async (tranId: string) =>
    (
      await q<{ status: string; payment_id: string | null; val_id: string | null; amount: string }>(
        `select status, payment_id, val_id, amount_poisha::text as amount from payment_intents where tran_id=$1`,
        [tranId],
      )
    )[0]!;
  const init = (amountPoisha: number, a: Actor = tenant, leaseId = lease) =>
    a.agent.post('/api/payments/sslcommerz/init').send({ leaseId, amountPoisha });
  /** Start a payment and return its tran_id. */
  async function startIntent(amountPoisha: number): Promise<string> {
    const res = await init(amountPoisha);
    expect(res.status).toBe(201);
    return res.body.data.tranId as string;
  }
  /** The gateway's server-to-server call: public, form-encoded, no cookies, no CSRF header. */
  const ipn = (tranId: string, o: Record<string, string> = {}) =>
    request(ctx.app)
      .post('/api/payments/sslcommerz/ipn')
      .type('form')
      .send({
        tran_id: tranId,
        val_id: `val-${tranId}`,
        status: 'VALID',
        amount: '5000.00',
        currency: 'BDT',
        ...o,
      });

  // ── init ───────────────────────────────────────────────────────────────────────────────────────
  describe('POST /payments/sslcommerz/init', () => {
    it('creates an initiated intent, calls the gateway with our callback URLs and returns the gateway URL', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const res = await init(500000);
      expect(res.status).toBe(201);
      expect(res.body.data.gatewayUrl).toBe(GATEWAY_PAGE);
      const tranId = res.body.data.tranId as string;
      expect(tranId).toBeTruthy();
      const row = await intentRow(tranId);
      expect(row.status).toBe('initiated');
      expect(row.amount).toBe('500000');
      expect(row.payment_id).toBeNull();
      const stored = await q<{ session_key: string; lease_id: string; created_by: string }>(
        `select session_key, lease_id, created_by from payment_intents where tran_id=$1`,
        [tranId],
      );
      expect(stored[0]).toMatchObject({
        session_key: 'SESSKEY123',
        lease_id: lease,
        created_by: tenant.userId,
      });
      const sent = initBodies[0]!;
      expect(sent.get('store_id')).toBe('teststore001');
      expect(sent.get('total_amount')).toBe('5000.00');
      expect(sent.get('currency')).toBe('BDT');
      expect(sent.get('tran_id')).toBe(tranId);
      expect(sent.get('success_url')).toContain('/api/payments/sslcommerz/return/success');
      expect(sent.get('fail_url')).toContain('/api/payments/sslcommerz/return/fail');
      expect(sent.get('cancel_url')).toContain('/api/payments/sslcommerz/return/cancel');
      expect(sent.get('ipn_url')).toContain('/api/payments/sslcommerz/ipn');
    });

    it('creating an intent changes no money', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      await startIntent(500000);
      expect(await count('payments')).toBe(0);
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
    });

    it('two inits get two different tran_ids', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      expect(await startIntent(500000)).not.toBe(await startIntent(500000));
    });

    it('amount below ৳100 or above dues + one month of rent is 400 VALIDATION_FAILED', async () => {
      await issuedBill(lease, '2026-03-01', 1000000); // dues ৳10,000 + rent ৳15,000 -> max ৳25,000
      for (const bad of [9999, 2500001, 0, -5, 1.5]) {
        const res = await init(bad);
        expect(res.status, String(bad)).toBe(400);
        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
      expect((await init(10000)).status).toBe(201);
      expect((await init(2500000)).status).toBe(201);
      expect(await count('payment_intents')).toBe(2);
    });

    it('401 anonymous, 403 landlord, 404 for another tenant’s lease', async () => {
      const anon = await newAgent(ctx)
        .post('/api/payments/sslcommerz/init')
        .send({ leaseId: lease, amountPoisha: 500000 });
      expect(anon.status).toBe(401);
      expect((await init(500000, landlord)).status).toBe(403);
      const res = await init(500000, tenant, lease2);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(await count('payment_intents')).toBe(0);
    });
  });

  // ── IPN ────────────────────────────────────────────────────────────────────────────────────────
  describe('POST /payments/sslcommerz/ipn', () => {
    it('valid IPN confirms the payment once: allocation, receipt, intent confirmed, outbox event', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const res = await ipn(tranId);
      expect(res.status).toBe(200);
      expect(validationCalls).toBe(1); // validated server-side, the form was not trusted
      const pays = await q<{ id: string; method: string; status: string; reference: string; amount: string }>(
        `select id, method, status, reference, amount_poisha::text as amount from payments where org_id=$1`,
        [org.id],
      );
      expect(pays).toHaveLength(1);
      expect(pays[0]).toMatchObject({
        method: 'sslcommerz',
        status: 'confirmed',
        reference: `val-${tranId}`,
        amount: '500000',
      });
      expect(await bill(b)).toEqual({ status: 'paid', paid: '500000' });
      const rec = await q<{ number: string }>(`select number from receipts where payment_id=$1`, [
        pays[0]!.id,
      ]);
      expect(rec[0]!.number).toMatch(/^BM-\d{4}-000001$/);
      expect(await intentRow(tranId)).toMatchObject({
        status: 'confirmed',
        payment_id: pays[0]!.id,
        val_id: `val-${tranId}`,
      });
      const ob = await q(`select 1 from outbox where org_id=$1 and type='payment.confirmed'`, [org.id]);
      expect(ob).toHaveLength(1);
    });

    it('replaying the same IPN changes nothing (one payment, one receipt, one outbox event)', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      expect((await ipn(tranId)).status).toBe(200);
      expect((await ipn(tranId)).status).toBe(200);
      expect(await count('payments')).toBe(1);
      expect(await count('receipts')).toBe(1);
      expect(await count('payment_allocations')).toBe(1);
      expect(await bill(b)).toEqual({ status: 'paid', paid: '500000' });
      expect(await q(`select 1 from outbox where type='payment.confirmed'`)).toHaveLength(1);
    });

    it('five simultaneous IPNs for one intent still make one payment', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => ipn(tranId)));
      for (const r of results) expect(r.status).toBe(200);
      expect(await count('payments')).toBe(1);
      expect(await count('receipts')).toBe(1);
    });

    it('amount mismatch between gateway and intent flags the intent and creates no payment', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      scenario = 'mismatch';
      expect((await ipn(tranId)).status).toBe(200);
      expect((await intentRow(tranId)).status).toBe('flagged');
      expect(await count('payments')).toBe(0);
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
    });

    it('a form that claims a different amount than the validated one cannot change the outcome', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await ipn(tranId, { amount: '1.00' }); // tampered form field; the validation API says ৳5,000
      const pays = await q<{ amount: string }>(`select amount_poisha::text as amount from payments`);
      expect(pays.map((p) => p.amount)).toEqual(['500000']);
      expect((await bill(b)).paid).toBe('500000');
    });

    it('a forged IPN the gateway rejects (INVALID_TRANSACTION without matching tran_id) leaves intent initiated and pays nothing', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      scenario = 'invalid';
      expect((await ipn(tranId)).status).toBe(200);
      expect(await count('payments')).toBe(0);
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
    });

    it('an anonymous IPN with an attacker foreign val_id (mismatched tran_id) is ignored and leaves intent initiated', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      scenario = 'foreign-val-id';
      expect((await ipn(tranId)).status).toBe(200);
      expect(await count('payments')).toBe(0);
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
    });

    it('an IPN whose own status is FAILED never pays', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      expect((await ipn(tranId, { status: 'FAILED' })).status).toBe(200);
      expect(await count('payments')).toBe(0);
    });

    it('unknown tran_id: 200, nothing created', async () => {
      const res = await ipn('BM-DOES-NOT-EXIST');
      expect(res.status).toBe(200);
      expect(await count('payments')).toBe(0);
      expect(await count('payment_intents')).toBe(0);
    });

    it('validation API unreachable: no payment, intent stays initiated for the re-check job', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      scenario = 'timeout';
      const res = await ipn(tranId);
      expect([200, 500, 502, 503]).toContain(res.status);
      expect(await count('payments')).toBe(0);
      expect((await intentRow(tranId)).status).toBe('initiated');
    });

    it('overpaying through the gateway allocates oldest bill first and keeps the rest as credit', async () => {
      const older = await issuedBill(lease, '2026-02-01', 300000);
      const newer = await issuedBill(lease, '2026-03-01', 300000);
      const tranId = await startIntent(700000); // ৳7,000 against ৳6,000 of dues
      await ipn(tranId);
      expect(await bill(older)).toEqual({ status: 'paid', paid: '300000' });
      expect(await bill(newer)).toEqual({ status: 'paid', paid: '300000' });
      const credit = await q<{ s: string }>(
        `select coalesce(sum(amount_poisha),0)::text as s from credit_entries where lease_id=$1`,
        [lease],
      );
      expect(credit[0]!.s).toBe('100000');
    });
  });

  // ── browser return ─────────────────────────────────────────────────────────────────────────────
  describe('POST /payments/sslcommerz/return/:result', () => {
    const back = (result: string, tranId: string) =>
      request(ctx.app)
        .post(`/api/payments/sslcommerz/return/${result}`)
        .set('Origin', 'https://sandbox.sslcommerz.com')
        .type('form')
        .send({
          tran_id: tranId,
          val_id: `val-${tranId}`,
          status: 'VALID',
          amount: '5000.00',
          currency: 'BDT',
        });

    it('success return WITHOUT an IPN: 303 to the result page, nothing is paid', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const res = await back('success', tranId);
      expect(res.status).toBe(303);
      expect(res.headers['location']).toContain('/pay/result');
      expect(res.headers['location']).toContain(`tran=${tranId}`);
      expect(res.headers['location']).toContain('result=success');
      expect(await count('payments')).toBe(0);
      expect(await count('receipts')).toBe(0);
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(validationCalls).toBe(0);
    });

    it('fail and cancel returns redirect and never create a payment, leaving intent initiated', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const t1 = await startIntent(500000);
      const t2 = await startIntent(500000);
      const res1 = await back('fail', t1);
      const res2 = await back('cancel', t2);
      expect(res1.status).toBe(303);
      expect(res1.headers['location']).toContain('result=fail');
      expect(res2.status).toBe(303);
      expect(res2.headers['location']).toContain('result=cancel');
      expect(await count('payments')).toBe(0);
      expect((await intentRow(t1)).status).toBe('initiated');
      expect((await intentRow(t2)).status).toBe('initiated');
    });

    it('a late fail return cannot undo a payment the IPN already confirmed', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await ipn(tranId);
      expect((await back('fail', tranId)).status).toBe(303);
      expect((await intentRow(tranId)).status).toBe('confirmed');
      expect(await count('payments')).toBe(1);
    });

    it('an unknown result segment is a 4xx', async () => {
      const res = await back('maybe', 'x');
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  // ── polling ────────────────────────────────────────────────────────────────────────────────────
  describe('GET /payments/sslcommerz/intents/:tranId', () => {
    it('owner sees initiated, then confirmed with the receipt id', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const before = await tenant.agent.get(`/api/payments/sslcommerz/intents/${tranId}`);
      expect(before.status).toBe(200);
      expect(before.body.data).toMatchObject({ status: 'initiated', amountPoisha: 500000, paymentId: null });
      await ipn(tranId);
      const after = await tenant.agent.get(`/api/payments/sslcommerz/intents/${tranId}`);
      expect(after.body.data.status).toBe('confirmed');
      expect(after.body.data.paymentId).toBeTruthy();
      const rec = await q<{ id: string }>(`select id from receipts where payment_id=$1`, [
        after.body.data.paymentId,
      ]);
      expect(after.body.data.receiptId).toBe(rec[0]!.id);
    });

    it('another tenant or an unknown tran id gets 404; anonymous gets 401', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      expect((await tenant2.agent.get(`/api/payments/sslcommerz/intents/${tranId}`)).status).toBe(404);
      expect((await tenant.agent.get(`/api/payments/sslcommerz/intents/nope`)).status).toBe(404);
      expect((await request(ctx.app).get(`/api/payments/sslcommerz/intents/${tranId}`)).status).toBe(401);
    });

    it('only the owning tenant can check intent status; same org landlord and caretaker get 404', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const ct = await actorIn(ctx, org.id, 'caretaker');
      expect((await landlord.agent.get(`/api/payments/sslcommerz/intents/${tranId}`)).status).toBe(404);
      expect((await ct.agent.get(`/api/payments/sslcommerz/intents/${tranId}`)).status).toBe(404);
    });

    it('a landlord of another org gets 404', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      const otherLandlord = await landlordOf(ctx, await makeOrg());
      expect((await otherLandlord.agent.get(`/api/payments/sslcommerz/intents/${tranId}`)).status).toBe(404);
    });
  });

  // ── re-check job ───────────────────────────────────────────────────────────────────────────────
  describe('recheckPaymentIntents job', () => {
    const job = () => jobs.find((j) => j.name === 'recheckPaymentIntents');
    const jobCtx = (): JobContext =>
      ({
        prisma: ctx.prisma,
        redis: ctx.redis,
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        env: {
          APP_ENV: 'test',
          SSLCOMMERZ_STORE_ID: 'teststore001',
          SSLCOMMERZ_STORE_PASSWORD: 'teststore001@ssl',
        },
      }) as unknown as JobContext;
    const age = (tranId: string, minutes: number) =>
      q(`update payment_intents set created_at = now() - make_interval(mins => $2) where tran_id=$1`, [
        tranId,
        minutes,
      ]);

    it('is registered', () => {
      expect(job()).toBeDefined();
    });

    it('confirms an intent stuck in initiated for over 30 minutes, exactly once even if run twice', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 45);
      await job()!.run(jobCtx());
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('confirmed');
      expect(await count('payments')).toBe(1);
      expect(await count('receipts')).toBe(1);
      expect(await bill(b)).toEqual({ status: 'paid', paid: '500000' });
    });

    it('leaves a recent intent (under 30 minutes) alone', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 5);
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await count('payments')).toBe(0);
    });

    it('flags a re-checked intent whose gateway amount differs', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 45);
      scenario = 'mismatch';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('flagged');
      expect(await count('payments')).toBe(0);
    });

    it('flags a re-checked intent whose gateway currency is not BDT', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 45);
      scenario = 'currency-mismatch';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('flagged');
      expect(await count('payments')).toBe(0);
    });

    it('confirms an intent when a declined attempt precedes the valid payment', async () => {
      const b = await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 45);
      scenario = 'declined-then-valid';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('confirmed');
      expect(await count('payments')).toBe(1);
      expect(await bill(b)).toEqual({ status: 'paid', paid: '500000' });
    });

    it('leaves an intent initiated even if only a declined attempt was found at 45 minutes (retry not lost)', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 45);
      scenario = 'only-declined';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await count('payments')).toBe(0);
    });

    it('skips intent and writes nothing when gateway query APIConnect is not DONE', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 1500); // 25 hours old
      scenario = 'query-error';
      await job()!.run(jobCtx());
      // Should NOT be marked expired or failed because query did not succeed!
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await count('payments')).toBe(0);
    });

    it('leaves an intent initiated at 31 minutes when no transactions found yet at gateway', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 31);
      scenario = 'query-empty';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('initiated');
      expect(await count('payments')).toBe(0);
    });

    it('marks an intent expired after 24 hours when no valid transaction found', async () => {
      await issuedBill(lease, '2026-03-01', 500000);
      const tranId = await startIntent(500000);
      await age(tranId, 1500); // 25 hours old
      scenario = 'query-empty';
      await job()!.run(jobCtx());
      expect((await intentRow(tranId)).status).toBe('expired');
      expect(await count('payments')).toBe(0);
    });
  });
});
