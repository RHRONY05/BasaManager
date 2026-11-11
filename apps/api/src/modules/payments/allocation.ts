import type { Tx } from '../../config/db.js';
import { clock, getDhakaDateString } from '../../lib/clock.js';
import { allocatePayment } from '@bm/domain';

export interface ProcessAllocationParams {
  orgId: string;
  paymentId: string;
  leaseId: string;
  amountPoisha: number;
  method: string;
  outboxType?: 'payment.confirmed';
}

export interface ProcessAllocationResult {
  allocationRecords: Array<{
    id: string;
    orgId: string;
    paymentId: string;
    billId: string;
    amountPoisha: bigint;
  }>;
  receipt: {
    id: string;
    orgId: string;
    paymentId: string;
    number: string;
    status: string;
  };
  receiptNumber: string;
}

/**
 * Shared implementation of Rule 5: Payment Allocation & Receipt Generation.
 * Atomically locks unpaid/partially paid bills in ascending period order,
 * applies payment allocation, creates credit entry for any overpayment,
 * reserves a gapless receipt sequence number based on the Dhaka calendar year,
 * creates the receipt record, and enqueues outbox message.
 */
export async function processPaymentAllocationAndReceipt(
  tx: Tx,
  params: ProcessAllocationParams,
): Promise<ProcessAllocationResult> {
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
    WHERE org_id = ${params.orgId}::uuid AND lease_id = ${params.leaseId}::uuid AND status IN ('issued', 'partially_paid')
    ORDER BY period_month ASC FOR UPDATE`;

  const now = new Date(clock.now());

  const billsToAllocate = lockedBills.map(
    (b: { id: string; period_month: string; total_poisha: bigint; paid_poisha: bigint }) => ({
      id: b.id,
      periodMonth: b.period_month,
      totalPoisha: Number(b.total_poisha),
      paidPoisha: Number(b.paid_poisha),
    }),
  );

  const { allocations, creditPoisha } = allocatePayment({
    amountPoisha: params.amountPoisha,
    bills: billsToAllocate,
  });

  const allocationRecords = [];
  for (const alloc of allocations) {
    const pa = await tx.paymentAllocation.create({
      data: {
        orgId: params.orgId,
        paymentId: params.paymentId,
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
        orgId: params.orgId,
        leaseId: params.leaseId,
        amountPoisha: BigInt(creditPoisha),
        kind: 'overpayment',
        paymentId: params.paymentId,
      },
    });
  }

  const dhakaDateStr = getDhakaDateString(now);
  const year = Number(dhakaDateStr.slice(0, 4));
  const counterRes = await tx.$queryRaw<Array<{ last_seq: number }>>`
    INSERT INTO receipt_counters (org_id, year, last_seq, created_at, updated_at)
    VALUES (${params.orgId}::uuid, ${year}, 1, now(), now())
    ON CONFLICT (org_id, year)
    DO UPDATE SET last_seq = receipt_counters.last_seq + 1, updated_at = now()
    RETURNING last_seq`;

  const lastSeq = counterRes[0]!.last_seq;
  const receiptNumber = `BM-${year}-${String(lastSeq).padStart(6, '0')}`;

  const receipt = await tx.receipt.create({
    data: {
      orgId: params.orgId,
      paymentId: params.paymentId,
      number: receiptNumber,
      status: 'valid',
    },
  });

  const outboxType = params.outboxType ?? 'payment.confirmed';
  await tx.outboxMessage.createMany({
    data: [
      {
        orgId: params.orgId,
        type: outboxType,
        payload: {
          paymentId: params.paymentId,
          leaseId: params.leaseId,
          amountPoisha: params.amountPoisha,
          method: params.method,
          receiptNumber,
        },
      },
    ],
  });

  return { allocationRecords, receipt, receiptNumber };
}
