import type {
  CreateBuildingRequest,
  UpdateBuildingRequest,
  CreateUnitRequest,
  UpdateUnitRequest,
} from '@bm/shared/api/buildings';
import type { Db, TenantCtx } from '../../config/db';
import { ApiError } from '../../lib/ApiError';
import { clock } from '../../lib/clock';

interface BuildingUnitWithLeases {
  leases?: Array<{ id: string; status: string }>;
}

interface BuildingWithUnitsData {
  id: string;
  orgId: string;
  name: string;
  address: string;
  area: string;
  city: string;
  lat: unknown;
  lng: unknown;
  billDay: number;
  dueDay: number;
  graceDays: number;
  lateFeeType: string;
  lateFeeValue: number;
  electricityRatePoisha: number;
  archivedAt: Date | null;
  createdAt: Date;
  units?: BuildingUnitWithLeases[];
}

function toBuildingDto(b: BuildingWithUnitsData) {
  const units = b.units ?? [];
  const occupiedCount = units.filter((u) =>
    u.leases?.some((l) => l.status === 'active' || l.status === 'notice'),
  ).length;
  const noticeCount = units.filter((u) => u.leases?.some((l) => l.status === 'notice')).length;

  return {
    id: b.id,
    orgId: b.orgId,
    name: b.name,
    address: b.address,
    area: b.area,
    city: b.city,
    lat: b.lat ? Number(b.lat) : null,
    lng: b.lng ? Number(b.lng) : null,
    billDay: b.billDay,
    dueDay: b.dueDay,
    graceDays: b.graceDays,
    lateFeeType: b.lateFeeType as 'none' | 'flat' | 'percent',
    lateFeeValue: b.lateFeeValue,
    electricityRatePoisha: b.electricityRatePoisha,
    archivedAt: b.archivedAt,
    createdAt: b.createdAt,
    unitCount: units.length,
    occupiedCount,
    noticeCount,
  };
}

interface UnitData {
  id: string;
  buildingId: string;
  label: string;
  floor: number;
  type: string;
  defaultRentPoisha: bigint | number;
  electricityMode: string;
  archivedAt: Date | null;
  charges?: Array<{ id: string; name: string; amountPoisha: bigint | number }>;
}

interface LeaseSummaryData {
  id: string;
  status: string;
  monthlyRentPoisha: bigint | number;
}

function toUnitDto(u: UnitData, lease: LeaseSummaryData | null = null) {
  return {
    id: u.id,
    buildingId: u.buildingId,
    label: u.label,
    floor: u.floor,
    type: u.type as 'family_flat' | 'bachelor_flat' | 'room' | 'shop',
    defaultRentPoisha: Number(u.defaultRentPoisha),
    electricityMode: u.electricityMode as 'none' | 'prepaid' | 'submeter',
    archivedAt: u.archivedAt,
    charges: (u.charges ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      amountPoisha: Number(c.amountPoisha),
    })),
    lease: lease
      ? {
          id: lease.id,
          status: lease.status as 'pending' | 'active' | 'notice' | 'ended' | 'terminated',
          monthlyRentPoisha: Number(lease.monthlyRentPoisha),
        }
      : null,
  };
}

export class BuildingsService {
  constructor(private readonly prisma: Db) {}

