import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { apiFetch, ApiRequestError, setActiveOrgId, getActiveOrgId, setNavigateHandler } from './client';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setActiveOrgId(null);
    if (typeof document !== 'undefined') {
      document.cookie = 'bm_csrf=; path=/; max-age=0';
    }
  });

  it('sends credentials: same-origin and parses successful response with schema', async () => {
    const testSchema = z.object({
      id: z.string(),
      count: z.number(),
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'test-123',
          count: 42,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await apiFetch('/api/test', { schema: testSchema });
    expect(result).toEqual({ id: 'test-123', count: 42 });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        credentials: 'same-origin',
        method: 'GET',
      }),
    );
  });

  it('adds X-CSRF-Token from bm_csrf cookie on unsafe methods', async () => {
    document.cookie = 'bm_csrf=test-csrf-token-123; path=/';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/mutate', { method: 'POST', body: { name: 'test' } });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/mutate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'test-csrf-token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('does not add X-CSRF-Token on GET requests', async () => {
    document.cookie = 'bm_csrf=test-csrf-token-123; path=/';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/data', { method: 'GET' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    const calledHeaders = (init?.headers ?? {}) as Record<string, string>;
    expect(calledHeaders['X-CSRF-Token']).toBeUndefined();
  });

  it('adds X-Org-Id when active org is set', async () => {
    setActiveOrgId('org-456');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/org-data');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/org-data',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Org-Id': 'org-456',
        }),
      }),
    );
  });

  it('throws ApiRequestError on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid input',
            requestId: 'req-abc-123',
            details: [{ path: 'name', message: 'Name is required' }],
          },
        }),
      }),
    );

    await expect(apiFetch('/api/fail')).rejects.toThrow(ApiRequestError);

    try {
      await apiFetch('/api/fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.message).toBe('Invalid input');
      expect(apiErr.requestId).toBe('req-abc-123');
      expect(apiErr.details).toEqual([{ path: 'name', message: 'Name is required' }]);
    }
  });

  it('runs single-flight refresh on 3 parallel 401 UNAUTHENTICATED requests and retries them', async () => {
    let refreshCalls = 0;
    const endpointCalls: Record<string, number> = {
      '/api/res1': 0,
      '/api/res2': 0,
      '/api/res3': 0,
    };

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        refreshCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { ok: true } }),
        };
      }

      endpointCalls[url] = (endpointCalls[url] || 0) + 1;
      // First call fails with 401 UNAUTHENTICATED, retry call succeeds
      if (endpointCalls[url] === 1) {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Token expired',
              requestId: `req-${url}`,
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { path: url, success: true } }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    // Run 3 requests in parallel
    const [res1, res2, res3] = await Promise.all([
      apiFetch<{ path: string; success: boolean }>('/api/res1'),
      apiFetch<{ path: string; success: boolean }>('/api/res2'),
      apiFetch<{ path: string; success: boolean }>('/api/res3'),
    ]);

    expect(res1).toEqual({ path: '/api/res1', success: true });
    expect(res2).toEqual({ path: '/api/res2', success: true });
    expect(res3).toEqual({ path: '/api/res3', success: true });

    // Single-flight refresh: POST /api/auth/refresh must be called EXACTLY once!
    expect(refreshCalls).toBe(1);

    // Each endpoint should have been called twice (initial 401 + retry 200)
    expect(endpointCalls['/api/res1']).toBe(2);
    expect(endpointCalls['/api/res2']).toBe(2);
    expect(endpointCalls['/api/res3']).toBe(2);
  });

  it('never refreshes on INVALID_CREDENTIALS', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          requestId: 'req-login',
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/auth/login', { method: 'POST', body: {} })).rejects.toThrow(ApiRequestError);

    // Refresh should NEVER have been called
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth/refresh', expect.anything());
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries once only when 401 UNAUTHENTICATED persists after refresh', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { ok: true } }),
        };
      }

      callCount++;
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Still unauthorized',
            requestId: 'req-persist-401',
          },
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/protected')).rejects.toThrow(ApiRequestError);

    // Initial request + retry once only = 2 calls to /api/protected
    expect(callCount).toBe(2);
  });

  it('clears session and navigates to /login when refresh returns 401 UNAUTHENTICATED', async () => {
    setActiveOrgId('org-789');
    const mockNavigate = vi.fn();
    setNavigateHandler(mockNavigate);

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Refresh token expired or invalid',
              requestId: 'req-refresh-expired',
            },
          }),
        };
      }

      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Token expired',
            requestId: 'req-first-fail',
          },
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/protected-res')).rejects.toThrow();

    expect(getActiveOrgId()).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('clears session and navigates to /login when refresh fails', async () => {
    setActiveOrgId('org-789');
    const mockNavigate = vi.fn();
    setNavigateHandler(mockNavigate);

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/refresh') {
        return {
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({
            error: {
              code: 'SESSION_REVOKED',
              message: 'Session revoked',
              requestId: 'req-refresh-fail',
            },
          }),
        };
      }

      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Token expired',
            requestId: 'req-first-fail',
          },
        }),
      };
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/protected-res')).rejects.toThrow();

    // Active org must be cleared
    expect(getActiveOrgId()).toBeNull();
    // Navigation to /login must be triggered
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });

  it('clears session and navigates to /login directly on SESSION_REVOKED error', async () => {
    setActiveOrgId('org-789');
    const mockNavigate = vi.fn();
    setNavigateHandler(mockNavigate);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: {
          code: 'SESSION_REVOKED',
          message: 'Session revoked',
          requestId: 'req-revoked',
        },
      }),
    });

    vi.stubGlobal('fetch', mockFetch);

    await expect(apiFetch('/api/some-endpoint')).rejects.toThrow(ApiRequestError);
    expect(getActiveOrgId()).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
