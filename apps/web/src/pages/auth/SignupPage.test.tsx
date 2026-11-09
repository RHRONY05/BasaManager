import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SignupPage from './SignupPage';
import * as ClientModule from '../../lib/api/client';

describe('SignupPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Google signup button pointing to /api/auth/google/start', () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const googleBtn = screen.getByRole('link', { name: /google/i });
    expect(googleBtn).toHaveAttribute('href', '/api/auth/google/start');
  });

  it('displays Check your email screen on successful signup and counts down 60s cooldown with fake timers', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path === '/api/auth/signup') {
        return { ok: true };
      }
      if (path === '/api/auth/resend-verification') {
        return { ok: true };
      }
      return {};
    });

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Farhana Chowdhury' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'farhana@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'secure-pass-phrase-1' },
    });
    fireEvent.change(screen.getByLabelText(/organisation name/i), {
      target: { value: 'Chowdhury Properties' },
    });

    // Use fake timers after form submission starts
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create.*account/i }));
    });

    // Verify "Check your email" screen
    expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/farhana@example\.com/)).toBeInTheDocument();

    // Initial button state: disabled and showing 1:00
    const resendBtn = screen.getByRole('button');
    expect(resendBtn).toBeDisabled();
    expect(resendBtn.textContent).toContain('1:00');

    // Advance 18 seconds -> should show 0:42
    act(() => {
      vi.advanceTimersByTime(18000);
    });
    expect(resendBtn.textContent).toContain('0:42');
    expect(resendBtn).toBeDisabled();

    // Advance remaining 42 seconds -> total 60s
    act(() => {
      vi.advanceTimersByTime(42000);
    });

    // Cooldown finished -> button is enabled
    expect(resendBtn).not.toBeDisabled();
    expect(resendBtn.textContent).toContain('Resend verification email');

    // Clicking resend triggers resend call and resets cooldown
    await act(async () => {
      fireEvent.click(resendBtn);
    });

    expect(screen.getByText(/verification email sent/i)).toBeInTheDocument();
    expect(resendBtn).toBeDisabled();
    expect(resendBtn.textContent).toContain('1:00');
  });

  it('handles RATE_LIMITED error when resending verification email', async () => {
    vi.spyOn(ClientModule, 'apiFetch').mockImplementation(async (path): Promise<unknown> => {
      if (path === '/api/auth/signup') {
        return { ok: true };
      }
      if (path === '/api/auth/resend-verification') {
        throw new ClientModule.ApiRequestError(429, 'RATE_LIMITED', 'Rate limit exceeded', 'req-rl');
      }
      return {};
    });

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Farhana Chowdhury' },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'farhana@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'secure-pass-phrase-1' },
    });
    fireEvent.change(screen.getByLabelText(/organisation name/i), {
      target: { value: 'Chowdhury Properties' },
    });

    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create.*account/i }));
    });

    // Advance full 60 seconds
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    const resendBtn = screen.getByRole('button');
    expect(resendBtn).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(resendBtn);
    });

    expect(screen.getByText(/too many requests/i)).toBeInTheDocument();
  });
});
