import { Redis } from 'ioredis';

export { Redis };
export type { Redis as RedisClient } from 'ioredis';

/**
 * Creates an ioredis client instance configured for fail-fast startup and resilience.
 */
export function createRedis(url: string): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  // Attach a no-op error handler to prevent unhandled EventEmitter error exceptions during network hiccups
  redis.on('error', () => {});

  return redis;
}

/**
 * Pings Redis with a timeout in milliseconds.
 * Returns true if Redis answers 'PONG' within timeoutMs, false otherwise.
 * Never throws.
 */
export async function pingRedis(redis: Redis, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  const query = redis.ping().then(
    (res) => res === 'PONG',
    () => false
  );

  try {
    return await Promise.race([query, timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
