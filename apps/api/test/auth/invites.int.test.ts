import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ErrorCode } from '@bm/shared/errors';
import { clock } from '../../src/lib/clock';
import { q } from '../helpers/pg';
import { makeOrg, type Org } from '../helpers/factories';
import {
  buildTestApp,
  resetAll,
  newAgent,
  loginAs,
  insertUser,
  insertInvitation,
  setCookieLine,
  uniqEmail,
  PASSWORD,
  type TestCtx,
} from '../helpers/auth';

describe('auth: invitations (A7)', () => {
  let ctx: TestCtx;
  let org: Org;
  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    org = await makeOrg({ name: 'Green View Apartments' });
  });

  const fixture = (email: string, o: Partial<Parameters<typeof insertInvitation>[0]> = {}) =>
    insertInvitation({ orgId: org.id, invitedBy: org.landlordUserId, email, ...o });

  describe('GET /invites/:token (preview)', () => {
    it('shows org name, role, inviter and a MASKED email; needs no session', async () => {
      const email = 'nusrat.jahan@test.local';
      const { token } = await fixture(email);
      const res = await newAgent(ctx).get(`/api/invites/${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(
        expect.objectContaining({ orgName: 'Green View Apartments', role: 'tenant' }),
      );
      expect(res.body.data.inviterName).toBeTruthy();
      expect(res.body.data.email).toBe('n***@test.local'); // first character + *** + @domain
      expect(JSON.stringify(res.body)).not.toContain('nusrat.jahan');
    });

    it.each(['unknown', 'expired', 'accepted', 'revoked'])('%s token is TOKEN_INVALID', async (kind) => {
      const email = uniqEmail();
      let token = 'q'.repeat(43);
      if (kind === 'expired')
        token = (await fixture(email, { expiresAt: new Date(Date.now() - 1000) })).token;
      if (kind === 'accepted') token = (await fixture(email, { acceptedAt: new Date() })).token;
      if (kind === 'revoked') token = (await fixture(email, { revokedAt: new Date() })).token;
      const res = await newAgent(ctx).get(`/api/invites/${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
    });
  });

  describe('POST /invites/:token/accept', () => {
    it('a new user: creates a verified account + active membership, signs in, marks the invite accepted', async () => {
      const email = uniqEmail('tenant');
      const { token, id } = await fixture(email);
      const agent = newAgent(ctx);
      const res = await agent
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'Nusrat Jahan' });
      expect(res.status).toBe(200);
      expect(setCookieLine(res, 'bm_at')).toBeDefined();

      const user = (
        await q<{ id: string; email_verified_at: Date | null; full_name: string }>(
          `select id, email_verified_at, full_name from users where email = $1`,
          [email],
        )
      )[0]!;
      expect(user.email_verified_at).not.toBeNull(); // the link proved the address
      expect(user.full_name).toBe('Nusrat Jahan');
      const m = await q<{ role: string; status: string }>(
        `select role, status from memberships where org_id = $1 and user_id = $2`,
        [org.id, user.id],
      );
      expect(m).toEqual([{ role: 'tenant', status: 'active' }]);
      expect(
        (await q<{ accepted_at: Date | null }>(`select accepted_at from invitations where id=$1`, [id]))[0]!
          .accepted_at,
      ).not.toBeNull();

      const me = await agent.get('/api/me');
      expect(me.body.data.memberships).toEqual([
        expect.objectContaining({ orgId: org.id, orgName: 'Green View Apartments', role: 'tenant' }),
      ]);
    });

    it('is single-use: a second accept is TOKEN_INVALID and creates nothing', async () => {
      const email = uniqEmail('tenant');
      const { token } = await fixture(email);
      const first = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'A B' });
      expect(first.status).toBe(200);
      const second = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'A B' });
      expect(second.status).toBe(400);
      expect(second.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
      expect(await q(`select 1 from users where email = $1`, [email])).toHaveLength(1);
      expect(await q(`select 1 from memberships where org_id=$1 and role='tenant'`, [org.id])).toHaveLength(
        1,
      );
    });

    it('two concurrent accepts of one token: exactly one wins', async () => {
      const { token } = await fixture(uniqEmail('tenant'));
      const results = await Promise.all(
        [1, 2].map(() =>
          newAgent(ctx)
            .post(`/api/invites/${token}/accept`)
            .send({ password: PASSWORD, fullName: 'Race Runner' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await q(`select 1 from memberships where org_id=$1 and role='tenant'`, [org.id])).toHaveLength(
        1,
      );
    });

    it('expires 7 days after creation (clock moved past the expiry)', async () => {
      const created = new Date();
      const { token } = await fixture(uniqEmail(), {
        expiresAt: new Date(created.getTime() + 7 * 86_400_000),
      });
      clock.set(new Date(created.getTime() + 7 * 86_400_000 + 60_000));
      const res = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: PASSWORD, fullName: 'Late Comer' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
      clock.reset();
      // and it was still fine just before
      const ok = await fixture(uniqEmail(), { expiresAt: new Date(Date.now() + 7 * 86_400_000) });
      clock.set(new Date(Date.now() + 6 * 86_400_000));
      expect(
        (
          await newAgent(ctx)
            .post(`/api/invites/${ok.token}/accept`)
            .send({ password: PASSWORD, fullName: 'On Time' })
        ).status,
      ).toBe(200);
    });

    it('revoked and unknown tokens are TOKEN_INVALID', async () => {
      const revoked = await fixture(uniqEmail(), { revokedAt: new Date() });
      for (const token of [revoked.token, 'k'.repeat(43)]) {
        const res = await newAgent(ctx)
          .post(`/api/invites/${token}/accept`)
          .send({ password: PASSWORD, fullName: 'No Way' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
      }
    });

    it('a new user must supply a strong password and a name (VALIDATION_FAILED, invite not consumed)', async () => {
      const { token } = await fixture(uniqEmail('tenant'));
      const weak = await newAgent(ctx)
        .post(`/api/invites/${token}/accept`)
        .send({ password: 'password123', fullName: 'X Y' });
      expect(weak.status).toBe(400);
      expect(weak.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      const noName = await newAgent(ctx).post(`/api/invites/${token}/accept`).send({ password: PASSWORD });
      expect(noName.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(
        (
          await newAgent(ctx)
            .post(`/api/invites/${token}/accept`)
            .send({ password: PASSWORD, fullName: 'X Y' })
        ).status,
      ).toBe(200);
    });

    it('a signed-in user with the matching email gets the membership (no password needed)', async () => {
      const u = await insertUser();
      const { token } = await fixture(u.email);
      const agent = await loginAs(newAgent(ctx), u.email, u.password);
      const res = await agent.post(`/api/invites/${token}/accept`).send({});
      expect(res.status).toBe(200);
      const m = await q(
        `select 1 from memberships where org_id=$1 and user_id=$2 and role='tenant' and status='active'`,
        [org.id, u.id],
      );
      expect(m).toHaveLength(1);
    });

    it('a signed-in user with a different email is INVITE_EMAIL_MISMATCH and nothing is created', async () => {
      const intended = uniqEmail('intended');
      const { token, id } = await fixture(intended);
      const other = await insertUser();
      const agent = await loginAs(newAgent(ctx), other.email, other.password);
      const res = await agent.post(`/api/invites/${token}/accept`).send({});
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ErrorCode.INVITE_EMAIL_MISMATCH);
      expect(
        await q(`select 1 from memberships where org_id=$1 and user_id=$2`, [org.id, other.id]),
      ).toHaveLength(0);
      expect(
        (await q<{ accepted_at: Date | null }>(`select accepted_at from invitations where id=$1`, [id]))[0]!
          .accepted_at,
      ).toBeNull();
      expect(await q(`select 1 from users where email=$1`, [intended])).toHaveLength(0);
    });
  });
});
