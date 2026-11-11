import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentsService, type PaymentContext } from './payments.service.js';
import { ApiError } from '../../lib/ApiError.js';
import type { Db } from '../../config/db.js';

describe('PaymentsService', () => {
  const mockTx = {
    leaseTenant: { findFirst: vi.fn(), findMany: vi.fn() },
    lease: { findFirst: vi.fn() },
    file: { findFirst: vi.fn() },
    payment: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    outboxMessage: { createMany: vi.fn() },
    caretakerBuilding: { findFirst: vi.fn(), findMany: vi.fn() },
    paymentAllocation: { create: vi.fn(), findMany: vi.fn() },
    bill: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
    creditEntry: { create: vi.fn(), findMany: vi.fn() },
    receipt: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  };

  const mockPrisma = {
    $tx: vi.fn().mockImplementation((_ctx, fn) => fn(mockTx)),
  } as unknown as Db;

  const service = new PaymentsService(mockPrisma);

  const tenantCtx: PaymentContext = {
    orgId: 'org-1',
    userId: 'user-tenant',
    role: 'tenant',
    membershipId: 'mem-tenant',
  };

  const landlordCtx: PaymentContext = {
    orgId: 'org-1',
    userId: 'user-landlord',
    role: 'landlord',
    membershipId: 'mem-landlord',
  };

  const caretakerCtx: PaymentContext = {
    orgId: 'org-1',
    userId: 'user-caretaker',
    role: 'caretaker',
    membershipId: 'mem-caretaker',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitClaim', () => {
    it('throws 403 when called by non-tenant', async () => {
      await expect(
        service.submitClaim(landlordCtx, {
          leaseId: 'l-1',
          amountPoisha: 5000,
          method: 'bkash',
          paidOn: '2026-11-11',
        }),
      ).rejects.toThrow('Payment claims can only be submitted by tenants');
    });

    it('throws 404 when lease not found for tenant', async () => {
      mockTx.leaseTenant.findFirst.mockResolvedValue(null);
      await expect(
        service.submitClaim(tenantCtx, {
          leaseId: 'l-nonexistent',
          amountPoisha: 5000,
          method: 'bkash',
          paidOn: '2026-11-11',
        }),
      ).rejects.toThrow('Lease not found');
    });

    it('throws 409 DUPLICATE_REFERENCE on duplicate reference', async () => {
      mockTx.leaseTenant.findFirst.mockResolvedValue({ id: 'lt-1' });
      mockTx.payment.findFirst.mockResolvedValue({ id: 'pay-existing' });

      await expect(
        service.submitClaim(tenantCtx, {
          leaseId: 'l-1',
          amountPoisha: 5000,
          method: 'bkash',
          reference: 'BKASH-123',
          paidOn: '2026-11-11',
        }),
      ).rejects.toThrow(ApiError);
    });

    it('submits claim and writes outbox event', async () => {
      mockTx.leaseTenant.findFirst.mockResolvedValue({ id: 'lt-1' });
      mockTx.payment.findFirst.mockResolvedValue(null);
      mockTx.payment.create.mockResolvedValue({
        id: 'pay-1',
        orgId: 'org-1',
        leaseId: 'l-1',
        amountPoisha: 5000n,
        method: 'bkash',
        status: 'pending_claim',
        reference: 'BKASH-123',
        paidOn: new Date('2026-11-11'),
        submittedBy: 'user-tenant',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.submitClaim(tenantCtx, {
        leaseId: 'l-1',
        amountPoisha: 5000,
        method: 'bkash',
        reference: 'BKASH-123',
        paidOn: '2026-11-11',
      });

      expect(res.id).toBe('pay-1');
      expect(mockTx.outboxMessage.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ type: 'payment.claim_submitted' })],
      });
    });
  });

  describe('recordPayment', () => {
    it('throws 403 when called by tenant', async () => {
      await expect(
        service.recordPayment(tenantCtx, {
          leaseId: 'l-1',
          amountPoisha: 5000,
          method: 'cash',
          paidOn: '2026-11-11',
        }),
      ).rejects.toThrow('Only landlords and caretakers can record payments');
    });

    it('throws 404 when caretaker is not assigned to the lease building', async () => {
      mockTx.lease.findFirst.mockResolvedValue({
        id: 'l-1',
        unit: { buildingId: 'b-other' },
      });
      mockTx.caretakerBuilding.findFirst.mockResolvedValue(null);

      await expect(
        service.recordPayment(caretakerCtx, {
          leaseId: 'l-1',
          amountPoisha: 5000,
          method: 'cash',
          paidOn: '2026-11-11',
        }),
      ).rejects.toThrow('Building not found or not assigned to caretaker');
    });

    it('records payment, allocates to bills, issues receipt and writes outbox', async () => {
      mockTx.lease.findFirst.mockResolvedValue({
        id: 'l-1',
        unit: { buildingId: 'b-1' },
      });
      mockTx.payment.findFirst.mockResolvedValue(null);
      mockTx.payment.create.mockResolvedValue({
        id: 'pay-rec',
        orgId: 'org-1',
        leaseId: 'l-1',
        amountPoisha: 10000n,
        method: 'cash',
        status: 'confirmed',
        paidOn: new Date('2026-11-11'),
        submittedBy: 'user-landlord',
        confirmedBy: 'user-landlord',
        confirmedAt: new Date(),
      });

      // Mock locked bills
      mockTx.$queryRaw
        .mockResolvedValueOnce([]) // lease lock
        .mockResolvedValueOnce([
          {
            id: 'bill-1',
            period_month: '2026-11-01',
            total_poisha: 10000n,
            paid_poisha: 0n,
            status: 'issued',
          },
        ]) // locked unpaid bills
        .mockResolvedValueOnce([{ last_seq: 1 }]); // receipt counter

      mockTx.paymentAllocation.create.mockResolvedValue({
        id: 'alloc-1',
        billId: 'bill-1',
        amountPoisha: 10000n,
      });

      mockTx.receipt.create.mockResolvedValue({
        id: 'rcpt-1',
        number: 'BM-2026-000001',
        status: 'valid',
      });

      const res = await service.recordPayment(landlordCtx, {
        leaseId: 'l-1',
        amountPoisha: 10000,
        method: 'cash',
        paidOn: '2026-11-11',
      });

      expect(res.id).toBe('pay-rec');
      expect(mockTx.paymentAllocation.create).toHaveBeenCalled();
      expect(mockTx.receipt.create).toHaveBeenCalled();
      expect(mockTx.outboxMessage.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ type: 'payment.confirmed' })],
      });
    });
  });

  describe('rejectPayment', () => {
    it('requires a non-empty reason', async () => {
      await expect(service.rejectPayment(landlordCtx, 'pay-1', '  ')).rejects.toThrow(
        'Reason is required to reject a payment',
      );
    });

    it('rejects pending_claim payment', async () => {
      mockTx.$queryRaw.mockResolvedValueOnce([{ id: 'pay-1', lease_id: 'l-1', status: 'pending_claim' }]);
      mockTx.payment.update.mockResolvedValue({
        id: 'pay-1',
        orgId: 'org-1',
        leaseId: 'l-1',
        status: 'rejected',
        rejectedReason: 'Invalid ref',
        paidOn: new Date(),
      });

      const res = await service.rejectPayment(landlordCtx, 'pay-1', 'Invalid ref');
      expect(res.status).toBe('rejected');
      expect(mockTx.outboxMessage.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ type: 'payment.rejected' })],
      });
    });
  });

  describe('voidPayment', () => {
    it('throws 403 when called by non-landlord', async () => {
      await expect(service.voidPayment(caretakerCtx, 'pay-1', 'Reason')).rejects.toThrow(
        'Only landlords can void payments',
      );
    });

    it('throws 400 when reason is missing', async () => {
      await expect(service.voidPayment(landlordCtx, 'pay-1', '')).rejects.toThrow(
        'Reason is required to void a payment',
      );
    });

    it('executes app_void_payment and marks receipt void', async () => {
      mockTx.$queryRaw
        .mockResolvedValueOnce([{ id: 'pay-1', lease_id: 'l-1', status: 'confirmed', amount_poisha: 10000n }])
        .mockResolvedValueOnce([]) // lease lock
        .mockResolvedValueOnce([{ balance: 0n }]) // credit balance
        .mockResolvedValueOnce([]) // app_void_payment
        .mockResolvedValueOnce([{ id: 'bill-1' }]) // bill lock
        .mockResolvedValueOnce([{ sum: 0n }]) // alloc sum
        .mockResolvedValueOnce([{ sum: 0n }]) // applied credit
        .mockResolvedValueOnce([{ sum: 0n }]); // reversed credit

      mockTx.paymentAllocation.findMany.mockResolvedValue([{ billId: 'bill-1' }]);
      mockTx.creditEntry.findMany.mockResolvedValue([]);
      mockTx.bill.findUniqueOrThrow.mockResolvedValue({ id: 'bill-1', totalPoisha: 10000n, status: 'paid' });
      mockTx.payment.update.mockResolvedValue({
        id: 'pay-1',
        orgId: 'org-1',
        leaseId: 'l-1',
        status: 'void',
        voidReason: 'Mistake',
        paidOn: new Date(),
      });
      mockTx.receipt.findFirst.mockResolvedValue({
        id: 'r-1',
        number: 'BM-2026-000001',
        status: 'void',
      });

      const res = await service.voidPayment(landlordCtx, 'pay-1', 'Mistake');
      expect(res.status).toBe('void');
      expect(mockTx.$executeRaw).toHaveBeenCalled();
      expect(mockTx.receipt.updateMany).toHaveBeenCalledWith({
        where: { paymentId: 'pay-1' },
        data: expect.objectContaining({ status: 'void' }),
      });
    });
  });

  describe('listPayments', () => {
    it('scopes caretaker to their assigned buildings', async () => {
      mockTx.caretakerBuilding.findMany.mockResolvedValue([{ buildingId: 'b-1' }]);
      mockTx.payment.findMany.mockResolvedValue([]);

      await service.listPayments(caretakerCtx, { limit: 20 });
      expect(mockTx.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            lease: { unit: { buildingId: { in: ['b-1'] } } },
          }),
        }),
      );
    });

    it('rejects caretaker filtering by unassigned building', async () => {
      mockTx.caretakerBuilding.findMany.mockResolvedValue([{ buildingId: 'b-1' }]);
      await expect(
        service.listPayments(caretakerCtx, { limit: 20, buildingId: 'b-unassigned' }),
      ).rejects.toThrow('Building not found');
    });
  });
});
