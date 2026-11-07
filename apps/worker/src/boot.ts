import type { Env } from '@bm/api/config/env';
import { pingRedis, type RedisClient } from '@bm/api/config/redis';
import type { Logger } from 'pino';

export interface WorkerDeps {
  env: Pick<Env, 'APP_ENV'>;
  logger: Logger;
  redis: RedisClient;
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
  const { env, logger, redis, exit, pingTimeoutMs = 2000 } = deps;

  const redisOk = await pingRedis(redis, pingTimeoutMs);
  if (!redisOk) {
    logger.fatal('Redis is unreachable. Worker startup aborted.');
    redis.disconnect();
    exit(1);
    return undefined;
  }

  logger.info({ appEnv: env.APP_ENV }, 'worker started');

  return {
    shutdown: async () => {
      await redis.quit();
    },
  };
}
