import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import {
  makeOrg,
  makeBuilding,
  makeUnit,
  makeLease,
  makeBill,
  makeFile,
  type Org,
} from '../helpers/factories';
import { buildTestApp, resetAll, newAgent, type TestCtx } from '../helpers/auth';
import { actorIn, landlordOf, type Actor } from '../helpers/roles';
import { clock, getDhakaDateString } from '../../src/lib/clock';

/**
 * Interface (V9 brief + 04-API.md conventions). Success bodies are enveloped like every other route:
 *  - POST /payments/claims | /payments | /:id/confirm | /:id/reject | /:id/void -> { data: PaymentResponse }
 *    (201 for claims and direct records, 200 for the others)
 *  - GET  /payments?leaseId=&status=   -> 200 { data: PaymentResponse[], page: { nextCursor } }
 *  - GET  /receipts/:id/download       -> 200 { data: { downloadUrl } } | 202 { data: { status: 'rendering' } }
 *  - POST /files (multipart file + kind) -> 201 { data: { fileId, publicId, kind, sizeBytes, mime } }
 *  - GET  /files/:id/url?variant=      -> 200 { data: { url, expiresAt } }
 *  - GET  /files/local/:id?exp=&sig=   -> 200 file bytes (no cookies needed), 403 on bad/expired signature
 * Outbox rows (table `outbox`): payment.claim_submitted | payment.confirmed | payment.rejected | payment.voided.
 */
