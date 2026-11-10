import { activateDueLeases } from '@bm/api/modules/leases/lease-activation';
import type { Db } from '@bm/api/config/db';
import type { RedisClient } from '@bm/api/config/redis';
import type { Logger } from 'pino';
import { withJobLock } from '../lib/jobLock';

export interface JobContext {
  prisma: Db;
  redis: RedisClient;
  logger: Logger;
  now?: () => Date;
}

export interface Job {
  name: string;
  schedule: string;
  ttlMs: number;
  run: (ctx: JobContext) => Promise<void>;
}

export const activateDueLeasesJob: Job = {
  name: 'activate-due-leases',
  // Daily at 00:05 Asia/Dhaka time
  schedule: '5 0 * * *',
  ttlMs: 60_000,
  run: async ({ prisma, redis, logger, now }) => {
    await withJobLock(redis, 'activate-due-leases', 60_000, async () => {
      logger.info('Running activateDueLeases job...');
      const activatedCount = await activateDueLeases(prisma, now ? now() : undefined);
      logger.info({ activatedCount }, 'activateDueLeases completed');
    });
  },
};

/**
 * Registry of background worker jobs.
 */
export const jobs: Job[] = [activateDueLeasesJob];
