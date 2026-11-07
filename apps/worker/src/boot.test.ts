import { describe, it, expect, vi } from 'vitest';
import { createRedis, type RedisClient } from '@bm/api/config/redis';
import { createLogger } from '@bm/api/lib/logger';
import { startWorker } from './boot';

const logger = createLogger({ isTest: true });

describe('startWorker', () => {
  it('exits 1 and does not report started when Redis is unreachable', async () => {
    const exit = vi.fn();
    const info = vi.spyOn(logger, 'info');
    const redis = createRedis('redis://127.0.0.1:1'); // nothing listens on port 1

    const worker = await startWorker({ env: { APP_ENV: 'test' }, logger, redis, exit, pingTimeoutMs: 300 });

    expect(worker).toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
    expect(info).not.toHaveBeenCalledWith(expect.anything(), 'worker started');
  });

  it('reports started and returns a shutdown that quits Redis when Redis answers', async () => {
    const exit = vi.fn();
    const quit = vi.fn().mockResolvedValue('OK');
    // Minimal stand-in: startWorker only calls ping() and quit()/disconnect() on the client.
    const redis = { ping: async () => 'PONG', quit, disconnect: vi.fn() } as unknown as RedisClient;

    const worker = await startWorker({ env: { APP_ENV: 'test' }, logger, redis, exit });
    expect(worker).toBeDefined();
    expect(exit).not.toHaveBeenCalled();

    await worker?.shutdown();
    expect(quit).toHaveBeenCalledOnce();
  });
});
