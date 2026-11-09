import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client'; // dev dependency the lead adds
import { createLogger } from '../../src/lib/logger';
// Missing until V5 (brief V5-tests "Interface"): attachRealtime(server, deps) -> { io, close() }
import { attachRealtime } from '../../src/realtime/io';
import {
  buildTestApp,
  resetAll,
  insertUser,
  loginAs,
  cookie,
  extractLink,
  tokenFromLink,
  latestMailTo,
  type TestAgent,
  type TestCtx,
} from '../helpers/auth';

describe('auth: socket handshake auth and session:revoked (04 Socket events)', () => {
  let ctx: TestCtx;
  let server: http.Server;
  let realtime: Awaited<ReturnType<typeof attachRealtime>>;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = buildTestApp();
    server = http.createServer(ctx.app);
    realtime = await attachRealtime(server, {
      env: ctx.env,
      prisma: ctx.prisma,
      redis: ctx.redis,
      logger: createLogger({ isTest: true }),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await realtime.close();
    await new Promise((r) => server.close(r));
    await ctx.close();
  });
  beforeEach(() => resetAll(ctx));
  afterEach(() => {
    while (sockets.length) sockets.pop()!.close();
  });

  const agentOnServer = (): TestAgent => request.agent(server).set('Origin', ctx.env.APP_URL);

  function open(at: string | undefined): Promise<Socket> {
    const s = connect(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: at ? { cookie: `bm_at=${at}` } : {},
    });
    sockets.push(s);
    return new Promise((resolve, reject) => {
      s.once('connect', () => resolve(s));
      s.once('connect_error', reject);
    });
  }
  const once = <T = unknown>(s: Socket, ev: string, ms = 3000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no "${ev}" within ${ms}ms`)), ms);
      s.once(ev, (v: T) => {
        clearTimeout(t);
        resolve(v);
      });
    });

  it('rejects a handshake without a valid bm_at cookie', async () => {
    await expect(open(undefined)).rejects.toBeTruthy();
    await expect(open('garbage.token.value')).rejects.toBeTruthy();
  });

  it('accepts a handshake authenticated by the bm_at cookie', async () => {
    const u = await insertUser();
    const agent = await loginAs(agentOnServer(), u.email, u.password);
    const s = await open(cookie(agent, 'bm_at'));
    expect(s.connected).toBe(true);
  });

  it('logout-all emits session:revoked to the user and disconnects their sockets, not other users', async () => {
    const u = await insertUser();
    const other = await insertUser();
    const agent = await loginAs(agentOnServer(), u.email, u.password);
    const otherAgent = await loginAs(agentOnServer(), other.email, other.password);
    const s1 = await open(cookie(agent, 'bm_at'));
    const s2 = await open(cookie(agent, 'bm_at')); // second tab
    const bystander = await open(cookie(otherAgent, 'bm_at'));

    const got = [once(s1, 'session:revoked'), once(s2, 'session:revoked')];
    const gone = [once(s1, 'disconnect'), once(s2, 'disconnect')];
    expect((await agent.post('/api/auth/logout-all')).status).toBe(200);
    expect(await Promise.all(got)).toEqual([{}, {}]);
    await Promise.all(gone);
    expect(s1.connected).toBe(false);
    expect(s2.connected).toBe(false);

    await new Promise((r) => setTimeout(r, 300));
    expect(bystander.connected).toBe(true);
  });

  it('reset-password also emits session:revoked and disconnects the old sockets', async () => {
    const u = await insertUser();
    const agent = await loginAs(agentOnServer(), u.email, u.password);
    const s = await open(cookie(agent, 'bm_at'));

    await agentOnServer().post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFromLink(
      extractLink(await latestMailTo(u.email, { subject: /reset/i }), '/reset-password'),
    );
    const revoked = once(s, 'session:revoked');
    const disconnected = once(s, 'disconnect');
    const res = await agentOnServer()
      .post('/api/auth/reset-password')
      .send({ token, password: 'Fresh-Passw0rd-4321' });
    expect(res.status).toBe(200);
    await revoked;
    await disconnected;
    expect(s.connected).toBe(false);
  });
});
