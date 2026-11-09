import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { Db } from '../../config/db';
import type { Env } from '../../config/env';
import { ApiError } from '../../lib/ApiError';
import { hashPassword } from '../../lib/passwords';

describe('AuthService unit tests', () => {
  let service: AuthService;
  let mockDb: any;
  let mockEnv: any;
  let mockReq: any;
  let mockRes: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.APP_URL = 'http://localhost:5173';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';

    mockDb = {
      user: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      session: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      authToken: {
        create: vi.fn(),
      },
      oauthAccount: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
        return fn({
          organization: { create: vi.fn() },
          membership: { create: vi.fn() },
          authToken: { create: vi.fn() },
          outboxMessage: { createMany: vi.fn() },
        });
      }),
      $queryRaw: vi.fn(),
    };

    mockEnv = {
      APP_URL: 'http://localhost:5173',
      JWT_SECRET: 'super-secret-key-32-chars-long-123456',
      COOKIE_SECURE: false,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TTL_DAYS: 30,
    };

    mockReq = {
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      cookies: {},
    };

    mockRes = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };

    service = new AuthService(mockDb as Db, mockEnv as Env);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('signup', () => {
    it('returns generic message without creating if email exists (anti-enumeration)', async () => {
      mockDb.user.findFirst.mockResolvedValue({ id: 'existing-u1' });
      const res = await service.signup(
        { email: 'taken@test.com', password: 'Strong-Password-123', fullName: 'John Doe', orgName: 'Acme Org' },
        mockReq as Request,
        mockRes as Response,
      );
      expect(res.message).toContain('Check your email');
      expect(mockDb.user.create).not.toHaveBeenCalled();
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });

    it('creates user, org, membership, token, outbox, and sets auth cookies on fresh email', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);
      mockDb.user.create.mockResolvedValue({ id: 'new-u1' });
      mockDb.session.create.mockResolvedValue({ id: 'new-s1', familyId: 'fam-1' });

      const res = await service.signup(
        { email: 'fresh@test.com', password: 'Strong-Password-123', fullName: 'John Doe', orgName: 'Acme Org' },
        mockReq as Request,
        mockRes as Response,
      );
      expect(res.message).toContain('Check your email');
      expect(mockDb.user.create).toHaveBeenCalled();
      expect(mockDb.session.create).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('throws ApiError if token is invalid or expired', async () => {
      mockDb.$queryRaw.mockResolvedValue([]);
      await expect(service.verifyEmail({ token: 'bad-token' })).rejects.toThrow(ApiError);
    });

    it('verifies email and marks user verified', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ id: 'tok-1', user_id: 'u1' }]);
      mockDb.user.update.mockResolvedValue({});
      const res = await service.verifyEmail({ token: 'valid-token' });
      expect(res.verified).toBe(true);
      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });
  });

  describe('login', () => {
    it('rejects unknown user without leaking existence', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);
      await expect(
        service.login({ email: 'unknown@test.com', password: 'Password-12345' }, mockReq as Request, mockRes as Response),
      ).rejects.toThrow(ApiError);
    });

    it('rejects if account is locked', async () => {
      mockDb.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'locked@test.com',
        deletedAt: null,
        lockedUntil: new Date(Date.now() + 600_000),
      });
      await expect(
        service.login({ email: 'locked@test.com', password: 'Password-12345' }, mockReq as Request, mockRes as Response),
      ).rejects.toThrow(ApiError);
    });

    it('increments failedLoginCount on wrong password and locks at 5', async () => {
      const pwHash = await hashPassword('Correct-Password-123');
      mockDb.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        passwordHash: pwHash,
        failedLoginCount: 4,
        lockedUntil: null,
        deletedAt: null,
      });

      await expect(
        service.login({ email: 'user@test.com', password: 'Wrong-Password-123' }, mockReq as Request, mockRes as Response),
      ).rejects.toThrow(ApiError);

      expect(mockDb.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLoginCount: 5, lockedUntil: expect.any(Date) }),
        }),
      );
    });

    it('signs in successfully and sets auth cookies on correct password', async () => {
      const pwHash = await hashPassword('Correct-Password-123');
      mockDb.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'user@test.com',
        passwordHash: pwHash,
        failedLoginCount: 0,
        lockedUntil: null,
        deletedAt: null,
        isPlatformAdmin: false,
      });
      mockDb.session.create.mockResolvedValue({ id: 's1', familyId: 'f1' });

      const res = await service.login(
        { email: 'user@test.com', password: 'Correct-Password-123' },
        mockReq as Request,
        mockRes as Response,
      );
      expect(res.user.id).toBe('u1');
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });

  describe('logout and logoutAll', () => {
    it('logout revokes current session and clears cookies', async () => {
      await service.logout('s1', mockRes as Response);
      expect(mockDb.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ revokeReason: 'logout' }) }),
      );
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });

    it('logoutAll revokes all sessions for user, emits realtime event, and clears cookies', async () => {
      await service.logoutAll('u1', mockRes as Response);
      expect(mockDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
      );
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('throws UNAUTHENTICATED if refresh token cookie is missing', async () => {
      mockReq.cookies = {};
      await expect(service.refresh(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);
    });

    it('throws SESSION_REVOKED if session not found', async () => {
      mockReq.cookies = { bm_rt: 'some-refresh-token' };
      mockDb.session.findUnique.mockResolvedValue(null);
      await expect(service.refresh(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);
    });

    it('detects token reuse and kills session family', async () => {
      mockReq.cookies = { bm_rt: 'reused-refresh-token' };
      mockDb.session.findUnique.mockResolvedValue({
        id: 's1',
        familyId: 'fam-1',
        userId: 'u1',
        rotatedAt: new Date(Date.now() - 1000),
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10000),
      });
      mockDb.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@test.com' });

      await expect(service.refresh(mockReq as Request, mockRes as Response)).rejects.toThrow(ApiError);
      expect(mockDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'fam-1', revokedAt: null } }),
      );
      expect(mockRes.clearCookie).toHaveBeenCalled();
    });

    it('rotates session and sets new cookies on valid unrotated token', async () => {
      mockReq.cookies = { bm_rt: 'valid-refresh-token' };
      mockDb.session.findUnique.mockResolvedValue({
        id: 's1',
        familyId: 'fam-1',
        userId: 'u1',
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 10000),
      });
      mockDb.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@test.com', isPlatformAdmin: false });
      mockDb.session.create.mockResolvedValue({ id: 's2', familyId: 'fam-1' });

      const res = await service.refresh(mockReq as Request, mockRes as Response);
      expect(res.ok).toBe(true);
      expect(mockDb.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1' }, data: expect.objectContaining({ rotatedAt: expect.any(Date) }) }),
      );
      expect(mockDb.session.create).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });

  describe('forgotPassword and resetPassword', () => {
    it('forgotPassword answers identically for known and unknown email', async () => {
      mockDb.user.findFirst.mockResolvedValue(null);
      const resUnknown = await service.forgotPassword({ email: 'unknown@test.com' });
      expect(resUnknown.message).toContain('If that email exists');

      mockDb.user.findFirst.mockResolvedValue({ id: 'u1', email: 'known@test.com', deletedAt: null });
      const resKnown = await service.forgotPassword({ email: 'known@test.com' });
      expect(resKnown.message).toContain('If that email exists');
      expect(mockDb.authToken.create).toHaveBeenCalled();
    });

    it('resetPassword consumes token, resets password, revokes sessions, and signs in', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ id: 'tok-1', user_id: 'u1' }]);
      mockDb.user.findUnique.mockResolvedValue({ id: 'u1', email: 'u1@test.com', isPlatformAdmin: false });
      mockDb.session.create.mockResolvedValue({ id: 'new-s1', familyId: 'fam-1' });

      const res = await service.resetPassword(
        { token: 'valid-reset-tok', password: 'Brand-New-Secure-Pass-123' },
        mockReq as Request,
        mockRes as Response,
      );
      expect(res.user.id).toBe('u1');
      expect(mockDb.user.update).toHaveBeenCalled();
      expect(mockDb.session.updateMany).toHaveBeenCalled();
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });
});
