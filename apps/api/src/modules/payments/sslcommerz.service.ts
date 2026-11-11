import crypto from 'node:crypto';
import type { Db, Tx, MembershipRole } from '../../config/db.js';
import type { Env } from '../../config/env.js';
import { env as defaultEnv } from '../../config/env.js';
import { clock, getDhakaDateString } from '../../lib/clock.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type {
  InitOnlinePaymentInput,
  InitOnlinePaymentResponse,
  PaymentIntentResponse,
} from '@bm/shared/api/payments';
import { SslcommerzClient } from './sslcommerz.client.js';
import { processPaymentAllocationAndReceipt } from './allocation.js';

function parseAmountToPoisha(amount: string | number | undefined | null): number {
  if (!amount) return 0;
  const str = String(amount).trim();
  const parts = str.split('.');
  const taka = parseInt(parts[0] || '0', 10);
  const poishaPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
  const poisha = parseInt(poishaPart || '0', 10);
  return isNaN(taka) || isNaN(poisha) ? 0 : taka * 100 + poisha;
}

export interface SslcommerzServiceContext {
  orgId: string;
  userId: string;
  role: MembershipRole | null;
}

const WORKER_SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000000';

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

    // 1. Validate lease, membership, and compute maxAllowed inside a short tx
    const leaseData = await this.prisma.$tx(
      { orgId: ctx.orgId, userId: ctx.userId, role: ctx.role },
      async (tx: Tx) => {
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

        const user = await tx.user.findUnique({
          where: { id: ctx.userId },
          select: { fullName: true, email: true },
        });

        return { user };
      },
    );

    // 2. Generate unique transaction ID using clock.now()
    const nowMs = clock.now().getTime();
    const tranId = `BM-${nowMs}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const appUrl = this.envConfig.APP_URL || process.env.APP_URL || 'http://localhost:4000';

    // 3. Call SSLCommerz Gateway Init API OUTSIDE database transaction
    const initRes = await this.client.initPayment({
      tranId,
      amountPoisha: input.amountPoisha,
      appUrl,
      cusName: leaseData.user?.fullName || 'Tenant',
      cusEmail: leaseData.user?.email || 'tenant@example.com',
    });

    // 4. Store PaymentIntent record in initiated status inside a short tx
    await this.prisma.$tx({ orgId: ctx.orgId, userId: ctx.userId, role: ctx.role }, async (tx: Tx) => {
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
    });

    return {
      gatewayUrl: initRes.GatewayPageURL,
      tranId,
    };
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

    // 2. Blocker 2: Never trust unauthenticated form body status alone.
    // If no val_id is provided, or the form claims failure/cancellation,
    // ignore the unauthenticated form payload and leave the intent 'initiated'.
    // The background recheck job will securely query SSLCommerz by tran_id.
    const valId = body.val_id;
    if (!valId || body.status === 'FAILED' || body.status === 'CANCELLED') {
      return { status: 'ignored' };
    }

    // 3. Call SSLCommerz server-to-server validation API
    const valRes = await this.client.validatePayment(valId);

    // Blocker 1 & 2: A transaction ID mismatch or missing tran_id must be IGNORED, not failed or flagged.
    // If the gateway validation response names someone else's transaction ID (or no transaction ID),
    // an attacker may be probing with arbitrary or foreign val_ids. Do not touch our intent.
    if (!valRes.tran_id || valRes.tran_id !== intent.tranId) {
      return { status: 'ignored' };
    }

    // Now we know valRes.tran_id === intent.tranId.
    // Both VALID and VALIDATED are accepted as successful. If gateway explicitly reports failure for our intent:
    if (valRes.status !== 'VALID' && valRes.status !== 'VALIDATED') {
      await this.prisma.$tx(
        { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
        async (tx) => {
          await tx.paymentIntent.updateMany({
            where: { id: intent.id, status: 'initiated' },
            data: { status: 'failed', valId },
          });
        },
      );
      return { status: 'failed' };
    }

    // 4. Validate transaction parameters match our intent
    const validatedPoisha = parseAmountToPoisha(valRes.amount);
    const currency = valRes.currency || valRes.currency_type;

    if (currency !== 'BDT' || validatedPoisha !== Number(intent.amountPoisha)) {
      await this.prisma.$tx(
        { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
        async (tx) => {
          await tx.paymentIntent.updateMany({
            where: { id: intent.id, status: 'initiated' },
            data: { status: 'flagged', valId },
          });
        },
      );
      return { status: 'flagged' };
    }

    // 5. Confirm payment, allocate to bills, issue receipt and write outbox atomically
    await this.confirmIntentAndAllocate(intent, valId);

    return { status: 'confirmed' };
  }

  /**
   * Handles browser return callback from SSLCommerz.
   * NEVER changes money or modifies payment intent state.
   */
  async handleReturn(result: string, body: { tran_id?: string }): Promise<{ redirectUrl: string }> {
    if (result !== 'success' && result !== 'fail' && result !== 'cancel') {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Invalid return result parameter');
    }

    // Blocker 1: Browser returns NEVER modify payment_intents or financial state.
    const tranId = body.tran_id;
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
    await this.prisma.$tx(
      { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
      async (tx: Tx) => {
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

        const now = new Date(clock.now());
        const paidDateDhaka = getDhakaDateString(now);

        // 3. Create confirmed Payment record
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
            paidOn: new Date(paidDateDhaka),
            submittedBy: intent.createdBy,
            confirmedBy: intent.createdBy,
            confirmedAt: now,
          },
        });

        // 4. Shared Rule 5 bill allocation, credit entry, gapless receipt, outbox
        await processPaymentAllocationAndReceipt(tx, {
          orgId: intent.orgId,
          paymentId: payment.id,
          leaseId: intent.leaseId,
          amountPoisha: Number(intent.amountPoisha),
          method: 'sslcommerz',
          outboxType: 'payment.confirmed',
        });

        // 5. Update payment intent status to confirmed
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: {
            status: 'confirmed',
            valId,
            paymentId: payment.id,
          },
        });
      },
    );
  }

  /**
   * Scans and rechecks initiated payment intents older than 30 minutes (worker cron job).
   */
  async recheckPaymentIntents(options?: {
    cutoffMinutes?: number;
    logger?: { info: (obj: unknown, msg: string) => void; error: (obj: unknown, msg: string) => void };
  }): Promise<{ checked: number; confirmed: number; flagged: number; failed: number; expired: number }> {
    const cutoffMinutes = options?.cutoffMinutes ?? 30;

    // Check credentials if not mock
    const isMock = this.envConfig.PAYMENTS_MOCK === true || process.env.PAYMENTS_MOCK === 'true';
    const storeId = this.envConfig.SSLCOMMERZ_STORE_ID || process.env.SSLCOMMERZ_STORE_ID;
    if (!isMock && !storeId) {
      options?.logger?.error({}, 'SSLCOMMERZ_STORE_ID missing for recheckPaymentIntents');
    }

    // 1. Find all intents initiated more than cutoffMinutes ago across all orgs
    const pendingIntents = await this.prisma.$queryRaw<
      {
        id: string;
        org_id: string;
        lease_id: string;
        tran_id: string;
        amount_poisha: bigint;
        created_by: string;
        created_at: Date;
      }[]
    >`
      SELECT id, org_id, lease_id, tran_id, amount_poisha, created_by, created_at
      FROM app_find_stale_payment_intents(${cutoffMinutes})
      ORDER BY created_at ASC
      LIMIT 50
    `;

    let confirmedCount = 0;
    let flaggedCount = 0;
    let failedCount = 0;
    let expiredCount = 0;
    const nowMs = clock.now().getTime();

    for (const raw of pendingIntents) {
      const intent = {
        id: raw.id,
        orgId: raw.org_id,
        leaseId: raw.lease_id,
        tranId: raw.tran_id,
        amountPoisha: raw.amount_poisha,
        createdBy: raw.created_by,
        createdAt: raw.created_at,
      };

      try {
        const queryRes = await this.client.queryTransaction(intent.tranId);
        // Blocker 4: When the gateway query doesn't succeed (e.g. network or credential failure), skip the intent and write nothing!
        if (queryRes.APIConnect !== 'DONE' && !isMock) {
          options?.logger?.error(
            { tranId: intent.tranId, apiConnect: queryRes.APIConnect },
            'SSLCommerz queryTransaction APIConnect was not DONE',
          );
          continue;
        }

        const elements = Array.isArray(queryRes.element) ? queryRes.element : [];
        const ageHours = (nowMs - new Date(intent.createdAt).getTime()) / (1000 * 60 * 60);

        // Blocker 3: Look for ANY paid entry for our transaction ID in queryRes.element
        const paidEntry = elements.find(
          (e) => (e.status === 'VALID' || e.status === 'VALIDATED') && e.tran_id === intent.tranId,
        );

        if (paidEntry) {
          const gatewayPoisha = parseAmountToPoisha(paidEntry.amount);
          if (gatewayPoisha !== Number(intent.amountPoisha)) {
            await this.prisma.$tx(
              { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
              async (tx) => {
                await tx.paymentIntent.updateMany({
                  where: { id: intent.id, status: 'initiated' },
                  data: { status: 'flagged', valId: paidEntry.val_id },
                });
              },
            );
            flaggedCount++;
            continue;
          }

          // Amount and status match -> confirm payment!
          await this.confirmIntentAndAllocate(intent, paidEntry.val_id);
          confirmedCount++;
          continue;
        }

        // Should fix 1: If there is no paid entry:
        // Only mark failed if gateway explicitly reports FAILED or CANCELLED for this tran_id.
        // If not found / still pending (e.g. at 30 min), leave as 'initiated' until 24h.
        const hasFailedEntry = elements.some(
          (e) => (e.status === 'FAILED' || e.status === 'CANCELLED') && e.tran_id === intent.tranId,
        );

        if (hasFailedEntry) {
          await this.prisma.$tx(
            { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
            async (tx) => {
              await tx.paymentIntent.updateMany({
                where: { id: intent.id, status: 'initiated' },
                data: { status: 'failed' },
              });
            },
          );
          failedCount++;
        } else if (ageHours >= 24) {
          // After 24 h with no VALID/VALIDATED, set expired
          await this.prisma.$tx(
            { orgId: intent.orgId, userId: WORKER_SYSTEM_USER_ID, role: null },
            async (tx) => {
              await tx.paymentIntent.updateMany({
                where: { id: intent.id, status: 'initiated' },
                data: { status: 'expired' },
              });
            },
          );
          expiredCount++;
        }
      } catch (err) {
        options?.logger?.error({ tranId: intent.tranId, err }, 'Failed to recheck payment intent');
      }
    }

    return {
      checked: pendingIntents.length,
      confirmed: confirmedCount,
      flagged: flaggedCount,
      failed: failedCount,
      expired: expiredCount,
    };
  }
}
