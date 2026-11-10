import { describe, it, expect, vi } from 'vitest';
import { LeasesService } from './leases.service';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';

describe('LeasesService', () => {
  const landlordCtx: TenantCtx = {
    orgId: 'org-1',
    userId: 'u-landlord',
    role: 'landlord',
  };

  const caretakerCtx: TenantCtx = {
    orgId: 'org-1',
    userId: 'u-caretaker',
    role: 'caretaker',
  };

  const tenantCtx: TenantCtx = {
    orgId: 'org-1',
    userId: 'u-tenant',
    role: 'tenant',
  };

  const sampleUnit = {
    id: 'unit-1',
    orgId: 'org-1',
    buildingId: 'b-1',
    label: '1A',
    floor: 1,
    type: 'family_flat',
    building: { id: 'b-1', name: 'Shapla Tower' },
    archivedAt: null,
  };

  const sampleLease = {
    id: 'lease-1',
    orgId: 'org-1',
    unitId: 'unit-1',
    startDate: new Date('2026-01-01'),
    endDate: null,
    noticeDate: null,
    monthlyRentPoisha: BigInt(2000000),
    depositPoisha: BigInt(4000000),
    householdSize: 2,
    status: 'pending',
    moveInReading: 100,
    createdBy: 'u-landlord',
    createdAt: new Date(),
    updatedAt: new Date(),
    unit: sampleUnit,
    charges: [{ id: 'ch-1', name: 'Gas', amountPoisha: BigInt(80000) }],
    tenants: [],
    depositEntries: [
      { id: 'dep-1', kind: 'received', amountPoisha: BigInt(4000000) },
      { id: 'dep-2', kind: 'applied_to_dues', amountPoisha: BigInt(500000) },
    ],
  };

  function createMockDb(overrides: Record<string, Record<string, unknown>> = {}): Db {
    const tx = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        ...overrides.user,
      },
      unit: {
        findFirst: vi.fn().mockResolvedValue(sampleUnit),
        ...overrides.unit,
      },
      lease: {
        findFirst: vi.fn().mockResolvedValue(sampleLease),
        findUnique: vi.fn().mockResolvedValue(sampleLease),
        findMany: vi.fn().mockResolvedValue([sampleLease]),
        create: vi.fn().mockResolvedValue(sampleLease),
        update: vi.fn().mockResolvedValue(sampleLease),
        ...overrides.lease,
      },
      leaseCharge: {
        create: vi.fn().mockResolvedValue({ id: 'ch-1' }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        ...overrides.leaseCharge,
      },
      invitation: {
        create: vi.fn().mockResolvedValue({ id: 'inv-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        ...overrides.invitation,
      },
      outboxMessage: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        ...overrides.outboxMessage,
      },
      caretakerBuilding: {
        findMany: vi.fn().mockResolvedValue([{ buildingId: 'b-1' }]),
        findFirst: vi.fn().mockResolvedValue({ buildingId: 'b-1' }),
        ...overrides.caretakerBuilding,
      },
      depositEntry: {
        create: vi.fn().mockResolvedValue({
          id: 'dep-1',
          kind: 'received',
          amountPoisha: BigInt(4000000),
          note: 'Deposit paid',
          createdAt: new Date(),
        }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: 'dep-1', kind: 'received', amountPoisha: BigInt(4000000) }]),
        ...overrides.depositEntry,
      },
      membership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mem-1',
          userId: 'u-tenant',
          status: 'active',
          role: 'tenant',
          createdAt: new Date(),
          user: { fullName: 'Tenant User', email: 't@test.com' },
        }),
        ...overrides.membership,
      },
      leaseTenant: {
        findMany: vi.fn().mockResolvedValue([{ leaseId: 'lease-1', lease: sampleLease }]),
        ...overrides.leaseTenant,
      },
      bill: {
        findMany: vi.fn().mockResolvedValue([]),
        ...overrides.bill,
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        ...overrides.payment,
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'lease-1', status: 'active' }]),
    };

    return {
      $tx: vi.fn().mockImplementation(async (_ctx, cb) => cb(tx)),
    } as unknown as Db;
  }

  describe('createLease', () => {
    it('throws 403 if user is not a landlord', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(
        service.createLease(caretakerCtx, {
          unitId: 'unit-1',
          tenantEmail: 't@test.com',
          tenantName: 'Tenant',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [],
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws validation error if charges contain duplicate names', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(
        service.createLease(landlordCtx, {
          unitId: 'unit-1',
          tenantEmail: 't@test.com',
          tenantName: 'Tenant',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [
            { name: 'Service', amountPoisha: 1000 },
            { name: 'service', amountPoisha: 2000 },
          ],
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 404 if unit is not found', async () => {
      const db = createMockDb({
        unit: { findFirst: vi.fn().mockResolvedValue(null) },
      });
      const service = new LeasesService(db);

      await expect(
        service.createLease(landlordCtx, {
          unitId: 'unit-missing',
          tenantEmail: 't@test.com',
          tenantName: 'Tenant',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [],
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 409 if unit already has an active or pending lease', async () => {
      const db = createMockDb({
        lease: { findFirst: vi.fn().mockResolvedValue({ id: 'existing-lease' }) },
      });
      const service = new LeasesService(db);

      await expect(
        service.createLease(landlordCtx, {
          unitId: 'unit-1',
          tenantEmail: 't@test.com',
          tenantName: 'Tenant',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [],
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 409 if tenantEmail belongs to an active staff member in the organisation', async () => {
      const db = createMockDb({
        lease: { findFirst: vi.fn().mockResolvedValue(null) },
        user: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'u-caretaker',
            email: 'caretaker@test.com',
          }),
        },
      });
      const service = new LeasesService(db);

      await expect(
        service.createLease(landlordCtx, {
          unitId: 'unit-1',
          tenantEmail: 'caretaker@test.com',
          tenantName: 'Staff Member',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [],
        }),
      ).rejects.toThrow(/Cannot invite staff member/);
    });

    it('maps P2002 on invitation email to distinct conflict message', async () => {
      const db = createMockDb({
        lease: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue({
            code: 'P2002',
            meta: { target: ['invitations_one_open_per_email'] },
          }),
        },
      });
      const service = new LeasesService(db);

      await expect(
        service.createLease(landlordCtx, {
          unitId: 'unit-1',
          tenantEmail: 't@test.com',
          tenantName: 'Tenant',
          startDate: '2026-01-01',
          monthlyRentPoisha: 2000000,
          depositPoisha: 4000000,
          householdSize: 2,
          charges: [],
        }),
      ).rejects.toThrow(/An open invitation already exists for this email address/);
    });

    it('creates lease and returns DTO', async () => {
      const db = createMockDb({
        lease: { findFirst: vi.fn().mockResolvedValue(null) },
      });
      const service = new LeasesService(db);

      const result = await service.createLease(landlordCtx, {
        unitId: 'unit-1',
        tenantEmail: 't@test.com',
        tenantName: 'Tenant',
        startDate: '2026-01-01',
        monthlyRentPoisha: 2000000,
        depositPoisha: 4000000,
        householdSize: 2,
        charges: [{ name: 'Gas', amountPoisha: 80000 }],
      });

      expect(result.id).toBe('lease-1');
      expect(result.status).toBe('pending');
      expect(result.depositHeldPoisha).toBe(3500000); // 4000000 - 500000
    });
  });

  describe('listLeases', () => {
    it('throws 403 if tenant attempts to list leases', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(service.listLeases(tenantCtx, {})).rejects.toThrow(ApiError);
    });

    it('caretaker sees only leases from assigned buildings', async () => {
      const db = createMockDb({
        caretakerBuilding: {
          findMany: vi.fn().mockResolvedValue([{ buildingId: 'b-1' }]),
        },
      });
      const service = new LeasesService(db);

      const result = await service.listLeases(caretakerCtx, {});
      expect(result).toHaveLength(1);
    });

    it('caretaker filtering for unassigned building gets empty array', async () => {
      const db = createMockDb({
        caretakerBuilding: {
          findMany: vi.fn().mockResolvedValue([{ buildingId: 'b-1' }]),
        },
      });
      const service = new LeasesService(db);

      const result = await service.listLeases(caretakerCtx, { buildingId: 'b-other' });
      expect(result).toEqual([]);
    });
  });

  describe('getLease', () => {
    it('throws 404 if lease not found', async () => {
      const db = createMockDb({
        lease: { findFirst: vi.fn().mockResolvedValue(null) },
      });
      const service = new LeasesService(db);

      await expect(service.getLease(landlordCtx, 'missing')).rejects.toThrow(ApiError);
    });

    it('throws 404 if caretaker not assigned to unit building', async () => {
      const db = createMockDb({
        caretakerBuilding: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new LeasesService(db);

      await expect(service.getLease(caretakerCtx, 'lease-1')).rejects.toThrow(ApiError);
    });

    it('throws 404 if tenant is not on the lease', async () => {
      const db = createMockDb({
        lease: {
          findFirst: vi.fn().mockResolvedValue({
            ...sampleLease,
            tenants: [{ membership: { userId: 'u-other-tenant' } }],
          }),
        },
      });
      const service = new LeasesService(db);

      await expect(service.getLease(tenantCtx, 'lease-1')).rejects.toThrow(ApiError);
    });
  });

  describe('recordDeposit', () => {
    it('throws 403 if not landlord', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(
        service.recordDeposit(caretakerCtx, 'lease-1', {
          kind: 'received',
          amountPoisha: 100000,
        }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 409 if lease is ended', async () => {
      const db = createMockDb();
      (db as unknown as { $tx: unknown }).$tx = vi.fn().mockImplementation(async (_ctx, cb) =>
        cb({
          $queryRaw: vi.fn().mockResolvedValue([{ id: 'lease-1', status: 'ended' }]),
        }),
      );
      const service = new LeasesService(db);

      await expect(
        service.recordDeposit(landlordCtx, 'lease-1', {
          kind: 'received',
          amountPoisha: 100000,
        }),
      ).rejects.toThrow(/Cannot record deposit on an ended lease/);
    });

    it('throws 400 if refund exceeds current held deposit balance', async () => {
      const db = createMockDb({
        depositEntry: {
          findMany: vi.fn().mockResolvedValue([{ id: 'dep-1', kind: 'received', amountPoisha: 100000n }]),
        },
      });
      const service = new LeasesService(db);

      await expect(
        service.recordDeposit(landlordCtx, 'lease-1', {
          kind: 'refunded',
          amountPoisha: 200000,
        }),
      ).rejects.toThrow(/cannot exceed held deposit balance/);
    });

    it('records deposit entry', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      const result = await service.recordDeposit(landlordCtx, 'lease-1', {
        kind: 'received',
        amountPoisha: 100000,
        note: 'Initial deposit',
      });

      expect(result.id).toBe('dep-1');
      expect(result.amountPoisha).toBe(4000000);
    });
  });

  describe('resendInvite', () => {
    it('throws 403 if not landlord', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(service.resendInvite(caretakerCtx, 'lease-1')).rejects.toThrow(ApiError);
    });

    it('throws 409 if lease is no longer pending', async () => {
      const db = createMockDb({
        lease: { findFirst: vi.fn().mockResolvedValue({ id: 'lease-1', status: 'active' }) },
      });
      const service = new LeasesService(db);

      await expect(service.resendInvite(landlordCtx, 'lease-1')).rejects.toThrow(ApiError);
    });

    it('throws 409 if no invitation ever existed for this lease', async () => {
      const db = createMockDb({
        invitation: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new LeasesService(db);

      await expect(service.resendInvite(landlordCtx, 'lease-1')).rejects.toThrow(
        /No invitation found to resend/,
      );
    });

    it('resends invitation', async () => {
      const db = createMockDb({
        invitation: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'inv-1',
            email: 't@test.com',
            role: 'tenant',
            expiresAt: new Date(Date.now() + 86400000),
          }),
        },
      });
      const service = new LeasesService(db);

      const result = await service.resendInvite(landlordCtx, 'lease-1');
      expect(result).toEqual({ resent: true });
    });
  });

  describe('getTenantHistory', () => {
    it('throws 403 if not landlord', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      await expect(service.getTenantHistory(caretakerCtx, 'mem-1')).rejects.toThrow(ApiError);
    });

    it('throws 404 if tenant membership not found', async () => {
      const db = createMockDb({
        membership: { findFirst: vi.fn().mockResolvedValue(null) },
      });
      const service = new LeasesService(db);

      await expect(service.getTenantHistory(landlordCtx, 'mem-missing')).rejects.toThrow(ApiError);
    });

    it('returns history with tenant, leases, bills, payments', async () => {
      const db = createMockDb();
      const service = new LeasesService(db);

      const result = await service.getTenantHistory(landlordCtx, 'mem-1');
      expect(result.tenant.email).toBe('t@test.com');
      expect(result.leases).toHaveLength(1);
    });
  });
});
