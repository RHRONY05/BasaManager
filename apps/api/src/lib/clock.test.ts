import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clock } from './clock';

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
});
