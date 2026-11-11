import crypto from 'node:crypto';
import type { Db, Tx, MembershipRole } from '../../config/db.js';
import type { Env } from '../../config/env.js';
import { env as defaultEnv } from '../../config/env.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type {
  InitOnlinePaymentInput,
  InitOnlinePaymentResponse,
  PaymentIntentResponse,
} from '@bm/shared/api/payments';
import { SslcommerzClient } from './sslcommerz.client.js';

export interface SslcommerzServiceContext {
  orgId: string;
  userId: string;
  role: MembershipRole | null;
}

export class SslcommerzService {
  private readonly client: SslcommerzClient;
  private readonly envConfig: Env;

  constructor(
    private readonly prisma: Db,
    envConfig?: Env,
    client?: SslcommerzClient,
  ) {
    this.envConfig = envConfig ?? defaultEnv;
    this.client =
      client ??
      new SslcommerzClient({
        storeId: this.envConfig.SSLCOMMERZ_STORE_ID || process.env.SSLCOMMERZ_STORE_ID || '',
        storePassword:
          this.envConfig.SSLCOMMERZ_STORE_PASSWORD || process.env.SSLCOMMERZ_STORE_PASSWORD || '',
        isSandbox: this.envConfig.SSLCOMMERZ_SANDBOX !== false,
        isMock: this.envConfig.PAYMENTS_MOCK === true || process.env.PAYMENTS_MOCK === 'true',
      });
  }

