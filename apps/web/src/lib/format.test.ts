import { describe, it, expect } from 'vitest';
import { formatMoney, formatDate, formatMonth } from './format';

describe('formatMoney', () => {
  it('formats whole taka with en-IN grouping', () => {
    expect(formatMoney(1250000)).toBe('৳12,500');
    expect(formatMoney(12500000)).toBe('৳1,25,000');
    expect(formatMoney(1250000000)).toBe('৳1,25,00,000');
  });

  it('formats zero poisha as ৳0', () => {
    expect(formatMoney(0)).toBe('৳0');
    expect(formatMoney(0n)).toBe('৳0');
  });

  it('formats negative amounts with U+2212 minus sign', () => {
    expect(formatMoney(-1250000)).toBe('−৳12,500');
    expect(formatMoney(-1250000n)).toBe('−৳12,500');
    expect(formatMoney(-1250000).charCodeAt(0)).toBe(0x2212);
  });

  it('formats non-zero poisha remainder with two decimal places', () => {
    expect(formatMoney(1250050)).toBe('৳12,500.50');
    expect(formatMoney(-1250050)).toBe('−৳12,500.50');
  });

  it('supports bigint amounts', () => {
    expect(formatMoney(1250000000n)).toBe('৳1,25,00,000');
    expect(formatMoney(-1250000000n)).toBe('−৳1,25,00,000');
  });
});

describe('formatDate', () => {
  it('formats ISO date string into DD MMM YYYY in Asia/Dhaka', () => {
    expect(formatDate('2026-11-10T06:00:00Z')).toBe('10 Nov 2026');
  });
});

describe('formatMonth', () => {
  it('formats month string into MMMM YYYY in Asia/Dhaka', () => {
    expect(formatMonth('2026-11-01')).toBe('November 2026');
  });
});