const MISSING = '00000000-0000-4000-8000-000000000000';
const MB = 1024 * 1024;
// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('V9: payments, receipts and files', () => {
  let ctx: TestCtx;
  let org: Org;
  let building: string;
  let lease: string;
  let lease2: string;
  let landlord: Actor;
  let caretaker: Actor;
  let tenant: Actor;
  let tenant2: Actor;
  const year = (): string => getDhakaDateString().slice(0, 4);

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());

  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg();
    building = await makeBuilding(org.id);
    const u1 = await makeUnit(org.id, building, { label: 'A1' });
    const u2 = await makeUnit(org.id, building, { label: 'A2' });
    lease = await makeLease(org.id, u1, org.landlordUserId);
    lease2 = await makeLease(org.id, u2, org.landlordUserId);
    landlord = await landlordOf(ctx, org);
    caretaker = await actorIn(ctx, org.id, 'caretaker', { buildingIds: [building] });
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

  // ── helpers ────────────────────────────────────────────────────────────────────────────────────
  async function issuedBill(leaseId: string, month: string, total: number, paid = 0): Promise<string> {
    const id = await makeBill(org.id, leaseId, { periodMonth: month, totalPoisha: total, paidPoisha: paid });
    await q(`update bills set status = $2, issued_at = now() where id = $1`, [
      id,
      paid === 0 ? 'issued' : 'partially_paid',
    ]);
    return id;
  }
  const bill = async (id: string) =>
    (
      await q<{ status: string; paid: string }>(
        `select status, paid_poisha::text as paid from bills where id=$1`,
        [id],
      )
    )[0]!;
  const body = (o: Record<string, unknown> = {}) => ({
    leaseId: lease,
    amountPoisha: 500000,
    method: 'cash',
    paidOn: '2026-03-05',
    ...o,
  });
  const claim = (o: Record<string, unknown> = {}, a: Actor = tenant) =>
    a.agent.post('/api/payments/claims').send(body(o));
  const record = (o: Record<string, unknown> = {}, a: Actor = landlord) =>
    a.agent.post('/api/payments').send(body(o));
  const confirm = (id: string, a: Actor = caretaker) => a.agent.post(`/api/payments/${id}/confirm`).send({});
  const reject = (id: string, reason: string | undefined = 'No such transfer', a: Actor = caretaker) =>
    a.agent.post(`/api/payments/${id}/reject`).send(reason === undefined ? {} : { reason });
  const voidIt = (id: string, a: Actor = landlord) =>
    a.agent.post(`/api/payments/${id}/void`).send({ reason: 'Entered twice' });
  const allocs = (paymentId: string) =>
    q<{ bill_id: string; amount_poisha: string }>(
      `select bill_id, amount_poisha::text from payment_allocations where payment_id=$1 order by amount_poisha`,
      [paymentId],
    );
  const creditSum = async (leaseId = lease) =>
    Number(
      (
        await q<{ s: string }>(
          `select coalesce(sum(amount_poisha),0)::text as s from credit_entries where lease_id=$1`,
          [leaseId],
        )
      )[0]!.s,
    );
  const outbox = (type: string) =>
    q<{ payload: Record<string, unknown> }>(`select payload from outbox where org_id=$1 and type=$2`, [
      org.id,
      type,
    ]);
  const receiptOf = async (paymentId: string) =>
    (
      await q<{ number: string; status: string }>(`select number, status from receipts where payment_id=$1`, [
        paymentId,
      ])
    )[0];
  const count = async (table: string) =>
    Number((await q<{ n: string }>(`select count(*)::text as n from ${table}`))[0]!.n);
  const upload = (a: Actor, buf: Buffer, filename: string, contentType: string, kind = 'payment_proof') =>
    a.agent.post('/api/files').field('kind', kind).attach('file', buf, { filename, contentType });

  // ── claims ─────────────────────────────────────────────────────────────────────────────────────
  describe('POST /payments/claims', () => {
    it('201: tenant claim for own lease is pending_claim, allocates nothing, queues payment.claim_submitted', async () => {
      const b = await issuedBill(lease, '2026-03-01', 1400000);
      const res = await claim({ method: 'bkash', reference: 'TRX100' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        leaseId: lease,
        amountPoisha: 500000,
        method: 'bkash',
        status: 'pending_claim',
        reference: 'TRX100',
        paidOn: '2026-03-05',
        submittedBy: tenant.userId,
      });
      expect(res.body.data.confirmedBy ?? null).toBeNull();
      expect(await allocs(res.body.data.id)).toEqual([]);
      expect(await receiptOf(res.body.data.id)).toBeUndefined();
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
      expect(await outbox('payment.claim_submitted')).toHaveLength(1);
    });

    it('201: accepts an uploaded proof file', async () => {
      const up = await upload(tenant, PNG, 'proof.png', 'image/png');
      expect(up.status).toBe(201);
      const res = await claim({ proofFileId: up.body.data.fileId });
      expect(res.status).toBe(201);
      expect(res.body.data.proofFileId).toBe(up.body.data.fileId);
    });

    it("404 for another tenant's lease (nothing created)", async () => {
      const res = await claim({ leaseId: lease2 });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(await count('payments')).toBe(0);
    });

    it('403 for landlord and caretaker (claims are tenant-initiated); 401 when signed out', async () => {
      expect((await claim({}, landlord)).status).toBe(403);
      expect((await claim({}, caretaker)).status).toBe(403);
      expect((await newAgent(ctx).get('/api/payments')).status).toBe(401);
      expect(await count('payments')).toBe(0);
    });

    it('409 DUPLICATE_REFERENCE for the same bKash reference; a rejected claim frees it', async () => {
      const first = await claim({ method: 'bkash', reference: 'TRX200' });
      expect(first.status).toBe(201);
      const dup = await claim({ method: 'bkash', reference: 'TRX200' });
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe(ErrorCode.DUPLICATE_REFERENCE);
      expect((await reject(first.body.data.id)).status).toBe(200);
      expect((await claim({ method: 'bkash', reference: 'TRX200' })).status).toBe(201);
    });

    it('400 VALIDATION_FAILED for amount 0 and a malformed paidOn', async () => {
      for (const bad of [{ amountPoisha: 0 }, { paidOn: '05/03/2026' }]) {
        const res = await claim(bad);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });
  });

  // ── direct recording ───────────────────────────────────────────────────────────────────────────
  describe('POST /payments', () => {
    it('201: landlord records a payment -> confirmed, confirmedBy/At set, Rule 5 example (3,000 + 14,000 + 3,000 credit)', async () => {
      const mar = await issuedBill(lease, '2026-03-01', 300000);
      const apr = await issuedBill(lease, '2026-04-01', 1400000);
      const res = await record({ amountPoisha: 2000000 });
      expect(res.status).toBe(201);
      const p = res.body.data;
      expect(p).toMatchObject({ status: 'confirmed', confirmedBy: landlord.userId, amountPoisha: 2000000 });
      expect(p.confirmedAt).toBeTruthy();
      expect(await allocs(p.id)).toEqual([
        { bill_id: mar, amount_poisha: '300000' },
        { bill_id: apr, amount_poisha: '1400000' },
      ]);
      expect(await bill(mar)).toEqual({ status: 'paid', paid: '300000' });
      expect(await bill(apr)).toEqual({ status: 'paid', paid: '1400000' });
      const credit = await q<{ amount_poisha: string; kind: string; payment_id: string }>(
        `select amount_poisha::text, kind::text, payment_id from credit_entries where lease_id=$1`,
        [lease],
      );
      expect(credit).toEqual([{ amount_poisha: '300000', kind: 'overpayment', payment_id: p.id }]);
    });

    it('allocates oldest unpaid bill first and leaves the next one partially_paid', async () => {
      const mar = await issuedBill(lease, '2026-03-01', 300000);
      const apr = await issuedBill(lease, '2026-04-01', 1400000);
      expect((await record({ amountPoisha: 500000 }, caretaker)).status).toBe(201);
      expect(await bill(mar)).toEqual({ status: 'paid', paid: '300000' });
      expect(await bill(apr)).toEqual({ status: 'partially_paid', paid: '200000' });
      expect(await creditSum()).toBe(0);
    });

    it('creates a receipt numbered BM-<year>-000001 (then 000002) in the same transaction', async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      const a = await record();
      const b = await record();
      expect(await receiptOf(a.body.data.id)).toEqual({ number: `BM-${year()}-000001`, status: 'valid' });
      expect(await receiptOf(b.body.data.id)).toEqual({ number: `BM-${year()}-000002`, status: 'valid' });
      expect(a.body.data.receipt?.number).toBe(`BM-${year()}-000001`);
    });

    it('403 for a tenant; 404 for a lease of another org', async () => {
      expect((await record({}, tenant)).status).toBe(403);
      const other = await makeOrg();
      const ob = await makeBuilding(other.id);
      const ol = await makeLease(other.id, await makeUnit(other.id, ob), other.landlordUserId);
      const res = await record({ leaseId: ol });
      expect(res.status).toBe(404);
      expect(await count('payments')).toBe(0);
    });

    it('caretaker cannot record on a building they are not assigned to (404)', async () => {
      const b2 = await makeBuilding(org.id);
      const l = await makeLease(org.id, await makeUnit(org.id, b2), org.landlordUserId);
      expect((await record({ leaseId: l }, caretaker)).status).toBe(404);
    });
  });

  // ── confirm / reject ───────────────────────────────────────────────────────────────────────────
  describe('POST /payments/:id/confirm and /reject', () => {
    it('caretaker confirms a claim: allocated, receipt issued, payment.confirmed queued', async () => {
      const b = await issuedBill(lease, '2026-03-01', 1400000);
      const c = (await claim({ amountPoisha: 600000 })).body.data;
      const res = await confirm(c.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'confirmed', confirmedBy: caretaker.userId });
      expect(res.body.data.confirmedAt).toBeTruthy();
      expect(await bill(b)).toEqual({ status: 'partially_paid', paid: '600000' });
      expect((await allocs(c.id)).map((a) => a.amount_poisha)).toEqual(['600000']);
      expect((await receiptOf(c.id))?.number).toBe(`BM-${year()}-000001`);
      expect(await outbox('payment.confirmed')).toHaveLength(1);
    });

    it('reject needs a reason (400), then sets rejected + rejectedReason and queues payment.rejected', async () => {
      const b = await issuedBill(lease, '2026-03-01', 1400000);
      const c = (await claim()).body.data;
      const noReason = await reject(c.id, undefined);
      expect(noReason.status).toBe(400);
      expect(noReason.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      const res = await reject(c.id, 'No such transfer');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'rejected', rejectedReason: 'No such transfer' });
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
      expect(await receiptOf(c.id)).toBeUndefined();
      expect(await outbox('payment.rejected')).toHaveLength(1);
    });

    it('409 when confirming or rejecting a payment that is already confirmed, rejected or void', async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      const confirmed = (await claim()).body.data;
      await confirm(confirmed.id);
      const rejected = (await claim()).body.data;
      await reject(rejected.id);
      const voided = (await record()).body.data;
      await voidIt(voided.id);
      for (const id of [confirmed.id, rejected.id, voided.id]) {
        expect((await confirm(id)).status).toBe(409);
        expect((await reject(id)).status).toBe(409);
      }
      expect(await count('receipts')).toBe(2);
    });

    it('403 for tenants; 404 for another org or a missing id', async () => {
      const c = (await claim()).body.data;
      expect((await confirm(c.id, tenant)).status).toBe(403);
      expect((await reject(c.id, 'x', tenant)).status).toBe(403);
      const other = await makeOrg();
      const outsider = await landlordOf(ctx, other);
      expect((await confirm(c.id, outsider)).status).toBe(404);
      expect((await confirm(MISSING)).status).toBe(404);
      expect(
        (await q<{ status: string }>(`select status::text from payments where id=$1`, [c.id]))[0]!.status,
      ).toBe('pending_claim');
    });
  });

  // ── concurrency and atomicity ──────────────────────────────────────────────────────────────────
  describe('concurrency and atomicity', () => {
    it('two claims confirmed at the same time on one lease: no lost update', async () => {
      const mar = await issuedBill(lease, '2026-03-01', 1000000);
      const apr = await issuedBill(lease, '2026-04-01', 1000000);
      const c1 = (await claim({ amountPoisha: 700000 })).body.data;
      const c2 = (await claim({ amountPoisha: 700000 })).body.data;
      const [r1, r2] = await Promise.all([confirm(c1.id, landlord), confirm(c2.id, caretaker)]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      const allocated = (await allocs(c1.id))
        .concat(await allocs(c2.id))
        .reduce((s, a) => s + Number(a.amount_poisha), 0);
      expect(allocated + (await creditSum())).toBe(1400000);
      const [m, a] = [await bill(mar), await bill(apr)];
      expect(Number(m.paid) + Number(a.paid)).toBe(1400000);
      expect(Number(m.paid)).toBeLessThanOrEqual(1000000);
      expect(Number(a.paid)).toBeLessThanOrEqual(1000000);
      expect(m.status).toBe('paid');
      expect(a.status).toBe('partially_paid');
    });

    it('20 concurrent payments in one org get gapless receipt numbers 000001..000020', async () => {
      await issuedBill(lease, '2026-03-01', 50000000);
      const results = await Promise.all(Array.from({ length: 20 }, () => record({ amountPoisha: 100000 })));
      for (const r of results) expect(r.status).toBe(201);
      const nums = (
        await q<{ number: string }>(`select number from receipts where org_id=$1 order by number`, [org.id])
      ).map((r) => r.number);
      expect(nums).toEqual(
        Array.from({ length: 20 }, (_, i) => `BM-${year()}-${String(i + 1).padStart(6, '0')}`),
      );
      expect((await bill((await q<{ id: string }>(`select id from bills`))[0]!.id)).paid).toBe('2000000');
    });

    it('rolls everything back when the receipt insert fails (no payment, allocation, credit or counter)', async () => {
      const b = await issuedBill(lease, '2026-03-01', 300000);
      await q(`create or replace function test_fail_receipt() returns trigger language plpgsql as
               $$ begin raise exception 'receipt insert failed (test)'; end $$`);
      await q(
        `create trigger test_fail_receipt before insert on receipts for each row execute function test_fail_receipt()`,
      );
      try {
        const res = await record({ amountPoisha: 500000 });
        expect(res.status).toBe(500);
      } finally {
        await q(`drop trigger test_fail_receipt on receipts`);
        await q(`drop function test_fail_receipt()`);
      }
      expect(await count('payments')).toBe(0);
      expect(await count('payment_allocations')).toBe(0);
      expect(await count('credit_entries')).toBe(0);
      expect(await count('receipt_counters')).toBe(0);
      expect(await bill(b)).toEqual({ status: 'issued', paid: '0' });
      expect(await outbox('payment.confirmed')).toHaveLength(0);
    });
  });

  // ── void ───────────────────────────────────────────────────────────────────────────────────────
  describe('POST /payments/:id/void', () => {
    it('landlord voids: payment void with reason + voidedBy, receipt void, allocations removed, bills reopened', async () => {
      const mar = await issuedBill(lease, '2026-03-01', 300000);
      const apr = await issuedBill(lease, '2026-04-01', 1400000);
      const p = (await record({ amountPoisha: 500000 })).body.data;
      const res = await voidIt(p.id);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'void',
        voidReason: 'Entered twice',
        voidedBy: landlord.userId,
      });
      expect(await receiptOf(p.id)).toMatchObject({ status: 'void' });
      expect(await allocs(p.id)).toEqual([]);
      expect(await bill(mar)).toEqual({ status: 'issued', paid: '0' });
      expect(await bill(apr)).toEqual({ status: 'issued', paid: '0' });
      expect(await outbox('payment.voided')).toHaveLength(1);
    });

    it('a bill that was part-paid by another payment goes back to partially_paid, not issued', async () => {
      const apr = await issuedBill(lease, '2026-04-01', 1000000);
      await record({ amountPoisha: 400000 });
      const second = (await record({ amountPoisha: 300000 })).body.data;
      expect(await bill(apr)).toEqual({ status: 'partially_paid', paid: '700000' });
      expect((await voidIt(second.id)).status).toBe(200);
      expect(await bill(apr)).toEqual({ status: 'partially_paid', paid: '400000' });
    });

    it('removes the credit the payment created', async () => {
      await issuedBill(lease, '2026-03-01', 300000);
      const p = (await record({ amountPoisha: 500000 })).body.data;
      expect(await creditSum()).toBe(200000);
      await voidIt(p.id);
      expect(await creditSum()).toBe(0);
    });

    it('void after the credit was already used: the later bill is unpaid again (Rule 6)', async () => {
      const mar = await issuedBill(lease, '2026-03-01', 300000);
      const p = (await record({ amountPoisha: 500000 })).body.data; // Mar paid, 200,000 credit
      const apr = await makeBill(org.id, lease, { periodMonth: '2026-04-01', totalPoisha: 1400000 });
      await q(`update bills set status='partially_paid', paid_poisha=200000, issued_at=now() where id=$1`, [
        apr,
      ]);
      await q(
        `insert into credit_entries (org_id, lease_id, amount_poisha, kind, bill_id) values ($1,$2,-200000,'applied',$3)`,
        [org.id, lease, apr],
      );
      const res = await voidIt(p.id);
      expect(res.status).toBe(200);
      expect(await bill(mar)).toEqual({ status: 'issued', paid: '0' });
      expect(await bill(apr)).toEqual({ status: 'issued', paid: '0' });
      expect(await creditSum()).toBe(0); // never negative
    });

    it('403 for caretaker and tenant; 400 without a reason; 409 for pending, rejected or already void', async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      const p = (await record()).body.data;
      expect((await voidIt(p.id, caretaker)).status).toBe(403);
      expect((await voidIt(p.id, tenant)).status).toBe(403);
      const noReason = await landlord.agent.post(`/api/payments/${p.id}/void`).send({});
      expect(noReason.status).toBe(400);
      expect(
        (await q<{ status: string }>(`select status::text from payments where id=$1`, [p.id]))[0]!.status,
      ).toBe('confirmed');
      const pending = (await claim()).body.data;
      expect((await voidIt(pending.id)).status).toBe(409);
      expect((await voidIt(p.id)).status).toBe(200);
      expect((await voidIt(p.id)).status).toBe(409);
    });
  });

  // ── list ───────────────────────────────────────────────────────────────────────────────────────
  describe('GET /payments', () => {
    it('staff filter by leaseId and status; tenants only ever see their own lease', async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      await issuedBill(lease2, '2026-03-01', 5000000);
      await record({ leaseId: lease });
      await record({ leaseId: lease2 });
      await claim({ leaseId: lease });
      const all = await landlord.agent.get('/api/payments');
      expect(all.status).toBe(200);
      expect(all.body.data).toHaveLength(3);
      expect(all.body.page).toHaveProperty('nextCursor');
      const pending = await caretaker.agent.get(`/api/payments?leaseId=${lease}&status=pending_claim`);
      expect(pending.body.data).toHaveLength(1);
      const mine = await tenant.agent.get('/api/payments');
      expect(mine.status).toBe(200);
      expect(mine.body.data.map((p: { leaseId: string }) => p.leaseId)).toEqual([lease, lease]);
      expect((await tenant.agent.get(`/api/payments?leaseId=${lease2}`)).status).toBe(404);
    });
  });

  // ── receipts ───────────────────────────────────────────────────────────────────────────────────
  describe('GET /receipts/:id/download', () => {
    const receiptId = async (paymentId: string) =>
      (await q<{ id: string }>(`select id from receipts where payment_id=$1`, [paymentId]))[0]!.id;

    it('202 rendering while the PDF is missing; 200 with an expiring downloadUrl once it exists', async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      const p = (await record()).body.data;
      const rid = await receiptId(p.id);
      const pending = await tenant.agent.get(`/api/receipts/${rid}/download`);
      expect(pending.status).toBe(202);
      expect(pending.body.data).toEqual({ status: 'rendering' });
      const f = await makeFile(org.id, org.landlordUserId, 'receipt_pdf');
      await q(`update receipts set file_id=$2 where id=$1`, [rid, f]);
      for (const a of [tenant, caretaker, landlord]) {
        const res = await a.agent.get(`/api/receipts/${rid}/download`);
        expect(res.status).toBe(200);
        expect(typeof res.body.data.downloadUrl).toBe('string');
      }
    });

    it("404 for another tenant's receipt and for another org", async () => {
      await issuedBill(lease, '2026-03-01', 5000000);
      const rid = await receiptId((await record()).body.data.id);
      expect((await tenant2.agent.get(`/api/receipts/${rid}/download`)).status).toBe(404);
      const outsider = await landlordOf(ctx, await makeOrg());
      expect((await outsider.agent.get(`/api/receipts/${rid}/download`)).status).toBe(404);
    });
  });

  // ── files ──────────────────────────────────────────────────────────────────────────────────────
  describe('files', () => {
    it('201: stores an allowed image as an authenticated-style private object', async () => {
      const res = await upload(tenant, PNG, 'proof.png', 'image/png');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ kind: 'payment_proof', mime: 'image/png' });
      expect(res.body.data.publicId).toContain(`org/${org.id}/`);
      const row = (
        await q<{ kind: string; uploaded_by: string }>(
          `select kind::text, uploaded_by from files where id=$1`,
          [res.body.data.fileId],
        )
      )[0]!;
      expect(row).toEqual({ kind: 'payment_proof', uploaded_by: tenant.userId });
    });

    it('413 above 5 MB (nothing stored)', async () => {
      const big = Buffer.concat([PNG, Buffer.alloc(6 * MB)]);
      const res = await upload(tenant, big, 'big.png', 'image/png');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
      expect(await count('files')).toBe(0);
    });

    it('415 for an executable renamed to .jpg (type is sniffed, not trusted)', async () => {
      const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
      const res = await upload(tenant, exe, 'invoice.jpg', 'image/jpeg');
      expect(res.status).toBe(415);
      expect(await count('files')).toBe(0);
    });

    it('401 without a session', async () => {
      const res = await request(ctx.app)
        .post('/api/files')
        .set('Origin', ctx.env.APP_URL)
        .field('kind', 'payment_proof')
        .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' });
      expect(res.status).toBe(401);
    });

    describe('signed URLs', () => {
      let fileId: string;
      beforeEach(async () => {
        fileId = (await upload(tenant, PNG, 'proof.png', 'image/png')).body.data.fileId;
      });
      const localPath = (url: string): string => {
        const u = new URL(url, 'http://localhost');
        return u.pathname + u.search;
      };

      it('permitted users get a url that works without cookies until it expires', async () => {
        for (const a of [tenant, landlord, caretaker]) {
          const res = await a.agent.get(`/api/files/${fileId}/url`);
          expect(res.status).toBe(200);
          expect(new Date(res.body.data.expiresAt).getTime()).toBeGreaterThan(clock.now().getTime());
        }
        const { url } = (await tenant.agent.get(`/api/files/${fileId}/url`)).body.data;
        const served = await request(ctx.app).get(localPath(url));
        expect(served.status).toBe(200);
        expect(served.headers['content-type']).toMatch(/image\//);
      });

      it('rejects a tampered signature and an expired url (403)', async () => {
        const { url } = (await tenant.agent.get(`/api/files/${fileId}/url`)).body.data;
        const u = new URL(url, 'http://localhost');
        const sig = u.searchParams.get('sig')!;
        u.searchParams.set('sig', (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1));
        expect((await request(ctx.app).get(u.pathname + u.search)).status).toBe(403);
        clock.set(new Date(clock.now().getTime() + 6 * 60_000)); // past the 5 minute expiry
        expect((await request(ctx.app).get(localPath(url))).status).toBe(403);
      });

      it("404 for another tenant, another org's landlord and a missing file", async () => {
        expect((await tenant2.agent.get(`/api/files/${fileId}/url`)).status).toBe(404);
        const outsider = await landlordOf(ctx, await makeOrg());
        expect((await outsider.agent.get(`/api/files/${fileId}/url`)).status).toBe(404);
        expect((await tenant.agent.get(`/api/files/${MISSING}/url`)).status).toBe(404);
      });
    });
  });
});
