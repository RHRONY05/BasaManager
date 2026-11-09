import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import VerifyEmailPage from './VerifyEmailPage';
import * as ClientModule from '../../lib/api/client';
import * as AuthContextModule from '../../app/auth/AuthContext';

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const renderVerify = (initialEntries = ['/verify-email?token=valid-tok']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('verifies email with token and shows success screen', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      status: 'signedOut',
      user: null,
      memberships: [],
      activeOrg: null,
      role: null,
      switchOrg: vi.fn(),
      signOut: vi.fn(),
    });

    const fetchSpy = vi.spyOn(ClientModule, 'apiFetch').mockResolvedValue({ ok: true });

    renderVerify();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/verify-email', {
        method: 'POST',
        body: { token: 'valid-tok' },
      });
      expect(screen.getByRole('heading', { name: /email verified/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });

  it('shows link expired alert when token is invalid or missing', async () => {
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
      new ClientModule.ApiRequestError(400, 'TOKEN_INVALID', 'Invalid token', 'req-1'),
    );

    renderVerify(['/verify-email?token=bad-tok']);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /this link has expired or was used/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
    });
  });
});
