import { describe, it, expect } from 'vitest';
import type { Redis } from 'ioredis';
import { pingDb, type Db } from './db';
import { pingRedis } from './redis';

const fakeDb = (impl: () => Promise<unknown>) => ({ $queryRaw: impl }) as unknown as Db;
const fakeRedis = (impl: () => Promise<unknown>) => ({ ping: impl }) as unknown as Redis;

describe('pingDb', () => {
  it('true when the query resolves', async () => {
    expect(
      await pingDb(
        fakeDb(() => Promise.resolve([])),
        100,
      ),
    ).toBe(true);
  });
  it('false when the query rejects', async () => {
    expect(
      await pingDb(
        fakeDb(() => Promise.reject(new Error('x'))),
        100,
      ),
    ).toBe(false);
  });
  it('false when the query hangs past the timeout', async () => {
    expect(
      await pingDb(
        fakeDb(() => new Promise(() => {})),
        20,
      ),
    ).toBe(false);
  });
});

describe('pingRedis', () => {
  it('true on PONG', async () => {
    expect(
      await pingRedis(
        fakeRedis(() => Promise.resolve('PONG')),
        100,
      ),
    ).toBe(true);
  });
  it('false on any other reply', async () => {
    expect(
      await pingRedis(
        fakeRedis(() => Promise.resolve('nope')),
        100,
      ),
    ).toBe(false);
  });
  it('false when ping rejects', async () => {
    expect(
      await pingRedis(
        fakeRedis(() => Promise.reject(new Error('x'))),
        100,
      ),
    ).toBe(false);
  });
  it('false when ping hangs past the timeout', async () => {
    expect(
      await pingRedis(
        fakeRedis(() => new Promise(() => {})),
        20,
      ),
    ).toBe(false);
  });
});

describe('client factories', () => {
  it('createRedis builds a lazy client that does not connect until used', async () => {
    const { createRedis } = await import('./redis');
    const client = createRedis('redis://:pw@127.0.0.1:59998/0');
    expect(client.status).toBe('wait');
    client.disconnect();
  });

  it('createPrisma builds a client without connecting', async () => {
    const { createPrisma } = await import('./db');
    const client = createPrisma('postgresql://u:p@127.0.0.1:59997/none');
    expect(typeof client.$queryRaw).toBe('function');
    await client.$disconnect();
  });
});
