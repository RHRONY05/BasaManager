import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { clock } from '../../src/lib/clock';
import { q } from '../helpers/pg';
import {
  buildTestApp,
  resetAll,
  newAgent,
  insertUser,
  setCookieLine,
  PASSWORD,
  uniqEmail,
  type TestCtx,
} from '../helpers/auth';

describe('auth: login, lockout, rate limit, cookies (A2)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  const login = (email: string, password: string) =>
    newAgent(ctx).post('/api/auth/login').send({ email, password });

  it('login sets bm_at / bm_rt / bm_csrf with the documented attributes', async () => {
    const u = await insertUser();
    const res = await login(u.email, u.password);
    expect(res.status).toBe(200);

    const at = setCookieLine(res, 'bm_at')!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\/(;|$)/);
    expect(at).toMatch(/Max-Age=900\b/);
    expect(at).not.toMatch(/;\s*Secure/i); // COOKIE_SECURE=false in test

    const rt = setCookieLine(res, 'bm_rt')!;
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/SameSite=Strict/i);
    expect(rt).toMatch(/Path=\/api\/auth(;|$)/);
    expect(rt).toMatch(/Max-Age=2592000\b/); // 30 days

    const csrf = setCookieLine(res, 'bm_csrf')!;
    expect(csrf).toBeDefined();
    expect(csrf).not.toMatch(/HttpOnly/i); // readable by the SPA (double-submit)

    // the refresh token is opaque and stored only as a SHA-256 hash (32 bytes)
    const rtValue = rt.split(';')[0]!.split('=')[1]!;
    expect(rtValue.split('.').length).not.toBe(3); // not a JWT
    const rows = await q<{ n: number }>(
      `select octet_length(token_hash) as n from sessions where user_id = $1`,
      [u.id],
    );
    expect(rows).toEqual([{ n: 32 }]);
    expect(await q(`select 1 from sessions where encode(token_hash,'hex') = $1`, [rtValue])).toHaveLength(0);
  });

  it('stores the password as argon2id m=19456,t=2,p=1', async () => {
    const agent = newAgent(ctx);
    const email = uniqEmail();
    await agent.post('/api/auth/signup').send({
      email,
      password: PASSWORD,
      fullName: 'Karim',
      orgName: 'Karim Homes',
    });
    const rows = await q<{ password_hash: string }>(`select password_hash from users where email = $1`, [
      email,
    ]);
    expect(rows[0]!.password_hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });

  it('wrong password and unknown email give the same INVALID_CREDENTIALS answer', async () => {
    const u = await insertUser();
    const wrong = await login(u.email, 'Not-the-password-1');
    const unknown = await login(uniqEmail('nobody'), 'Not-the-password-1');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknown.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.details).toEqual(wrong.body.error.details);
    expect(setCookieLine(wrong, 'bm_at')).toBeUndefined();
  });

  it('email matching is case-insensitive', async () => {
    const u = await insertUser({ email: 'Mixed.Case@test.local' });
    expect((await login('mixed.case@TEST.local', u.password)).status).toBe(200);
  });

  it('5 wrong passwords lock the account for 15 minutes, even for the correct password', async () => {
    const u = await insertUser();
    for (let i = 0; i < 5; i++) {
      const r = await login(u.email, 'Wrong-password-1');
      expect([401, 423]).toContain(r.status); // the 5th may already report the lock
    }
    const locked = await login(u.email, u.password); // correct password, still refused
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe(ErrorCode.ACCOUNT_LOCKED);
    expect(JSON.stringify(locked.body.error)).toMatch(
      /\b(1[0-5]|[1-9])\b.*minute|minute.*\b(1[0-5]|[1-9])\b/i,
    );
    expect(setCookieLine(locked, 'bm_at')).toBeUndefined();

    const row = (await q<{ locked_until: Date }>(`select locked_until from users where id = $1`, [u.id]))[0]!;
    const ms = row.locked_until.getTime() - Date.now();
    expect(ms).toBeGreaterThan(13 * 60_000);
    expect(ms).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it('the lock ends after 15 minutes and the fail counter resets', async () => {
    const u = await insertUser();
    for (let i = 0; i < 5; i++) await login(u.email, 'Wrong-password-1');
    expect((await login(u.email, u.password)).status).toBe(423);

    clock.set(new Date(Date.now() + 16 * 60_000));
    const ok = await login(u.email, u.password);
    expect(ok.status).toBe(200);
    const row = (
      await q<{ failed_login_count: number; locked_until: Date | null }>(
        `select failed_login_count, locked_until from users where id = $1`,
        [u.id],
      )
    )[0]!;
    expect(row.failed_login_count).toBe(0);
  });

  it('a successful login resets the failure counter (failures must be consecutive)', async () => {
    const u = await insertUser();
    for (let i = 0; i < 3; i++) await login(u.email, 'Wrong-password-1');
    expect((await login(u.email, u.password)).status).toBe(200);
    expect(
      (
        await q<{ failed_login_count: number }>(`select failed_login_count from users where id=$1`, [u.id])
      )[0]!.failed_login_count,
    ).toBe(0);
    for (let i = 0; i < 3; i++) {
      expect((await login(u.email, 'Wrong-password-1')).status).toBe(401);
    }
    expect((await login(u.email, u.password)).status).toBe(200); // not locked: 3 + 3 were not consecutive
  });

  it('the 11th login attempt within a minute from one IP is RATE_LIMITED', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await login(uniqEmail('ghost'), 'Whatever-pass-1');
      expect(r.status).toBe(401);
    }
    const eleventh = await login(uniqEmail('ghost'), 'Whatever-pass-1');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('login validates its input', async () => {
    const res = await newAgent(ctx).post('/api/auth/login').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('an unverified user can sign in (the UI gates actions on emailVerified)', async () => {
    const u = await insertUser({ verified: false });
    const agent = newAgent(ctx);
    expect((await agent.post('/api/auth/login').send({ email: u.email, password: u.password })).status).toBe(
      200,
    );
    const me = await agent.get('/api/me');
    expect(me.body.data.user.emailVerified).toBe(false);
  });
});
