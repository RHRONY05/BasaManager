import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import {
  buildTestApp,
  resetAll,
  newAgent,
  loginAs,
  insertUser,
  cookie,
  cookiesOf,
  csrfFrom,
  rawRequest,
  syncCsrf,
  setCookieLine,
  sessionByRefreshToken,
  sessionsOfUser,
  liveSessions,
  latestMailTo,
  type TestCtx,
} from '../helpers/auth';

describe('auth: refresh rotation, reuse detection, logout, devices (A3, A4)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  async function signedIn() {
    const u = await insertUser();
    const agent = await loginAs(newAgent(ctx), u.email, u.password);
    return { u, agent };
  }

  it('refresh without a refresh cookie is UNAUTHENTICATED', async () => {
    const res = await rawRequest(ctx, 'post', '/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('refresh rotates: old token marked rotated, new cookies differ, same family', async () => {
    const { u, agent } = await signedIn();
    const rt1 = cookie(agent, 'bm_rt')!;
    const at1 = cookie(agent, 'bm_at')!;

    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    const rt2 = cookie(agent, 'bm_rt')!;
    const at2 = cookie(agent, 'bm_at')!;
    expect(rt2).toBeTruthy();
    expect(rt2).not.toBe(rt1);
    expect(at2).not.toBe(at1);
    expect(setCookieLine(res, 'bm_rt')).toMatch(/Path=\/api\/auth/);

    const old = (await sessionByRefreshToken(rt1))!;
    const next = (await sessionByRefreshToken(rt2))!;
    expect(old.rotated_at).not.toBeNull();
    expect(old.revoked_at).toBeNull(); // rotated, not revoked
    expect(next.rotated_at).toBeNull();
    expect(next.family_id).toBe(old.family_id);
    expect(await sessionsOfUser(u.id)).toHaveLength(2);

    syncCsrf(agent);
    expect((await agent.get('/api/me')).status).toBe(200);
  });

  it('reusing a rotated refresh token is SESSION_REVOKED, kills the family (incl. the newest token) and mails a security alert', async () => {
    const { u, agent } = await signedIn();
    const otherDevice = await loginAs(newAgent(ctx), u.email, u.password);
    const rt1 = cookie(agent, 'bm_rt')!;
    const stolen = { ...cookiesOf(agent) }; // what an attacker copied before the legit rotation

    await agent.post('/api/auth/refresh'); // legitimate client rotates
    const rt2 = cookie(agent, 'bm_rt')!;
    syncCsrf(agent);

    // attacker replays the old token
    const replay = await rawRequest(ctx, 'post', '/api/auth/refresh', {
      cookies: { bm_rt: stolen['bm_rt']!, bm_csrf: stolen['bm_csrf']! },
      csrf: stolen['bm_csrf']!,
    });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe(ErrorCode.SESSION_REVOKED);
    expect(rt1).toBe(stolen['bm_rt']);

    // whole family revoked, with a reason
    const family = (await sessionByRefreshToken(rt1))!.family_id;
    const rows = (await sessionsOfUser(u.id)).filter((s) => s.family_id === family);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const s of rows) {
      expect(s.revoked_at).not.toBeNull();
      expect(['reuse', 'reuse_detected']).toContain(s.revoke_reason);
    }

    // the legitimate holder's newest token stops working too
    const legit = await agent.post('/api/auth/refresh');
    expect(legit.status).toBe(401);
    expect(legit.body.error.code).toBe(ErrorCode.SESSION_REVOKED);
    expect((await sessionByRefreshToken(rt2))!.revoked_at).not.toBeNull();

    // the user's other device (another family) is untouched
    const other = await otherDevice.post('/api/auth/refresh');
    expect(other.status).toBe(200);

    const mail = await latestMailTo(u.email, { subject: /security/i });
    expect(mail.to).toContain(u.email);
  });

  it('5 parallel refreshes with one token yields exactly one 200 and after any reuse 0 live sessions in family', async () => {
    const { u, agent } = await signedIn();
    const rt = cookie(agent, 'bm_rt')!;
    const csrf = cookie(agent, 'bm_csrf')!;
    const family = (await sessionByRefreshToken(rt))!.family_id;

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        rawRequest(ctx, 'post', '/api/auth/refresh', {
          cookies: { bm_rt: rt, bm_csrf: csrf },
          csrf,
        }),
      ),
    );

    const statuses = results.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 200).length;
    expect(successCount).toBe(1);

    const familySessions = (await sessionsOfUser(u.id)).filter((s) => s.family_id === family);
    const liveFamilySessions = familySessions.filter((s) => s.revoked_at === null);
    expect(liveFamilySessions).toHaveLength(0);
  });

  it('a revoked-by-logout refresh token is SESSION_REVOKED', async () => {
    const { agent } = await signedIn();
    const c = cookiesOf(agent);
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    const res = await rawRequest(ctx, 'post', '/api/auth/refresh', {
      cookies: { bm_rt: c['bm_rt']!, bm_csrf: c['bm_csrf']! },
      csrf: c['bm_csrf']!,
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.SESSION_REVOKED);
  });

  it('an expired refresh token cannot be used', async () => {
    const { u, agent } = await signedIn();
    await q(`update sessions set expires_at = now() - interval '1 minute' where user_id = $1`, [u.id]);
    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect([ErrorCode.UNAUTHENTICATED, ErrorCode.SESSION_REVOKED]).toContain(res.body.error.code);
  });

  it('logout needs a session; it revokes the current session only and clears the cookies', async () => {
    const anon = await rawRequest(ctx, 'post', '/api/auth/logout');
    expect(anon.status).toBe(401);

    const { u, agent: a } = await signedIn();
    const b = await loginAs(newAgent(ctx), u.email, u.password);
    expect(await liveSessions(u.id)).toHaveLength(2);

    const res = await a.post('/api/auth/logout');
    expect(res.status).toBe(200);
    for (const n of ['bm_at', 'bm_rt']) {
      const line = setCookieLine(res, n)!;
      expect(line).toMatch(new RegExp(`^${n}=;|Max-Age=0|Expires=Thu, 01 Jan 1970`));
    }
    expect(await liveSessions(u.id)).toHaveLength(1);
    expect((await b.post('/api/auth/refresh')).status).toBe(200); // the other device lives on
  });

  it('logout-all revokes every session of the user and no one else', async () => {
    const { u, agent: a } = await signedIn();
    const b = await loginAs(newAgent(ctx), u.email, u.password);
    const bystander = await insertUser();
    const c = await loginAs(newAgent(ctx), bystander.email, bystander.password);

    const res = await a.post('/api/auth/logout-all');
    expect(res.status).toBe(200);
    expect(await liveSessions(u.id)).toHaveLength(0);
    for (const s of await sessionsOfUser(u.id)) expect(s.revoked_at).not.toBeNull();

    const bRefresh = await b.post('/api/auth/refresh');
    expect(bRefresh.status).toBe(401);
    expect(bRefresh.body.error.code).toBe(ErrorCode.SESSION_REVOKED);
    expect((await c.post('/api/auth/refresh')).status).toBe(200);
  });

  describe('devices: GET /me/sessions and DELETE /me/sessions/:id', () => {
    it('lists one entry per live sign-in, marks the current one, and hides token material', async () => {
      const { u, agent: a } = await signedIn();
      await a.post('/api/auth/refresh'); // rotation must not create a second "device"
      syncCsrf(a);
      await loginAs(newAgent(ctx), u.email, u.password);

      const res = await a.get('/api/me/sessions');
      expect(res.status).toBe(200);
      const list = res.body.data as { id: string; current: boolean }[];
      expect(list).toHaveLength(2);
      expect(list.filter((s) => s.current)).toHaveLength(1);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/token_?hash|tokenHash|bm_rt/i);
      expect(list[0]).toHaveProperty('createdAt');
    });

    it('revokes another device by id (its refresh then fails); unknown or foreign ids are 404', async () => {
      const { u, agent: a } = await signedIn();
      const b = await loginAs(newAgent(ctx), u.email, u.password);
      const list = (await a.get('/api/me/sessions')).body.data as { id: string; current: boolean }[];
      const other = list.find((s) => !s.current)!;

      const del = await a.delete(`/api/me/sessions/${other.id}`);
      expect([200, 204]).toContain(del.status);
      const refreshed = await b.post('/api/auth/refresh');
      expect(refreshed.status).toBe(401);
      expect(refreshed.body.error.code).toBe(ErrorCode.SESSION_REVOKED);
      expect(((await a.get('/api/me/sessions')).body.data as unknown[]).length).toBe(1);

      const stranger = await insertUser();
      const sa = await loginAs(newAgent(ctx), stranger.email, stranger.password);
      const strangerSessions = (await sa.get('/api/me/sessions')).body.data as { id: string }[];
      const foreign = await a.delete(`/api/me/sessions/${strangerSessions[0]!.id}`);
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect((await a.delete('/api/me/sessions/7d1f7b3e-3c2a-4b5e-8f10-2f0a9b6c1d11')).status).toBe(404);
      expect(csrfFrom(a)).toBeTruthy();
    });

    it('requires a session', async () => {
      const res = await rawRequest(ctx, 'get', '/api/me/sessions');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });
  });
});
