import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { q } from '../helpers/pg';
import { makeOrg, type Org } from '../helpers/factories';
import {
  buildTestApp,
  resetAll,
  newAgent,
  insertUser,
  insertInvitation,
  cookie,
  syncCsrf,
  uniqEmail,
  type TestAgent,
  type TestCtx,
} from '../helpers/auth';
// Missing until V5: the module is the contract (brief V5-tests "Interface").
import {
  setGoogleClientForTests,
  type GoogleClient,
  type GoogleProfile,
} from '../../src/modules/auth/google';

/**
 * Fake of the injectable googleClient: the real one builds the authorization URL (arctic, PKCE) and
 * exchanges the code for the user's profile. The fake returns whatever profile the test sets.
 */
function fakeGoogle(profile: () => GoogleProfile): GoogleClient & { lastVerifier?: string } {
  const fake: GoogleClient & { lastVerifier?: string } = {
    authorizationUrl: ({ state, codeVerifier }) => {
      fake.lastVerifier = codeVerifier;
      const u = new URL('https://accounts.google.test/o/oauth2/v2/auth');
      u.searchParams.set('state', state);
      return u;
    },
    fetchProfile: async ({ code }) => {
      if (code === 'bad-code') throw new Error('invalid_grant');
      return profile();
    },
  };
  return fake;
}

