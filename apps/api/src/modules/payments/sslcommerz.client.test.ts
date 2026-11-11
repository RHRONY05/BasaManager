import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SslcommerzClient } from './sslcommerz.client.js';
import { ApiError } from '../../lib/ApiError.js';

describe('SslcommerzClient', () => {
  const originalFetch = globalThis.fetch;
  const config = {
    storeId: 'test_store',
    storePassword: 'test_password',
    isSandbox: true,
  };

  beforeEach(() => {
    delete process.env.PAYMENTS_MOCK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('initPayment', () => {
    it('returns gateway URL and session key on SUCCESS', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'SUCCESS',
          GatewayPageURL: 'https://sandbox.sslcommerz.com/gw',
          sessionkey: 'sess-123',
        }),
      });

      const client = new SslcommerzClient(config);
      const res = await client.initPayment({
        tranId: 'TRAN-1',
        amountPoisha: 10000,
        appUrl: 'http://localhost:4000',
        cusName: 'Tenant Name',
        cusEmail: 'tenant@example.com',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.GatewayPageURL).toBe('https://sandbox.sslcommerz.com/gw');
      expect(res.sessionkey).toBe('sess-123');
    });

    it('returns mock URL when PAYMENTS_MOCK is true', async () => {
      process.env.PAYMENTS_MOCK = 'true';
      const client = new SslcommerzClient(config);
      const res = await client.initPayment({
        tranId: 'TRAN-MOCK',
        amountPoisha: 50000,
        appUrl: 'http://localhost:4000',
      });

      expect(res.status).toBe('SUCCESS');
      expect(res.GatewayPageURL).toContain('/mock-gateway?tran_id=TRAN-MOCK');
      expect(res.sessionkey).toBe('MOCK_SESS_TRAN-MOCK');
    });

    it('throws ApiError on non-ok HTTP response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const client = new SslcommerzClient(config);
      await expect(
        client.initPayment({
          tranId: 'TRAN-1',
          amountPoisha: 10000,
          appUrl: 'http://localhost:4000',
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws ApiError when response status is not SUCCESS', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'FAILED',
          failedreason: 'Store Credential Error',
        }),
      });

      const client = new SslcommerzClient(config);
      await expect(
        client.initPayment({
          tranId: 'TRAN-1',
          amountPoisha: 10000,
          appUrl: 'http://localhost:4000',
        }),
      ).rejects.toThrow(/Store Credential Error/);
    });
  });

  describe('validatePayment', () => {
    it('returns validation response on valid transaction', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'VALID',
          tran_id: 'TRAN-1',
          val_id: 'VAL-1',
          amount: '100.00',
          currency: 'BDT',
        }),
      });

      const client = new SslcommerzClient(config);
      const res = await client.validatePayment('VAL-1');
      expect(res.status).toBe('VALID');
      expect(res.tran_id).toBe('TRAN-1');
      expect(res.amount).toBe('100.00');
    });

    it('handles mock validation when PAYMENTS_MOCK is true', async () => {
      process.env.PAYMENTS_MOCK = 'true';
      const client = new SslcommerzClient(config);
      const res = await client.validatePayment('MOCK_VAL_TRAN-1_150.00');
      expect(res.status).toBe('VALID');
      expect(res.tran_id).toBe('TRAN-1');
      expect(res.amount).toBe('150.00');
      expect(res.currency).toBe('BDT');
    });

    it('throws ApiError on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      });

      const client = new SslcommerzClient(config);
      await expect(client.validatePayment('VAL-1')).rejects.toThrow(ApiError);
    });
  });

  describe('queryTransaction', () => {
    it('returns transaction status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          APIConnect: 'DONE',
          no_of_trans_found: 1,
          element: [
            {
              status: 'VALID',
              tran_id: 'TRAN-1',
              val_id: 'VAL-1',
              amount: '100.00',
              currency_type: 'BDT',
            },
          ],
        }),
      });

      const client = new SslcommerzClient(config);
      const res = await client.queryTransaction('TRAN-1');
      expect(res.APIConnect).toBe('DONE');
      expect(res.element?.[0]?.status).toBe('VALID');
    });

    it('handles mock query when PAYMENTS_MOCK is true', async () => {
      process.env.PAYMENTS_MOCK = 'true';
      const client = new SslcommerzClient(config);
      const res = await client.queryTransaction('TRAN-1');
      expect(res.APIConnect).toBe('DONE');
      expect(res.no_of_trans_found).toBe(1);
    });

    it('throws ApiError on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });

      const client = new SslcommerzClient(config);
      await expect(client.queryTransaction('TRAN-1')).rejects.toThrow(ApiError);
    });
  });
});
