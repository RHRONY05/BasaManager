import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { InvitesService } from './invites.service';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import { ApiError } from '../../lib/ApiError';
import { hashPassword } from '../../lib/passwords';

const env = {
  JWT_SECRET: 'test-secret-at-least-32-chars-long-123456',
  COOKIE_SECURE: false,
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TTL_DAYS: 30,
} as unknown as Env;

const row = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  org_id: 'org-1',
  email: 'New@Test.Local',
  role: 'caretaker',
  building_ids: ['b1', 'b2'],
  lease_id: null,
  invited_by: 'u-l',
  accepted_at: null,
  revoked_at: null,
  expires_at: new Date(Date.now() + 86_400_000),
  ...over,
});

interface Spies {
  updateMany: ReturnType<typeof vi.fn>;
  membershipCreate: ReturnType<typeof vi.fn>;
  cbCreate: ReturnType<typeof vi.fn>;
  userCreate: ReturnType<typeof vi.fn>;
  userDelete: ReturnType<typeof vi.fn>;
  sessionCreate: ReturnType<typeof vi.fn>;
}

function mkDb(
  invRow: unknown,
  opts: {
    count?: number;
    userCreateErr?: unknown;
    existingUser?: unknown;
    existingMembership?: unknown;
  } = {},
) {
  const s: Spies = {
    updateMany: vi.fn().mockResolvedValue({ count: opts.count ?? 1 }),
    membershipCreate: vi.fn().mockResolvedValue({ id: 'm1' }),
    cbCreate: vi.fn().mockResolvedValue({}),
    userCreate: opts.userCreateErr
      ? vi.fn().mockRejectedValue(opts.userCreateErr)
      : vi.fn().mockResolvedValue({}),
    userDelete: vi.fn().mockResolvedValue({}),
    sessionCreate: vi.fn().mockResolvedValue({ id: 'sess1' }),
  };
  const tx = {
    invitation: { updateMany: s.updateMany },
    membership: {
      create: s.membershipCreate,
      findFirst: vi.fn().mockResolvedValue(opts.existingMembership ?? null),
      update: vi.fn().mockResolvedValue({ id: 'm-1' }),
    },
    caretakerBuilding: {
      create: s.cbCreate,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    organization: { findUnique: vi.fn().mockResolvedValue({ name: 'Acme' }) },
    leaseTenant: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'lt-1' }),
    },
    lease: {
      update: vi.fn().mockResolvedValue({ id: 'l-1' }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'l-1', status: 'pending', start_date: new Date() }]),
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue(invRow ? [invRow] : []),
    $tx: vi.fn().mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)),
    user: {
      create: s.userCreate,
      delete: s.userDelete,
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockImplementation(async (args: { where?: { id?: string; email?: string } }) => {
        if (args?.where?.id) return { fullName: 'Lan Lord' };
        if (args?.where?.email && opts.existingUser !== undefined) return opts.existingUser;
        return null;
      }),
    },
    session: { create: s.sessionCreate },
  } as unknown as Db;
  return { db, s, tx };
}

const req = { headers: { 'user-agent': 'UA' }, ip: '1.2.3.4' } as unknown as Request;
const mkRes = () => ({ cookie: vi.fn() }) as unknown as Response;
const goodBody = { fullName: ' Neo ', password: 'Str0ng-Passw0rd-xyz!' } as never;

describe('InvitesService.preview', () => {
  it('returns masked details for a valid invitation', async () => {
    const { db } = mkDb(row());
    const out = await new InvitesService(db, env).preview('tok');
    expect(out).toEqual({
      orgName: 'Acme',
      role: 'caretaker',
      inviterName: 'Lan Lord',
      email: 'N***@Test.Local',
      emailMatchesCurrentUser: false,
      userExists: false,
    });
  });

  it('falls back to empty strings when org and inviter are missing', async () => {
    const { db } = mkDb(row({ email: 'weird' }));
    (db.user.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (db.$tx as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_c: unknown, fn: (t: unknown) => unknown) =>
        fn({ organization: { findUnique: vi.fn().mockResolvedValue(null) } }),
    );
    const out = await new InvitesService(db, env).preview('tok');
    expect(out.orgName).toBe('');
    expect(out.inviterName).toBe('');
    expect(out.email).toBe('w***@');
    expect(out.emailMatchesCurrentUser).toBe(false);
    expect(out.userExists).toBe(false);
  });

  for (const [name, over] of [
    ['accepted', { accepted_at: new Date() }],
    ['revoked', { revoked_at: new Date() }],
    ['expired', { expires_at: new Date(Date.now() - 1000) }],
  ] as const) {
    it(`rejects ${name} invitations`, async () => {
      const { db } = mkDb(row(over));
      await expect(new InvitesService(db, env).preview('tok')).rejects.toThrow(ApiError);
    });
  }
});

