import { describe, it, expect } from 'vitest';
import { getDhakaDate, generateBillsJob } from './generateBills.js';
import { applyLateFeesJob } from './applyLateFees.js';
import { jobs } from './index.js';

describe('worker billing jobs', () => {
  it('getDhakaDate correctly formats date and day of month in Asia/Dhaka', () => {
    // 2026-11-10 19:00:00 UTC is 2026-11-11 01:00:00 in Asia/Dhaka (+6)
    const testDate = new Date('2026-11-10T19:00:00.000Z');
    const res = getDhakaDate(testDate);
    expect(res.todayStr).toBe('2026-11-11');
    expect(res.dayOfMonth).toBe(11);
    expect(res.monthStr).toBe('2026-11');
  });

  it('generateBillsJob has correct schedule and lock TTL', () => {
    expect(generateBillsJob.name).toBe('generateBills');
    expect(generateBillsJob.schedule).toBe('10 0 * * *');
    expect(generateBillsJob.ttlMs).toBe(120_000);
  });

  it('applyLateFeesJob has correct schedule and lock TTL', () => {
    expect(applyLateFeesJob.name).toBe('applyLateFees');
    expect(applyLateFeesJob.schedule).toBe('20 0 * * *');
    expect(applyLateFeesJob.ttlMs).toBe(120_000);
  });

  it('all jobs are registered in worker jobs list', () => {
    const jobNames = jobs.map((j) => j.name);
    expect(jobNames).toContain('generateBills');
    expect(jobNames).toContain('applyLateFees');
    expect(jobNames).toContain('activate-due-leases');
  });
});
