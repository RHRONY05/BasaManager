import { describe, it, expect, vi } from 'vitest';
import { withJobLock, type JobLockRedis } from './jobLock';

describe('withJobLock', () => {
  it('allows only one of two concurrent calls to run the locked function', async () => {
    // In-memory fake Redis mock
    const store = new Map<string, string>();

    const fakeRedis: JobLockRedis = {
      set: vi.fn(
        async (key: string, value: string, _mode: 'PX', _ttl: number, nx: 'NX'): Promise<'OK' | null> => {
          if (nx === 'NX' && store.has(key)) {
            return null;
          }
          store.set(key, value);
          return 'OK';
        },
      ),
      eval: vi.fn(async (_script: string, _numkeys: number, ...args: string[]): Promise<number> => {
        const [key, token] = args;
        if (key && store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      }),
    };

    let executionCount = 0;
    const task = async () => {
      executionCount++;
      // Simulate asynchronous work inside the lock
      await new Promise((resolve) => setTimeout(resolve, 50));
      return 'done';
    };

    // Run two concurrent lock acquisitions for the exact same job name
    const [result1, result2] = await Promise.all([
      withJobLock(fakeRedis, 'nightlySync', 5000, task),
      withJobLock(fakeRedis, 'nightlySync', 5000, task),
    ]);

    // Exactly one should succeed and return 'done', the other should receive null
    const results = [result1, result2];
    expect(results).toContain('done');
    expect(results).toContain(null);
    expect(executionCount).toBe(1);

    // After completion, lock is released so the store is empty
    expect(store.has('lock:job:nightlySync')).toBe(false);
  });
});