describe('auth: Google OAuth (A6)', () => {
  let ctx: TestCtx;
  let profile: GoogleProfile;
  let fake: ReturnType<typeof fakeGoogle>;

  beforeAll(() => {
    ctx = buildTestApp();
  });
  afterAll(() => ctx.close());
  beforeEach(async () => {
    await resetAll(ctx);
    profile = { sub: 'g-sub-1', email: uniqEmail('g'), emailVerified: true, name: 'Hasan Mahmud' };
    fake = fakeGoogle(() => profile);
    setGoogleClientForTests(fake);
  });
  afterEach(() => setGoogleClientForTests(null));

  const failed = `/login?error=google_failed`;

  /** start → fake Google → callback; returns the callback response. */
  async function viaGoogle(agent: TestAgent, o: { invite?: string; code?: string; state?: string } = {}) {
    const start = await agent.get('/api/auth/google/start').query(o.invite ? { invite: o.invite } : {});
    expect(start.status).toBe(302);
    const state = new URL(start.headers['location'] as string).searchParams.get('state')!;
    expect(state.length).toBeGreaterThan(10);
    return agent
      .get('/api/auth/google/callback')
      .query({ code: o.code ?? 'ok-code', state: o.state ?? state });
  }

  it('start redirects to Google with state + PKCE and remembers them in a short-lived HttpOnly cookie', async () => {
    const res = await newAgent(ctx).get('/api/auth/google/start');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^https:\/\/accounts\.google\.test\//);
    expect(fake.lastVerifier).toBeTruthy();
    const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(
      cookies.some((c) => /HttpOnly/i.test(c) && !c.startsWith('bm_at=') && !c.startsWith('bm_rt=')),
    ).toBe(true);
    expect(JSON.stringify(cookies)).not.toContain(fake.lastVerifier!); // verifier must not sit in the clear
  });

  it('a new email creates a verified landlord account + org named "<profile name>\'s properties", and signs in', async () => {
    const agent = newAgent(ctx);
    const res = await viaGoogle(agent);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(new RegExp(`^${ctx.env.APP_URL}`));
    expect(res.headers['location']).not.toContain('error=');
    expect(cookie(agent, 'bm_rt')).toBeTruthy();

    const user = (
      await q<{
        id: string;
        email_verified_at: Date | null;
        password_hash: string | null;
        full_name: string;
      }>(`select id, email_verified_at, password_hash, full_name from users where email = $1`, [
        profile.email,
      ])
    )[0]!;
    expect(user.email_verified_at).not.toBeNull();
    expect(user.password_hash).toBeNull();
    expect(user.full_name).toBe('Hasan Mahmud');
    const orgs = await q<{ name: string; role: string }>(
      `select o.name, m.role from memberships m join organizations o on o.id = m.org_id where m.user_id = $1`,
      [user.id],
    );
    expect(orgs).toEqual([{ name: "Hasan Mahmud's properties", role: 'landlord' }]);
    const link = await q(
      `select 1 from oauth_accounts where user_id=$1 and provider='google' and provider_user_id=$2`,
      [user.id, 'g-sub-1'],
    );
    expect(link).toHaveLength(1);
  });

  it('Google brand new signup is atomic: if org creation fails, no user or oauth account is committed (Issue #17)', async () => {
    await q(`alter table organizations add constraint test_fail_org check (name not like 'TriggerFail%')`);
    try {
      profile = { ...profile, name: 'TriggerFail' };
      const agent = newAgent(ctx);
      const res = await viaGoogle(agent);
      expect(res.status).toBe(302);
      expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);

      // Assert that user and oauthAccount rolled back completely
      const users = await q(`select 1 from users where email = $1`, [profile.email]);
      expect(users).toHaveLength(0);
      const oauths = await q(`select 1 from oauth_accounts where provider_user_id = $1`, [profile.sub]);
      expect(oauths).toHaveLength(0);
    } finally {
      await q(`alter table organizations drop constraint if exists test_fail_org`);
    }
  });

  it('a verified Google email that matches an existing account links to it (no new user)', async () => {
    const existing = await insertUser({ email: profile.email });
    const agent = newAgent(ctx);
    const res = await viaGoogle(agent);
    expect(res.headers['location']).not.toContain('error=');
    expect(await q(`select 1 from users where email=$1`, [profile.email])).toHaveLength(1);
    expect(await q(`select 1 from oauth_accounts where user_id=$1`, [existing.id])).toHaveLength(1);
    expect(cookie(agent, 'bm_at')).toBeTruthy();
    const me = await agent.get('/api/me');
    expect(me.body.data.user.id).toBe(existing.id);
  });

  it('linking an UNVERIFIED local account revokes old sessions, clears password, and marks email verified', async () => {
    const rawPassword = 'AttackerPassword123!';
    const unverifiedUser = await insertUser({
      email: profile.email,
      password: rawPassword,
      verified: false,
    });

    // Attacker signs in and gets an active session
    const attackerAgent = newAgent(ctx);
    const loginRes = await attackerAgent.post('/api/auth/login').send({
      email: profile.email,
      password: rawPassword,
    });
    expect(loginRes.status).toBe(200);
    expect(cookie(attackerAgent, 'bm_at')).toBeTruthy();
    syncCsrf(attackerAgent);

    // Legitimate owner signs in via Google OAuth
    const victimAgent = newAgent(ctx);
    const googleRes = await viaGoogle(victimAgent);
    expect(googleRes.headers['location']).not.toContain('error=');
    expect(cookie(victimAgent, 'bm_at')).toBeTruthy();

    // 1. Account now has email_verified_at set, password_hash null, and oauth link
    const updatedUser = (
      await q<{ email_verified_at: Date | null; password_hash: string | null }>(
        `select email_verified_at, password_hash from users where id = $1`,
        [unverifiedUser.id],
      )
    )[0]!;
    expect(updatedUser.email_verified_at).not.toBeNull();
    expect(updatedUser.password_hash).toBeNull();

    // 2. Attacker's old session is revoked in DB with reason 'google_claimed_unverified'
    const oldSessions = await q<{ revoked_at: Date | null; revoke_reason: string | null }>(
      `select revoked_at, revoke_reason from sessions where user_id = $1 and revoke_reason = 'google_claimed_unverified'`,
      [unverifiedUser.id],
    );
    expect(oldSessions.length).toBeGreaterThan(0);
    expect(oldSessions[0]!.revoked_at).not.toBeNull();

    // Attacker tries to use existing session (refresh fails with 401)
    const refreshRes = await attackerAgent.post('/api/auth/refresh');
    expect(refreshRes.status).toBe(401);

    // 3. Attacker tries to log in again with old password -> fails with INVALID_CREDENTIALS
    const attackerRelogin = await newAgent(ctx).post('/api/auth/login').send({
      email: profile.email,
      password: rawPassword,
    });
    expect(attackerRelogin.status).toBe(401);
    expect(attackerRelogin.body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('later sign-ins are matched by the Google subject id, not the email', async () => {
    await viaGoogle(newAgent(ctx));
    const userId = (await q<{ id: string }>(`select id from users where email=$1`, [profile.email]))[0]!.id;
    profile = { ...profile, email: uniqEmail('changed') };
    const agent = newAgent(ctx);
    const res = await viaGoogle(agent);
    expect(res.headers['location']).not.toContain('error=');
    expect((await agent.get('/api/me')).body.data.user.id).toBe(userId);
    expect(await q(`select 1 from users`)).toHaveLength(1);
  });

  it('an UNVERIFIED Google email matching an account is never linked: redirect to /login?error=google_failed', async () => {
    const existing = await insertUser({ email: profile.email });
    profile = { ...profile, emailVerified: false };
    const agent = newAgent(ctx);
    const res = await viaGoogle(agent);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);
    expect(await q(`select 1 from oauth_accounts where user_id=$1`, [existing.id])).toHaveLength(0);
    expect(cookie(agent, 'bm_rt')).toBeUndefined();
  });

  it('an unverified Google email never creates an account either', async () => {
    profile = { ...profile, emailVerified: false };
    const res = await viaGoogle(newAgent(ctx));
    expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);
    expect(await q(`select 1 from users where email=$1`, [profile.email])).toHaveLength(0);
  });

  it('a wrong state, a missing state cookie, or a failed code exchange all end at /login?error=google_failed', async () => {
    const wrongState = await viaGoogle(newAgent(ctx), { state: 'forged-state-value' });
    expect(wrongState.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);

    const noStart = await newAgent(ctx)
      .get('/api/auth/google/callback')
      .query({ code: 'ok-code', state: 'whatever' });
    expect(noStart.status).toBe(302);
    expect(noStart.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);

    const badCode = await viaGoogle(newAgent(ctx), { code: 'bad-code' });
    expect(badCode.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);
    expect(await q(`select 1 from users`)).toHaveLength(0);
  });

  describe('with an invite in the state', () => {
    let org: Org;
    beforeEach(async () => {
      org = await makeOrg({ name: 'Lake View' });
    });

    it('accepts the invite: tenant membership in the inviting org, no new organisation', async () => {
      const { token, id } = await insertInvitation({
        orgId: org.id,
        invitedBy: org.landlordUserId,
        email: profile.email,
      });
      const agent = newAgent(ctx);
      const res = await viaGoogle(agent, { invite: token });
      expect(res.headers['location']).not.toContain('error=');

      const user = (await q<{ id: string }>(`select id from users where email=$1`, [profile.email]))[0]!;
      expect(
        await q(
          `select 1 from memberships where org_id=$1 and user_id=$2 and role='tenant' and status='active'`,
          [org.id, user.id],
        ),
      ).toHaveLength(1);
      expect(
        (await q<{ accepted_at: Date | null }>(`select accepted_at from invitations where id=$1`, [id]))[0]!
          .accepted_at,
      ).not.toBeNull();
      expect(await q(`select 1 from organizations`)).toHaveLength(1); // only Lake View, nothing named "...'s properties"
    });

    it('accepts caretaker invite: creates membership AND assigns caretaker buildings', async () => {
      const bRows = await q<{ id: string }>(
        `insert into buildings (id, org_id, name, address, area, city, created_at, updated_at)
         values (gen_random_uuid(), $1, 'Tower A', 'Road 11', 'Banani', 'Dhaka', now(), now())
         returning id`,
        [org.id],
      );
      const buildingId = bRows[0]!.id;

      const { token } = await insertInvitation({
        orgId: org.id,
        invitedBy: org.landlordUserId,
        email: profile.email,
        role: 'caretaker',
        buildingIds: [buildingId],
      });

      const agent = newAgent(ctx);
      const res = await viaGoogle(agent, { invite: token });
      expect(res.headers['location']).not.toContain('error=');

      const user = (await q<{ id: string }>(`select id from users where email=$1`, [profile.email]))[0]!;
      const memberships = await q<{ id: string }>(
        `select id from memberships where org_id=$1 and user_id=$2 and role='caretaker' and status='active'`,
        [org.id, user.id],
      );
      expect(memberships).toHaveLength(1);

      const cbRows = await q<{ building_id: string }>(
        `select building_id from caretaker_buildings where org_id=$1 and membership_id=$2`,
        [org.id, memberships[0]!.id],
      );
      expect(cbRows).toHaveLength(1);
      expect(cbRows[0]!.building_id).toBe(buildingId);
    });

    it('refuses when the Google email differs from the invited email', async () => {
      const { token, id } = await insertInvitation({
        orgId: org.id,
        invitedBy: org.landlordUserId,
        email: uniqEmail('someone-else'),
      });
      const res = await viaGoogle(newAgent(ctx), { invite: token });
      expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);
      expect(
        (await q<{ accepted_at: Date | null }>(`select accepted_at from invitations where id=$1`, [id]))[0]!
          .accepted_at,
      ).toBeNull();
      expect(await q(`select 1 from users where email=$1`, [profile.email])).toHaveLength(0);
    });

    it('refuses an invalid or already used invite token', async () => {
      const used = await insertInvitation({
        orgId: org.id,
        invitedBy: org.landlordUserId,
        email: profile.email,
        acceptedAt: new Date(),
      });
      for (const invite of [used.token, 'n'.repeat(43)]) {
        const res = await viaGoogle(newAgent(ctx), { invite });
        expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);
      }
    });

    it('rolls back user and oauth creation if invitation was accepted concurrently during callback', async () => {
      const { token } = await insertInvitation({
        orgId: org.id,
        invitedBy: org.landlordUserId,
        email: profile.email,
      });

      // Simulate a concurrent accept by setting accepted_at via trigger when user row is inserted
      await q(`
        create or replace function accept_inv_race() returns trigger as $$
        begin
          update invitations set accepted_at = now();
          return new;
        end;
        $$ language plpgsql;
      `);
      await q(`
        create trigger trg_test_concurrent_accept
        after insert on users
        for each row execute function accept_inv_race();
      `);

      try {
        const res = await viaGoogle(newAgent(ctx), { invite: token });
        expect(res.headers['location']).toBe(`${ctx.env.APP_URL}${failed}`);

        // Entire transaction must have rolled back: no user, no oauth account, no membership
        expect(await q(`select 1 from users where email=$1`, [profile.email])).toHaveLength(0);
        expect(await q(`select 1 from oauth_accounts where provider_user_id=$1`, [profile.sub])).toHaveLength(
          0,
        );
        expect(await q(`select 1 from memberships where org_id=$1 and role='tenant'`, [org.id])).toHaveLength(
          0,
        );
      } finally {
        await q(`drop trigger if exists trg_test_concurrent_accept on users;`);
        await q(`drop function if exists accept_inv_race();`);
      }
    });
  });
});
