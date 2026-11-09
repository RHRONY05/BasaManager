import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { makeOrg } from '../helpers/factories';
import {
  buildTestApp,
  resetAll,
  newAgent,
  signupAndVerify,
  loginAs,
  insertUser,
  insertInvitation,
  latestMailTo,
  extractLink,
  tokenFromLink,
  cookie,
  syncCsrf,
  uniqEmail,
  type TestCtx,
} from '../helpers/auth';

describe('auth: no auth route logs a body, a password or a token (02 Observability, 04)', () => {
  let ctx: TestCtx;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(() => resetAll(ctx));

  it('runs every auth flow, then finds none of the secrets in the captured logger output', async () => {
    const secrets: string[] = [];
    const pw1 = 'Zq7-Unique-Leak-Canary-Pw-1';
    const pw2 = 'Zq7-Unique-Leak-Canary-Pw-2';
    const pw3 = 'Zq7-Unique-Leak-Canary-Pw-3';
    const wrong = 'Zq7-Unique-Leak-Canary-Wrong';
    secrets.push(pw1, pw2, pw3, wrong);

    // signup + verify (verify token travels in the body, the mailed link carries it in the query)
    const a = newAgent(ctx);
    const owner = await signupAndVerify(a, { password: pw1 });
    const verifyMail = await latestMailTo(owner.email, { subject: /verify/i });
    secrets.push(tokenFromLink(extractLink(verifyMail, '/verify-email')));

    // login (good and bad), refresh, change password
    await newAgent(ctx).post('/api/auth/login').send({ email: owner.email, password: wrong });
    const b = await loginAs(newAgent(ctx), owner.email, pw1);
    await b.post('/api/auth/refresh');
    syncCsrf(b);
    secrets.push(cookie(b, 'bm_at')!, cookie(b, 'bm_rt')!, cookie(b, 'bm_csrf')!);
    await b.post('/api/me/change-password').send({ currentPassword: pw1, newPassword: pw2 });

    // forgot + reset
    await newAgent(ctx).post('/api/auth/forgot-password').send({ email: owner.email });
    const resetToken = tokenFromLink(
      extractLink(await latestMailTo(owner.email, { subject: /reset/i }), '/reset-password'),
    );
    secrets.push(resetToken);
    await newAgent(ctx).post('/api/auth/reset-password').send({ token: resetToken, password: pw3 });

    // invite preview + accept (token is in the URL path)
    const org = await makeOrg();
    const inv = await insertInvitation({
      orgId: org.id,
      invitedBy: org.landlordUserId,
      email: uniqEmail('inv'),
    });
    secrets.push(inv.token);
    await newAgent(ctx).get(`/api/invites/${inv.token}`);
    await newAgent(ctx)
      .post(`/api/invites/${inv.token}/accept`)
      .send({ password: pw1, fullName: 'Log Check' });

    // logout paths
    const c = await insertUser();
    const cAgent = await loginAs(newAgent(ctx), c.email, c.password);
    secrets.push(cookie(cAgent, 'bm_rt')!);
    await cAgent.post('/api/auth/logout');

    expect(ctx.logs.length).toBeGreaterThan(0); // the request logger did run
    const blob = ctx.logs.join('\n');
    for (const s of secrets) {
      expect(s, 'secret must be non-empty').toBeTruthy();
      expect(blob.includes(s), `log output leaked a secret starting "${s.slice(0, 8)}"`).toBe(false);
    }
    // and no request/response body fields at all
    expect(blob).not.toMatch(/"(password|newPassword|currentPassword|refreshToken)"\s*:\s*"(?!\[REDACTED\])/);
  });
});
