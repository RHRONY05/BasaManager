import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { deliverOutboxNow } from './mailer';

describe('mailer', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.APP_ENV = 'test';
    process.env.APP_URL = 'http://localhost:5173';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    delete process.env.SMTP_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('handles deliverOutboxNow with empty messages or when SMTP is not configured', async () => {
    await expect(deliverOutboxNow([])).resolves.toBeUndefined();
    await expect(
      deliverOutboxNow([{ type: 'user.security_alert', payload: { email: 'test@example.com' } }]),
    ).resolves.toBeUndefined();
  });
});
