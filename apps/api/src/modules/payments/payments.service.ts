import { type Db, type Tx, type MembershipRole, Prisma } from '../../config/db.js';
import { clock, getDhakaDateString } from '../../lib/clock.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import { allocatePayment } from '@bm/domain';
import { storage } from '../../config/storage/index.js';
import type {
  CreatePaymentClaimInput,
  RecordPaymentInput,
  ListPaymentsParsedQuery,
  PaymentResponse,
} from '@bm/shared/api/payments';

type PaymentWithRelations = Prisma.PaymentGetPayload<object> & {
  allocations?: Array<{
    id: string;
    billId: string;
    amountPoisha: bigint | number;
    createdAt?: Date | string;
    bill?: {
      periodMonth: Date;
    } | null;
  }>;
  receipt?: {
    id: string;
    number: string;
    status: string;
    fileId?: string | null;
    createdAt?: Date | string;
  } | null;
  lease?: {
    unit?: {
      label: string;
      building?: {
        name: string;
      } | null;
    } | null;
  } | null;
};

export interface PaymentContext {
  orgId: string;
  userId: string;
  role: string;
  membershipId: string;
  isAdmin?: boolean;
}

export class PaymentsService {
  constructor(private readonly prisma: Db) {}

  private getTenantCtx(ctx: PaymentContext) {
    return {
      orgId: ctx.orgId,
      userId: ctx.userId,
      role: (ctx.role ?? null) as MembershipRole | null,
      isAdmin: ctx.isAdmin,
    };
  }

