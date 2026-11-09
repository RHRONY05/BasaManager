import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { encryptOAuthState, setGoogleClientForTests, type GoogleClient, type GoogleProfile } from './google';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';

const SECRET = 'super-secret-key-32-chars-long-123456';
const APP = 'http://localhost:5173';
const FAIL = `${APP}/login?error=google_failed`;

const env = {
  APP_URL: APP,
  JWT_SECRET: SECRET,
  COOKIE_SECURE: false,
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TTL_DAYS: 30,
} as unknown as Env;

const profile: GoogleProfile = { sub: 'g1', email: 'Guy@Test.Local', emailVerified: true, name: 'Guy' };

function mkRes() {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

function mkReq(over: { cookie?: string; state?: string; code?: string } = {}) {
  return {
    cookies: over.cookie === undefined ? {} : { bm_g_oauth: over.cookie },
    query: { state: over.state, code: over.code },
    headers: { 'user-agent': 'ua' },
    ip: '1.1.1.1',
  } as unknown as Request;
}

const cookieFor = (invite?: string) => encryptOAuthState({ state: 'st', codeVerifier: 'cv', invite }, SECRET);

interface Mocks {
  invitation: { updateMany: ReturnType<typeof vi.fn> };
  membership: { create: ReturnType<typeof vi.fn> };
  organization: { create: ReturnType<typeof vi.fn> };
  user: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  oauthAccount: { create: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
  caretakerBuilding: { create: ReturnType<typeof vi.fn> };
}

function mkDb() {
  const tx = {
    invitation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    membership: { create: vi.fn().mockResolvedValue({}) },
    organization: { create: vi.fn().mockResolvedValue({}) },
    user: {
      create: vi.fn().mockResolvedValue({ id: 'u-new', isPlatformAdmin: false }),
      update: vi.fn().mockResolvedValue({ id: 'u-new', isPlatformAdmin: false }),
    },
    oauthAccount: {
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    caretakerBuilding: {
      create: vi.fn().mockResolvedValue({}),
    },
    session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    authToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $tx: vi.fn().mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)),
    $transaction: vi.fn().mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx)),
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'u-new', isPlatformAdmin: false }),
      update: vi.fn().mockResolvedValue({}),
    },
    oauthAccount: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    session: { create: vi.fn().mockResolvedValue({ id: 's1' }) },
  };
  return { db, tx: tx as Mocks };
}

const invRow = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  org_id: 'o1',
  email: 'guy@test.local',
  role: 'tenant',
  building_ids: [],
  lease_id: null,
  invited_by: 'l1',
  accepted_at: null,
  revoked_at: null,
  expires_at: new Date(Date.now() + 86_400_000),
  ...over,
});

