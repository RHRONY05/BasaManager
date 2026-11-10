import { describe, it, expect, vi } from 'vitest';
import { getDhakaDate, generateBillsJob } from './generateBills.js';
import { applyLateFeesJob, runApplyLateFees } from './applyLateFees.js';
import { jobs, type JobContext } from './index.js';

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

  it('runApplyLateFees computes 5% late fee (500 bp) on ৳5,000 balance as exactly ৳250 (Example 4)', async () => {
    const candidateBill = {
      id: 'bill-1',
      orgId: 'org-1',
      leaseId: 'lease-1',
      dueDate: new Date('2026-11-05T00:00:00.000Z'),
      status: 'issued',
      totalPoisha: BigInt(500000), // ৳5,000 balance
      paidPoisha: BigInt(0),
      lateFeeAppliedAt: null,
      lines: [],
      lease: {
        unit: {
          building: {
            lateFeeType: 'percent',
            lateFeeValue: 500, // 500 basis points = 5%
            graceDays: 2,
          },
        },
      },
    };

    let updatedTotalPoisha = BigInt(0);
    let createdLineAmount = 0;

    const mockTx = {
      bill: {
        findMany: vi.fn().mockResolvedValue([candidateBill]),
        findUnique: vi.fn().mockResolvedValue({
          ...candidateBill,
          lines: [],
        }),
        update: vi.fn().mockImplementation(({ data }) => {
          updatedTotalPoisha = data.totalPoisha;
          return Promise.resolve({ ...candidateBill, ...data });
        }),
        fields: {
          paidPoisha: 'paidPoisha',
        },
      },
      billLine: {
        create: vi.fn().mockImplementation(({ data }) => {
          createdLineAmount = data.amountPoisha;
          return Promise.resolve({ id: 'line-late', ...data });
        }),
      },
      outboxMessage: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      jobRun: {
        create: vi.fn().mockResolvedValue({ id: 'jr-1' }),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'lease-1' }]),
    };

    const mockCtx = {
      prisma: {
        $tx: vi.fn().mockImplementation((_auth, cb) => cb(mockTx)),
      },
      redis: {} as never,
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      } as never,
      // Date is 2026-11-15, past due date 2026-11-05 + 2 grace days
      now: () => new Date('2026-11-15T00:00:00.000Z'),
    } as unknown as JobContext;

    const result = await runApplyLateFees(mockCtx);
    expect(result.applied).toBe(1);
    expect(result.totalFeePoisha).toBe(25000); // ৳250 = 25,000 poisha
    expect(createdLineAmount).toBe(BigInt(25000));
    expect(updatedTotalPoisha).toEqual({ increment: BigInt(25000) });
  });
});