  /**
   * Initializes an online payment with SSLCommerz (tenant only).
   */
  async initPayment(
    ctx: SslcommerzServiceContext,
    input: InitOnlinePaymentInput,
  ): Promise<InitOnlinePaymentResponse> {
    if (ctx.role !== 'tenant') {
      throw new ApiError(ErrorCode.FORBIDDEN, 'Only tenants can initiate online payments');
    }

    const { gatewayUrl, tranId } = await this.prisma.$tx(
      { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role },
      async (tx: Tx) => {
        // 1. Validate lease exists in this organisation
        const lease = await tx.lease.findFirst({
          where: { id: input.leaseId, orgId: ctx.orgId },
          include: {
            unit: {
              include: {
                building: true,
              },
            },
          },
        });

        if (!lease) {
          throw new ApiError(ErrorCode.NOT_FOUND, 'Lease not found');
        }

        // 2. Verify that the caller is a tenant on this specific lease
        const isTenantOnLease = await tx.leaseTenant.findFirst({
          where: {
            leaseId: input.leaseId,
            membership: {
              userId: ctx.userId,
              orgId: ctx.orgId,
            },
          },
        });

        if (!isTenantOnLease) {
          throw new ApiError(ErrorCode.NOT_FOUND, 'Lease not found or not accessible');
        }

        // 3. Calculate open dues + one month's rent as the upper limit
        const unpaidBills = await tx.bill.findMany({
          where: {
            leaseId: input.leaseId,
            status: { in: ['issued', 'partially_paid'] },
          },
          select: {
            totalPoisha: true,
            paidPoisha: true,
          },
        });

        const openDues = unpaidBills.reduce(
          (acc, b) => acc + Math.max(0, Number(b.totalPoisha - b.paidPoisha)),
          0,
        );
        const maxAllowed = openDues + Number(lease.monthlyRentPoisha);

        if (input.amountPoisha < 100_00 || input.amountPoisha > maxAllowed) {
          throw new ApiError(
            ErrorCode.VALIDATION_FAILED,
            `Payment amount must be between ৳100 and open dues plus one month rent (max ৳${(maxAllowed / 100).toFixed(2)})`,
          );
        }

        // 4. Generate unique transaction ID
        const tranId = `BM-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        // 5. Query user details for customer information
        const user = await tx.user.findUnique({
          where: { id: ctx.userId },
          select: { fullName: true, email: true },
        });

        const appUrl = this.envConfig.APP_URL || process.env.APP_URL || 'http://localhost:4000';

        // 6. Call SSLCommerz Gateway Init API
        const initRes = await this.client.initPayment({
          tranId,
          amountPoisha: input.amountPoisha,
          appUrl,
          cusName: user?.fullName || 'Tenant',
          cusEmail: user?.email || 'tenant@example.com',
        });

        // 7. Store PaymentIntent record in initiated status
        await tx.paymentIntent.create({
          data: {
            id: crypto.randomUUID(),
            orgId: ctx.orgId,
            leaseId: input.leaseId,
            tranId,
            amountPoisha: BigInt(input.amountPoisha),
            status: 'initiated',
            sessionKey: initRes.sessionkey,
            createdBy: ctx.userId,
          },
        });

        return {
          gatewayUrl: initRes.GatewayPageURL,
          tranId,
        };
      },
    );

    return { gatewayUrl, tranId };
  }

  /**
   * Handles SSLCommerz Instant Payment Notification (IPN) webhook.
   */
  async handleIpn(body: {
    tran_id?: string;
    val_id?: string;
    status?: string;
    amount?: string;
    currency?: string;
  }): Promise<{ status: 'confirmed' | 'failed' | 'flagged' | 'ignored' | 'already_confirmed' }> {
    const tranId = body.tran_id;
    if (!tranId) {
      return { status: 'ignored' };
    }

    const workerUserId = '00000000-0000-4000-8000-000000000000';

    // 1. Locate intent across all organisations using security-definer lookup
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        org_id: string;
        lease_id: string;
        tran_id: string;
        amount_poisha: bigint;
        status: string;
        session_key: string | null;
        val_id: string | null;
        payment_id: string | null;
        created_by: string;
      }[]
    >`SELECT * FROM app_find_payment_intent_by_tran_id(${tranId})`;

    const rawIntent = rows[0];
    if (!rawIntent) {
      return { status: 'ignored' };
    }

    const intent = {
      id: rawIntent.id,
      orgId: rawIntent.org_id,
      leaseId: rawIntent.lease_id,
      tranId: rawIntent.tran_id,
      amountPoisha: rawIntent.amount_poisha,
      status: rawIntent.status,
      sessionKey: rawIntent.session_key,
      valId: rawIntent.val_id,
      paymentId: rawIntent.payment_id,
      createdBy: rawIntent.created_by,
    };

    if (intent.status === 'confirmed') {
      return { status: 'already_confirmed' };
    }

    // 2. Check if IPN payload itself declares failure
    if (body.status === 'FAILED' || body.status === 'CANCELLED') {
      await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx) => {
        if (intent.status === 'initiated') {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: 'failed' },
          });
        }
      });
      return { status: 'failed' };
    }

    const valId = body.val_id;
    if (!valId) {
      return { status: 'ignored' };
    }

    // 3. Call SSLCommerz server-to-server validation API (never trust form data alone)
    const valRes = await this.client.validatePayment(valId);

    if (valRes.status !== 'VALID') {
      await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx) => {
        if (intent.status === 'initiated') {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: 'failed', valId },
          });
        }
      });
      return { status: 'failed' };
    }

    // 4. Validate transaction parameters match our intent
    const validatedPoisha = Math.round(parseFloat(valRes.amount) * 100);
    const currency = valRes.currency || valRes.currency_type;

    if (
      valRes.tran_id !== intent.tranId ||
      currency !== 'BDT' ||
      validatedPoisha !== Number(intent.amountPoisha)
    ) {
      await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx) => {
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'flagged', valId },
        });
      });
      return { status: 'flagged' };
    }

    // 5. Confirm payment, allocate to bills, issue receipt and write outbox atomically
    await this.confirmIntentAndAllocate(intent, valId);

    return { status: 'confirmed' };
  }

  /**
   * Handles browser return callback from SSLCommerz.
   * NEVER changes money.
   */
  async handleReturn(result: string, body: { tran_id?: string }): Promise<{ redirectUrl: string }> {
    if (result !== 'success' && result !== 'fail' && result !== 'cancel') {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Invalid return result parameter');
    }

    const tranId = body.tran_id;
    const workerUserId = '00000000-0000-4000-8000-000000000000';

    if (tranId && (result === 'fail' || result === 'cancel')) {
      const targetStatus = result === 'fail' ? 'failed' : 'cancelled';
      const rows = await this.prisma.$queryRaw<
        { id: string; org_id: string; status: string }[]
      >`SELECT id, org_id, status::text FROM app_find_payment_intent_by_tran_id(${tranId})`;

      const intent = rows[0];
      if (intent && intent.status === 'initiated') {
        await this.prisma.$tx({ orgId: intent.org_id, userId: workerUserId, role: null }, async (tx) => {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: targetStatus },
          });
        });
      }
    }

    const appUrl = this.envConfig.APP_URL || process.env.APP_URL || 'http://localhost:4000';
    const redirectUrl = `${appUrl}/pay/result?tran=${encodeURIComponent(tranId || '')}`;
    return { redirectUrl };
  }

  /**
   * Retrieves intent status for polling by the owning tenant.
   */
  async getIntent(ctx: SslcommerzServiceContext, tranId: string): Promise<PaymentIntentResponse> {
    return await this.prisma.$tx({ orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }, async (tx: Tx) => {
      const intent = await tx.paymentIntent.findUnique({
        where: { tranId },
      });

      if (!intent || intent.orgId !== ctx.orgId) {
        throw new ApiError(ErrorCode.NOT_FOUND, 'Payment intent not found');
      }

      // Tenants can only inspect intents on their own lease
      if (ctx.role === 'tenant') {
        const isTenantOnLease = await tx.leaseTenant.findFirst({
          where: {
            leaseId: intent.leaseId,
            membership: {
              userId: ctx.userId,
              orgId: ctx.orgId,
            },
          },
        });
        if (!isTenantOnLease) {
          throw new ApiError(ErrorCode.NOT_FOUND, 'Payment intent not found');
        }
      }

      let receiptId: string | null = null;
      let receiptNumber: string | null = null;
      if (intent.paymentId) {
        const receipt = await tx.receipt.findFirst({
          where: { paymentId: intent.paymentId },
          select: { id: true, number: true },
        });
        receiptId = receipt?.id || null;
        receiptNumber = receipt?.number || null;
      }

      return {
        id: intent.id,
        tranId: intent.tranId,
        status: intent.status,
        amountPoisha: Number(intent.amountPoisha),
        paymentId: intent.paymentId,
        receiptId,
        receiptNumber,
      };
    });
  }

  /**
   * Executes atomic payment confirmation, bill allocation (Rule 5), and receipt creation.
   */
  private async confirmIntentAndAllocate(
    intent: {
      id: string;
      orgId: string;
      leaseId: string;
      amountPoisha: bigint;
      createdBy: string;
      tranId: string;
    },
    valId: string,
  ): Promise<void> {
    const workerUserId = '00000000-0000-4000-8000-000000000000';

    await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx: Tx) => {
      // 1. Lock payment intent row to avoid double-processing
      const lockedIntent = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status::text
          FROM payment_intents
          WHERE id = ${intent.id}::uuid
          FOR UPDATE
        `;

      if (!lockedIntent[0] || lockedIntent[0].status === 'confirmed') {
        return;
      }

      // 2. Lock lease row first
      await tx.$queryRaw`
          SELECT id FROM leases WHERE id = ${intent.leaseId}::uuid FOR UPDATE
        `;

      // 3. Lock unpaid and partially paid bills in period_month ASC order
      const bills = await tx.$queryRaw<
        { id: string; period_month: Date; total_poisha: bigint; paid_poisha: bigint; status: string }[]
      >`
          SELECT id, period_month, total_poisha, paid_poisha, status::text
          FROM bills
          WHERE lease_id = ${intent.leaseId}::uuid
            AND status IN ('issued', 'partially_paid')
          ORDER BY period_month ASC
          FOR UPDATE
        `;

      // 4. Create confirmed Payment record
      const paymentId = crypto.randomUUID();
      const payment = await tx.payment.create({
        data: {
          id: paymentId,
          orgId: intent.orgId,
          leaseId: intent.leaseId,
          amountPoisha: intent.amountPoisha,
          method: 'sslcommerz',
          status: 'confirmed',
          reference: valId,
          paidOn: new Date(),
          submittedBy: intent.createdBy,
          confirmedBy: intent.createdBy,
          confirmedAt: new Date(),
        },
      });

      // 5. Allocate payment amount to bills (oldest first)
      let remainingPoisha = Number(intent.amountPoisha);

      for (const b of bills) {
        if (remainingPoisha <= 0) break;

        const total = Number(b.total_poisha);
        const paid = Number(b.paid_poisha);
        const due = Math.max(0, total - paid);

        if (due <= 0) continue;

        const allocateAmount = Math.min(remainingPoisha, due);
        remainingPoisha -= allocateAmount;

        await tx.paymentAllocation.create({
          data: {
            id: crypto.randomUUID(),
            orgId: intent.orgId,
            paymentId: payment.id,
            billId: b.id,
            amountPoisha: BigInt(allocateAmount),
          },
        });

        const newPaid = paid + allocateAmount;
        const newStatus = newPaid >= total ? 'paid' : 'partially_paid';

        await tx.bill.update({
          where: { id: b.id },
          data: {
            paidPoisha: BigInt(newPaid),
            status: newStatus,
          },
        });
      }

      // 6. Overpayment becomes credit entry
      if (remainingPoisha > 0) {
        await tx.creditEntry.create({
          data: {
            id: crypto.randomUUID(),
            orgId: intent.orgId,
            leaseId: intent.leaseId,
            paymentId: payment.id,
            amountPoisha: BigInt(remainingPoisha),
            kind: 'overpayment',
          },
        });
      }

      // 7. Atomic gapless receipt numbering per org and calendar year
      const year = new Date().getUTCFullYear();
      const counterRes = await tx.$queryRaw<{ last_seq: number }[]>`
          INSERT INTO receipt_counters (org_id, year, last_seq)
          VALUES (${intent.orgId}::uuid, ${year}, 1)
          ON CONFLICT (org_id, year)
          DO UPDATE SET last_seq = receipt_counters.last_seq + 1
          RETURNING last_seq
        `;

      const seq = counterRes[0]?.last_seq ?? 1;
      const receiptNumber = `BM-${year}-${String(seq).padStart(6, '0')}`;

      await tx.receipt.create({
        data: {
          id: crypto.randomUUID(),
          orgId: intent.orgId,
          paymentId: payment.id,
          number: receiptNumber,
          status: 'valid',
          fileId: null,
        },
      });

      // 8. Update PaymentIntent status to confirmed
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'confirmed',
          paymentId: payment.id,
          valId: valId,
        },
      });

