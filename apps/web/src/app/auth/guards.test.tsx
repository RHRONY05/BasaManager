import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { homeFor, sanitizeNext, RequireAuth, RequireRole, RedirectIfSignedIn } from './guards';
import * as AuthContextModule from './AuthContext';

describe('homeFor', () => {
  it('returns correct home path for each role', () => {
    expect(homeFor('landlord')).toBe('/l');
    expect(homeFor('caretaker')).toBe('/c');
    expect(homeFor('tenant')).toBe('/t');
    expect(homeFor('admin')).toBe('/a');
    expect(homeFor(null)).toBe('/login');
    expect(homeFor(undefined)).toBe('/login');
    expect(homeFor('other' as unknown as string)).toBe('/login');
  });
});

describe('sanitizeNext', () => {
  it('accepts valid same-origin relative paths', () => {
    expect(sanitizeNext('/l/buildings')).toBe('/l/buildings');
    expect(sanitizeNext('/t/bills?month=2026-11')).toBe('/t/bills?month=2026-11');
    expect(sanitizeNext('/account#profile')).toBe('/account#profile');
    expect(sanitizeNext('/')).toBe('/');
  });

  it('rejects external URLs, protocol-relative paths, and malicious schemes', () => {
    expect(sanitizeNext('//evil.com')).toBeNull();
    expect(sanitizeNext('https://evil.com')).toBeNull();
    expect(sanitizeNext('http://evil.com/login')).toBeNull();
    expect(sanitizeNext('javascript:alert(1)')).toBeNull();
    expect(sanitizeNext('/\\evil.com')).toBeNull();
    expect(sanitizeNext('\\\\evil.com')).toBeNull();
    expect(sanitizeNext('///evil.com')).toBeNull();
    expect(sanitizeNext(null)).toBeNull();
    expect(sanitizeNext(undefined)).toBeNull();
    expect(sanitizeNext('')).toBeNull();
    expect(sanitizeNext('   ')).toBeNull();
  });
});

describe('RequireAuth', () => {
  it('renders RouteSkeleton while status is loading', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'loading',
      user: null,
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(document.querySelector('[data-skeleton]')).toBeInTheDocument();
  });

  it('redirects signedOut users to /login?next=<path>', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedOut',
      user: null,
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/l/buildings?page=2']}>
        <Routes>
          <Route
            path="/l/buildings"
            element={
              <RequireAuth>
                <div>Landlord Buildings</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Landlord Buildings')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders protected content when signedIn', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'user-1',
        email: 'user@test.com',
        fullName: 'Test User',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: 'landlord',
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/l/dashboard']}>
        <Routes>
          <Route
            path="/l/dashboard"
            element={
              <RequireAuth>
                <div>Landlord Dashboard</div>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Landlord Dashboard')).toBeInTheDocument();
  });
});

describe('RequireRole', () => {
  it('redirects to homeFor(role) when user has a different role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'user-tenant',
        email: 'tenant@test.com',
        fullName: 'Tenant User',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: 'tenant',
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/l']}>
        <Routes>
          <Route
            path="/l"
            element={
              <RequireRole roles={['landlord']}>
                <div>Landlord Only</div>
              </RequireRole>
            }
          />
          <Route path="/t" element={<div>Tenant Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Landlord Only')).not.toBeInTheDocument();
    expect(screen.getByText('Tenant Home')).toBeInTheDocument();
  });
});

describe('RedirectIfSignedIn', () => {
  it('redirects signedIn user visiting /login to homeFor(role)', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'user-ll',
        email: 'll@test.com',
        fullName: 'Landlord User',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: 'landlord',
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfSignedIn>
                <div>Login Form</div>
              </RedirectIfSignedIn>
            }
          />
          <Route path="/l" element={<div>Landlord Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
    expect(screen.getByText('Landlord Home')).toBeInTheDocument();
  });

  it('redirects signedIn user with valid ?next= to the next destination', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'user-ll',
        email: 'll@test.com',
        fullName: 'Landlord User',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: 'landlord',
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/login?next=/l/buildings']}>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfSignedIn>
                <div>Login Form</div>
              </RedirectIfSignedIn>
            }
          />
          <Route path="/l/buildings" element={<div>Target Buildings</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
    expect(screen.getByText('Target Buildings')).toBeInTheDocument();
  });
});
