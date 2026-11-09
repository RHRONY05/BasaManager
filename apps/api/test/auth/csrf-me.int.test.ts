import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import { makeOrg, makeMembership } from '../helpers/factories';
import {
  buildTestApp,
  resetAll,
  newAgent,
  loginAs,
  insertUser,
  cookiesOf,
  csrfFrom,
  rawRequest,
  syncCsrf,
  setCookieLine,
  type TestCtx,
} from '../helpers/auth';

describe('auth: CSRF, /me, memberships, X-Org-Id (02 Auth model, 04 Auth & account)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  describe('CSRF: unsafe methods need X-CSRF-Token == bm_csrf AND Origin == APP_URL', () => {
    async function victim() {
      const u = await insertUser({ fullName: 'Original Name' });
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      return { u, agent, c: cookiesOf(agent) };
    }
    const nameOf = async (id: string) =>
      (await q<{ full_name: string }>(`select full_name from users where id=$1`, [id]))[0]!.full_name;

    it('accepts a request with the right header and Origin', async () => {
      const { u, agent } = await victim();
      const res = await agent.patch('/api/me').send({ fullName: 'Changed Name' });
      expect(res.status).toBe(200);
      expect(await nameOf(u.id)).toBe('Changed Name');
    });

    it('missing X-CSRF-Token is 403 FORBIDDEN and changes nothing', async () => {
      const { u, c } = await victim();
      const res = await rawRequest(ctx, 'patch', '/api/me', { cookies: c }).send({ fullName: 'Hacked' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(await nameOf(u.id)).toBe('Original Name');
    });

    it('wrong X-CSRF-Token is 403', async () => {
      const { u, c } = await victim();
      const res = await rawRequest(ctx, 'patch', '/api/me', { cookies: c, csrf: 'not-the-token' }).send({
        fullName: 'Hacked',
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(await nameOf(u.id)).toBe('Original Name');
    });

    it('right token but a foreign Origin is 403', async () => {
      const { u, c } = await victim();
      const res = await rawRequest(ctx, 'patch', '/api/me', {
        cookies: c,
        csrf: c['bm_csrf']!,
        origin: 'https://evil.example',
      }).send({ fullName: 'Hacked' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(await nameOf(u.id)).toBe('Original Name');
    });

    it('right token but no Origin header is 403', async () => {
      const { c } = await victim();
      const res = await rawRequest(ctx, 'patch', '/api/me', {
        cookies: c,
        csrf: c['bm_csrf']!,
        origin: null,
      }).send({
        fullName: 'Hacked',
      });
      expect(res.status).toBe(403);
    });

    it('also guards the auth routes that act on the session (logout-all, refresh)', async () => {
      const { c } = await victim();
      expect((await rawRequest(ctx, 'post', '/api/auth/logout-all', { cookies: c })).status).toBe(403);
      expect((await rawRequest(ctx, 'post', '/api/auth/refresh', { cookies: c })).status).toBe(403);
      expect((await rawRequest(ctx, 'post', '/api/auth/logout', { cookies: c, csrf: 'bad' })).status).toBe(
        403,
      );
    });

    it('public routes still need an Origin equal to APP_URL (login CSRF)', async () => {
      const u = await insertUser();
      const bad = await rawRequest(ctx, 'post', '/api/auth/login', { origin: 'https://evil.example' }).send({
        email: u.email,
        password: u.password,
      });
      expect(bad.status).toBe(403);
      expect(bad.body.error.code).toBe(ErrorCode.FORBIDDEN);
      expect(setCookieLine(bad, 'bm_at')).toBeUndefined();
      // without any auth cookie there is no double-submit token to compare, so only Origin is required
      const ok = await rawRequest(ctx, 'post', '/api/auth/login').send({
        email: u.email,
        password: u.password,
      });
      expect(ok.status).toBe(200);
    });

    it('GET requests need neither header', async () => {
      const { c } = await victim();
      const res = await rawRequest(ctx, 'get', '/api/me', { cookies: c, origin: null });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /me', () => {
    it('is UNAUTHENTICATED without a session', async () => {
      const res = await newAgent(ctx).get('/api/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    it('lists memberships across organisations: tenant in A, landlord in B (one email, two orgs)', async () => {
      const u = await insertUser({ fullName: 'Dual Role' });
      const orgA = await makeOrg({ name: 'Org A' });
      const orgB = await makeOrg({ name: 'Org B' });
      await makeMembership(orgA.id, u.id, 'tenant');
      await makeMembership(orgB.id, u.id, 'landlord');
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      const res = await agent.get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.data.user).toEqual(
        expect.objectContaining({ id: u.id, email: u.email, fullName: 'Dual Role', emailVerified: true }),
      );
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|password_hash/);
      expect(res.body.data.memberships).toHaveLength(2);
      expect(res.body.data.memberships).toEqual(
        expect.arrayContaining([
          { orgId: orgA.id, orgName: 'Org A', role: 'tenant', status: 'active' },
          { orgId: orgB.id, orgName: 'Org B', role: 'landlord', status: 'active' },
        ]),
      );
    });

    it('PATCH /me updates fullName and phone and validates', async () => {
      const u = await insertUser();
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      const ok = await agent.patch('/api/me').send({ fullName: 'New Name', phone: '+8801712345678' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.user).toEqual(
        expect.objectContaining({ fullName: 'New Name', phone: '+8801712345678' }),
      );
      const bad = await agent.patch('/api/me').send({ fullName: '' });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  describe('X-Org-Id on an org-scoped probe route: GET /api/org', () => {
    it('member: 200 with the org name', async () => {
      const org = await makeOrg({ name: 'Sunrise Heights' });
      const pw = await insertUser();
      await makeMembership(org.id, pw.id, 'caretaker');
      const agent = await loginAs(newAgent(ctx), pw.email, pw.password);
      const res = await agent.get('/api/org').set('X-Org-Id', org.id);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Sunrise Heights');
    });

    it('an org you are not a member of is 404 NOT_FOUND, same as a random id (never leaks existence)', async () => {
      const mine = await makeOrg({ name: 'Mine' });
      const theirs = await makeOrg({ name: 'Theirs' });
      const u = await insertUser();
      await makeMembership(mine.id, u.id, 'landlord');
      const agent = await loginAs(newAgent(ctx), u.email, u.password);

      const foreign = await agent.get('/api/org').set('X-Org-Id', theirs.id);
      const random = await agent.get('/api/org').set('X-Org-Id', randomUUID());
      expect(foreign.status).toBe(404);
      expect(foreign.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(random.status).toBe(404);
      expect(random.body.error.message).toBe(foreign.body.error.message);
      expect(JSON.stringify(foreign.body)).not.toContain('Theirs');
    });

    it('a removed membership is 404 too', async () => {
      const org = await makeOrg();
      const u = await insertUser();
      await makeMembership(org.id, u.id, 'caretaker', 'removed');
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      expect((await agent.get('/api/org').set('X-Org-Id', org.id)).status).toBe(404);
    });

    it('without a session it is 401, and a malformed X-Org-Id is VALIDATION_FAILED', async () => {
      const org = await makeOrg();
      const anon = await newAgent(ctx).get('/api/org').set('X-Org-Id', org.id);
      expect(anon.status).toBe(401);
      expect(anon.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);

      const u = await insertUser();
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      const bad = await agent.get('/api/org').set('X-Org-Id', 'not-a-uuid');
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });
  });

  it('helpers expose the double-submit token', async () => {
    const u = await insertUser();
    const agent = await loginAs(newAgent(ctx), u.email, u.password);
    expect(csrfFrom(agent)).toBe(cookiesOf(agent)['bm_csrf']);
    expect(syncCsrf(agent)).toBe(agent);
  });
});
