import crypto from 'node:crypto';

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Structural interface representing the minimal Redis operations required by withJobLock.
 * Compatible with real ioredis client instances and lightweight test mocks.
 */
export interface JobLockRedis {
  set(key: string, value: string, mode: 'PX', ttl: number, nx: 'NX'): Promise<'OK' | null | string>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

/**
 * Runs an asynchronous task with an exclusive Redis distributed lock.
 * Acquires with: SET lock:job:<name> <token> NX PX <ttlMs>
 * Releases only if the token in Redis matches the acquired token, using an atomic Lua script.
 * Returns null if the lock could not be acquired.
 */
export async function withJobLock<T>(
  redis: JobLockRedis,
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const token = crypto.randomUUID();
  const key = `lock:job:${name}`;

  // Attempt to acquire lock exclusively with milliseconds TTL
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');

  if (acquired !== 'OK') {
    return null;
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    } catch {
      // Ignore release error if key expired or connection dropped
    }
  }
}
