import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GoogleButton } from './GoogleButton';

describe('GoogleButton', () => {
  it('renders Google sign-in link with google-g svg and brand paths', () => {
    render(<GoogleButton>Continue with Google</GoogleButton>);

    const link = screen.getByRole('link', { name: /continue with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google/start');
    expect(link).toHaveClass('btn', 'btn--secondary', 'btn--block');

    const svg = link.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass('google-g');
    expect(svg).toHaveAttribute('viewBox', '0 0 48 48');

    expect(svg?.querySelector('.g-y')).not.toBeNull();
    expect(svg?.querySelector('.g-r')).not.toBeNull();
    expect(svg?.querySelector('.g-g')).not.toBeNull();
    expect(svg?.querySelector('.g-b')).not.toBeNull();
  });

  it('includes encoded invite token in href when provided', () => {
    render(<GoogleButton inviteToken="invite-token-123">Join with Google</GoogleButton>);

    const link = screen.getByRole('link', { name: /join with google/i });
    expect(link).toHaveAttribute('href', '/api/auth/google/start?invite=invite-token-123');
  });
});
