import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrgSwitcher } from './OrgSwitcher';
import { AuthProvider } from '../../app/auth/AuthContext';
import * as ClientModule from '../../lib/api/client';

describe('OrgSwitcher', () => {
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

  it('hides the interactive switcher menu when user has only one membership', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'landlord@test.com',
        fullName: 'Landlord User',
        emailVerified: true,
      },
      memberships: [
        {
          orgId: 'org-single',
          orgName: 'Single Property Org',
          role: 'landlord',
          status: 'active',
        },
      ],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/l']}>
            <OrgSwitcher />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Shows static org display
    await waitFor(() => {
      expect(screen.getByTestId('org-display')).toBeInTheDocument();
      expect(screen.getByText('Single Property Org')).toBeInTheDocument();
    });

    // The interactive dropdown button is NOT rendered
    expect(screen.queryByTestId('org-switcher-button')).not.toBeInTheDocument();
  });

  it('renders dropdown menu with multiple memberships and switching clears cache and navigates to homeFor(role)', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'multi@test.com',
        fullName: 'Multi Role User',
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
          orgName: 'Green View Flat',
          role: 'tenant',
          status: 'active',
        },
      ],
    });

    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/l']}>
            <OrgSwitcher />
            <Routes>
              <Route path="/l" element={<div>Landlord Home</div>} />
              <Route path="/t" element={<div>Tenant Home</div>} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('org-switcher-button')).toBeInTheDocument();
      expect(screen.getByText('Chowdhury Properties')).toBeInTheDocument();
    });

    // Open dropdown
    fireEvent.click(screen.getByTestId('org-switcher-button'));

    await waitFor(() => {
      expect(screen.getByTestId('org-switcher-menu')).toBeInTheDocument();
      expect(screen.getByText('Green View Flat')).toBeInTheDocument();
    });

    // Switch to Tenant Org
    fireEvent.click(screen.getByText('Green View Flat'));

    await waitFor(() => {
      // Query cache must be cleared
      expect(clearSpy).toHaveBeenCalled();
      // Active org in storage updated
      expect(localStorage.getItem('bm.activeOrg')).toBe('org-2');
      // Navigated to tenant home (/t)
      expect(screen.getByText('Tenant Home')).toBeInTheDocument();
    });
  });
});
