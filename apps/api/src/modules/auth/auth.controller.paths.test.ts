import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

function mkRes() {
  return {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

const methods = [
  'signup',
  'verifyEmail',
  'resendVerification',
  'login',
  'refresh',
  'logout',
  'logoutAll',
  'forgotPassword',
  'resetPassword',
] as const;

const mkReq = () => ({ body: {}, user: { id: 'u1', email: 'a@b.c', sessionId: 's1' } }) as unknown as Request;

describe('AuthController success and error paths', () => {
  for (const m of methods) {
    it(`${m} responds with data on success`, async () => {
      const svc = { [m]: vi.fn().mockResolvedValue({ ok: m }) } as unknown as AuthService;
      const res = mkRes();
      const next = vi.fn();
      await new AuthController(svc)[m](mkReq(), res, next);
      expect(res.json).toHaveBeenCalledWith({ data: { ok: m } });
      expect(next).not.toHaveBeenCalled();
    });

    it(`${m} forwards errors to next`, async () => {
      const err = new Error('boom');
      const svc = { [m]: vi.fn().mockRejectedValue(err) } as unknown as AuthService;
      const next = vi.fn();
      await new AuthController(svc)[m](mkReq(), mkRes(), next);
      expect(next).toHaveBeenCalledWith(err);
    });
  }

  it('googleStart redirects to the service URL', () => {
    const svc = { googleStart: vi.fn().mockReturnValue('https://g/auth') } as unknown as AuthService;
    const res = mkRes();
    new AuthController(svc).googleStart({ query: { invite: 'tok' } } as unknown as Request, res, vi.fn());
    expect(svc.googleStart).toHaveBeenCalledWith('tok', res);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://g/auth');
  });

  it('googleStart forwards thrown errors', () => {
    const err = new Error('x');
    const svc = {
      googleStart: vi.fn().mockImplementation(() => {
        throw err;
      }),
    } as unknown as AuthService;
    const next = vi.fn();
    new AuthController(svc).googleStart({ query: {} } as unknown as Request, mkRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('googleCallback redirects and forwards errors', async () => {
    const svc = {
      googleCallback: vi.fn().mockResolvedValueOnce('/app').mockRejectedValueOnce(new Error('e')),
    } as unknown as AuthService;
    const c = new AuthController(svc);
    const res = mkRes();
    const next = vi.fn();
    await c.googleCallback({} as Request, res, next);
    expect(res.redirect).toHaveBeenCalledWith(302, '/app');
    await c.googleCallback({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