describe('InvitesService.accept (signed-in)', () => {
  it('creates membership and caretaker building links', async () => {
    const { db, s } = mkDb(row());
    const user = { id: 'u1', email: ' new@test.local ' } as never;
    const r = await new InvitesService(db, env).accept('t', {} as never, user, req, mkRes());
    expect(r).toEqual({ accepted: true });
    expect(s.cbCreate).toHaveBeenCalledTimes(2);
  });

  it('throws when the conditional update affects no row (race)', async () => {
    const { db } = mkDb(row(), { count: 0 });
    const user = { id: 'u1', email: 'new@test.local' } as never;
    await expect(new InvitesService(db, env).accept('t', {} as never, user, req, mkRes())).rejects.toThrow(
      /already accepted/,
    );
  });

  it('rejects an unknown token', async () => {
    const { db } = mkDb(null);
    await expect(
      new InvitesService(db, env).accept('t', {} as never, undefined, req, mkRes()),
    ).rejects.toThrow(ApiError);
  });
});

describe('InvitesService.accept (new user)', () => {
  it('requires a full name', async () => {
    const { db } = mkDb(row());
    await expect(
      new InvitesService(db, env).accept('t', { password: 'x' } as never, undefined, req, mkRes()),
    ).rejects.toThrow(ApiError);
    await expect(
      new InvitesService(db, env).accept(
        't',
        { fullName: '   ', password: 'x' } as never,
        undefined,
        req,
        mkRes(),
      ),
    ).rejects.toThrow(ApiError);
  });

  it('requires a password', async () => {
    const { db } = mkDb(row());
    await expect(
      new InvitesService(db, env).accept('t', { fullName: 'A' } as never, undefined, req, mkRes()),
    ).rejects.toThrow(ApiError);
  });

  it('rejects a weak password', async () => {
    const { db, s } = mkDb(row());
    await expect(
      new InvitesService(db, env).accept(
        't',
        { fullName: 'A', password: 'short' } as never,
        undefined,
        req,
        mkRes(),
      ),
    ).rejects.toThrow(ApiError);
    expect(s.userCreate).not.toHaveBeenCalled();
  });

  it('registers, links buildings, creates a session and sets cookies', async () => {
    const { db, s } = mkDb(row());
    const res = mkRes();
    const r = await new InvitesService(db, env).accept('t', goodBody, undefined, req, res);
    expect(r).toEqual({ accepted: true });
    expect(s.userCreate).toHaveBeenCalledOnce();
    expect(s.userCreate.mock.calls[0]![0].data.email).toBe('new@test.local');
    expect(s.cbCreate).toHaveBeenCalledTimes(2);
    expect(s.sessionCreate).toHaveBeenCalledOnce();
    expect(res.cookie).toHaveBeenCalled();
  });

  it('skips building links for non-caretakers', async () => {
    const { db, s } = mkDb(row({ role: 'tenant' }));
    await new InvitesService(db, env).accept('t', goodBody, undefined, req, mkRes());
    expect(s.cbCreate).not.toHaveBeenCalled();
  });

  it('maps unique-violation on user create to TOKEN_INVALID', async () => {
    const { db } = mkDb(row(), { userCreateErr: { code: 'P2002' } });
    await expect(new InvitesService(db, env).accept('t', goodBody, undefined, req, mkRes())).rejects.toThrow(
      /already accepted/,
    );
  });

  it('rethrows other user create errors', async () => {
    const err = new Error('db down');
    const { db } = mkDb(row(), { userCreateErr: err });
    await expect(new InvitesService(db, env).accept('t', goodBody, undefined, req, mkRes())).rejects.toBe(
      err,
    );
  });

  it('deletes the freshly created user when the invitation race is lost', async () => {
    const { db, s } = mkDb(row(), { count: 0 });
    await expect(new InvitesService(db, env).accept('t', goodBody, undefined, req, mkRes())).rejects.toThrow(
      /already accepted/,
    );
    expect(s.userDelete).toHaveBeenCalledOnce();
  });
});

