import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { clock } from '../../src/lib/clock';
import { q } from '../helpers/pg';
import {
  buildTestApp,
  resetAll,
  newAgent,
  loginAs,
  insertUser,
  latestMailTo,
  mailCount,
  extractLink,
  tokenFromLink,
  setCookieLine,
  liveSessions,
  cookie,
  syncCsrf,
  uniqEmail,
  type TestCtx,
} from '../helpers/auth';

const NEW_PASSWORD = 'Brand-New-Passw0rd-77';

describe('auth: forgot / reset / change password (A5)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  async function requestReset(email: string): Promise<string> {
    const res = await newAgent(ctx).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    const mail = await latestMailTo(email, { subject: /reset/i });
    return tokenFromLink(extractLink(mail, '/reset-password'));
  }

  it('forgot-password is 200 with an identical body for known and unknown emails; only known users get mail', async () => {
    const u = await insertUser();
    const ghost = uniqEmail('ghost');
    const unknown = await newAgent(ctx).post('/api/auth/forgot-password').send({ email: ghost });
    const known = await newAgent(ctx).post('/api/auth/forgot-password').send({ email: u.email });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    const mail = await latestMailTo(u.email, { subject: /reset/i }); // known user's mail has arrived ...
    expect(extractLink(mail, '/reset-password')).toContain('token=');
    expect(await mailCount(ghost)).toBe(0); // ... and the unknown address got nothing
  });

  it('forgot-password responds promptly without blocking on mailer delivery', async () => {
    const u = await insertUser();
    const mailer = await import('../../src/config/mailer');
    const origDeliver = mailer.deliverOutboxNow;
    const deliverSpy = vi.spyOn(mailer, 'deliverOutboxNow').mockImplementation(async (msgs) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return origDeliver(msgs);
    });

    try {
      const t0 = Date.now();
      const res = await newAgent(ctx).post('/api/auth/forgot-password').send({ email: u.email });
      const elapsed = Date.now() - t0;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(300);

      const mail = await latestMailTo(u.email, { subject: /reset/i, timeoutMs: 5000 });
      expect(extractLink(mail, '/reset-password')).toContain('token=');
    } finally {
      deliverSpy.mockRestore();
    }
  });

  it('forgot-password validates the email and is RATE_LIMITED after repeated requests', async () => {
    const bad = await newAgent(ctx).post('/api/auth/forgot-password').send({ email: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    let limited: { status: number; body: { error?: { code: string } } } | undefined;
    for (let i = 0; i < 12 && !limited; i++) {
      const r = await newAgent(ctx)
        .post('/api/auth/forgot-password')
        .send({ email: uniqEmail('spam') });
      if (r.status === 429) limited = r;
    }
    expect(limited, 'expected a 429 within 12 forgot-password requests from one IP').toBeDefined();
    expect(limited!.body.error!.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('reset sets the password, signs in on this device, revokes ALL other sessions, and the old password stops working', async () => {
    const u = await insertUser();
    const phone = await loginAs(newAgent(ctx), u.email, u.password);
    const laptop = await loginAs(newAgent(ctx), u.email, u.password);
    expect(await liveSessions(u.id)).toHaveLength(2);

    const token = await requestReset(u.email);
    const device = newAgent(ctx);
    const res = await device.post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(setCookieLine(res, 'bm_at')).toBeDefined();
    expect(cookie(device, 'bm_rt')).toBeTruthy();

    // only the session created by the reset is live
    expect(await liveSessions(u.id)).toHaveLength(1);
    expect((await phone.post('/api/auth/refresh')).status).toBe(401);
    expect((await laptop.post('/api/auth/refresh')).status).toBe(401);
    syncCsrf(device);
    expect((await device.get('/api/me')).status).toBe(200);

    expect(
      (await newAgent(ctx).post('/api/auth/login').send({ email: u.email, password: u.password })).status,
    ).toBe(401);
    expect(
      (await newAgent(ctx).post('/api/auth/login').send({ email: u.email, password: NEW_PASSWORD })).status,
    ).toBe(200);
    const hash = (
      await q<{ password_hash: string }>(`select password_hash from users where id=$1`, [u.id])
    )[0]!;
    expect(hash.password_hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
  });

  it('a reset token is single-use', async () => {
    const u = await insertUser();
    const token = await requestReset(u.email);
    expect(
      (await newAgent(ctx).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status,
    ).toBe(200);
    const again = await newAgent(ctx)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Another-Passw0rd-12' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('a reset token expires after 30 minutes', async () => {
    const u = await insertUser();
    const token = await requestReset(u.email);

    clock.set(new Date(Date.now() + 29 * 60_000));
    const probe = newAgent(ctx);
    // 29 minutes: still valid (weak password so nothing is consumed; validation must not burn the token)
    const weak = await probe.post('/api/auth/reset-password').send({ token, password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

    clock.set(new Date(Date.now() + 2 * 60_000)); // now T+31
    const late = await probe.post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD });
    expect(late.status).toBe(400);
    expect(late.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('an unknown reset token is TOKEN_INVALID and a weak new password does not consume a valid token', async () => {
    const u = await insertUser();
    const unknown = await newAgent(ctx)
      .post('/api/auth/reset-password')
      .send({ token: 'z'.repeat(43), password: NEW_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe(ErrorCode.TOKEN_INVALID);

    const token = await requestReset(u.email);
    const weak = await newAgent(ctx)
      .post('/api/auth/reset-password')
      .send({ token, password: 'password123' });
    expect(weak.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(
      (await newAgent(ctx).post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD })).status,
    ).toBe(200);
  });

  describe('POST /me/change-password', () => {
    it('revokes every other session but keeps the current one', async () => {
      const u = await insertUser();
      const here = await loginAs(newAgent(ctx), u.email, u.password);
      const there = await loginAs(newAgent(ctx), u.email, u.password);

      const res = await here
        .post('/api/me/change-password')
        .send({ currentPassword: u.password, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);

      expect(await liveSessions(u.id)).toHaveLength(1);
      expect((await there.post('/api/auth/refresh')).status).toBe(401);
      expect((await here.post('/api/auth/refresh')).status).toBe(200);
      expect(
        (await newAgent(ctx).post('/api/auth/login').send({ email: u.email, password: NEW_PASSWORD })).status,
      ).toBe(200);
      expect(
        (await newAgent(ctx).post('/api/auth/login').send({ email: u.email, password: u.password })).status,
      ).toBe(401);
    });

    it('wrong current password is INVALID_CREDENTIALS; weak new password is VALIDATION_FAILED; both change nothing', async () => {
      const u = await insertUser();
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      const before = (
        await q<{ password_hash: string }>(`select password_hash from users where id=$1`, [u.id])
      )[0]!.password_hash;

      const wrong = await agent
        .post('/api/me/change-password')
        .send({ currentPassword: 'Not-my-password-1', newPassword: NEW_PASSWORD });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);

      const weak = await agent
        .post('/api/me/change-password')
        .send({ currentPassword: u.password, newPassword: '1234567890' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);

      const after = (
        await q<{ password_hash: string }>(`select password_hash from users where id=$1`, [u.id])
      )[0]!.password_hash;
      expect(after).toBe(before);
    });

    it('requires a session', async () => {
      const res = await newAgent(ctx)
        .post('/api/me/change-password')
        .send({ currentPassword: 'a', newPassword: NEW_PASSWORD });
      expect(res.status).toBe(401);
    });
  });
});
