import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './LoginPage';
import * as ClientModule from '../../lib/api/client';

describe('LoginPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderLogin = (initialEntries = ['/login']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<div>Forgot Password Page</div>} />
            <Route path="/l" element={<div>Landlord Dashboard</div>} />
            <Route path="/l/buildings" element={<div>Target Buildings</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders Google sign in button pointing to /api/auth/google/start', () => {
    renderLogin();

    const googleBtn = screen.getByRole('link', { name: /google/i });
    expect(googleBtn).toHaveAttribute('href', '/api/auth/google/start');
  });

  it('shows google_failed banner when ?error=google_failed is present', () => {
    renderLogin(['/login?error=google_failed']);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument();
  });

  it('maps INVALID_CREDENTIALS error to generic message', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockRejectedValue(
      new ClientModule.ApiRequestError(401, 'INVALID_CREDENTIALS', 'Invalid email or password', 'req-1'),
    );

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
    });
  });

  it('maps ACCOUNT_LOCKED error and extracts remaining minutes', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockRejectedValue(
      new ClientModule.ApiRequestError(
        423,
        'ACCOUNT_LOCKED',
        'Account locked. Try again in 12 minutes.',
        'req-locked',
      ),
    );

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'locked@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/try again in 12 minutes/i)).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: /forgot password/i })[0]).toBeInTheDocument();
    });
  });

  it('maps RATE_LIMITED error to rate limited message', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockRejectedValue(
      new ClientModule.ApiRequestError(429, 'RATE_LIMITED', 'Too many requests', 'req-rate'),
    );

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'rate@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'password123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
    });
  });

  it('redirects to sanitized ?next= path upon successful login', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path === '/api/auth/login') {
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

    renderLogin(['/login?next=/l/buildings']);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'landlord@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'valid-password-10' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByText('Target Buildings')).toBeInTheDocument();
    });
  });
});
