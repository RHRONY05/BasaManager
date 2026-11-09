import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import * as ClientModule from '../../lib/api/client';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits email and displays confirmation message', async () => {
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({ ok: true });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/forgot-password', {
        method: 'POST',
        body: { email: 'user@example.com' },
      });
      expect(
        screen.getByRole('heading', { name: /if an account exists, we sent a link/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
    });
  });
});

describe('ResetPasswordPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('shows expired message if token is missing from URL', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reset-password']}>
          <ResetPasswordPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /this link has expired or was used/i })).toBeInTheDocument();
  });

  it('submits new password and redirects to home', async () => {
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path === '/api/auth/reset-password') {
        return { ok: true };
      }
      if (path === '/api/me') {
        return {
          user: { id: 'u1', email: 'test@test.com', fullName: 'User', emailVerified: true },
          memberships: [{ orgId: 'o1', orgName: 'Org', role: 'landlord', status: 'active' }],
        };
      }
      return {};
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reset-password?token=valid-reset-tok']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/l" element={<div>Landlord Home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'brand-new-password-10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /set password and sign in/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/reset-password', {
        method: 'POST',
        body: {
          token: 'valid-reset-tok',
          password: 'brand-new-password-10',
        },
      });
      expect(screen.getByText('Landlord Home')).toBeInTheDocument();
    });
  });
});
