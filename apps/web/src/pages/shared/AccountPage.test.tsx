import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountPage from './AccountPage';
import { AuthProvider } from '../../app/auth/AuthContext';
import { ToastProvider } from '../../components/ui/Toast';
import * as ClientModule from '../../lib/api/client';

const mockMe = {
  user: {
    id: 'user-1',
    email: 'landlord@test.com',
    fullName: 'Farhana Chowdhury',
    phone: '+880 1711-234567',
    emailVerified: true,
  },
  memberships: [
    {
      orgId: 'org-1',
      orgName: 'Chowdhury Properties',
      role: 'landlord',
      status: 'active',
    },
  ],
};

const mockSessions = [
  {
    id: 'sess-current',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    ip: '103.23.45.67',
    createdAt: '2026-11-08T10:00:00Z',
    current: true,
  },
  {
    id: 'sess-other',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile',
    ip: '103.23.45.99',
    createdAt: '2026-11-07T12:00:00Z',
    current: false,
  },
];

describe('AccountPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (url, options) => {
      const path = typeof url === 'string' ? url : '';
      if (path === '/api/me' && (!options || options.method === 'GET' || !options.method)) {
        return mockMe;
      }
      if (path === '/api/me/sessions' && (!options || options.method === 'GET' || !options.method)) {
        return mockSessions;
      }
      return { ok: true };
    });
  });

  const renderAccount = (initialEntries = ['/account']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={initialEntries}>
              <Routes>
                <Route path="/account" element={<AccountPage />} />
                <Route path="/login" element={<div>Login Page</div>} />
                <Route path="/" element={<div>Home Landing Page</div>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  it('renders profile and saves updated details with success toast', async () => {
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch');

    renderAccount();

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveValue('Farhana Chowdhury');
    });

    const nameInput = screen.getByLabelText(/full name/i);
    const phoneInput = screen.getByLabelText(/phone/i);

    fireEvent.change(nameInput, { target: { value: 'Farhana Updated' } });
    fireEvent.change(phoneInput, { target: { value: '+880 1811-999999' } });

    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/me', {
        method: 'PATCH',
        body: {
          fullName: 'Farhana Updated',
          phone: '+880 1811-999999',
        },
      });
      expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
    });
  });

  it('maps INVALID_CREDENTIALS error to inline error on current password field', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (url, options) => {
      const path = typeof url === 'string' ? url : '';
      if (path === '/api/me' && (!options || options.method === 'GET' || !options.method)) {
        return mockMe;
      }
      if (path === '/api/me/sessions') {
        return mockSessions;
      }
      if (path === '/api/me/change-password') {
        throw new ClientModule.ApiRequestError(
          400,
          'INVALID_CREDENTIALS',
          'Invalid current password',
          'req-cp',
        );
      }
      return { ok: true };
    });

    renderAccount();

    await waitFor(() => {
      expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: 'brandnewpass123' },
    });

    const changeBtn = screen.getByRole('button', { name: /change password/i });
    fireEvent.click(changeBtn);

    await waitFor(() => {
      expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument();
    });
  });

  it('revokes a session after confirmation dialog', async () => {
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (url, options) => {
      const path = typeof url === 'string' ? url : '';
      if (path === '/api/me' && (!options || options.method === 'GET' || !options.method)) {
        return mockMe;
      }
      if (path === '/api/me/sessions' && (!options || options.method === 'GET' || !options.method)) {
        return mockSessions;
      }
      if (path === '/api/me/sessions/sess-other' && options?.method === 'DELETE') {
        return { ok: true };
      }
      return { ok: true };
    });

    renderAccount();

    await waitFor(() => {
      expect(screen.getByText(/chrome on android/i)).toBeInTheDocument();
    });

    // Only non-current session has "Sign out" button
    const signOutBtn = screen.getByRole('button', { name: /^sign out$/i });
    fireEvent.click(signOutBtn);

    // Confirm dialog should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/sign out of this device\?/i)).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /sign out device/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/me/sessions/sess-other', {
        method: 'DELETE',
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByText(/device signed out/i)).toBeInTheDocument();
    });
  });

  it('signs out everywhere and navigates to /login', async () => {
    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch');

    renderAccount();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out everywhere/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign out everywhere/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout-all', {
        method: 'POST',
      });
      expect(screen.getByText(/login page/i)).toBeInTheDocument();
    });
  });

  it('delete dialog requires typed DELETE and handles LANDLORD_MUST_TRANSFER', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (url, options) => {
      const path = typeof url === 'string' ? url : '';
      if (path === '/api/me' && (!options || options.method === 'GET' || !options.method)) {
        return mockMe;
      }
      if (path === '/api/me/sessions') {
        return mockSessions;
      }
      if (path === '/api/me' && options?.method === 'DELETE') {
        throw new ClientModule.ApiRequestError(
          409,
          'LANDLORD_MUST_TRANSFER',
          'Landlord must transfer organisation',
          'req-del',
        );
      }
      return { ok: true };
    });

    renderAccount();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /delete my account/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const confirmInput = screen.getByLabelText(/type delete below/i);
    const passwordInput = screen.getByLabelText(/enter your password/i);
    const deleteBtn = screen.getByRole('button', { name: /^delete account$/i });

    // Both empty: disabled
    expect(deleteBtn).toBeDisabled();

    // Password entered, confirmation empty: disabled
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    expect(deleteBtn).toBeDisabled();

    // Wrong confirmation word: disabled
    fireEvent.change(confirmInput, { target: { value: 'delete' } });
    expect(deleteBtn).toBeDisabled();

    // Exact DELETE typed: enabled
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } });
    expect(deleteBtn).toBeEnabled();

    // Click confirm delete -> API throws LANDLORD_MUST_TRANSFER
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          /as the landlord, you must first hand over or close your organisations before deleting your account/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
