import type { Env } from '@bm/api/config/env';
import type { Db } from '@bm/api/config/db';
import { pingRedis, type RedisClient } from '@bm/api/config/redis';
import type { Logger } from 'pino';
import cron, { type ScheduledTask } from 'node-cron';
import type { Job } from './jobs';

export interface WorkerDeps {
  env: Pick<Env, 'APP_ENV'>;
  logger: Logger;
  redis: RedisClient;
  prisma?: Db;
  jobs?: Job[];
  /** Injected so tests can observe the exit instead of killing the test process. */
  exit: (code: number) => void;
  /** How long to wait for Redis before giving up. */
  pingTimeoutMs?: number;
}

/**
 * Connects to Redis and fails fast (exit 1) when it is unreachable, like the API does: a worker that
 * cannot take its cron lock must not pretend to be running. The open connection also keeps the process alive.
 * Returns a `shutdown` function, or undefined when startup was aborted.
 */
export async function startWorker(deps: WorkerDeps): Promise<{ shutdown: () => Promise<void> } | undefined> {
  const { env, logger, redis, exit, pingTimeoutMs = 2000, prisma, jobs } = deps;

  const redisOk = await pingRedis(redis, pingTimeoutMs);
  if (!redisOk) {
    logger.fatal('Redis is unreachable. Worker startup aborted.');
    redis.disconnect();
    exit(1);
    return undefined;
  }

  const tasks: ScheduledTask[] = [];
  if (prisma && jobs && jobs.length > 0) {
    for (const job of jobs) {
      logger.info({ job: job.name, schedule: job.schedule }, 'Scheduling cron job');
      const task = cron.schedule(
        job.schedule,
        () => {
          void job.run({ prisma, redis, logger }).catch((err) => {
            logger.error({ err, job: job.name }, 'Job execution failed');
          });
        },
        { timezone: 'Asia/Dhaka' },
      );
      tasks.push(task);
    }
  }

  logger.info({ appEnv: env.APP_ENV, scheduledJobsCount: tasks.length }, 'worker started');

  return {
    shutdown: async () => {
      for (const t of tasks) {
        t.stop();
      }
      await redis.quit();
    },
  };
}