describe('InvitesService.accept (existing user account)', () => {
  const existingUserRecord = {
    id: 'u-exist',
    email: 'new@test.local',
    fullName: 'Existing Person',
    // hash of 'Str0ng-Passw0rd-xyz!'
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$qUfS7Fk7eG0qW480p2sYw8bXvB4u6u9uPqW480p2sYw',
    failedLoginCount: 0,
    lockedUntil: null,
    deletedAt: null,
    isPlatformAdmin: false,
  };

  it('rejects an existing user whose account is locked', async () => {
    const lockedUser = {
      ...existingUserRecord,
      lockedUntil: new Date(Date.now() + 600000),
    };
    const { db } = mkDb(row(), { existingUser: lockedUser });
    await expect(new InvitesService(db, env).accept('t', goodBody, undefined, req, mkRes())).rejects.toThrow(
      /Account locked/,
    );
  });

  it('rejects an existing user if the password is wrong', async () => {
    const { db } = mkDb(row(), { existingUser: existingUserRecord });
    (db.$queryRaw as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...row(), failed_login_count: 1, locked_until: null },
    ]);

    await expect(
      new InvitesService(db, env).accept(
        't',
        { password: 'WrongPassword123!' } as never,
        undefined,
        req,
        mkRes(),
      ),
    ).rejects.toThrow(/Invalid email or password/);
  });

  it('accepts invite with existing account password without creating a new user', async () => {
    const validHash = await hashPassword('Str0ng-Passw0rd-xyz!');
    const validExistingUser = {
      ...existingUserRecord,
      passwordHash: validHash,
    };
    const { db, s } = mkDb(row(), { existingUser: validExistingUser });
    const res = mkRes();
    const r = await new InvitesService(db, env).accept('t', goodBody, undefined, req, res);
    expect(r).toEqual({ accepted: true });
    expect(s.userCreate).not.toHaveBeenCalled();
    expect(s.sessionCreate).toHaveBeenCalledOnce();
  });

  it('rejects caretaker invite if user is already an active tenant', async () => {
    const { db } = mkDb(row({ role: 'caretaker' }), {
      existingUser: { ...existingUserRecord, passwordHash: null }, // won't reach here if role conflict checked
      existingMembership: { id: 'm-ten', role: 'tenant', status: 'active' },
    });

    // When signed-in:
    const signedInUser = { id: 'u-exist', email: 'new@test.local' } as never;
    await expect(
      new InvitesService(db, env).accept('t', {} as never, signedInUser, req, mkRes()),
    ).rejects.toThrow(/already an active tenant/);
  });

  it('rejects tenant invite if user is already an active staff member', async () => {
    const { db } = mkDb(row({ role: 'tenant' }), {
      existingUser: { ...existingUserRecord, passwordHash: null },
      existingMembership: { id: 'm-staff', role: 'caretaker', status: 'active' },
    });

    const signedInUser = { id: 'u-exist', email: 'new@test.local' } as never;
    await expect(
      new InvitesService(db, env).accept('t', {} as never, signedInUser, req, mkRes()),
    ).rejects.toThrow(/already a staff member/);
  });

  it('rejects invitation acceptance if lease is already ended', async () => {
    const { db, tx } = mkDb(row({ role: 'tenant', lease_id: 'l-1' }));
    tx.$queryRaw = vi.fn().mockResolvedValue([{ id: 'l-1', status: 'ended', start_date: new Date() }]);

    const signedInUser = { id: 'u-exist', email: 'new@test.local' } as never;
    await expect(
      new InvitesService(db, env).accept('t', {} as never, signedInUser, req, mkRes()),
    ).rejects.toThrow(/Cannot accept invitation on an ended or missing lease/);
  });
});
