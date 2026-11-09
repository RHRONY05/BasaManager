import type { Response } from 'express';
import type { Env } from '../config/env';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken?: string;
}

export const COOKIE_ACCESS_NAME = 'bm_at';
export const COOKIE_REFRESH_NAME = 'bm_rt';
export const COOKIE_CSRF_NAME = 'bm_csrf';

/**
 * Sets the three authentication cookies (bm_at, bm_rt, bm_csrf) according to 02-ARCHITECTURE.md.
 */
export function setAuthCookies(res: Response, env: Env, tokens: AuthTokens): void {
  // Access token: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900 (15 min)
  res.cookie(COOKIE_ACCESS_NAME, tokens.accessToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 900 * 1000,
  });

  // Refresh token: HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000 (30 days)
  res.cookie(COOKIE_REFRESH_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 30 * 24 * 3600 * 1000,
  });

  // CSRF token: Non-HttpOnly; Secure; SameSite=Lax; Path=/ (readable by SPA for double-submit)
  if (tokens.csrfToken) {
    res.cookie(COOKIE_CSRF_NAME, tokens.csrfToken, {
      httpOnly: false,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }
}

/**
 * Clears the authentication cookies.
 */
export function clearAuthCookies(res: Response, env?: Env): void {
  const secure = env ? env.COOKIE_SECURE : false;

  res.clearCookie(COOKIE_ACCESS_NAME, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });

  res.clearCookie(COOKIE_REFRESH_NAME, {
    path: '/api/auth',
    httpOnly: true,
    secure,
    sameSite: 'strict',
  });

  res.clearCookie(COOKIE_CSRF_NAME, {
    path: '/',
    httpOnly: false,
    secure,
    sameSite: 'lax',
  });
}
