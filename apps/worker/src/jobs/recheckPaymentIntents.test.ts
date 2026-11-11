import { describe, it, expect, vi } from 'vitest';
import { recheckPaymentIntentsJob } from './recheckPaymentIntents.js';
import type { JobContext } from './index.js';

const recheckMock = vi.fn().mockResolvedValue({ processed: 2, confirmed: 1, failed: 1, flagged: 0 });

vi.mock('@bm/api/modules/payments/sslcommerz.service', () => ({
  SslcommerzService: class {
    recheckPaymentIntents = recheckMock;
  },
}));

describe('recheckPaymentIntentsJob', () => {
  it('has correct name and schedule', () => {
    expect(recheckPaymentIntentsJob.name).toBe('recheckPaymentIntents');
    expect(recheckPaymentIntentsJob.schedule).toBe('*/10 * * * *');
  });

  it('runs job with lock and calls recheckPaymentIntents', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      eval: vi.fn().mockResolvedValue(1),
    };

    const mockCtx = {
      redis: mockRedis,
      prisma: {},
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      env: {
        SSLCOMMERZ_STORE_ID: 'store',
        SSLCOMMERZ_STORE_PASSWORD: 'pass',
      },
    } as unknown as JobContext;

    await recheckPaymentIntentsJob.run(mockCtx);
    expect(mockRedis.set).toHaveBeenCalled();
    expect(recheckMock).toHaveBeenCalled();
  });
});