      // 9. Enqueue outbox notification (createMany avoids RETURNING * since bm_app has no SELECT on outbox)
      await tx.outboxMessage.createMany({
        data: [
          {
            id: crypto.randomUUID(),
            orgId: intent.orgId,
            type: 'payment.confirmed',
            payload: {
              paymentId: payment.id,
              leaseId: intent.leaseId,
              amountPoisha: Number(intent.amountPoisha),
              receiptNumber,
            },
          },
        ],
      });
    });
  }

  /**
   * Scans and rechecks initiated payment intents older than 30 minutes (worker cron job).
   */
  async recheckPaymentIntents(options?: {
    cutoffMinutes?: number;
    logger?: { info: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void };
  }): Promise<{ checked: number; confirmed: number; flagged: number; failed: number }> {
    const cutoffMinutes = options?.cutoffMinutes ?? 30;
    const workerUserId = '00000000-0000-4000-8000-000000000000';

    // 1. Find all intents initiated more than cutoffMinutes ago across all orgs
    const pendingIntents = await this.prisma.$queryRaw<
      {
        id: string;
        org_id: string;
        lease_id: string;
        tran_id: string;
        amount_poisha: bigint;
        created_by: string;
      }[]
    >`
      SELECT id, org_id, lease_id, tran_id, amount_poisha, created_by
      FROM app_find_stale_payment_intents(${cutoffMinutes})
      ORDER BY created_at ASC
      LIMIT 50
    `;

    let confirmedCount = 0;
    let flaggedCount = 0;
    let failedCount = 0;

    for (const raw of pendingIntents) {
      const intent = {
        id: raw.id,
        orgId: raw.org_id,
        leaseId: raw.lease_id,
        tranId: raw.tran_id,
        amountPoisha: raw.amount_poisha,
        createdBy: raw.created_by,
      };

      try {
        const queryRes = await this.client.queryTransaction(intent.tranId);
        const trans = queryRes.element?.[0];

        if (!trans || trans.status !== 'VALID') {
          // If transaction was not found or failed
          if (queryRes.no_of_trans_found === 0 || trans?.status === 'FAILED') {
            await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx) => {
              await tx.paymentIntent.update({
                where: { id: intent.id },
                data: { status: 'failed' },
              });
            });
            failedCount++;
          }
          continue;
        }

        const gatewayPoisha = Math.round(parseFloat(trans.amount) * 100);
        if (gatewayPoisha !== Number(intent.amountPoisha)) {
          await this.prisma.$tx({ orgId: intent.orgId, userId: workerUserId, role: null }, async (tx) => {
            await tx.paymentIntent.update({
              where: { id: intent.id },
              data: { status: 'flagged', valId: trans.val_id },
            });
          });
          flaggedCount++;
          continue;
        }

        // Amount and status match -> confirm payment!
        await this.confirmIntentAndAllocate(intent, trans.val_id);
        confirmedCount++;
      } catch (err) {
        options?.logger?.error({ tranId: intent.tranId, err }, 'Failed to recheck payment intent');
      }
    }

    return {
      checked: pendingIntents.length,
      confirmed: confirmedCount,
      flagged: flaggedCount,
      failed: failedCount,
    };
  }
}
