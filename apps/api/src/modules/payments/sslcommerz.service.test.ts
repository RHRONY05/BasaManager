import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SslcommerzService, type SslcommerzServiceContext } from './sslcommerz.service.js';
import type { SslcommerzClient } from './sslcommerz.client.js';
import { ApiError } from '../../lib/ApiError.js';
import type { Db } from '../../config/db.js';
import type { Env } from '../../config/env.js';

describe('SslcommerzService', () => {
  const mockTx = {
    lease: { findFirst: vi.fn() },
    leaseTenant: { findFirst: vi.fn() },
    bill: { findMany: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    paymentIntent: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payment: { create: vi.fn() },
    paymentAllocation: { create: vi.fn() },
    creditEntry: { create: vi.fn() },
    receipt: { create: vi.fn(), findFirst: vi.fn() },
    outboxMessage: { createMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };

  const mockPrisma = {
    $tx: vi.fn().mockImplementation((_ctx, fn) => fn(mockTx)),
    $queryRaw: vi.fn(),
  } as unknown as Db;

  const mockClient = {
    initPayment: vi.fn(),
    validatePayment: vi.fn(),
    queryTransaction: vi.fn(),
  } as unknown as SslcommerzClient;

  const mockEnv = {
    SSLCOMMERZ_STORE_ID: 'store',
    SSLCOMMERZ_STORE_PASSWORD: 'pass',
    SSLCOMMERZ_SANDBOX: true,
    PAYMENTS_MOCK: false,
    APP_URL: 'http://localhost:4000',
  } as unknown as Env;

  const service = new SslcommerzService(mockPrisma, mockEnv, mockClient);

  const tenantCtx: SslcommerzServiceContext = {
    orgId: 'org-1',
    userId: 'u-tenant',
    role: 'tenant',
  };

  const landlordCtx: SslcommerzServiceContext = {
    orgId: 'org-1',
    userId: 'u-landlord',
    role: 'landlord',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initPayment', () => {
    it('throws 403 when called by non-tenant', async () => {
      await expect(service.initPayment(landlordCtx, { leaseId: 'l-1', amountPoisha: 10000 })).rejects.toThrow(
        ApiError,
      );
    });

    it('throws 404 when lease not found', async () => {
      mockTx.lease.findFirst.mockResolvedValue(null);
      await expect(
        service.initPayment(tenantCtx, { leaseId: 'l-none', amountPoisha: 10000 }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 404 when tenant does not belong to lease', async () => {
      mockTx.lease.findFirst.mockResolvedValue({ id: 'l-1', monthlyRentPoisha: 1500000 });
      mockTx.leaseTenant.findFirst.mockResolvedValue(null);
      await expect(service.initPayment(tenantCtx, { leaseId: 'l-1', amountPoisha: 10000 })).rejects.toThrow(
        ApiError,
      );
    });

    it('throws 400 when amount is below ৳100', async () => {
      mockTx.lease.findFirst.mockResolvedValue({ id: 'l-1', monthlyRentPoisha: 1500000 });
      mockTx.leaseTenant.findFirst.mockResolvedValue({ id: 'lt-1' });
      mockTx.bill.findMany.mockResolvedValue([]);

      await expect(service.initPayment(tenantCtx, { leaseId: 'l-1', amountPoisha: 5000 })).rejects.toThrow(
        ApiError,
      );
    });

    it('initializes payment and returns gatewayUrl', async () => {
      mockTx.lease.findFirst.mockResolvedValue({ id: 'l-1', monthlyRentPoisha: 1500000 });
      mockTx.leaseTenant.findFirst.mockResolvedValue({ id: 'lt-1' });
      mockTx.bill.findMany.mockResolvedValue([{ totalPoisha: 1500000, paidPoisha: 0 }]);
      mockTx.user.findUnique.mockResolvedValue({ fullName: 'Tenant User', email: 'tenant@test.com' });
      vi.mocked(mockClient.initPayment).mockResolvedValue({
        status: 'SUCCESS',
        GatewayPageURL: 'https://gateway.example.com/checkout',
        sessionkey: 'sess-123',
      });
      mockTx.paymentIntent.create.mockResolvedValue({ id: 'pi-1' });

      const res = await service.initPayment(tenantCtx, { leaseId: 'l-1', amountPoisha: 1500000 });
      expect(res.gatewayUrl).toBe('https://gateway.example.com/checkout');
      expect(res.tranId).toMatch(/^BM-/);
    });
  });

  describe('handleReturn', () => {
    it('redirects to /pay/result on success without modifying intent', async () => {
      const res = await service.handleReturn('success', { tran_id: 'TRAN-1' });
      expect(res.redirectUrl).toBe('http://localhost:4000/pay/result?tran=TRAN-1');
    });

    it('updates initiated intent to failed on fail return', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        { id: 'pi-1', org_id: 'org-1', status: 'initiated' },
      ]);

      const res = await service.handleReturn('fail', { tran_id: 'TRAN-1' });
      expect(res.redirectUrl).toBe('http://localhost:4000/pay/result?tran=TRAN-1');
      expect(mockTx.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } }),
      );
    });
  });

  describe('getIntent', () => {
    it('throws 404 when intent not found', async () => {
      mockTx.paymentIntent.findUnique.mockResolvedValue(null);
      await expect(service.getIntent(tenantCtx, 'TRAN-NONE')).rejects.toThrow(ApiError);
    });

    it('returns intent details when found for tenant on lease', async () => {
      mockTx.paymentIntent.findUnique.mockResolvedValue({
        id: 'pi-1',
        orgId: 'org-1',
        leaseId: 'l-1',
        tranId: 'TRAN-1',
        amountPoisha: 10000,
        status: 'confirmed',
        paymentId: 'pay-1',
        createdAt: new Date(),
      });
      mockTx.leaseTenant.findFirst.mockResolvedValue({ id: 'lt-1' });
      mockTx.receipt.findFirst.mockResolvedValue({ id: 'rec-1' });

      const res = await service.getIntent(tenantCtx, 'TRAN-1');
      expect(res.tranId).toBe('TRAN-1');
      expect(res.status).toBe('confirmed');
      expect(res.receiptId).toBe('rec-1');
    });
  });

  describe('handleIpn', () => {
    it('returns ignored when intent not found in DB', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([]);
      const res = await service.handleIpn({ tran_id: 'UNKNOWN' });
      expect(res.status).toBe('ignored');
    });

    it('returns already_confirmed when intent is already confirmed', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000,
          status: 'confirmed',
        },
      ]);
      const res = await service.handleIpn({ tran_id: 'TRAN-1' });
      expect(res.status).toBe('already_confirmed');
    });

    it('marks intent failed when payload has status FAILED', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000,
          status: 'initiated',
        },
      ]);

      const res = await service.handleIpn({ tran_id: 'TRAN-1', status: 'FAILED' });
      expect(res.status).toBe('failed');
      expect(mockTx.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } }),
      );
    });

    it('marks intent flagged on validation mismatch', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000,
          status: 'initiated',
        },
      ]);

      vi.mocked(mockClient.validatePayment).mockResolvedValue({
        status: 'VALID',
        tran_id: 'TRAN-1',
        val_id: 'VAL-1',
        amount: '50.00', // 5000 poisha != 10000 poisha
        currency: 'BDT',
      });

      const res = await service.handleIpn({ tran_id: 'TRAN-1', val_id: 'VAL-1', status: 'VALID' });
      expect(res.status).toBe('flagged');
      expect(mockTx.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'flagged' }),
        }),
      );
    });

    it('confirms payment, allocates bills and creates receipt on valid IPN', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValue([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000n,
          status: 'initiated',
          created_by: 'u-1',
        },
      ]);

      vi.mocked(mockClient.validatePayment).mockResolvedValue({
        status: 'VALID',
        tran_id: 'TRAN-1',
        val_id: 'VAL-1',
        amount: '100.00',
        currency: 'BDT',
      });

      mockTx.$queryRaw
        .mockResolvedValueOnce([{ id: 'pi-1', status: 'initiated' }]) // lockedIntent
        .mockResolvedValueOnce([{ id: 'l-1' }]) // lease lock
        .mockResolvedValueOnce([
          {
            id: 'b-1',
            period_month: new Date('2026-03-01'),
            total_poisha: 8000n,
            paid_poisha: 0n,
            status: 'issued',
          },
        ]) // bills lock
        .mockResolvedValueOnce([{ next_seq: 42 }]); // receipt counter upsert

      mockTx.payment.create.mockResolvedValue({ id: 'pay-1' });

      const res = await service.handleIpn({ tran_id: 'TRAN-1', val_id: 'VAL-1', status: 'VALID' });
      expect(res.status).toBe('confirmed');
      expect(mockTx.payment.create).toHaveBeenCalled();
      expect(mockTx.paymentAllocation.create).toHaveBeenCalled();
      expect(mockTx.creditEntry.create).toHaveBeenCalled(); // 2000 poisha overpayment credit
      expect(mockTx.receipt.create).toHaveBeenCalled();
      expect(mockTx.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pi-1' },
          data: expect.objectContaining({ status: 'confirmed' }),
        }),
      );
    });
  });

  describe('recheckPaymentIntents', () => {
    it('checks stale intents and confirms when gateway reports VALID', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000n,
          created_by: 'u-1',
        },
      ]);

      vi.mocked(mockClient.queryTransaction).mockResolvedValue({
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
      });

      mockTx.$queryRaw
        .mockResolvedValueOnce([{ id: 'pi-1', status: 'initiated' }])
        .mockResolvedValueOnce([{ id: 'l-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ next_seq: 1 }]);

      const summary = await service.recheckPaymentIntents({ cutoffMinutes: 30 });
      expect(summary.checked).toBe(1);
      expect(summary.confirmed).toBe(1);
    });

    it('marks intent failed when gateway query returns FAILED', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000n,
          created_by: 'u-1',
        },
      ]);

      vi.mocked(mockClient.queryTransaction).mockResolvedValue({
        APIConnect: 'DONE',
        no_of_trans_found: 1,
        element: [
          {
            status: 'FAILED',
            tran_id: 'TRAN-1',
            val_id: 'VAL-1',
            amount: '100.00',
          },
        ],
      });

      const summary = await service.recheckPaymentIntents({ cutoffMinutes: 30 });
      expect(summary.checked).toBe(1);
      expect(summary.failed).toBe(1);
    });

    it('marks intent flagged when gateway query amount mismatches', async () => {
      vi.mocked(mockPrisma.$queryRaw).mockResolvedValueOnce([
        {
          id: 'pi-1',
          org_id: 'org-1',
          lease_id: 'l-1',
          tran_id: 'TRAN-1',
          amount_poisha: 10000n,
          created_by: 'u-1',
        },
      ]);

      vi.mocked(mockClient.queryTransaction).mockResolvedValue({
        APIConnect: 'DONE',
        no_of_trans_found: 1,
        element: [
          {
            status: 'VALID',
            tran_id: 'TRAN-1',
            val_id: 'VAL-1',
            amount: '50.00',
          },
        ],
      });

      const summary = await service.recheckPaymentIntents({ cutoffMinutes: 30 });
      expect(summary.checked).toBe(1);
      expect(summary.flagged).toBe(1);
    });
  });
});
