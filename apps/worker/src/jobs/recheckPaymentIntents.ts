import { withJobLock } from '../lib/jobLock.js';
import type { Job, JobContext } from './index.js';
import { SslcommerzService } from '@bm/api/modules/payments/sslcommerz.service';
import type { Env } from '@bm/api/config/env';

export const recheckPaymentIntentsJob: Job = {
  name: 'recheckPaymentIntents',
  // Runs every 10 minutes
  schedule: '*/10 * * * *',
  ttlMs: 50_000,
  run: async (ctx: JobContext) => {
    await withJobLock(ctx.redis, recheckPaymentIntentsJob.name, recheckPaymentIntentsJob.ttlMs, async () => {
      const { prisma, logger, env } = ctx;
      logger.info('Starting recheckPaymentIntents job...');
      const sslEnv = env && 'SSLCOMMERZ_STORE_ID' in env ? (env as Env) : undefined;
      const service = new SslcommerzService(prisma, sslEnv);
      const result = await service.recheckPaymentIntents({
        cutoffMinutes: 30,
        logger,
      });
      logger.info(result, 'recheckPaymentIntents job completed');
    });
  },
};
