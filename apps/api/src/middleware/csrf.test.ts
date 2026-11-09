import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createCsrfMiddleware } from './csrf';
import { ApiError } from '../lib/ApiError';
import type { Env } from '../config/env';

describe('csrf middleware', () => {
  const appUrl = 'http://localhost:5173';
  const mockEnv = { APP_URL: appUrl } as unknown as Env;
  const csrfMiddleware = createCsrfMiddleware(mockEnv);

  it('allows safe methods GET, HEAD, OPTIONS', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const req = { method } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn();
      csrfMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    }
  });

  it('allows exempt paths', () => {
    const req = {
      method: 'POST',
      path: '/api/payments/sslcommerz/ipn',
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects unsafe methods if Origin does not match APP_URL', () => {
    const req = {
      method: 'POST',
      path: '/api/auth/login',
      headers: { origin: 'https://evil.attacker.com' },
      cookies: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(ApiError));
  });

  it('allows public routes with valid origin and no auth cookie', () => {
    const req = {
      method: 'POST',
      path: '/api/auth/login',
      headers: { origin: appUrl },
      cookies: {},
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('requires matching X-CSRF-Token and bm_csrf cookie for authenticated requests', () => {
    const req = {
      method: 'POST',
      path: '/api/me',
      headers: { origin: appUrl, 'x-csrf-token': 'token-123' },
      cookies: { bm_csrf: 'token-123' },
    } as unknown as Request;
    const res = {} as Response;
    const next = vi.fn();
    csrfMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();

    // Mismatched token
    const badReq = {
      method: 'POST',
      path: '/api/me',
      headers: { origin: appUrl, 'x-csrf-token': 'wrong-token' },
      cookies: { bm_csrf: 'token-123' },
    } as unknown as Request;
    const badNext = vi.fn();
    csrfMiddleware(badReq, res, badNext);
    expect(badNext).toHaveBeenCalledWith(expect.any(ApiError));
  });
});
