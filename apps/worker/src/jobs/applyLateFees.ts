import type { Job, JobContext } from './index.js';
import { withJobLock } from '../lib/jobLock.js';
import { computeLateFee } from '@bm/domain';
import { getDhakaDate } from './generateBills.js';
import type { Prisma } from '@bm/api/config/db';

export async function runApplyLateFees(
  ctx: JobContext,
): Promise<{ evaluated: number; applied: number; totalFeePoisha: number }> {
  const currentDate = ctx.now ? ctx.now() : new Date();
  const { todayStr } = getDhakaDate(currentDate);

  // Find issued or partially_paid bills that don't have late fee applied yet and have balance > 0
  const candidateBills = await ctx.prisma.$tx(
    { orgId: null, userId: '00000000-0000-4000-8000-000000000000', role: null },
    async (tx) => {
      return tx.bill.findMany({
        where: {
          status: { in: ['issued', 'partially_paid'] },
          lateFeeAppliedAt: null,
          totalPoisha: { gt: tx.bill.fields.paidPoisha },
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: {
                include: {
                  building: true,
                },
              },
            },
          },
        },
      });
    },
  );

  let appliedCount = 0;
  let totalFeePoisha = 0;

  for (const bill of candidateBills) {
    const building = bill.lease.unit.building;
    const balance = Number(bill.totalPoisha - bill.paidPoisha);
    const dueDateStr =
      bill.dueDate instanceof Date
        ? bill.dueDate.toISOString().slice(0, 10)
        : String(bill.dueDate).slice(0, 10);
    const hasLateFeeLine = bill.lines.some((l) => l.kind === 'late_fee');

    const fee = computeLateFee({
      dueDate: dueDateStr,
      graceDays: building.graceDays,
      lateFeeType: building.lateFeeType as 'none' | 'flat' | 'percent',
      lateFeeValue: building.lateFeeValue,
      balancePoisha: balance,
      today: todayStr,
      lateFeeAlreadyApplied: hasLateFeeLine,
    });

    if (fee > 0) {
      await ctx.prisma.$tx(
        { orgId: bill.orgId, userId: '00000000-0000-4000-8000-000000000000', role: null },
        async (tx) => {
          // Add late_fee line
          await tx.billLine.create({
            data: {
              orgId: bill.orgId,
              billId: bill.id,
              kind: 'late_fee',
              label: 'Late fee',
              amountPoisha: BigInt(fee),
              meta: {
                graceDays: building.graceDays,
                type: building.lateFeeType,
                value: building.lateFeeValue,
              } as unknown as Prisma.InputJsonValue,
            },
          });

          // Update bill total and lateFeeAppliedAt
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              totalPoisha: {
                increment: BigInt(fee),
              },
              lateFeeAppliedAt: currentDate,
            },
          });

          // Write outbox event for late fee
          await tx.outboxMessage.createMany({
            data: [
              {
                orgId: bill.orgId,
                type: 'bill.late_fee',
                payload: {
                  billId: bill.id,
                  feePoisha: fee,
                  orgId: bill.orgId,
                },
              },
            ],
          });
        },
      );

      appliedCount++;
      totalFeePoisha += fee;
    }
  }

  // Record job run
  await ctx.prisma.$tx(
    { orgId: null, userId: '00000000-0000-4000-8000-000000000000', role: null },
    async (tx) => {
      await tx.jobRun.create({
        data: {
          job: 'applyLateFees',
          status: 'ok',
          details: {
            evaluated: candidateBills.length,
            applied: appliedCount,
            totalFeePoisha,
            date: todayStr,
          },
        },
      });
    },
  );

  return { evaluated: candidateBills.length, applied: appliedCount, totalFeePoisha };
}

export const applyLateFeesJob: Job = {
  name: 'applyLateFees',
  // Daily at 00:20 Asia/Dhaka time
  schedule: '20 0 * * *',
  ttlMs: 120_000,
  run: async (ctx) => {
    await withJobLock(ctx.redis, applyLateFeesJob.name, applyLateFeesJob.ttlMs, async () => {
      ctx.logger.info('Running applyLateFees job...');
      const stats = await runApplyLateFees(ctx);
      ctx.logger.info(stats, 'applyLateFees job completed');
    });
  },
};
