import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InvitePage from './InvitePage';
import * as ClientModule from '../../lib/api/client';
import * as AuthContextModule from '../../app/auth/AuthContext';

describe('InvitePage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderInvite = (initialEntries = ['/invite/test-token-123']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/t" element={<div>Tenant Home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders name+password form and Google button with invite param for new/anonymous user', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedOut',
      user: null,
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      orgName: 'Chowdhury Properties',
      role: 'tenant',
      inviterName: 'Farhana Chowdhury',
      email: 'sadia.islam@gmail.com',
    });

    renderInvite();

    await waitFor(() => {
      expect(screen.getByText(/join chowdhury properties/i)).toBeInTheDocument();
      expect(screen.getByText(/farhana chowdhury invited you as the tenant/i)).toBeInTheDocument();
    });

    // Check Google button has invite query param
    const googleBtn = screen.getByRole('link', { name: /google/i });
    expect(googleBtn).toHaveAttribute('href', '/api/auth/google/start?invite=test-token-123');

    // Check read-only email input
    const emailInput = screen.getByLabelText(/email/i);
    expect(emailInput).toHaveValue('sadia.islam@gmail.com');
    expect(emailInput).toBeDisabled();

    // Check name and password inputs exist
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });

  it('shows mismatch card when user is signed in with a different email', async () => {
    const mockSignOut = vi.fn();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'u-other',
        email: 'tanvir@gmail.com',
        fullName: 'Tanvir',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: mockSignOut,
    });

    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      orgName: 'Chowdhury Properties',
      role: 'tenant',
      inviterName: 'Farhana Chowdhury',
      email: 'sadia.islam@gmail.com',
    });

    renderInvite();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/this invite is for another email/i)).toBeInTheDocument();
      expect(screen.getByText(/tanvir@gmail\.com/)).toBeInTheDocument();
      expect(screen.getByText(/sadia\.islam@gmail\.com/)).toBeInTheDocument();
    });

    const signoutBtn = screen.getByRole('button', { name: /sign out and continue/i });
    fireEvent.click(signoutBtn);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('shows accept invitation button when user is signed in with matching email', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedIn',
      user: {
        id: 'u-sadia',
        email: 'sadia.islam@gmail.com',
        fullName: 'Sadia Islam',
        emailVerified: true,
      },
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path.startsWith('/api/invites/test-token-123/accept')) {
        return { ok: true };
      }
      if (path.startsWith('/api/invites/test-token-123')) {
        return {
          orgName: 'Chowdhury Properties',
          role: 'tenant',
          inviterName: 'Farhana Chowdhury',
          email: 'sadia.islam@gmail.com',
        };
      }
      if (path === '/api/me') {
        return {
          user: { id: 'u-sadia', email: 'sadia.islam@gmail.com', fullName: 'Sadia', emailVerified: true },
          memberships: [
            { orgId: 'org-1', orgName: 'Chowdhury Properties', role: 'tenant', status: 'active' },
          ],
        };
      }
      return {};
    });

    renderInvite();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /accept invitation/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/invites/test-token-123/accept', {
        method: 'POST',
        body: {},
      });
      expect(screen.getByText('Tenant Home')).toBeInTheDocument();
    });
  });

  it('shows link expired alert when invite token is invalid', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedOut',
      user: null,
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(ClientModule, 'apiFetch').mockRejectedValue(
      new ClientModule.ApiRequestError(400, 'TOKEN_INVALID', 'Invalid token', 'req-invalid'),
    );

    renderInvite();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /this link has expired or was used/i })).toBeInTheDocument();
    });
  });
});
