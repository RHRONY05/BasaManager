import { type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import type { MembershipRole } from '@bm/shared';
import { useAuth } from './AuthContext';
import { RouteSkeleton } from '../../components/ui/RouteSkeleton';

export type AppRole = MembershipRole | 'admin';

/**
 * Returns the default home path for a user's role.
 */
export function homeFor(role: AppRole | string | null | undefined): string {
  switch (role) {
    case 'landlord':
      return '/l';
    case 'caretaker':
      return '/c';
    case 'tenant':
      return '/t';
    case 'admin':
      return '/a';
    default:
      return '/login';
  }
}

/**
 * Validates and sanitizes a post-login redirect path.
 * Must only accept same-origin paths starting with a single '/'.
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== 'string') return null;
  const trimmed = next.trim();

  // Must start with a single slash, not protocol-relative // or backslash /\ or \\
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return null;
  }

  // Reject backslashes anywhere and ASCII control characters
  if (trimmed.includes('\\')) {
    return null;
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 32 || code === 127) {
      return null;
    }
  }

  try {
    const url = new URL(trimmed, 'http://localhost');
    if (url.origin !== 'http://localhost') {
      return null;
    }
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
      return null;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export interface RequireAuthProps {
  children?: ReactNode;
}

/**
 * Route guard that requires authentication.
 * While loading, renders RouteSkeleton (never flashes protected content).
 * If signed out, redirects to /login?next=<path>.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <RouteSkeleton />;
  }

  if (status === 'signedOut') {
    const nextPath = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export interface RequireRoleProps {
  roles: AppRole[];
  children?: ReactNode;
}

/**
 * Route guard that requires one of the specified membership roles.
 * While loading, renders RouteSkeleton.
 * If signed out, redirects to /login?next=<path>.
 * If role is not permitted, redirects to homeFor(role).
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { status, role } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <RouteSkeleton />;
  }

  if (status === 'signedOut') {
    const nextPath = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(nextPath)}`} replace />;
  }

  if (!role || !roles.includes(role)) {
    return <Navigate to={homeFor(role)} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export interface RedirectIfSignedInProps {
  children?: ReactNode;
}

/**
 * Redirects authenticated users from public pages (/, /login, /signup) to their home (or ?next= if valid).
 * While loading, renders RouteSkeleton.
 */
export function RedirectIfSignedIn({ children }: RedirectIfSignedInProps) {
  const { status, role } = useAuth();
  const [searchParams] = useSearchParams();

  if (status === 'loading') {
    return <RouteSkeleton />;
  }

  if (status === 'signedIn') {
    const nextParam = sanitizeNext(searchParams.get('next'));
    const destination = nextParam || homeFor(role);
    return <Navigate to={destination} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
