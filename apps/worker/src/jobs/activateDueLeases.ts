import { activateDueLeases } from '@bm/api/modules/leases/lease-activation';
import { withJobLock } from '../lib/jobLock.js';
import type { Job } from './index.js';

export const activateDueLeasesJob: Job = {
  name: 'activate-due-leases',
  // Daily at 00:05 Asia/Dhaka time
  schedule: '5 0 * * *',
  ttlMs: 60_000,
  run: async ({ prisma, redis, logger, now }) => {
    await withJobLock(redis, activateDueLeasesJob.name, activateDueLeasesJob.ttlMs, async () => {
      logger.info('Running activateDueLeases job...');
      const activatedCount = await activateDueLeases(prisma, now ? now() : undefined, undefined, logger);
      logger.info({ activatedCount }, 'activateDueLeases completed');
    });
  },
};
