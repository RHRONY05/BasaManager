import { type Db, type Tx, type MembershipRole, Prisma } from '../../config/db.js';
import { clock } from '../../lib/clock.js';
import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { BillStatus } from '@bm/shared/enums';
import { storage } from '../../config/storage/index.js';
import { processPaymentAllocationAndReceipt } from './allocation.js';
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
    status: 'valid' | 'void' | string;
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

      if (
        (input.method === 'bkash' || input.method === 'nagad') &&
        input.reference &&
        input.reference.trim()
      ) {
        const trimmedRef = input.reference.trim();
        const existing = await tx.payment.findFirst({
          where: {
            orgId: ctx.orgId,
            method: input.method,
            reference: trimmedRef,
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
            kind: 'payment_proof',
            uploadedBy: ctx.userId,
            deletedAt: null,
          },
        });
        if (!file) {
          throw ApiError.notFound('Proof file not found');
        }
      }

      let p;
      try {
        p = await tx.payment.create({
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
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ApiError(ErrorCode.DUPLICATE_REFERENCE, 'A payment with this reference already exists');
        }
        throw err;
      }

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

      if (
        (input.method === 'bkash' || input.method === 'nagad') &&
        input.reference &&
        input.reference.trim()
      ) {
        const trimmedRef = input.reference.trim();
        const existing = await tx.payment.findFirst({
          where: {
            orgId: ctx.orgId,
            method: input.method,
            reference: trimmedRef,
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
            kind: 'payment_proof',
            deletedAt: null,
          },
        });
        if (!file) {
          throw ApiError.notFound('Proof file not found');
        }
      }

      // Lock lease row
      await tx.$queryRaw`SELECT id FROM leases WHERE org_id = ${ctx.orgId}::uuid AND id = ${input.leaseId}::uuid FOR UPDATE`;

      const now = new Date(clock.now());

      let payment;
      try {
        payment = await tx.payment.create({
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
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ApiError(ErrorCode.DUPLICATE_REFERENCE, 'A payment with this reference already exists');
        }
        throw err;
      }

      const { allocationRecords, receipt } = await this.processPaymentAllocationAndReceipt(tx, {
        orgId: ctx.orgId,
        paymentId: payment.id,
        leaseId: input.leaseId,
        amountPoisha: input.amountPoisha,
        method: payment.method,
        outboxType: 'payment.confirmed',
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

      const { allocationRecords, receipt } = await this.processPaymentAllocationAndReceipt(tx, {
        orgId: ctx.orgId,
        paymentId,
        leaseId: p.lease_id,
        amountPoisha: Number(p.amount_poisha),
        method: p.method,
        outboxType: 'payment.confirmed',
      });

      return this.formatPayment({
        ...updatedPayment,
        allocations: allocationRecords,
        receipt,
      });
    });
  }

  private async processPaymentAllocationAndReceipt(
    tx: Tx,
    params: {
      orgId: string;
      paymentId: string;
      leaseId: string;
      amountPoisha: number;
      method: string;
      outboxType: 'payment.confirmed';
    },
  ) {
    return processPaymentAllocationAndReceipt(tx, params);
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
          lease_id: string;
          status: string;
        }>
      >`SELECT id, lease_id::text, status::text
        FROM payments
        WHERE org_id = ${ctx.orgId}::uuid AND id = ${paymentId}::uuid
        FOR UPDATE`;

      if (payments.length === 0) {
        throw ApiError.notFound('Payment not found');
      }

      const p = payments[0]!;
      if (p.status !== 'pending_claim') {
        throw new ApiError(ErrorCode.CONFLICT, `Payment cannot be rejected because it is ${p.status}`);
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

      const now = new Date(clock.now());

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'rejected',
          rejectedReason: trimmedReason,
          updatedAt: now,
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
          lease_id: string;
          status: string;
          amount_poisha: bigint;
        }>
      >`SELECT id, lease_id::text, status::text, amount_poisha
        FROM payments
        WHERE org_id = ${ctx.orgId}::uuid AND id = ${paymentId}::uuid
        FOR UPDATE`;

      if (payments.length === 0) {
        throw ApiError.notFound('Payment not found');
      }

      const p = payments[0]!;
      if (p.status !== 'confirmed') {
        throw new ApiError(ErrorCode.CONFLICT, `Payment cannot be voided because it is ${p.status}`);
      }

      // Lock lease row
      await tx.$queryRaw`SELECT id FROM leases WHERE org_id = ${ctx.orgId}::uuid AND id = ${p.lease_id}::uuid FOR UPDATE`;

      // Find allocations to know which bills were paid by this payment
      const existingAllocations = await tx.paymentAllocation.findMany({
        where: { paymentId },
      });

      const affectedBillIds = new Set<string>();
      for (const a of existingAllocations) {
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

          const appliedEntries = await tx.creditEntry.findMany({
            where: {
              leaseId: p.lease_id,
              kind: 'applied',
            },
            orderBy: { createdAt: 'desc' },
          });

          // Group applied entries by billId to avoid double-counting on bills with multiple applied entries
          const appliedByBill = new Map<string, number>();
          for (const applied of appliedEntries) {
            if (!applied.billId) continue;
            appliedByBill.set(
              applied.billId,
              (appliedByBill.get(applied.billId) || 0) + Math.abs(Number(applied.amountPoisha)),
            );
          }

          for (const [billId, totalBillApplied] of appliedByBill) {
            if (neededToReverse <= 0) break;

            // Calculate existing reversed credit for this specific bill
            const existingReversedRow = await tx.$queryRaw<Array<{ sum: bigint }>>`
              SELECT COALESCE(SUM(amount_poisha), 0) as sum FROM credit_entries WHERE bill_id = ${billId}::uuid AND kind = 'reversed'`;
            const existingReversed = Number(existingReversedRow[0]?.sum || 0n);

            const netApplied = Math.max(0, totalBillApplied - existingReversed);
            if (netApplied <= 0) continue;

            const rev = Math.min(neededToReverse, netApplied);
            affectedBillIds.add(billId);

            await tx.creditEntry.create({
              data: {
                orgId: ctx.orgId,
                leaseId: p.lease_id,
                amountPoisha: BigInt(rev),
                kind: 'reversed',
                billId,
                paymentId,
              },
            });

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
        const newPaidPoisha = allocSum + netCredit;

        let newStatus: BillStatus;
        if (newPaidPoisha <= 0) {
          newStatus = 'issued';
        } else if (newPaidPoisha < Number(bill.totalPoisha)) {
          newStatus = 'partially_paid';
        } else {
          newStatus = 'paid';
        }

        await tx.bill.update({
          where: { id: billId },
          data: {
            paidPoisha: BigInt(newPaidPoisha),
            status: newStatus,
            updatedAt: now,
          },
        });
      }

      // Mark payment void
      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'void',
          voidReason: trimmedReason,
          voidedBy: ctx.userId,
          updatedAt: now,
        },
      });

      // Mark receipt void and clear fileId so worker re-renders with VOID watermark
      const existingReceipt = await tx.receipt.findFirst({
        where: { paymentId },
        select: { id: true, fileId: true },
      });

      if (existingReceipt?.fileId) {
        await tx.file.update({
          where: { id: existingReceipt.fileId },
          data: { deletedAt: now },
        });
      }

      await tx.receipt.updateMany({
        where: { paymentId },
        data: {
          status: 'void',
          fileId: null,
          updatedAt: now,
        },
      });

      // Fetch the updated receipt
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
              voidedBy: ctx.userId,
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
        const tenantLeases = await tx.leaseTenant.findMany({
          where: {
            orgId: ctx.orgId,
            membership: {
              userId: ctx.userId,
              orgId: ctx.orgId,
            },
          },
          select: { leaseId: true },
        });
        tenantLeaseIds = tenantLeases.map((l: { leaseId: string }) => l.leaseId);

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
        if (query.buildingId) {
          if (!caretakerBuildingIds.includes(query.buildingId)) {
            throw ApiError.notFound('Building not found');
          }
          where.lease = {
            unit: {
              buildingId: query.buildingId,
            },
          };
        } else {
          where.lease = {
            unit: {
              buildingId: { in: caretakerBuildingIds },
            },
          };
        }
      } else if (query.buildingId) {
        where.lease = {
          unit: {
            buildingId: query.buildingId,
          },
        };
      }

      const findArgs: Prisma.PaymentFindManyArgs = {
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
      };

      if (query.cursor) {
        findArgs.cursor = { id: query.cursor };
        findArgs.skip = 1;
      }

      const payments = await tx.payment.findMany(findArgs);

      const hasMore = payments.length > limit;
      if (hasMore) {
        payments.pop();
      }
      const nextCursor = hasMore && payments.length > 0 ? payments[payments.length - 1]!.id : undefined;

      return {
        items: payments.map((p) => this.formatPayment(p)),
        nextCursor,
      };
    });
  }

  async getReceiptDownloadUrl(
    ctx: PaymentContext,
    receiptId: string,
  ): Promise<{ downloadUrl?: string; status?: 'rendering' }> {
    return await this.prisma.$tx(this.getTenantCtx(ctx), async (tx: Tx) => {
      const receipt = await tx.receipt.findFirst({
        where: { id: receiptId, orgId: ctx.orgId },
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

      if (ctx.role === 'tenant') {
        const isTenant = receipt.payment.lease.tenants.some(
          (t: { membershipId: string }) => t.membershipId === ctx.membershipId,
        );
        if (!isTenant) {
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

  getReceiptDownload = this.getReceiptDownloadUrl.bind(this);

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
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date(0).toISOString(),
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date(0).toISOString(),
      allocations: p.allocations?.map((a) => ({
        id: a.id,
        billId: a.billId,
        periodMonth: a.bill?.periodMonth ? a.bill.periodMonth.toISOString().slice(0, 7) : undefined,
        amountPoisha: Number(a.amountPoisha),
        createdAt: a.createdAt
          ? new Date(a.createdAt).toISOString()
          : p.createdAt
            ? new Date(p.createdAt).toISOString()
            : new Date(0).toISOString(),
      })),
      receipt: p.receipt
        ? {
            id: p.receipt.id,
            number: p.receipt.number,
            status: p.receipt.status as 'valid' | 'void',
            fileId: p.receipt.fileId || null,
            createdAt: p.receipt.createdAt
              ? new Date(p.receipt.createdAt).toISOString()
              : p.createdAt
                ? new Date(p.createdAt).toISOString()
                : new Date(0).toISOString(),
          }
        : null,
      unitLabel: p.lease?.unit?.label,
      buildingName: p.lease?.unit?.building?.name,
    };
  }
}