  async submitClaim(ctx: PaymentContext, input: CreatePaymentClaimInput): Promise<PaymentResponse> {
    if (ctx.role !== 'tenant') {
      throw ApiError.forbidden('Payment claims can only be submitted by tenants');
    }

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      // Verify lease belongs to tenant in this org
      const leaseTenant = await tx.leaseTenant.findFirst({
        where: {
          orgId: ctx.orgId,
          leaseId: input.leaseId,
          membership: {
            id: ctx.membershipId,
            userId: ctx.userId,
            orgId: ctx.orgId,
          },
        },
      });

      if (!leaseTenant) {
        throw ApiError.notFound('Lease not found');
      }

      if (input.reference && input.reference.trim()) {
        const existing = await tx.payment.findFirst({
          where: {
            orgId: ctx.orgId,
            method: input.method,
            reference: input.reference.trim(),
            status: { not: 'rejected' },
          },
        });
        if (existing) {
          throw new ApiError(ErrorCode.DUPLICATE_REFERENCE, 'A payment with this reference already exists');
        }
      }

      if (input.proofFileId) {
        const file = await tx.file.findFirst({
          where: {
            id: input.proofFileId,
            orgId: ctx.orgId,
            deletedAt: null,
          },
        });
        if (!file) {
          throw ApiError.notFound('Proof file not found');
        }
      }

      const p = await tx.payment.create({
        data: {
          orgId: ctx.orgId,
          leaseId: input.leaseId,
          amountPoisha: BigInt(input.amountPoisha),
          method: input.method,
          status: 'pending_claim',
          reference: input.reference ? input.reference.trim() : null,
          proofFileId: input.proofFileId || null,
          paidOn: new Date(input.paidOn),
          submittedBy: ctx.userId,
        },
      });

      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: ctx.orgId,
            type: 'payment.claim_submitted',
            payload: {
              paymentId: p.id,
              leaseId: p.leaseId,
              amountPoisha: input.amountPoisha,
              method: p.method,
              reference: p.reference,
              paidOn: input.paidOn,
              submittedBy: ctx.userId,
            },
          },
        ],
      });

      return this.formatPayment(p);
    });
  }

  async recordPayment(ctx: PaymentContext, input: RecordPaymentInput): Promise<PaymentResponse> {
    if (ctx.role !== 'landlord' && ctx.role !== 'caretaker') {
      throw ApiError.forbidden('Only landlords and caretakers can record payments');
    }

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      const lease = await tx.lease.findFirst({
        where: {
          id: input.leaseId,
          orgId: ctx.orgId,
        },
        include: {
          unit: {
            select: { buildingId: true },
          },
        },
      });

      if (!lease) {
        throw ApiError.notFound('Lease not found');
      }

      if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
            buildingId: lease.unit.buildingId,
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Building not found or not assigned to caretaker');
        }
      }

      if (input.reference && input.reference.trim()) {
        const existing = await tx.payment.findFirst({
          where: {
            orgId: ctx.orgId,
            method: input.method,
            reference: input.reference.trim(),
            status: { not: 'rejected' },
          },
        });
        if (existing) {
          throw new ApiError(ErrorCode.DUPLICATE_REFERENCE, 'A payment with this reference already exists');
        }
      }

      // Lock lease row
      await tx.$queryRaw`SELECT id FROM leases WHERE org_id = ${ctx.orgId}::uuid AND id = ${input.leaseId}::uuid FOR UPDATE`;

      // Lock unpaid bills ordered by period_month ASC
      const lockedBills = await tx.$queryRaw<
        Array<{
          id: string;
          period_month: string;
          total_poisha: bigint;
          paid_poisha: bigint;
          status: string;
        }>
      >`SELECT id, period_month::text, total_poisha, paid_poisha, status::text
        FROM bills
        WHERE org_id = ${ctx.orgId}::uuid AND lease_id = ${input.leaseId}::uuid AND status IN ('issued', 'partially_paid')
        ORDER BY period_month ASC FOR UPDATE`;

      const now = new Date(clock.now());

      const payment = await tx.payment.create({
        data: {
          orgId: ctx.orgId,
          leaseId: input.leaseId,
          amountPoisha: BigInt(input.amountPoisha),
          method: input.method,
          status: 'confirmed',
          reference: input.reference ? input.reference.trim() : null,
          proofFileId: input.proofFileId || null,
          paidOn: new Date(input.paidOn),
          submittedBy: ctx.userId,
          confirmedBy: ctx.userId,
          confirmedAt: now,
        },
      });

      // Allocate payment to bills
      const billsToAllocate = lockedBills.map(
        (b: { id: string; period_month: string; total_poisha: bigint; paid_poisha: bigint }) => ({
          id: b.id,
          periodMonth: b.period_month,
          totalPoisha: Number(b.total_poisha),
          paidPoisha: Number(b.paid_poisha),
        }),
      );

      const { allocations, creditPoisha } = allocatePayment({
        amountPoisha: input.amountPoisha,
        bills: billsToAllocate,
      });

      const allocationRecords = [];
      for (const alloc of allocations) {
        const pa = await tx.paymentAllocation.create({
          data: {
            orgId: ctx.orgId,
            paymentId: payment.id,
            billId: alloc.billId,
            amountPoisha: BigInt(alloc.amountPoisha),
          },
        });
        allocationRecords.push(pa);

        await tx.bill.update({
          where: { id: alloc.billId },
          data: {
            paidPoisha: { increment: BigInt(alloc.amountPoisha) },
            status: alloc.status,
            updatedAt: now,
          },
        });
      }

      if (creditPoisha > 0) {
        await tx.creditEntry.create({
          data: {
            orgId: ctx.orgId,
            leaseId: input.leaseId,
            amountPoisha: BigInt(creditPoisha),
            kind: 'overpayment',
            paymentId: payment.id,
          },
        });
      }

      // Generate sequential receipt
      const year = Number(getDhakaDateString().slice(0, 4));
      const counterRes = await tx.$queryRaw<Array<{ last_seq: number }>>`
        INSERT INTO receipt_counters (org_id, year, last_seq, created_at, updated_at)
        VALUES (${ctx.orgId}::uuid, ${year}, 1, now(), now())
        ON CONFLICT (org_id, year)
        DO UPDATE SET last_seq = receipt_counters.last_seq + 1, updated_at = now()
        RETURNING last_seq`;

      const lastSeq = counterRes[0]!.last_seq;
      const receiptNumber = `BM-${year}-${String(lastSeq).padStart(6, '0')}`;

      const receipt = await tx.receipt.create({
        data: {
          orgId: ctx.orgId,
          paymentId: payment.id,
          number: receiptNumber,
          status: 'valid',
        },
      });

      // Outbox event
      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: ctx.orgId,
            type: 'payment.confirmed',
            payload: {
              paymentId: payment.id,
              leaseId: payment.leaseId,
              amountPoisha: input.amountPoisha,
              method: payment.method,
              receiptNumber,
            },
          },
        ],
      });

      return this.formatPayment({
        ...payment,
        allocations: allocationRecords,
        receipt,
      });
    });
  }

  async confirmPayment(ctx: PaymentContext, paymentId: string): Promise<PaymentResponse> {
    if (ctx.role !== 'landlord' && ctx.role !== 'caretaker') {
      throw ApiError.forbidden('Only landlords and caretakers can confirm payments');
    }

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      // Lock payment
      const payments = await tx.$queryRaw<
        Array<{
          id: string;
          org_id: string;
          lease_id: string;
          amount_poisha: bigint;
          status: string;
          method: string;
          reference: string | null;
          paid_on: Date;
          proof_file_id: string | null;
          submitted_by: string;
        }>
      >`SELECT id, org_id::text, lease_id::text, amount_poisha, status::text, method::text, reference, paid_on, proof_file_id::text, submitted_by::text
        FROM payments
        WHERE org_id = ${ctx.orgId}::uuid AND id = ${paymentId}::uuid
        FOR UPDATE`;

      if (payments.length === 0) {
        throw ApiError.notFound('Payment not found');
      }

      const p = payments[0]!;
      if (p.status !== 'pending_claim') {
        throw new ApiError(ErrorCode.CONFLICT, `Payment is already ${p.status}`);
      }

      // Check caretaker building assignment
      if (ctx.role === 'caretaker') {
        const lease = await tx.lease.findFirst({
          where: { id: p.lease_id, orgId: ctx.orgId },
          include: { unit: { select: { buildingId: true } } },
        });
        if (!lease) {
          throw ApiError.notFound('Lease not found');
        }
        const assignment = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
            buildingId: lease.unit.buildingId,
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Building not assigned to caretaker');
        }
      }

      // Lock lease row
      await tx.$queryRaw`SELECT id FROM leases WHERE org_id = ${ctx.orgId}::uuid AND id = ${p.lease_id}::uuid FOR UPDATE`;

      // Lock unpaid bills
      const lockedBills = await tx.$queryRaw<
        Array<{
          id: string;
          period_month: string;
          total_poisha: bigint;
          paid_poisha: bigint;
          status: string;
        }>
      >`SELECT id, period_month::text, total_poisha, paid_poisha, status::text
        FROM bills
        WHERE org_id = ${ctx.orgId}::uuid AND lease_id = ${p.lease_id}::uuid AND status IN ('issued', 'partially_paid')
        ORDER BY period_month ASC FOR UPDATE`;

      const now = new Date(clock.now());

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'confirmed',
          confirmedBy: ctx.userId,
          confirmedAt: now,
          updatedAt: now,
        },
      });

      const billsToAllocate = lockedBills.map(
        (b: { id: string; period_month: string; total_poisha: bigint; paid_poisha: bigint }) => ({
          id: b.id,
          periodMonth: b.period_month,
          totalPoisha: Number(b.total_poisha),
          paidPoisha: Number(b.paid_poisha),
        }),
      );

      const { allocations, creditPoisha } = allocatePayment({
        amountPoisha: Number(p.amount_poisha),
        bills: billsToAllocate,
      });

      const allocationRecords = [];
      for (const alloc of allocations) {
        const pa = await tx.paymentAllocation.create({
          data: {
            orgId: ctx.orgId,
            paymentId,
            billId: alloc.billId,
            amountPoisha: BigInt(alloc.amountPoisha),
          },
        });
        allocationRecords.push(pa);

        await tx.bill.update({
          where: { id: alloc.billId },
          data: {
            paidPoisha: { increment: BigInt(alloc.amountPoisha) },
            status: alloc.status,
            updatedAt: now,
          },
        });
      }

      if (creditPoisha > 0) {
        await tx.creditEntry.create({
          data: {
            orgId: ctx.orgId,
            leaseId: p.lease_id,
            amountPoisha: BigInt(creditPoisha),
            kind: 'overpayment',
            paymentId,
          },
        });
      }

      const year = Number(getDhakaDateString().slice(0, 4));
      const counterRes = await tx.$queryRaw<Array<{ last_seq: number }>>`
        INSERT INTO receipt_counters (org_id, year, last_seq, created_at, updated_at)
        VALUES (${ctx.orgId}::uuid, ${year}, 1, now(), now())
        ON CONFLICT (org_id, year)
        DO UPDATE SET last_seq = receipt_counters.last_seq + 1, updated_at = now()
        RETURNING last_seq`;

      const lastSeq = counterRes[0]!.last_seq;
      const receiptNumber = `BM-${year}-${String(lastSeq).padStart(6, '0')}`;

      const receipt = await tx.receipt.create({
        data: {
          orgId: ctx.orgId,
          paymentId,
          number: receiptNumber,
          status: 'valid',
        },
      });

      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: ctx.orgId,
            type: 'payment.confirmed',
            payload: {
              paymentId,
              leaseId: p.lease_id,
              amountPoisha: Number(p.amount_poisha),
              method: p.method,
              receiptNumber,
            },
          },
        ],
      });

      return this.formatPayment({
        ...updatedPayment,
        allocations: allocationRecords,
        receipt,
      });
    });
  }

  async rejectPayment(ctx: PaymentContext, paymentId: string, reason?: string): Promise<PaymentResponse> {
    if (ctx.role !== 'landlord' && ctx.role !== 'caretaker') {
      throw ApiError.forbidden('Only landlords and caretakers can reject payments');
    }

    if (!reason || !reason.trim()) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Reason is required to reject a payment');
    }

    const trimmedReason = reason.trim();

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      const payments = await tx.$queryRaw<
        Array<{
          id: string;
          org_id: string;
          lease_id: string;
          status: string;
        }>
      >`SELECT id, org_id::text, lease_id::text, status::text
        FROM payments
        WHERE org_id = ${ctx.orgId}::uuid AND id = ${paymentId}::uuid
        FOR UPDATE`;

      if (payments.length === 0) {
        throw ApiError.notFound('Payment not found');
      }

      const p = payments[0]!;
      if (p.status !== 'pending_claim') {
        throw new ApiError(ErrorCode.CONFLICT, `Payment is already ${p.status}`);
      }

      if (ctx.role === 'caretaker') {
        const lease = await tx.lease.findFirst({
          where: { id: p.lease_id, orgId: ctx.orgId },
          include: { unit: { select: { buildingId: true } } },
        });
        if (!lease) {
          throw ApiError.notFound('Lease not found');
        }
        const assignment = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
            buildingId: lease.unit.buildingId,
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Building not assigned to caretaker');
        }
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'rejected',
          rejectedReason: trimmedReason,
          updatedAt: new Date(clock.now()),
        },
      });

      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: ctx.orgId,
            type: 'payment.rejected',
            payload: {
              paymentId,
              leaseId: p.lease_id,
              reason: trimmedReason,
            },
          },
        ],
      });

      return this.formatPayment(updated);
    });
  }

  async voidPayment(ctx: PaymentContext, paymentId: string, reason?: string): Promise<PaymentResponse> {
    if (ctx.role !== 'landlord') {
      throw ApiError.forbidden('Only landlords can void payments');
    }

    if (!reason || !reason.trim()) {
      throw new ApiError(ErrorCode.VALIDATION_FAILED, 'Reason is required to void a payment');
    }

    const trimmedReason = reason.trim();

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      const payments = await tx.$queryRaw<
        Array<{
          id: string;
          org_id: string;
          lease_id: string;
          amount_poisha: bigint;
          status: string;
        }>
      >`SELECT id, org_id::text, lease_id::text, amount_poisha, status::text
        FROM payments
        WHERE org_id = ${ctx.orgId}::uuid AND id = ${paymentId}::uuid
        FOR UPDATE`;

      if (payments.length === 0) {
        throw ApiError.notFound('Payment not found');
      }

      const p = payments[0]!;
      if (p.status !== 'confirmed') {
        throw new ApiError(ErrorCode.CONFLICT, `Payment is ${p.status}, cannot void`);
      }

      // Lock lease row
      await tx.$queryRaw`SELECT id FROM leases WHERE org_id = ${ctx.orgId}::uuid AND id = ${p.lease_id}::uuid FOR UPDATE`;

      // Find all allocations for this payment
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId },
      });

      const affectedBillIds = new Set<string>();
      for (const a of allocations) {
        affectedBillIds.add(a.billId);
      }

      // Find overpayment credit created by this payment
      const overpaymentEntries = await tx.creditEntry.findMany({
        where: {
          paymentId,
          kind: 'overpayment',
        },
      });

      const totalOverpayment = overpaymentEntries.reduce(
        (sum: number, e: { amountPoisha: bigint }) => sum + Number(e.amountPoisha),
        0,
      );

      // Check current lease credit balance
      const currentCreditBalanceRow = await tx.$queryRaw<Array<{ balance: bigint }>>`
        SELECT COALESCE(SUM(amount_poisha), 0) as balance FROM credit_entries WHERE lease_id = ${p.lease_id}::uuid`;
      const currentCreditBalance = Number(currentCreditBalanceRow[0]?.balance || 0n);

      if (totalOverpayment > 0) {
        // If current balance is less than totalOverpayment, some credit was already applied to subsequent bills!
        if (totalOverpayment > currentCreditBalance) {
          let neededToReverse = totalOverpayment - currentCreditBalance;

          // Find credit applications on this lease
          const appliedEntries = await tx.creditEntry.findMany({
            where: {
              leaseId: p.lease_id,
              kind: 'applied',
            },
            orderBy: { createdAt: 'desc' },
          });

          for (const applied of appliedEntries) {
            if (neededToReverse <= 0) break;
            const appliedAmount = Math.abs(Number(applied.amountPoisha));
            const rev = Math.min(neededToReverse, appliedAmount);

            if (applied.billId) {
              affectedBillIds.add(applied.billId);
              // Insert reversed credit entry
              await tx.creditEntry.create({
                data: {
                  orgId: ctx.orgId,
                  leaseId: p.lease_id,
                  amountPoisha: BigInt(rev),
                  kind: 'reversed',
                  billId: applied.billId,
                },
              });
            }

            neededToReverse -= rev;
          }
        }
      }

      // Execute SECURITY DEFINER function to remove payment allocations and overpayment credit
      await tx.$executeRaw`SELECT app_void_payment(${ctx.orgId}::uuid, ${paymentId}::uuid)`;

      const now = new Date(clock.now());

      // Recompute all affected bills
      for (const billId of affectedBillIds) {
        // Lock bill row
        await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId}::uuid FOR UPDATE`;

        const bill = await tx.bill.findUniqueOrThrow({
          where: { id: billId },
        });

        // Sum remaining allocations
        const allocSumRow = await tx.$queryRaw<Array<{ sum: bigint }>>`
          SELECT COALESCE(SUM(amount_poisha), 0) as sum FROM payment_allocations WHERE bill_id = ${billId}::uuid`;
        const allocSum = Number(allocSumRow[0]?.sum || 0n);

        // Sum remaining applied credit minus reversed credit for this bill
        const appliedCreditRow = await tx.$queryRaw<Array<{ sum: bigint }>>`
          SELECT COALESCE(SUM(-amount_poisha), 0) as sum FROM credit_entries WHERE bill_id = ${billId}::uuid AND kind = 'applied'`;
        const appliedCredit = Number(appliedCreditRow[0]?.sum || 0n);

        const reversedCreditRow = await tx.$queryRaw<Array<{ sum: bigint }>>`
          SELECT COALESCE(SUM(amount_poisha), 0) as sum FROM credit_entries WHERE bill_id = ${billId}::uuid AND kind = 'reversed'`;
        const reversedCredit = Number(reversedCreditRow[0]?.sum || 0n);

        const netCredit = Math.max(0, appliedCredit - reversedCredit);
        const newPaid = allocSum + netCredit;

        let newStatus: 'issued' | 'partially_paid' | 'paid';
        if (newPaid === 0) {
          newStatus = 'issued';
        } else if (newPaid >= Number(bill.totalPoisha)) {
          newStatus = 'paid';
        } else {
          newStatus = 'partially_paid';
        }

        await tx.bill.update({
          where: { id: billId },
          data: {
            paidPoisha: BigInt(newPaid),
            status: newStatus,
            updatedAt: now,
          },
        });
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'void',
          voidReason: trimmedReason,
          voidedBy: ctx.userId,
          updatedAt: now,
        },
      });

      await tx.receipt.updateMany({
        where: { paymentId },
        data: {
          status: 'void',
          updatedAt: now,
        },
      });

      const receipt = await tx.receipt.findFirst({
        where: { paymentId },
      });

      await tx.outboxMessage.createMany({
        data: [
          {
            orgId: ctx.orgId,
            type: 'payment.voided',
            payload: {
              paymentId,
              leaseId: p.lease_id,
              reason: trimmedReason,
            },
          },
        ],
      });

      return this.formatPayment({
        ...updatedPayment,
        allocations: [],
        receipt,
      });
    });
  }

  async listPayments(
    ctx: PaymentContext,
    query: ListPaymentsParsedQuery,
  ): Promise<{ items: PaymentResponse[]; nextCursor?: string }> {
    const limit = query.limit || 20;

    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      let tenantLeaseIds: string[] = [];
      if (ctx.role === 'tenant') {
        const leases = await tx.leaseTenant.findMany({
          where: {
            orgId: ctx.orgId,
            membership: {
              id: ctx.membershipId,
              userId: ctx.userId,
              orgId: ctx.orgId,
            },
          },
          select: { leaseId: true },
        });
        tenantLeaseIds = leases.map((l: { leaseId: string }) => l.leaseId);

        if (query.leaseId) {
          if (!tenantLeaseIds.includes(query.leaseId)) {
            throw ApiError.notFound('Lease not found');
          }
        }
      }

      let caretakerBuildingIds: string[] = [];
      if (ctx.role === 'caretaker') {
        const buildings = await tx.caretakerBuilding.findMany({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
          },
          select: { buildingId: true },
        });
        caretakerBuildingIds = buildings.map((b: { buildingId: string }) => b.buildingId);

        if (query.leaseId) {
          const lease = await tx.lease.findFirst({
            where: { id: query.leaseId, orgId: ctx.orgId },
            include: { unit: { select: { buildingId: true } } },
          });
          if (!lease || !caretakerBuildingIds.includes(lease.unit.buildingId)) {
            throw ApiError.notFound('Lease not found');
          }
        }
      }

      const where: Prisma.PaymentWhereInput = {
        orgId: ctx.orgId,
      };

      if (query.status) {
        where.status = query.status;
      }

      if (query.leaseId) {
        where.leaseId = query.leaseId;
      } else if (ctx.role === 'tenant') {
        where.leaseId = { in: tenantLeaseIds };
      } else if (ctx.role === 'caretaker') {
        where.lease = {
          unit: {
            buildingId: { in: caretakerBuildingIds },
          },
        };
      }

      if (query.buildingId) {
        where.lease = {
          unit: {
            buildingId: query.buildingId,
          },
        };
      }

      if (query.cursor) {
        where.id = { lt: query.cursor };
      }

      const payments = await tx.payment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          allocations: {
            include: {
              bill: {
                select: { periodMonth: true },
              },
            },
          },
          receipt: {
            select: {
              id: true,
              number: true,
              status: true,
              fileId: true,
              createdAt: true,
            },
          },
          lease: {
            include: {
              unit: {
                include: { building: true },
              },
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (payments.length > limit) {
        const nextItem = payments.pop()!;
        nextCursor = nextItem.id;
      }

      return {
        items: payments.map((p) => this.formatPayment(p)),
        nextCursor,
      };
    });
  }

  async getReceiptDownload(ctx: PaymentContext, receiptId: string) {
    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      const receipt = await tx.receipt.findFirst({
        where: {
          id: receiptId,
          orgId: ctx.orgId,
        },
        include: {
          payment: {
            include: {
              lease: {
                include: {
                  unit: true,
                  tenants: true,
                },
              },
            },
          },
        },
      });

      if (!receipt) {
        throw ApiError.notFound('Receipt not found');
      }

      // Tenant check
      if (ctx.role === 'tenant') {
        const isTenantOnLease = receipt.payment.lease.tenants.some(
          (t: { membershipId: string }) => t.membershipId === ctx.membershipId,
        );
        if (!isTenantOnLease) {
          throw ApiError.notFound('Receipt not found');
        }
      }

      // Caretaker check
      if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
            buildingId: receipt.payment.lease.unit.buildingId,
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Receipt not found');
        }
      }

      if (!receipt.fileId) {
        return { status: 'rendering' as const };
      }

      const file = await tx.file.findFirst({
        where: { id: receipt.fileId, orgId: ctx.orgId },
      });

      if (!file) {
        return { status: 'rendering' as const };
      }

      const signedUrl = await storage.getSignedUrl({
        fileId: file.id,
        publicId: file.publicId,
        resourceType: 'raw',
        format: 'pdf',
        expiresInSeconds: 300,
      });

      return { downloadUrl: signedUrl.url };
    });
  }

  private formatPayment(p: PaymentWithRelations): PaymentResponse {
    const paidOnStr =
      p.paidOn instanceof Date ? p.paidOn.toISOString().slice(0, 10) : String(p.paidOn).slice(0, 10);

    return {
      id: p.id,
      orgId: p.orgId,
      leaseId: p.leaseId,
      amountPoisha: Number(p.amountPoisha),
      method: p.method,
      status: p.status,
      reference: p.reference || null,
      proofFileId: p.proofFileId || null,
      paidOn: paidOnStr,
      submittedBy: p.submittedBy,
      confirmedBy: p.confirmedBy || null,
      confirmedAt: p.confirmedAt ? new Date(p.confirmedAt).toISOString() : null,
      rejectedReason: p.rejectedReason || null,
      voidReason: p.voidReason || null,
      voidedBy: p.voidedBy || null,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      allocations: p.allocations?.map((a) => ({
        id: a.id,
        billId: a.billId,
        periodMonth: a.bill?.periodMonth ? a.bill.periodMonth.toISOString().slice(0, 7) : undefined,
        amountPoisha: Number(a.amountPoisha),
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      })),
      receipt: p.receipt
        ? {
            id: p.receipt.id,
            number: p.receipt.number,
            status: p.receipt.status as 'valid' | 'void',
            fileId: p.receipt.fileId || null,
            createdAt: p.receipt.createdAt
              ? new Date(p.receipt.createdAt).toISOString()
              : new Date().toISOString(),
          }
        : null,
      unitLabel: p.lease?.unit?.label,
      buildingName: p.lease?.unit?.building?.name,
    };
  }
}
