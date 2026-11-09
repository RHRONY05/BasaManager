import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { q } from '../helpers/pg';
import {
  buildTestApp,
  resetAll,
  newAgent,
  signupAndVerify,
  latestMailTo,
  extractLink,
  tokenFromLink,
  mailCount,
  setCookieLine,
  uniqEmail,
  syncCsrf,
  PASSWORD,
  type TestCtx,
} from '../helpers/auth';

describe('auth: signup and email verification (A1)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  const body = (email: string, over: Record<string, unknown> = {}) => ({
    email,
    password: PASSWORD,
    fullName: 'Rahim Uddin',
    orgName: 'Rahim Properties',
    ...over,
  });

  it('signup creates user + org + landlord membership, signs in, mails a verify link; verifying shows up in /me', async () => {
    const agent = newAgent(ctx);
    const email = uniqEmail();
    const res = await agent.post('/api/auth/signup').send(body(email));
    expect([200, 201]).toContain(res.status);
    expect(setCookieLine(res, 'bm_at')).toBeDefined();

    const users = await q<{ id: string; email_verified_at: Date | null; password_hash: string }>(
      `select id, email_verified_at, password_hash from users where email = $1`,
      [email],
    );
    expect(users).toHaveLength(1);
    expect(users[0]!.email_verified_at).toBeNull();
    expect(users[0]!.password_hash).not.toContain(PASSWORD);

    // Unverified users can use the session; /me tells the UI they are unverified.
    syncCsrf(agent);
    const before = await agent.get('/api/me');
    expect(before.status).toBe(200);
    expect(before.body.data.user.emailVerified).toBe(false);

    const mail = await latestMailTo(email, { subject: /verify/i });
    expect(mail.to).toContain(email);
    const link = extractLink(mail, '/verify-email');
    expect(link.startsWith(ctx.env.APP_URL)).toBe(true);
    const verify = await agent.post('/api/auth/verify-email').send({ token: tokenFromLink(link) });
    expect(verify.status).toBe(200);

    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.emailVerified).toBe(true);
    expect(me.body.data.memberships).toEqual([
      expect.objectContaining({ orgName: 'Rahim Properties', role: 'landlord', status: 'active' }),
    ]);
  });

  it('signupAndVerify helper yields a verified landlord with one org', async () => {
    const agent = newAgent(ctx);
    const u = await signupAndVerify(agent);
    const orgs = await q(`select id from organizations where id = $1`, [u.orgId]);
    expect(orgs).toHaveLength(1);
    const rows = await q<{ email_verified_at: Date | null }>(
      `select email_verified_at from users where id = $1`,
      [u.userId],
    );
    expect(rows[0]!.email_verified_at).not.toBeNull();
  });

  it('a verify token works once; used, unknown and malformed tokens are all TOKEN_INVALID', async () => {
    const agent = newAgent(ctx);
    const email = uniqEmail();
    await agent.post('/api/auth/signup').send(body(email));
    syncCsrf(agent);
    const token = tokenFromLink(
      extractLink(await latestMailTo(email, { subject: /verify/i }), '/verify-email'),
    );

    expect((await agent.post('/api/auth/verify-email').send({ token })).status).toBe(200);
    const again = await agent.post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe(ErrorCode.TOKEN_INVALID);

    const unknown = await agent.post('/api/auth/verify-email').send({ token: 'x'.repeat(43) });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
    expect(unknown.body.error.message).toBe(again.body.error.message); // one code, one wording

    const missing = await agent.post('/api/auth/verify-email').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('a verify token is TOKEN_INVALID after it expires', async () => {
    const { clock } = await import('../../src/lib/clock');
    const agent = newAgent(ctx);
    const email = uniqEmail();
    await agent.post('/api/auth/signup').send(body(email));
    syncCsrf(agent);
    const token = tokenFromLink(
      extractLink(await latestMailTo(email, { subject: /verify/i }), '/verify-email'),
    );
    clock.set(new Date(Date.now() + 8 * 24 * 3600_000)); // far past any sane verify window
    const res = await agent.post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('signup with a taken email answers exactly like a fresh signup and creates nothing (no enumeration)', async () => {
    const first = await newAgent(ctx)
      .post('/api/auth/signup')
      .send(body(uniqEmail('a')));
    const email = uniqEmail('taken');
    const ok = await newAgent(ctx).post('/api/auth/signup').send(body(email));
    const orgsBefore = await q(`select id from organizations`);

    const dupAgent = newAgent(ctx);
    const dup = await dupAgent.post('/api/auth/signup').send(body(email, { orgName: 'Second Org' }));
    expect(dup.status).toBe(ok.status);
    expect(dup.body).toEqual(ok.body); // identical wording ("check your email"), no user data
    expect(first.status).toBe(ok.status);

    expect(await q(`select id from users where email = $1`, [email])).toHaveLength(1);
    expect(await q(`select id from organizations`)).toHaveLength(orgsBefore.length); // no 2nd org
    expect(setCookieLine(dup, 'bm_at')).toBeUndefined(); // the duplicate must not get a session
  });

  it('two concurrent signups with the same email return 200 without throwing 500 P2002', async () => {
    const email = uniqEmail('concurrent');
    const [res1, res2] = await Promise.all([
      newAgent(ctx)
        .post('/api/auth/signup')
        .send(body(email, { orgName: 'Org 1' })),
      newAgent(ctx)
        .post('/api/auth/signup')
        .send(body(email, { orgName: 'Org 2' })),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body).toEqual(res2.body);

    const users = await q(`select id from users where email = $1`, [email]);
    expect(users).toHaveLength(1);
  });

  it.each([
    ['shorter than 10 characters', 'Ab1!xyz'],
    ['only digits (common)', '1234567890'],
    ['common password', 'password123'],
    ['keyboard row (common)', 'qwertyuiop'],
  ])('weak password (%s) is VALIDATION_FAILED with a details entry for password', async (_n, password) => {
    const email = uniqEmail();
    const res = await newAgent(ctx).post('/api/auth/signup').send(body(email, { password }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'password' })]),
    );
    expect(await q(`select id from users where email = $1`, [email])).toHaveLength(0);
  });

  it('missing fields and a bad email are VALIDATION_FAILED', async () => {
    const a = newAgent(ctx);
    expect(
      (await a.post('/api/auth/signup').send({ email: 'not-an-email', password: PASSWORD })).status,
    ).toBe(400);
    const res = await a.post('/api/auth/signup').send(body(uniqEmail(), { orgName: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('resend-verification needs a session, sends a new mail, and is limited to 3 per hour', async () => {
    const anon = await newAgent(ctx).post('/api/auth/resend-verification');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);

    const agent = newAgent(ctx);
    const email = uniqEmail();
    await agent.post('/api/auth/signup').send(body(email));
    syncCsrf(agent);
    await latestMailTo(email, { subject: /verify/i });

    for (let i = 1; i <= 3; i++) {
      const r = await agent.post('/api/auth/resend-verification');
      expect(r.status).toBe(200);
      await latestMailTo(email, { subject: /verify/i, minCount: i + 1 });
    }
    expect(await mailCount(email, /verify/i)).toBe(4);

    const fourth = await agent.post('/api/auth/resend-verification');
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(await mailCount(email, /verify/i)).toBe(4);
  });
});
