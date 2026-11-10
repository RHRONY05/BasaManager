import { describe, it, expect, vi } from 'vitest';
import { BillingService, type BillingContext } from './billing.service.js';
import type { Db } from '../../config/db.js';
import { ApiError } from '../../lib/ApiError.js';

describe('BillingService', () => {
  const landlordCtx: BillingContext = {
    orgId: 'org-1',
    userId: 'u-landlord',
    role: 'landlord',
    membershipId: 'mem-landlord',
    isAdmin: false,
  };

  const caretakerCtx: BillingContext = {
    orgId: 'org-1',
    userId: 'u-caretaker',
    role: 'caretaker',
    membershipId: 'mem-caretaker',
    isAdmin: false,
  };

  const tenantCtx: BillingContext = {
    orgId: 'org-1',
    userId: 'u-tenant',
    role: 'tenant',
    membershipId: 'mem-tenant',
    isAdmin: false,
  };

  const sampleBuilding = {
    id: 'b-1',
    orgId: 'org-1',
    name: 'Padma Heights',
    electricityRatePoisha: 900,
    dueDay: 10,
    units: [],
  };

  const sampleUnit = {
    id: 'unit-1',
    orgId: 'org-1',
    buildingId: 'b-1',
    label: '1A',
    floor: 1,
    electricityMode: 'submeter',
    currentSubmeterReading: 1200,
    submeterLastReadingDate: new Date('2026-10-01'),
    submeterMultiplier: 1,
    submeterReplacedAt: null,
    submeterPrevFinalReading: null,
    submeterNewStartReading: null,
    building: sampleBuilding,
    leases: [
      {
        id: 'lease-1',
        moveInReading: 1000,
      },
    ],
  };

  const sampleLease = {
    id: 'lease-1',
    orgId: 'org-1',
    unitId: 'unit-1',
    startDate: new Date('2026-01-01'),
    endDate: null,
    status: 'active',
    monthlyRentPoisha: BigInt(2000000),
    depositPoisha: BigInt(4000000),
    householdSize: 2,
    moveInReading: 1000,
    unit: sampleUnit,
    charges: [{ id: 'ch-1', name: 'Gas', amountPoisha: BigInt(80000) }],
    tenants: [{ userId: 'u-tenant', membershipId: 'mem-tenant', role: 'primary' }],
  };

  const sampleBill = {
    id: 'bill-1',
    orgId: 'org-1',
    leaseId: 'lease-1',
    unitId: 'unit-1',
    buildingId: 'b-1',
    periodMonth: new Date('2026-11-01'),
    status: 'draft',
    needsReading: false,
    issuedAt: null,
    issuedBy: null,
    lateFeeAppliedAt: null,
    voidReason: null,
    dueDate: new Date('2026-11-10'),
    createdAt: new Date('2026-11-01T00:00:00Z'),
    totalPoisha: BigInt(2135000),
    paidPoisha: BigInt(0),
    lines: [
      { id: 'l-1', kind: 'rent', label: 'Rent', amountPoisha: BigInt(2000000), meta: {}, reason: null },
      { id: 'l-2', kind: 'fixed_charge', label: 'Gas', amountPoisha: BigInt(80000), meta: {}, reason: null },
      {
        id: 'l-3',
        kind: 'submeter_electricity',
        label: 'Electricity',
        amountPoisha: BigInt(55000),
        meta: { prev: 1200, curr: 1250, units: 50, ratePoisha: 900 },
        reason: null,
      },
    ],
    allocations: [],
    lease: {
      ...sampleLease,
      unit: sampleUnit,
      tenants: [{ userId: 'u-tenant', membershipId: 'mem-tenant', role: 'primary' }],
    },
    unit: sampleUnit,
    building: sampleBuilding,
  };

  type MockDbOverrides = Record<string, Record<string, unknown>>;

  function createMockDb(overrides: MockDbOverrides = {}): Db {
    const defaultBillResolver = vi.fn().mockResolvedValue(sampleBill);

    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'lease-1' }]),
      $queryRaw: vi.fn().mockImplementation((queryParts: unknown) => {
        const sql = String(Array.isArray(queryParts) ? queryParts[0] : (queryParts ?? ''));
        if (sql.includes('credit_entries')) {
          return Promise.resolve([{ sum: '300000' }]);
        }
        return Promise.resolve([{ id: 'lease-1' }]);
      }),
      building: {
        findFirst: vi.fn().mockResolvedValue(sampleBuilding),
        findUnique: vi.fn().mockResolvedValue({
          ...sampleBuilding,
          units: [
            {
              id: 'unit-1',
              electricityMode: 'direct_postpaid',
              leases: [sampleLease],
            },
          ],
        }),
        ...overrides.building,
      },
      caretakerBuilding: {
        findFirst: vi.fn().mockResolvedValue({ buildingId: 'b-1' }),
        findUnique: vi.fn().mockResolvedValue({ buildingId: 'b-1' }),
        findMany: vi.fn().mockResolvedValue([{ buildingId: 'b-1' }]),
        ...overrides.caretakerBuilding,
      },
      unit: {
        findFirst: vi.fn().mockResolvedValue(sampleUnit),
        findUnique: vi.fn().mockResolvedValue(sampleUnit),
        findMany: vi.fn().mockResolvedValue([sampleUnit]),
        update: vi.fn().mockResolvedValue(sampleUnit),
        ...overrides.unit,
      },
      lease: {
        findFirst: vi.fn().mockResolvedValue(sampleLease),
        findUnique: vi.fn().mockResolvedValue(sampleLease),
        findMany: vi.fn().mockResolvedValue([sampleLease]),
        ...overrides.lease,
      },
      leaseTenant: {
        findFirst: vi.fn().mockResolvedValue({ leaseId: 'lease-1' }),
        findMany: vi.fn().mockResolvedValue([{ leaseId: 'lease-1' }]),
        ...overrides.leaseTenant,
      },
      bill: {
        findFirst: defaultBillResolver,
        findUnique: defaultBillResolver,
        findMany: vi.fn().mockResolvedValue([sampleBill]),
        create: vi.fn().mockResolvedValue(sampleBill),
        update: vi.fn().mockResolvedValue(sampleBill),
        ...overrides.bill,
      },
      billLine: {
        create: vi.fn().mockResolvedValue({ id: 'line-new' }),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
        update: vi.fn().mockResolvedValue({ id: 'line-upd' }),
        ...overrides.billLine,
      },
      meterReading: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'mr-1', reading: 1250 }),
        update: vi.fn().mockResolvedValue({ id: 'mr-1', reading: 1250 }),
        upsert: vi.fn().mockResolvedValue({ id: 'mr-1', reading: 1250 }),
        ...overrides.meterReading,
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
        ...overrides.payment,
      },
      paymentAllocation: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'alloc-1' }),
        ...overrides.paymentAllocation,
      },
      creditEntry: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'credit-1' }),
        ...overrides.creditEntry,
      },
      outboxMessage: {
        create: vi.fn().mockResolvedValue({ id: 'out-1' }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        ...overrides.outboxMessage,
      },
    };

    return {
      $tx: vi.fn().mockImplementation(async (_ctx, cb) => cb(tx)),
      $queryRaw: vi.fn().mockResolvedValue([{ sum: '0' }]),
    } as unknown as Db;
  }

  describe('runGeneration', () => {
    it('throws 404 when building is not found', async () => {
      const db = createMockDb({
        building: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.runGeneration(landlordCtx, { buildingId: 'b-missing', month: '2026-11' }),
      ).rejects.toThrow(ApiError);
    });

    it('generates bill when no prior bill exists for the month', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(sampleBill),
        },
      });
      const service = new BillingService(db);
      const res = await service.runGeneration(landlordCtx, { buildingId: 'b-1', month: '2026-11' });
      expect(res.created).toBe(1);
      expect(res.skipped).toBe(0);
    });

    it('skips bill generation if bill already exists', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(sampleBill),
        },
      });
      const service = new BillingService(db);
      const res = await service.runGeneration(landlordCtx, { buildingId: 'b-1', month: '2026-11' });
      expect(res.created).toBe(0);
      expect(res.skipped).toBe(1);
    });
  });

  describe('enterReading submeter validation', () => {
    it('throws 400 if unit electricityMode is not submeter', async () => {
      const db = createMockDb({
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleUnit,
            electricityMode: 'direct_postpaid',
          }),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.enterReading(landlordCtx, { unitId: 'unit-1', month: '2026-11', reading: 1300 }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 if reading is less than previous reading without replacement', async () => {
      const db = createMockDb({
        meterReading: {
          findFirst: vi.fn().mockResolvedValue({ reading: 1200 }),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.enterReading(landlordCtx, { unitId: 'unit-1', month: '2026-11', reading: 1100 }),
      ).rejects.toThrow(ApiError);
    });

    it('successfully enters valid meter reading', async () => {
      const db = createMockDb({
        meterReading: {
          findFirst: vi.fn().mockResolvedValue({ reading: 1200 }),
          upsert: vi
            .fn()
            .mockResolvedValue({ id: 'mr-1', reading: 1250, periodMonth: new Date('2026-11-01') }),
        },
      });
      const service = new BillingService(db);
      const res = await service.enterReading(landlordCtx, {
        unitId: 'unit-1',
        month: '2026-11',
        reading: 1250,
      });
      expect(res.units).toBe(50);
      expect(res.amountPoisha).toBe(45000); // 50 units * 900 poisha
    });

    it('throws 404 if caretaker is not assigned to the building', async () => {
      const db = createMockDb({
        caretakerBuilding: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.enterReading(caretakerCtx, { unitId: 'unit-1', month: '2026-11', reading: 1300 }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe('voidBill restrictions', () => {
    it('throws 409 if bill has payments (paidPoisha > 0)', async () => {
      const paidBill = {
        ...sampleBill,
        status: 'issued',
        paidPoisha: BigInt(500000),
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(paidBill),
        },
      });
      const service = new BillingService(db);
      await expect(service.voidBill(landlordCtx, 'bill-1', { reason: 'Test' })).rejects.toThrow(ApiError);
    });

    it('throws 409 if bill status is already void', async () => {
      const voidBill = {
        ...sampleBill,
        status: 'void',
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(voidBill),
        },
      });
      const service = new BillingService(db);
      await expect(service.voidBill(landlordCtx, 'bill-1', { reason: 'Test' })).rejects.toThrow(ApiError);
    });

    it('throws 409 if bill status is paid', async () => {
      const paidBill = {
        ...sampleBill,
        status: 'paid',
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(paidBill),
        },
      });
      const service = new BillingService(db);
      await expect(service.voidBill(landlordCtx, 'bill-1', { reason: 'Test' })).rejects.toThrow(ApiError);
    });

    it('throws 409 if bill has payment allocations', async () => {
      const unpaidBill = {
        ...sampleBill,
        status: 'issued',
        paidPoisha: BigInt(0),
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(unpaidBill),
        },
        paymentAllocation: {
          count: vi.fn().mockResolvedValue(1),
        },
      });
      const service = new BillingService(db);
      await expect(service.voidBill(landlordCtx, 'bill-1', { reason: 'Test' })).rejects.toThrow(ApiError);
    });

    it('successfully voids an unpaid issued bill', async () => {
      const unpaidBill = {
        ...sampleBill,
        status: 'issued',
        paidPoisha: BigInt(0),
        allocations: [],
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(unpaidBill),
          update: vi.fn().mockResolvedValue({
            ...unpaidBill,
            status: 'void',
          }),
        },
      });
      const service = new BillingService(db);
      const res = await service.voidBill(landlordCtx, 'bill-1', { reason: 'Wrong tenant assigned' });
      expect(res.status).toBe('void');
    });
  });

  describe('addAdjustment validation and status recomputation', () => {
    it('throws 400 if adjustment would make total negative', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'issued',
            totalPoisha: BigInt(100000),
            paidPoisha: BigInt(0),
          }),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.addAdjustment(landlordCtx, 'bill-1', { amountPoisha: -200000, reason: 'Overdiscount' }),
      ).rejects.toThrow(ApiError);
    });

    it('throws 400 if adjustment makes total less than already paidPoisha', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'partially_paid',
            totalPoisha: BigInt(1000000),
            paidPoisha: BigInt(600000),
          }),
        },
      });
      const service = new BillingService(db);
      await expect(
        service.addAdjustment(landlordCtx, 'bill-1', {
          amountPoisha: -500000,
          reason: 'Discount exceeds balance',
        }),
      ).rejects.toThrow(ApiError);
    });

    it('recomputes status to paid when adjustment reduces balance to 0', async () => {
      let updatedStatus = '';
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'partially_paid',
            totalPoisha: BigInt(1000000),
            paidPoisha: BigInt(800000),
            lines: [],
            allocations: [],
          }),
          update: vi.fn().mockImplementation(({ data }) => {
            updatedStatus = data.status;
            return Promise.resolve({ ...sampleBill, ...data });
          }),
        },
      });
      const service = new BillingService(db);
      await service.addAdjustment(landlordCtx, 'bill-1', {
        amountPoisha: -200000,
        reason: 'Settlement discount',
      });
      expect(updatedStatus).toBe('paid');
    });
  });

  describe('waiveLateFee', () => {
    it('throws 404 if no late fee line exists on the bill', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'issued',
            lines: [{ id: 'l-1', kind: 'rent', amountPoisha: BigInt(2000000) }],
          }),
        },
      });
      const service = new BillingService(db);
      await expect(service.waiveLateFee(landlordCtx, 'bill-1', { reason: 'First offense' })).rejects.toThrow(
        ApiError,
      );
    });

    it('waives existing late fee and updates total', async () => {
      const lateFeeLine = { id: 'l-late', kind: 'late_fee', amountPoisha: BigInt(50000), label: 'Late Fee' };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'issued',
            totalPoisha: BigInt(2050000),
            paidPoisha: BigInt(0),
            lines: [lateFeeLine],
            allocations: [],
          }),
          update: vi.fn().mockResolvedValue({
            ...sampleBill,
            totalPoisha: BigInt(2000000),
            lines: [lateFeeLine],
          }),
        },
      });
      const service = new BillingService(db);
      const res = await service.waiveLateFee(landlordCtx, 'bill-1', { reason: 'Courtesy' });
      expect(res.totalPoisha).toBe(2000000);
    });
  });

  describe('Tenant bill visibility & privacy', () => {
    it('throws 404 when tenant queries a draft bill by id', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'draft',
          }),
        },
      });
      const service = new BillingService(db);
      await expect(service.getBillById(tenantCtx, 'bill-1')).rejects.toThrow(ApiError);
    });

    it('throws 404 when tenant accesses bill belonging to another lease', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'issued',
            lease: {
              ...sampleLease,
              tenants: [{ userId: 'other-user', membershipId: 'mem-other', role: 'primary' }],
            },
          }),
        },
      });
      const service = new BillingService(db);
      await expect(service.getBillById(tenantCtx, 'bill-1')).rejects.toThrow(ApiError);
    });

    it('returns issued bill when tenant is assigned to lease', async () => {
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue({
            ...sampleBill,
            status: 'issued',
          }),
        },
      });
      const service = new BillingService(db);
      const res = await service.getBillById(tenantCtx, 'bill-1');
      expect(res.id).toBe('bill-1');
    });

    it('listBills excludes drafts for tenant role', async () => {
      let capturedWhere: Record<string, unknown> = {};
      const db = createMockDb({
        bill: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            capturedWhere = where;
            return Promise.resolve([sampleBill]);
          }),
        },
      });
      const service = new BillingService(db);
      await service.listBills(tenantCtx, {});
      expect(capturedWhere.status).toEqual({ not: 'draft' });
    });
  });

  describe('issueBill & issueReadyBills', () => {
    it('throws 400 when issuing draft bill with missing submeter reading', async () => {
      const billMissingReading = {
        ...sampleBill,
        needsReading: true,
        lines: [
          { id: 'l-1', kind: 'rent', amountPoisha: BigInt(2000000), meta: {} },
          {
            id: 'l-missing',
            kind: 'submeter_electricity',
            amountPoisha: BigInt(0),
            meta: { missingReading: true },
          },
        ],
      };
      const db = createMockDb({
        bill: {
          findUnique: vi.fn().mockResolvedValue(billMissingReading),
        },
      });
      const service = new BillingService(db);
      await expect(service.issueBill(landlordCtx, 'bill-1')).rejects.toThrow(ApiError);
    });

    it('issues ready bills in batch skipping bills with missing readings', async () => {
      const readyBill = {
        ...sampleBill,
        id: 'bill-ready',
        lines: [{ id: 'l-1', kind: 'rent', amountPoisha: BigInt(2000000), meta: {} }],
        allocations: [],
      };
      const db = createMockDb({
        bill: {
          findMany: vi.fn().mockResolvedValue([readyBill]),
          findUnique: vi.fn().mockResolvedValue(readyBill),
          update: vi.fn().mockResolvedValue({ ...readyBill, status: 'issued' }),
        },
      });
      const service = new BillingService(db);
      const res = await service.issueReadyBills(landlordCtx, { buildingId: 'b-1', month: '2026-11' });
      expect(res.issued).toBe(1);
      expect(res.skipped).toBe(0);
    });
  });

  describe('getDues', () => {
    it('aggregates dues and available credit for tenant', async () => {
      const db = createMockDb({
        bill: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { ...sampleBill, status: 'issued', totalPoisha: BigInt(1500000), paidPoisha: BigInt(500000) },
            ]),
        },
      });
      const service = new BillingService(db);
      const dues = await service.getDues(tenantCtx);
      expect(dues.bills.length).toBe(1);
      expect(dues.creditPoisha).toBe(300000);
      expect(dues.totalPoisha).toBe(1000000); // balance of bill
    });
  });
});