describe('AuthService Google flows', () => {
  let fetchProfile: ReturnType<typeof vi.fn>;
  let m: ReturnType<typeof mkDb>;
  let svc: AuthService;

  beforeEach(() => {
    fetchProfile = vi.fn().mockResolvedValue(profile);
    const client: GoogleClient = {
      authorizationUrl: () => new URL('https://accounts.google.test/auth'),
      fetchProfile: fetchProfile as GoogleClient['fetchProfile'],
    };
    setGoogleClientForTests(client);
    m = mkDb();
    svc = new AuthService(m.db as unknown as Db, env);
  });
  afterEach(() => setGoogleClientForTests(null));

  it('googleStart sets an encrypted state cookie and returns the URL', () => {
    const res = mkRes();
    const url = svc.googleStart('inv', res as unknown as Response);
    expect(url).toBe('https://accounts.google.test/auth');
    expect(res.cookie).toHaveBeenCalledWith(
      'bm_g_oauth',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('fails without a state cookie', async () => {
    expect(await svc.googleCallback(mkReq(), mkRes() as unknown as Response)).toBe(FAIL);
  });

  it('fails on a tampered cookie or state mismatch', async () => {
    expect(
      await svc.googleCallback(mkReq({ cookie: 'a.b.c', state: 'st' }), mkRes() as unknown as Response),
    ).toBe(FAIL);
    expect(
      await svc.googleCallback(
        mkReq({ cookie: cookieFor(), state: 'other', code: 'c' }),
        mkRes() as unknown as Response,
      ),
    ).toBe(FAIL);
  });

  it('fails without a code', async () => {
    expect(
      await svc.googleCallback(mkReq({ cookie: cookieFor(), state: 'st' }), mkRes() as unknown as Response),
    ).toBe(FAIL);
  });

  it('fails when the profile fetch throws or email is unverified', async () => {
    const req = mkReq({ cookie: cookieFor(), state: 'st', code: 'c' });
    fetchProfile.mockRejectedValueOnce(new Error('net'));
    expect(await svc.googleCallback(req, mkRes() as unknown as Response)).toBe(FAIL);
    fetchProfile.mockResolvedValueOnce({ ...profile, emailVerified: false });
    expect(await svc.googleCallback(req, mkRes() as unknown as Response)).toBe(FAIL);
  });

  it('signs in via an existing linked OAuth account', async () => {
    m.db.oauthAccount.findUnique.mockResolvedValue({ user: { id: 'u1', isPlatformAdmin: false } });
    const res = mkRes();
    const out = await svc.googleCallback(
      mkReq({ cookie: cookieFor(), state: 'st', code: 'c' }),
      res as unknown as Response,
    );
    expect(out).toBe(APP);
    expect(m.db.session.create).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalled();
    expect(m.db.user.create).not.toHaveBeenCalled();
  });

  it('links Google to an existing user with the same email', async () => {
    m.db.user.findFirst.mockResolvedValue({ id: 'u2', isPlatformAdmin: false, emailVerifiedAt: new Date() });
    const out = await svc.googleCallback(
      mkReq({ cookie: cookieFor(), state: 'st', code: 'c' }),
      mkRes() as unknown as Response,
    );
    expect(out).toBe(APP);
    expect(m.db.oauthAccount.create).toHaveBeenCalled();
    expect(m.db.user.create).not.toHaveBeenCalled();
  });

  it('creates a new landlord user and organisation for an unknown email', async () => {
    const out = await svc.googleCallback(
      mkReq({ cookie: cookieFor(), state: 'st', code: 'c' }),
      mkRes() as unknown as Response,
    );
    expect(out).toBe(APP);
    expect(m.db.$tx).toHaveBeenCalled();
    expect(m.tx.user.create).toHaveBeenCalled();
    expect(m.tx.organization.create).toHaveBeenCalled();
    expect(m.tx.membership.create).toHaveBeenCalled();
  });

  describe('with an invite', () => {
    const run = () =>
      svc.googleCallback(
        mkReq({ cookie: cookieFor('invtok'), state: 'st', code: 'c' }),
        mkRes() as unknown as Response,
      );

    it('fails for unknown, used, revoked or expired invitations', async () => {
      expect(await run()).toBe(FAIL);
      for (const over of [
        { accepted_at: new Date() },
        { revoked_at: new Date() },
        { expires_at: new Date(Date.now() - 1000) },
      ]) {
        m.db.$queryRaw.mockResolvedValue([invRow(over)]);
        expect(await run()).toBe(FAIL);
      }
    });

    it('fails when the Google email differs from the invited email', async () => {
      m.db.$queryRaw.mockResolvedValue([invRow({ email: 'someone@else.local' })]);
      expect(await run()).toBe(FAIL);
    });

    it('fails if the invitation was accepted concurrently', async () => {
      m.db.$queryRaw.mockResolvedValue([invRow()]);
      m.tx.invitation.updateMany.mockResolvedValue({ count: 0 });
      expect(await run()).toBe(FAIL);
    });

    it('creates the user, links OAuth, accepts the invite and signs in', async () => {
      m.db.$queryRaw.mockResolvedValue([invRow()]);
      expect(await run()).toBe(APP);
      expect(m.tx.user.create).toHaveBeenCalled();
      expect(m.tx.oauthAccount.upsert).toHaveBeenCalled();
      expect(m.tx.membership.create).toHaveBeenCalled();
      expect(m.db.session.create).toHaveBeenCalled();
    });

    it('reuses an existing user', async () => {
      m.db.$queryRaw.mockResolvedValue([invRow()]);
      m.db.user.findFirst.mockResolvedValue({
        id: 'u9',
        isPlatformAdmin: false,
        emailVerifiedAt: new Date(),
      });
      expect(await run()).toBe(APP);
      expect(m.tx.user.create).not.toHaveBeenCalled();
    });
  });
});
