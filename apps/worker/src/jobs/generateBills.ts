import type { Job, JobContext } from './index.js';
import { withJobLock } from '../lib/jobLock.js';
import { BillingService } from '@bm/api/modules/billing/billing.service';

export function getDhakaDate(d: Date = new Date()): {
  todayStr: string;
  dayOfMonth: number;
  monthStr: string;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = formatter.format(d); // YYYY-MM-DD
  const dayOfMonth = parseInt(todayStr.slice(8, 10), 10);
  const monthStr = todayStr.slice(0, 7);
  return { todayStr, dayOfMonth, monthStr };
}

export async function runGenerateBills(
  ctx: JobContext,
): Promise<{ created: number; skipped: number; buildings: number }> {
  const billingService = new BillingService(ctx.prisma);
  const currentDate = ctx.now ? ctx.now() : new Date();
  const { dayOfMonth, monthStr } = getDhakaDate(currentDate);

  // Find all active buildings whose bill_day is today
  // Run with null org context since this worker job queries across orgs
  const buildings = await ctx.prisma.$tx(
    { orgId: null, userId: '00000000-0000-4000-8000-000000000000', role: null },
    async (tx) => {
      return tx.building.findMany({
        where: {
          billDay: dayOfMonth,
          archivedAt: null,
        },
        select: {
          id: true,
          orgId: true,
        },
      });
    },
  );

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const b of buildings) {
    try {
      const res = await billingService.runGeneration(
        {
          orgId: b.orgId,
          userId: '00000000-0000-4000-8000-000000000000',
          role: null,
          membershipId: '',
        },
        {
          buildingId: b.id,
          month: monthStr,
        },
      );
      totalCreated += res.created;
      totalSkipped += res.skipped;
    } catch (err) {
      ctx.logger.error({ err, buildingId: b.id }, 'Failed to generate bills for building');
    }
  }

  // Record job run
  await ctx.prisma.$tx(
    { orgId: null, userId: '00000000-0000-4000-8000-000000000000', role: null },
    async (tx) => {
      await tx.jobRun.create({
        data: {
          job: 'generateBills',
          status: 'ok',
          details: {
            buildingsCount: buildings.length,
            created: totalCreated,
            skipped: totalSkipped,
            month: monthStr,
          },
        },
      });
    },
  );

  return { created: totalCreated, skipped: totalSkipped, buildings: buildings.length };
}

export const generateBillsJob: Job = {
  name: 'generateBills',
  // Daily at 00:10 Asia/Dhaka time
  schedule: '10 0 * * *',
  ttlMs: 120_000,
  run: async (ctx) => {
    await withJobLock(ctx.redis, generateBillsJob.name, generateBillsJob.ttlMs, async () => {
      ctx.logger.info('Running generateBills job...');
      const stats = await runGenerateBills(ctx);
      ctx.logger.info(stats, 'generateBills job completed');
    });
  },
};
