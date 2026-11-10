import { describe, it, expect, vi } from 'vitest';
import { BuildingsService } from './buildings.service';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';

describe('BuildingsService', () => {
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

  const sampleBuilding = {
    id: 'b-1',
    orgId: 'org-1',
    name: 'Green Villa',
    address: 'Road 5',
    area: 'Dhanmondi',
    city: 'Dhaka',
    lat: 23.7461,
    lng: 90.3742,
    billDay: 1,
    dueDay: 10,
    graceDays: 3,
    lateFeeType: 'flat',
    lateFeeValue: 50000,
    electricityRatePoisha: 1200,
    archivedAt: null,
    createdAt: new Date(),
    units: [
      {
        id: 'u-1',
        archivedAt: null,
        leases: [{ id: 'lease-1', status: 'active' }],
      },
      {
        id: 'u-2',
        archivedAt: null,
        leases: [],
      },
    ],
  };

  describe('listBuildings', () => {
    it('returns all active buildings for a landlord with unit and occupied counts', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findMany: vi.fn().mockResolvedValue([sampleBuilding]),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.listBuildings(landlordCtx, 'mem-1');
      expect(res).toHaveLength(1);
      expect(res[0]?.name).toBe('Green Villa');
      expect(res[0]?.unitCount).toBe(2);
      expect(res[0]?.occupiedCount).toBe(1);
    });

    it('returns only assigned buildings for a caretaker', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            caretakerBuilding: {
              findMany: vi.fn().mockResolvedValue([{ buildingId: 'b-1' }]),
            },
            building: {
              findMany: vi.fn().mockResolvedValue([sampleBuilding]),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.listBuildings(caretakerCtx, 'mem-caretaker');
      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('b-1');
    });

    it('returns empty list for a caretaker with no assigned buildings', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            caretakerBuilding: {
              findMany: vi.fn().mockResolvedValue([]),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.listBuildings(caretakerCtx, 'mem-caretaker');
      expect(res).toEqual([]);
    });

    it('returns building of active lease for a tenant', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            leaseTenant: {
              findMany: vi.fn().mockResolvedValue([
                {
                  lease: {
                    unit: { buildingId: 'b-1' },
                  },
                },
              ]),
            },
            building: {
              findMany: vi.fn().mockResolvedValue([sampleBuilding]),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.listBuildings(tenantCtx, 'mem-tenant');
      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('b-1');
    });
  });

  describe('getBuilding', () => {
    it('returns building details when landlord requests it', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.getBuilding(landlordCtx, 'b-1', 'mem-1');
      expect(res.name).toBe('Green Villa');
    });

    it('throws notFound if caretaker is not assigned to the building', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            caretakerBuilding: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.getBuilding(caretakerCtx, 'b-1', 'mem-caretaker')).rejects.toThrow(ApiError);
    });

    it('throws notFound if tenant has no lease in the building', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            leaseTenant: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.getBuilding(tenantCtx, 'b-1', 'mem-tenant')).rejects.toThrow(ApiError);
    });
  });

  describe('createBuilding', () => {
    it('creates a building with trimmed strings and default counts', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              create: vi.fn().mockResolvedValue({
                ...sampleBuilding,
                name: 'Sunrise Villa',
                units: [],
              }),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.createBuilding(landlordCtx, {
        name: '  Sunrise Villa  ',
        address: '  Road 10  ',
        area: 'Banani',
        city: 'Dhaka',
        billDay: 1,
        dueDay: 10,
        graceDays: 3,
        lateFeeType: 'flat',
        lateFeeValue: 50000,
        electricityRatePoisha: 1200,
      });

      expect(res.name).toBe('Sunrise Villa');
      expect(res.unitCount).toBe(0);
      expect(res.occupiedCount).toBe(0);
    });
  });

  describe('updateBuilding', () => {
    it('updates building fields', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
              update: vi.fn().mockResolvedValue({
                ...sampleBuilding,
                name: 'Renamed Villa',
              }),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.updateBuilding(landlordCtx, 'b-1', { name: 'Renamed Villa' });
      expect(res.name).toBe('Renamed Villa');
    });

    it('throws notFound when building does not exist', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.updateBuilding(landlordCtx, 'b-none', { name: 'Renamed' })).rejects.toThrow(
        ApiError,
      );
    });

    it('rejects update if patched billDay exceeds existing dueDay', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding), // billDay: 1, dueDay: 10
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.updateBuilding(landlordCtx, 'b-1', { billDay: 15 })).rejects.toThrow(
        /Validation failed/,
      );
    });

    it('rejects update if percentage late fee exceeds 10000 bps (100%) against merged values', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue({
                ...sampleBuilding,
                lateFeeType: 'percent',
                lateFeeValue: 500,
              }),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.updateBuilding(landlordCtx, 'b-1', { lateFeeValue: 10500 })).rejects.toThrow(
        /Validation failed/,
      );
    });
  });

  describe('archiveBuilding', () => {
    it('archives building if no active or pending leases exist', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
              update: vi.fn().mockResolvedValue({
                ...sampleBuilding,
                archivedAt: new Date(),
              }),
            },
            lease: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.archiveBuilding(landlordCtx, 'b-1');
      expect(res.success).toBe(true);
    });

    it('throws 409 conflict if live leases exist', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
            },
            lease: {
              findFirst: vi.fn().mockResolvedValue({ id: 'live-lease' }),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(service.archiveBuilding(landlordCtx, 'b-1')).rejects.toThrow(ApiError);
    });
  });

  describe('units management', () => {
    const sampleUnit = {
      id: 'u-1',
      orgId: 'org-1',
      buildingId: 'b-1',
      label: '2A',
      floor: 2,
      type: 'family_flat',
      defaultRentPoisha: BigInt(2500000),
      electricityMode: 'submeter',
      archivedAt: null,
      createdAt: new Date(),
      charges: [],
      leases: [],
    };

    it('lists units for a building', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
            },
            unit: {
              findMany: vi.fn().mockResolvedValue([sampleUnit]),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.listUnits(landlordCtx, 'b-1', 'mem-1');
      expect(res).toHaveLength(1);
      expect(res[0]?.label).toBe('2A');
    });

    it('creates a unit with recurring charges', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
            },
            unit: {
              findFirst: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue(sampleUnit),
            },
            unitCharge: {
              create: vi.fn().mockResolvedValue({
                id: 'ch-1',
                name: 'Water',
                amountPoisha: BigInt(100000),
              }),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.createUnit(landlordCtx, 'b-1', {
        label: '2A',
        floor: 2,
        type: 'family_flat',
        defaultRentPoisha: 2500000,
        electricityMode: 'submeter',
        charges: [
          {
            name: 'Water',
            amountPoisha: 100000,
          },
        ],
      });

      expect(res.label).toBe('2A');
      expect(res.charges).toHaveLength(1);
    });

    it('throws 409 conflict on duplicate unit label in building', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            building: {
              findFirst: vi.fn().mockResolvedValue(sampleBuilding),
            },
            unit: {
              findFirst: vi.fn().mockResolvedValue(sampleUnit),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      await expect(
        service.createUnit(landlordCtx, 'b-1', {
          label: '2A',
          floor: 2,
          type: 'family_flat',
          defaultRentPoisha: 2500000,
          electricityMode: 'submeter',
        }),
      ).rejects.toThrow(ApiError);
    });

    it('updates unit fields and charges', async () => {
      const mockDb = {
        $tx: vi.fn().mockImplementation(async (_ctx, fn) => {
          return fn({
            unit: {
              findFirst: vi.fn().mockResolvedValueOnce(sampleUnit).mockResolvedValueOnce(null),
              update: vi.fn().mockResolvedValue({
                ...sampleUnit,
                label: '2A-Renamed',
                charges: [
                  {
                    id: 'ch-2',
                    name: 'Gas',
                    amountPoisha: BigInt(80000),
                  },
                ],
              }),
            },
            unitCharge: {
              deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
              create: vi.fn().mockResolvedValue({
                id: 'ch-2',
                name: 'Gas',
                amountPoisha: BigInt(80000),
              }),
            },
            lease: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      } as unknown as Db;

      const service = new BuildingsService(mockDb);
      const res = await service.updateUnit(landlordCtx, 'u-1', {
        label: '2A-Renamed',
        charges: [{ name: 'Gas', amountPoisha: 80000 }],
      });

      expect(res.label).toBe('2A-Renamed');
      expect(res.charges).toHaveLength(1);
    });
  });
});
