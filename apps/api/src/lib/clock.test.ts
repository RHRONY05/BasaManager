import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clock, getDhakaDateString } from './clock';

describe('clock', () => {
  const originalEnv = process.env.CLOCK_OVERRIDE;

  beforeEach(() => {
    clock.reset();
    delete process.env.CLOCK_OVERRIDE;
  });

  afterEach(() => {
    clock.reset();
    if (originalEnv !== undefined) {
      process.env.CLOCK_OVERRIDE = originalEnv;
    } else {
      delete process.env.CLOCK_OVERRIDE;
    }
  });

  it('returns current time when no override is set', () => {
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('supports explicit date override via clock.set()', () => {
    const target = new Date('2026-11-08T12:00:00Z');
    clock.set(target);
    expect(clock.now().toISOString()).toBe('2026-11-08T12:00:00.000Z');

    clock.set(null);
    expect(clock.now().getTime()).not.toBe(target.getTime());
  });

  it('supports string date override via clock.set()', () => {
    clock.set('2026-12-25T00:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-12-25T00:00:00.000Z');
  });

  it('throws on invalid date string in clock.set()', () => {
    expect(() => clock.set('not-a-date')).toThrow(/Invalid date string/);
  });

  it('honours process.env.CLOCK_OVERRIDE when no manual override is active', () => {
    process.env.CLOCK_OVERRIDE = '2026-05-01T10:30:00.000Z';
    expect(clock.now().toISOString()).toBe('2026-05-01T10:30:00.000Z');

    // Manual set takes precedence
    clock.set('2026-06-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-06-01T00:00:00.000Z');

    // Reset restores CLOCK_OVERRIDE
    clock.set(null);
    expect(clock.now().toISOString()).toBe('2026-05-01T10:30:00.000Z');
  });

  describe('getDhakaDateString', () => {
    it('returns Dhaka calendar date matching UTC+6 offset', () => {
      // 19:30 UTC on 10 Nov is 01:30 Dhaka time on 11 Nov
      const date = new Date('2026-11-10T19:30:00.000Z');
      expect(getDhakaDateString(date)).toBe('2026-11-11');
    });

    it('returns date for early morning UTC', () => {
      // 02:00 UTC on 10 Nov is 08:00 Dhaka time on 10 Nov
      const date = new Date('2026-11-10T02:00:00.000Z');
      expect(getDhakaDateString(date)).toBe('2026-11-10');
    });
  });
});