  /**
   * Lists buildings visible to the caller (Landlord: all active org buildings;
   * Caretaker: assigned active buildings; Tenant: active building of own lease).
   */
  async listBuildings(tenantCtx: TenantCtx, membershipId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      let buildingIdsFilter: string[] | undefined;

      if (tenantCtx.role === 'caretaker') {
        const assignments = await tx.caretakerBuilding.findMany({
          where: {
            orgId: tenantCtx.orgId!,
            membershipId,
          },
          select: { buildingId: true },
        });
        const assignedIds = assignments.map((a) => a.buildingId);
        if (assignedIds.length === 0) {
          return [];
        }
        buildingIdsFilter = assignedIds;
      } else if (tenantCtx.role === 'tenant') {
        const leaseTenants = await tx.leaseTenant.findMany({
          where: {
            orgId: tenantCtx.orgId!,
            membershipId,
          },
          include: {
            lease: {
              include: {
                unit: {
                  select: { buildingId: true },
                },
              },
            },
          },
        });
        const ids = [...new Set(leaseTenants.map((lt) => lt.lease.unit.buildingId))];
        if (ids.length === 0) {
          return [];
        }
        buildingIdsFilter = ids;
      }

      const buildings = await tx.building.findMany({
        where: {
          orgId: tenantCtx.orgId!,
          archivedAt: null,
          ...(buildingIdsFilter ? { id: { in: buildingIdsFilter } } : {}),
        },
        include: {
          units: {
            where: { archivedAt: null },
            include: {
              leases: {
                where: { status: { in: ['active', 'notice'] } },
                select: { id: true, status: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return buildings.map((b) => toBuildingDto(b));
    });
  }

  /**
   * Retrieves single building details, scoped by role and permissions.
   */
  async getBuilding(tenantCtx: TenantCtx, buildingId: string, membershipId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      if (tenantCtx.role === 'caretaker') {
        const assigned = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: tenantCtx.orgId!,
            membershipId,
            buildingId,
          },
        });
        if (!assigned) {
          throw ApiError.notFound('Building not found');
        }
      } else if (tenantCtx.role === 'tenant') {
        const leaseTenant = await tx.leaseTenant.findFirst({
          where: {
            orgId: tenantCtx.orgId!,
            membershipId,
            lease: {
              unit: { buildingId },
            },
          },
        });
        if (!leaseTenant) {
          throw ApiError.notFound('Building not found');
        }
      }

      const b = await tx.building.findFirst({
        where: {
          id: buildingId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
        include: {
          units: {
            where: { archivedAt: null },
            include: {
              leases: {
                where: { status: { in: ['active', 'notice'] } },
                select: { id: true, status: true },
              },
            },
          },
        },
      });

      if (!b) {
        throw ApiError.notFound('Building not found');
      }

      return toBuildingDto(b);
    });
  }

  /**
   * Creates a building under the current organization (landlord only).
   */
  async createBuilding(tenantCtx: TenantCtx, data: CreateBuildingRequest) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const b = await tx.building.create({
        data: {
          orgId: tenantCtx.orgId!,
          name: data.name.trim(),
          address: data.address.trim(),
          area: data.area.trim(),
          city: data.city.trim(),
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          billDay: data.billDay,
          dueDay: data.dueDay,
          graceDays: data.graceDays,
          lateFeeType: data.lateFeeType,
          lateFeeValue: data.lateFeeValue,
          electricityRatePoisha: data.electricityRatePoisha,
        },
      });

      return toBuildingDto(b);
    });
  }

  /**
   * Updates an existing building (landlord only).
   */
  async updateBuilding(tenantCtx: TenantCtx, buildingId: string, data: UpdateBuildingRequest) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const existing = await tx.building.findFirst({
        where: {
          id: buildingId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!existing) {
        throw ApiError.notFound('Building not found');
      }

      const updated = await tx.building.update({
        where: { id: buildingId },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.address !== undefined ? { address: data.address.trim() } : {}),
          ...(data.area !== undefined ? { area: data.area.trim() } : {}),
          ...(data.city !== undefined ? { city: data.city.trim() } : {}),
          ...(data.lat !== undefined ? { lat: data.lat } : {}),
          ...(data.lng !== undefined ? { lng: data.lng } : {}),
          ...(data.billDay !== undefined ? { billDay: data.billDay } : {}),
          ...(data.dueDay !== undefined ? { dueDay: data.dueDay } : {}),
          ...(data.graceDays !== undefined ? { graceDays: data.graceDays } : {}),
          ...(data.lateFeeType !== undefined ? { lateFeeType: data.lateFeeType } : {}),
          ...(data.lateFeeValue !== undefined ? { lateFeeValue: data.lateFeeValue } : {}),
          ...(data.electricityRatePoisha !== undefined
            ? { electricityRatePoisha: data.electricityRatePoisha }
            : {}),
        },
        include: {
          units: {
            where: { archivedAt: null },
            include: {
              leases: {
                where: { status: { in: ['active', 'notice'] } },
                select: { id: true, status: true },
              },
            },
          },
        },
      });

      return toBuildingDto(updated);
    });
  }

  /**
   * Archives a building if it has no active or pending leases.
   */
  async archiveBuilding(tenantCtx: TenantCtx, buildingId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const b = await tx.building.findFirst({
        where: {
          id: buildingId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!b) {
        throw ApiError.notFound('Building not found');
      }

      const activeLease = await tx.lease.findFirst({
        where: {
          orgId: tenantCtx.orgId!,
          unit: { buildingId },
          status: { in: ['pending', 'active', 'notice'] },
        },
      });

      if (activeLease) {
        throw ApiError.conflict('Cannot archive building with active or pending leases');
      }

      await tx.building.update({
        where: { id: buildingId },
        data: { archivedAt: clock.now() },
      });

      return { success: true };
    });
  }

  /**
   * Lists units of a building with charges and current lease summary.
   */
  async listUnits(tenantCtx: TenantCtx, buildingId: string, membershipId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      if (tenantCtx.role === 'caretaker') {
        const assigned = await tx.caretakerBuilding.findFirst({
          where: {
            orgId: tenantCtx.orgId!,
            membershipId,
            buildingId,
          },
        });
        if (!assigned) {
          throw ApiError.notFound('Building not found');
        }
      }

      const b = await tx.building.findFirst({
        where: {
          id: buildingId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!b) {
        throw ApiError.notFound('Building not found');
      }

      const units = await tx.unit.findMany({
        where: {
          orgId: tenantCtx.orgId!,
          buildingId,
          archivedAt: null,
        },
        include: {
          charges: true,
          leases: {
            where: {
              status: { in: ['pending', 'active', 'notice'] },
            },
            select: {
              id: true,
              status: true,
              monthlyRentPoisha: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ floor: 'asc' }, { label: 'asc' }],
      });

      return units.map((u) => {
        const lease = u.leases[0] ?? null;
        return toUnitDto(u, lease);
      });
    });
  }

  /**
   * Creates a unit in a building with optional charges (landlord only).
   */
  async createUnit(tenantCtx: TenantCtx, buildingId: string, data: CreateUnitRequest) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const b = await tx.building.findFirst({
        where: {
          id: buildingId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!b) {
        throw ApiError.notFound('Building not found');
      }

      // Check unique label in building
      const duplicate = await tx.unit.findFirst({
        where: {
          orgId: tenantCtx.orgId!,
          buildingId,
          label: data.label.trim(),
          archivedAt: null,
        },
      });

      if (duplicate) {
        throw ApiError.conflict('A unit with this label already exists in this building');
      }

      try {
        const unit = await tx.unit.create({
          data: {
            orgId: tenantCtx.orgId!,
            buildingId,
            label: data.label.trim(),
            floor: data.floor,
            type: data.type,
            defaultRentPoisha: BigInt(data.defaultRentPoisha),
            electricityMode: data.electricityMode,
          },
        });

        const charges = [];
        if (data.charges && data.charges.length > 0) {
          for (const c of data.charges) {
            const createdCharge = await tx.unitCharge.create({
              data: {
                orgId: tenantCtx.orgId!,
                unitId: unit.id,
                name: c.name.trim(),
                amountPoisha: BigInt(c.amountPoisha),
              },
            });
            charges.push(createdCharge);
          }
        }

        return toUnitDto({ ...unit, charges }, null);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 'P2002') {
          throw ApiError.conflict('A unit with this label already exists in this building');
        }
        throw err;
      }
    });
  }

  /**
   * Updates an existing unit and replaces charges if specified (landlord only).
   */
  async updateUnit(tenantCtx: TenantCtx, unitId: string, data: UpdateUnitRequest) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const existing = await tx.unit.findFirst({
        where: {
          id: unitId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!existing) {
        throw ApiError.notFound('Unit not found');
      }

      if (data.label && data.label.trim() !== existing.label) {
        const duplicate = await tx.unit.findFirst({
          where: {
            orgId: tenantCtx.orgId!,
            buildingId: existing.buildingId,
            label: data.label.trim(),
            archivedAt: null,
            id: { not: unitId },
          },
        });
        if (duplicate) {
          throw ApiError.conflict('A unit with this label already exists in this building');
        }
      }

      if (data.charges !== undefined) {
        await tx.unitCharge.deleteMany({
          where: {
            orgId: tenantCtx.orgId!,
            unitId,
          },
        });

        for (const c of data.charges) {
          await tx.unitCharge.create({
            data: {
              orgId: tenantCtx.orgId!,
              unitId,
              name: c.name.trim(),
              amountPoisha: BigInt(c.amountPoisha),
            },
          });
        }
      }

      const updated = await tx.unit.update({
        where: { id: unitId },
        data: {
          ...(data.label !== undefined ? { label: data.label.trim() } : {}),
          ...(data.floor !== undefined ? { floor: data.floor } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.defaultRentPoisha !== undefined
            ? { defaultRentPoisha: BigInt(data.defaultRentPoisha) }
            : {}),
          ...(data.electricityMode !== undefined ? { electricityMode: data.electricityMode } : {}),
        },
        include: {
          charges: true,
        },
      });

      const activeLease = await tx.lease.findFirst({
        where: {
          orgId: tenantCtx.orgId!,
          unitId,
          status: { in: ['pending', 'active', 'notice'] },
        },
        select: {
          id: true,
          status: true,
          monthlyRentPoisha: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return toUnitDto(updated, activeLease);
    });
  }

  /**
   * Archives a unit if it has no active or pending leases.
   */
  async archiveUnit(tenantCtx: TenantCtx, unitId: string) {
    return this.prisma.$tx(tenantCtx, async (tx) => {
      const u = await tx.unit.findFirst({
        where: {
          id: unitId,
          orgId: tenantCtx.orgId!,
          archivedAt: null,
        },
      });

      if (!u) {
        throw ApiError.notFound('Unit not found');
      }

      const activeLease = await tx.lease.findFirst({
        where: {
          orgId: tenantCtx.orgId!,
          unitId,
          status: { in: ['pending', 'active', 'notice'] },
        },
      });

      if (activeLease) {
        throw ApiError.conflict('Cannot archive unit with active or pending leases');
      }

      await tx.unit.update({
        where: { id: unitId },
        data: { archivedAt: clock.now() },
      });

      return { success: true };
    });
  }
}
