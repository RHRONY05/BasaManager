import { describe, it, expect, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { createRateLimiters } from './rateLimit';

describe('rateLimit middleware', () => {
  it('creates rate limiter instances with redis store', () => {
    const mockRedis = {
      call: vi.fn(),
    } as unknown as Redis;

    const limiters = createRateLimiters(mockRedis);
    expect(limiters).toHaveProperty('loginLimiter');
    expect(limiters).toHaveProperty('forgotPasswordLimiter');
    expect(limiters).toHaveProperty('resendVerificationLimiter');
    expect(limiters).toHaveProperty('authSensitiveLimiter');
    expect(limiters).toHaveProperty('generalLimiter');
    expect(typeof limiters.loginLimiter).toBe('function');
  });
});
