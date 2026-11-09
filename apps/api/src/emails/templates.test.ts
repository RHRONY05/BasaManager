import { describe, it, expect } from 'vitest';
import { renderEmail } from './templates';

describe('email templates', () => {
  const appUrl = 'https://basamanager.rhrony05.me';

  it('renders user.verify_email template', () => {
    const rendered = renderEmail(
      'user.verify_email',
      { email: 'user@example.com', token: 'token-abc' },
      appUrl,
    );
    expect(rendered).not.toBeNull();
    expect(rendered?.to).toBe('user@example.com');
    expect(rendered?.subject).toMatch(/verify/i);
    expect(rendered?.text).toContain(`${appUrl}/verify-email?token=token-abc`);
  });

  it('renders user.password_reset template', () => {
    const rendered = renderEmail(
      'user.password_reset',
      { email: 'user@example.com', token: 'reset-token-123' },
      appUrl,
    );
    expect(rendered).not.toBeNull();
    expect(rendered?.to).toBe('user@example.com');
    expect(rendered?.subject).toMatch(/reset/i);
    expect(rendered?.text).toContain(`${appUrl}/reset-password?token=reset-token-123`);
  });

  it('renders user.security_alert template', () => {
    const rendered = renderEmail('user.security_alert', { email: 'user@example.com' }, appUrl);
    expect(rendered).not.toBeNull();
    expect(rendered?.to).toBe('user@example.com');
    expect(rendered?.subject).toMatch(/security/i);
  });

  it('renders invitation template with invite.sent', () => {
    const rendered = renderEmail(
      'invite.sent',
      {
        email: 'tenant@example.com',
        token: 'invite-tok',
        role: 'tenant',
        orgName: 'Sunrise Apartments',
      },
      appUrl,
    );
    expect(rendered).not.toBeNull();
    expect(rendered?.to).toBe('tenant@example.com');
    expect(rendered?.subject).toMatch(/invited/i);
    expect(rendered?.text).toContain(`${appUrl}/invites/invite-tok`);
  });

  it('returns null for unknown type or missing email', () => {
    expect(renderEmail('unknown.type', { email: 'test@example.com' }, appUrl)).toBeNull();
    expect(renderEmail('user.verify_email', {}, appUrl)).toBeNull();
  });
});
