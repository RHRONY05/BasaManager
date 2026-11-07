import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { apiFetch, ApiRequestError } from './client';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parses successful response with schema', async () => {
    const testSchema = z.object({
      id: z.string(),
      count: z.number(),
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'test-123',
            count: 42,
          },
        }),
      })
    );

    const result = await apiFetch('/api/test', { schema: testSchema });
    expect(result).toEqual({ id: 'test-123', count: 42 });
  });

  it('throws ApiRequestError with parsed error body on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid input',
            requestId: 'req-abc-123',
            details: [{ path: 'name', message: 'Name is required' }],
          },
        }),
      })
    );

    await expect(apiFetch('/api/fail')).rejects.toThrow(ApiRequestError);

    try {
      await apiFetch('/api/fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.code).toBe('VALIDATION_FAILED');
      expect(apiErr.message).toBe('Invalid input');
      expect(apiErr.requestId).toBe('req-abc-123');
      expect(apiErr.details).toEqual([{ path: 'name', message: 'Name is required' }]);
    }
  });

  it('handles non-JSON error responses gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new Error('Not JSON');
        },
      })
    );

    try {
      await apiFetch('/api/gateway-error');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      const apiErr = err as ApiRequestError;
      expect(apiErr.status).toBe(502);
      expect(apiErr.code).toBe('INTERNAL');
      expect(apiErr.message).toBe('Bad Gateway');
      expect(apiErr.requestId).toBe('unknown');
    }
  });
});
