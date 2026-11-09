import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import { setAuthCookies, clearAuthCookies, COOKIE_ACCESS_NAME, COOKIE_REFRESH_NAME, COOKIE_CSRF_NAME } from './cookies';
import type { Env } from '../config/env';

describe('cookies lib', () => {
  const mockEnv = {
    COOKIE_SECURE: false,
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_DAYS: 30,
  } as unknown as Env;

  it('sets auth cookies with correct attributes', () => {
    const res = {
      cookie: vi.fn(),
    } as unknown as Response;

    setAuthCookies(res, mockEnv, {
      accessToken: 'at-123',
      refreshToken: 'rt-123',
      csrfToken: 'csrf-123',
    });

    expect(res.cookie).toHaveBeenCalledWith(
      COOKIE_ACCESS_NAME,
      'at-123',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      COOKIE_REFRESH_NAME,
      'rt-123',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      COOKIE_CSRF_NAME,
      'csrf-123',
      expect.objectContaining({ httpOnly: false, sameSite: 'lax', path: '/' }),
    );
  });

  it('clears auth cookies with clearAuthCookies', () => {
    const res = {
      clearCookie: vi.fn(),
    } as unknown as Response;

    clearAuthCookies(res, mockEnv);

    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_ACCESS_NAME, expect.objectContaining({ path: '/' }));
    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_REFRESH_NAME, expect.objectContaining({ path: '/api/auth' }));
    expect(res.clearCookie).toHaveBeenCalledWith(COOKIE_CSRF_NAME, expect.objectContaining({ path: '/' }));
  });
});
