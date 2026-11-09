import type { z } from 'zod';
import { errorBodySchema, type ErrorCode, type ErrorDetail } from '@bm/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'INTERNAL';
  readonly requestId: string;
  readonly details?: ErrorDetail[];

  constructor(
    status: number,
    code: ErrorCode | 'INTERNAL',
    message: string,
    requestId: string,
    details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export interface ApiFetchOptions<T = unknown> {
  schema?: z.ZodType<T>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Internal flag to avoid infinite refresh loops. */
  _isRetry?: boolean;
}

let activeOrgId: string | null = null;

export function getActiveOrgId(): string | null {
  if (activeOrgId) return activeOrgId;
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('bm.activeOrg');
  }
  return null;
}

export function setActiveOrgId(orgId: string | null): void {
  activeOrgId = orgId;
  if (typeof localStorage !== 'undefined') {
    if (orgId) {
      localStorage.setItem('bm.activeOrg', orgId);
    } else {
      localStorage.removeItem('bm.activeOrg');
    }
  }
}

let navigateHandler: (url: string) => void = (url: string) => {
  if (typeof window !== 'undefined') {
    window.location.assign(url);
  }
};

export function setNavigateHandler(fn: (url: string) => void): void {
  navigateHandler = fn;
}

function getCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )bm_csrf=([^;]*)/);
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}

let sessionRevokedHandler: (() => void) | null = null;

export function setSessionRevokedHandler(fn: (() => void) | null): void {
  sessionRevokedHandler = fn;
}

function clearSessionAndRedirect(requestPath: string): void {
  setActiveOrgId(null);
  sessionRevokedHandler?.();
  // Do not force navigation to /login when /api/me fails on public pages (lets useAuth transition to signedOut).
  if (requestPath === '/api/me') {
    return;
  }
  navigateHandler('/login');
}

let activeRefreshPromise: Promise<void> | null = null;

function runSingleFlightRefresh(requestPath: string): Promise<void> {
  if (!activeRefreshPromise) {
    activeRefreshPromise = (async () => {
      try {
        const doRefresh = async () => {
          await apiFetch('/api/auth/refresh', {
            method: 'POST',
            _isRetry: true,
          });
        };
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
          await navigator.locks.request('bm-refresh', doRefresh);
        } else {
          await doRefresh();
        }
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'SESSION_REVOKED') {
          clearSessionAndRedirect(requestPath);
        }
        throw err;
      } finally {
        activeRefreshPromise = null;
      }
    })();
  }
  return activeRefreshPromise;
}

export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions<T> = {}): Promise<T> {
  const { schema, method = 'GET', body, signal, headers = {}, _isRetry = false } = options;

  const mergedHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };

  // Add X-CSRF-Token on unsafe methods (POST, PUT, PATCH, DELETE)
  const isUnsafeMethod = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (isUnsafeMethod && !mergedHeaders['X-CSRF-Token']) {
    const csrfToken = getCsrfCookie();
    if (csrfToken) {
      mergedHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  // Add X-Org-Id from active org when set
  if (!mergedHeaders['X-Org-Id']) {
    const orgId = getActiveOrgId();
    if (orgId) {
      mergedHeaders['X-Org-Id'] = orgId;
    }
  }

  const init: RequestInit = {
    method,
    signal,
    credentials: 'same-origin',
    headers: mergedHeaders,
    body: body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(path, init);

  if (!response.ok) {
    let code: ErrorCode | 'INTERNAL' = 'INTERNAL';
    let message = response.statusText || 'An error occurred';
    let requestId = 'unknown';
    let details: ErrorDetail[] | undefined;

    try {
      const json = await response.json();
      const parsed = errorBodySchema.safeParse(json);
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
        requestId = parsed.data.error.requestId;
        details = parsed.data.error.details;
      }
    } catch {
      // Non-JSON error body fallback
    }

    // On SESSION_REVOKED, clear session and visibly sign out
    if (code === 'SESSION_REVOKED') {
      clearSessionAndRedirect(path);
    }

    // On 401 UNAUTHENTICATED, run one single-flight refresh then retry once
    if (response.status === 401 && code === 'UNAUTHENTICATED' && !_isRetry && path !== '/api/auth/refresh') {
      await runSingleFlightRefresh(path);
      return apiFetch(path, { ...options, _isRetry: true });
    }

    throw new ApiRequestError(response.status, code, message, requestId, details);
  }

  const json = await response.json();
  const rawData = json && typeof json === 'object' && 'data' in json ? json.data : json;

  if (schema) {
    return schema.parse(rawData);
  }

  return rawData as T;
}
