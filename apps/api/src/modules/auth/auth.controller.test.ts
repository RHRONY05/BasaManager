import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('auth.controller unit tests', () => {
  it('delegates to AuthService methods and handles responses', async () => {
    const mockAuthService = {
      signup: vi.fn().mockResolvedValue({ message: 'ok' }),
      verifyEmail: vi.fn().mockResolvedValue({ verified: true }),
      login: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
      logout: vi.fn().mockResolvedValue({ loggedOut: true }),
      logoutAll: vi.fn().mockResolvedValue({ loggedOutAll: true }),
      refresh: vi.fn().mockResolvedValue({ refreshed: true }),
      forgotPassword: vi.fn().mockResolvedValue({ message: 'ok' }),
      resetPassword: vi.fn().mockResolvedValue({ user: { id: 'u1' } }),
    } as unknown as AuthService;

    const controller = new AuthController(mockAuthService);

    const req = { body: {}, user: { sessionId: 's1', id: 'u1' } } as unknown as Request;
    const res = {
      locals: {},
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    await controller.signup(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { message: 'ok' } }));

    await controller.logout(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { loggedOut: true } }));
  });
});
