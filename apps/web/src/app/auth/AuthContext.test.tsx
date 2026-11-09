import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import * as ClientModule from '../../lib/api/client';

function TestConsumer() {
  const { status, user, activeOrg, role, switchOrg, signOut } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="org">{activeOrg?.orgName ?? 'none'}</span>
      <span data-testid="role">{role ?? 'none'}</span>
      <button onClick={() => switchOrg('org-2')} data-testid="btn-switch">
        Switch Org
      </button>
      <button onClick={() => void signOut()} data-testid="btn-signout">
        Sign Out
      </button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  it('provides signedOut state when /api/me returns 401', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockRejectedValue(
      new ClientModule.ApiRequestError(401, 'UNAUTHENTICATED', 'Unauthorized', 'req-1'),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Initial query loading
    expect(screen.getByTestId('status').textContent).toBe('loading');

    // After failure resolves
    await vi.waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('signedOut');
      expect(screen.getByTestId('user').textContent).toBe('none');
      expect(screen.getByTestId('role').textContent).toBe('none');
    });
  });

  it('loads /api/me and defaults activeOrg to first active membership', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'landlord@test.com',
        fullName: 'Landlord Chowdhury',
        emailVerified: true,
      },
      memberships: [
        {
          orgId: 'org-1',
          orgName: 'Chowdhury Properties',
          role: 'landlord',
          status: 'active',
        },
        {
          orgId: 'org-2',
          orgName: 'Second Org',
          role: 'caretaker',
          status: 'active',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('signedIn');
      expect(screen.getByTestId('user').textContent).toBe('landlord@test.com');
      expect(screen.getByTestId('org').textContent).toBe('Chowdhury Properties');
      expect(screen.getByTestId('role').textContent).toBe('landlord');
      expect(localStorage.getItem('bm.activeOrg')).toBe('org-1');
    });
  });

  it('restores stored activeOrg from localStorage if valid', async () => {
    localStorage.setItem('bm.activeOrg', 'org-2');

    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'landlord@test.com',
        fullName: 'Landlord Chowdhury',
        emailVerified: true,
      },
      memberships: [
        {
          orgId: 'org-1',
          orgName: 'Chowdhury Properties',
          role: 'landlord',
          status: 'active',
        },
        {
          orgId: 'org-2',
          orgName: 'Second Org',
          role: 'caretaker',
          status: 'active',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('org').textContent).toBe('Second Org');
      expect(screen.getByTestId('role').textContent).toBe('caretaker');
    });
  });

  it('switchOrg updates activeOrg and persists to localStorage', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'landlord@test.com',
        fullName: 'Landlord Chowdhury',
        emailVerified: true,
      },
      memberships: [
        {
          orgId: 'org-1',
          orgName: 'Chowdhury Properties',
          role: 'landlord',
          status: 'active',
        },
        {
          orgId: 'org-2',
          orgName: 'Second Org',
          role: 'caretaker',
          status: 'active',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('org').textContent).toBe('Chowdhury Properties');
    });

    act(() => {
      screen.getByTestId('btn-switch').click();
    });

    await vi.waitFor(() => {
      expect(screen.getByTestId('org').textContent).toBe('Second Org');
      expect(screen.getByTestId('role').textContent).toBe('caretaker');
      expect(localStorage.getItem('bm.activeOrg')).toBe('org-2');
    });
  });

  it('signOut calls /api/auth/logout, clears cache and navigates to /login', async () => {
    const mockNavigate = vi.fn();
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path === '/api/me') {
        return {
          user: {
            id: 'user-1',
            email: 'user@test.com',
            fullName: 'User',
            emailVerified: true,
          },
          memberships: [
            {
              orgId: 'org-1',
              orgName: 'Org 1',
              role: 'tenant',
              status: 'active',
            },
          ],
        };
      }
      if (path === '/api/auth/logout') {
        return { ok: true };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNavigateToLogin={mockNavigate}>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('signedIn');
    });

    await act(async () => {
      screen.getByTestId('btn-signout').click();
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(localStorage.getItem('bm.activeOrg')).toBeNull();
    expect(mockNavigate).toHaveBeenCalled();
  });
});
