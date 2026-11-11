import { ApiError } from '../../lib/ApiError.js';
import { ErrorCode } from '@bm/shared/errors';
import type { Db, Tx } from '../../config/db.js';
import type { Prisma } from '../../generated/prisma/client';
import {
  prorate,
  prorationFactor,
  electricityCharge,
  applyCreditToBill,
  waiveLateFee as pureWaiveLateFee,
  DomainError,
} from '@bm/domain';
import type {
  BillResponse,
  BillLineResponse,
  RunBillingInput,
  IssueReadyBillsInput,
  AddAdjustmentInput,
  WaiveLateFeeInput,
  VoidBillInput,
  MeterReadingInput,
  GetReadingsQuery,
  ListBillsQuery,
  DuesResponse,
} from '@bm/shared/api/billing';
import { clock, getDhakaDateString } from '../../lib/clock.js';
import type { MembershipRole } from '@bm/shared/enums';

export interface BillingContext {
  orgId: string;
  userId: string;
  role: MembershipRole | null;
  membershipId: string;
  isAdmin?: boolean;
}

function toDateString(d: Date | string): string {
  if (d instanceof Date) {
    return d.toISOString().slice(0, 10);
  }
  return String(d).slice(0, 10);
}

function parseMonthToDate(monthStr: string): Date {
  return new Date(`${monthStr.slice(0, 7)}-01T00:00:00.000Z`);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function computeDueDate(monthStr: string, dueDay: number): Date {
  const [y, m] = monthStr.split('-').map(Number);
  const maxDay = daysInMonth(y!, m!);
  const day = Math.min(Math.max(1, dueDay), maxDay);
  const dayStr = String(day).padStart(2, '0');
  return new Date(`${y}-${String(m).padStart(2, '0')}-${dayStr}T00:00:00.000Z`);
}

/**
 * Helper to find prior meter reading before periodMonth, or fallback to lease moveInReading.
 * Per Rule 3 (#28): The first bill of a lease uses the move-in reading as prev. Prior readings
 * from previous tenants (before this lease's start month) must not be charged to the new tenant.
 */
export async function resolvePreviousReading(
  tx: Tx,
  orgId: string,
  unitId: string,
  periodDate: Date,
  leaseMoveInReading?: number | null,
  leaseStartDate?: Date | string | null,
): Promise<number> {
  let leaseStartMonth: Date | undefined;
  if (leaseStartDate) {
    const d = typeof leaseStartDate === 'string' ? new Date(leaseStartDate) : leaseStartDate;
    leaseStartMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  const priorReading = await tx.meterReading.findFirst({
    where: {
      orgId,
      unitId,
      periodMonth: {
        lt: periodDate,
        ...(leaseStartMonth ? { gte: leaseStartMonth } : {}),
      },
    },
    orderBy: { periodMonth: 'desc' },
    select: { reading: true },
  });

  if (priorReading) {
    return priorReading.reading;
  }

  return leaseMoveInReading ?? 0;
}

export interface LeaseForBilling {
  id: string;
  startDate: Date | string;
  endDate?: Date | string | null;
  monthlyRentPoisha: bigint | number;
  moveInReading?: number | null;
  charges: Array<{
    id: string;
    name: string;
    amountPoisha: bigint | number;
  }>;
}

export interface BuildingForBilling {
  id: string;
  dueDay: number;
  electricityRatePoisha: number;
}

export interface UnitForBilling {
  id: string;
  electricityMode: string;
}

/**
 * Shared helper to build and persist a draft bill for a lease.
 * Used by both monthly generation (runGeneration) and immediate mid-month activation (generateFirstBillIfAfterBillDay).
 * Returns true if a bill was created, false if skipped (already exists or prorationFactor == 0).
 */
export async function createDraftBillForLease(
  tx: Tx,
  orgId: string,
  building: BuildingForBilling,
  unit: UnitForBilling,
  lease: LeaseForBilling,
  periodDate: Date,
  periodMonthStr: string,
): Promise<boolean> {
  // Check if bill already exists for this lease and month
  const existing = await tx.bill.findUnique({
    where: {
      orgId_leaseId_periodMonth: {
        orgId,
        leaseId: lease.id,
        periodMonth: periodDate,
      },
    },
  });

  if (existing) {
    return false;
  }

  // Compute proration based on lease start date and end date
  const startDateStr = toDateString(lease.startDate);
  const endDateStr = lease.endDate ? toDateString(lease.endDate) : undefined;
  const prorationInput = {
    periodMonth: periodMonthStr,
    moveInDate: startDateStr,
    moveOutDate: endDateStr,
  };
  const factor = prorationFactor(prorationInput);

  // #31: Skip leases that have not started yet in this period month (do not create empty ৳0 bill)
  if (factor === 0) {
    return false;
  }

  const rentAmount = prorate(Number(lease.monthlyRentPoisha), prorationInput);

  const linesToCreate: Array<{
    orgId: string;
    kind: 'rent' | 'fixed_charge' | 'electricity';
    label: string;
    amountPoisha: number;
    meta: Record<string, unknown>;
  }> = [
    {
      orgId,
      kind: 'rent',
      label: 'Rent',
      amountPoisha: rentAmount,
      meta: factor < 1 ? { factor } : {},
    },
  ];

  let totalPoisha = rentAmount;

  for (const charge of lease.charges) {
    const chargeAmount = prorate(Number(charge.amountPoisha), prorationInput);
    linesToCreate.push({
      orgId,
      kind: 'fixed_charge',
      label: charge.name,
      amountPoisha: chargeAmount,
      meta: factor < 1 ? { factor } : {},
    });
    totalPoisha += chargeAmount;
  }

  let needsReading = false;
  if (unit.electricityMode === 'submeter') {
    // Check if reading was already entered for this period
    const reading = await tx.meterReading.findUnique({
      where: {
        orgId_unitId_periodMonth: {
          orgId,
          unitId: unit.id,
          periodMonth: periodDate,
        },
      },
    });

    if (reading) {
      const prevReading = await resolvePreviousReading(
        tx,
        orgId,
        unit.id,
        periodDate,
        lease.moveInReading,
        lease.startDate,
      );
      try {
        const elec = electricityCharge({
          prev: prevReading,
          curr: reading.reading,
          ratePoisha: building.electricityRatePoisha,
          meterReplaced: reading.meterReplaced,
          newMeterStart: reading.newMeterStart ?? undefined,
        });
        linesToCreate.push({
          orgId,
          kind: 'electricity',
          label: 'Electricity',
          amountPoisha: elec.amountPoisha,
          meta: {
            prev: reading.meterReplaced ? (reading.newMeterStart ?? 0) : prevReading,
            curr: reading.reading,
            units: elec.units,
            ratePoisha: building.electricityRatePoisha,
            meterReplaced: reading.meterReplaced,
          },
        });
        totalPoisha += elec.amountPoisha;
        needsReading = false;
      } catch {
        needsReading = true;
      }
    } else {
      needsReading = true;
    }
  }

  const dueDate = computeDueDate(periodMonthStr, building.dueDay);

  const createdBill = await tx.bill.create({
    data: {
      orgId,
      leaseId: lease.id,
      periodMonth: periodDate,
      dueDate,
      status: 'draft',
      needsReading,
      totalPoisha: BigInt(totalPoisha),
      paidPoisha: BigInt(0),
    },
  });

  await tx.billLine.createMany({
    data: linesToCreate.map((l) => ({
      orgId: l.orgId,
      billId: createdBill.id,
      kind: l.kind,
      label: l.label,
      amountPoisha: BigInt(l.amountPoisha),
      meta: (l.meta ?? {}) as Prisma.InputJsonValue,
    })),
  });

  return true;
}

/**
 * Rule 2 (#30): A lease starting after that month's bill day gets its first bill created
 * immediately at lease start / activation.
 * Also handles cases where lease was activated on/after the bill day in the start month.
 */
export async function generateFirstBillIfAfterBillDay(
  tx: Tx,
  orgId: string,
  leaseId: string,
  now: Date = clock.now(),
): Promise<boolean> {
  const lease = await tx.lease.findUnique({
    where: { id: leaseId },
    select: {
      id: true,
      orgId: true,
      startDate: true,
      endDate: true,
      monthlyRentPoisha: true,
      moveInReading: true,
      charges: {
        select: {
          id: true,
          name: true,
          amountPoisha: true,
        },
      },
      unit: {
        select: {
          id: true,
          electricityMode: true,
          building: {
            select: {
              id: true,
              billDay: true,
              dueDay: true,
              electricityRatePoisha: true,
            },
          },
        },
      },
    },
  });

  if (!lease || !lease.unit?.building) {
    return false;
  }

  const building = lease.unit.building;
  const startDateStr = getDhakaDateString(lease.startDate);
  const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
  const periodMonthStr = `${startYear}-${String(startMonth).padStart(2, '0')}`;
  const periodDate = new Date(`${periodMonthStr}-01T00:00:00.000Z`);

  const todayDhaka = getDhakaDateString(now);
  const [nowYear, nowMonth, nowDay] = todayDhaka.split('-').map(Number);

  // Check if lease start day is after building's bill day, or if today is past the bill day in that month or subsequent month
  const isPastBillDayInSameMonth =
    nowYear! === startYear! && nowMonth! === startMonth! && nowDay! >= building.billDay;
  const isFutureMonth = nowYear! > startYear! || (nowYear! === startYear! && nowMonth! > startMonth!);
  const isAfterBillDay = startDay! > building.billDay || isPastBillDayInSameMonth || isFutureMonth;

  if (!isAfterBillDay) {
    return false;
  }

  return createDraftBillForLease(tx, orgId, building, lease.unit, lease, periodDate, periodMonthStr);
}

export function toBillDto(
  bill: {
    id: string;
    orgId: string;
    leaseId: string;
    periodMonth: Date | string;
    dueDate: Date | string;
    status: string;
    needsReading: boolean;
    totalPoisha: bigint | number;
    paidPoisha: bigint | number;
    issuedAt?: Date | string | null;
    issuedBy?: string | null;
    lateFeeAppliedAt?: Date | string | null;
    voidReason?: string | null;
    createdAt: Date | string;
    lines?: Array<{
      id: string;
      kind: string;
      label: string;
      amountPoisha: bigint | number;
      meta?: unknown;
      reason?: string | null;
    }>;
  },
  todayStr: string,
): BillResponse {
  const total = Number(bill.totalPoisha);
  const paid = Number(bill.paidPoisha);
  const balance = total - paid;
  const dueDateStr = toDateString(bill.dueDate);
  const isOverdue = (bill.status === 'issued' || bill.status === 'partially_paid') && todayStr > dueDateStr;
  const unitLabel = (bill as { lease?: { unit?: { label?: string } } }).lease?.unit?.label;

  return {
    id: bill.id,
    orgId: bill.orgId,
    leaseId: bill.leaseId,
    unitLabel: unitLabel ?? null,
    periodMonth: toDateString(bill.periodMonth),
    dueDate: dueDateStr,
    status: bill.status as BillResponse['status'],
    needsReading: bill.needsReading,
    totalPoisha: total,
    paidPoisha: paid,
    balancePoisha: balance,
    overdue: isOverdue,
    issuedAt: bill.issuedAt ? new Date(bill.issuedAt).toISOString() : null,
    issuedBy: bill.issuedBy ?? null,
    lateFeeAppliedAt: bill.lateFeeAppliedAt ? new Date(bill.lateFeeAppliedAt).toISOString() : null,
    voidReason: bill.voidReason ?? null,
    createdAt: new Date(bill.createdAt).toISOString(),
    lines: bill.lines?.map((l) => ({
      id: l.id,
      kind: l.kind as BillLineResponse['kind'],
      label: l.label,
      amountPoisha: Number(l.amountPoisha),
      meta: (l.meta as Record<string, unknown>) ?? {},
      reason: l.reason ?? null,
    })),
  };
}

export class BillingService {
  constructor(private readonly prisma: Db) {}

  private getTenantCtx(ctx: BillingContext) {
    return {
      orgId: ctx.orgId,
      userId: ctx.userId,
      role: ctx.role,
      isAdmin: ctx.isAdmin,
    };
  }

  /**
   * Generates draft bills for all active leases in a building for a given month.
   * Idempotent: creates exactly one bill per lease per month.
   */
  async runGeneration(ctx: BillingContext, input: RunBillingInput) {
    const periodDate = parseMonthToDate(input.month);
    const periodMonthStr = `${input.month}-01`;

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      // Serialize concurrent generation requests for the same building and month
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ctx.orgId}:${input.buildingId}:${input.month}`}))`;

      // 1. Verify building exists in org
      const building = await tx.building.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: input.buildingId,
          },
        },
        select: {
          id: true,
          dueDay: true,
          electricityRatePoisha: true,
          units: {
            where: { archivedAt: null },
            select: {
              id: true,
              electricityMode: true,
              leases: {
                where: { status: 'active' },
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                  monthlyRentPoisha: true,
                  moveInReading: true,
                  charges: {
                    select: {
                      id: true,
                      name: true,
                      amountPoisha: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!building) {
        throw ApiError.notFound('Building not found');
      }

      let created = 0;
      let skipped = 0;

      for (const unit of building.units) {
        for (const lease of unit.leases) {
          const wasCreated = await createDraftBillForLease(
            tx,
            ctx.orgId,
            building,
            unit,
            lease,
            periodDate,
            periodMonthStr,
          );
          if (wasCreated) {
            created++;
          } else {
            skipped++;
          }
        }
      }

      return { created, skipped };
    });
  }

  /**
   * Helper to find prior meter reading before periodMonth, or fallback to lease moveInReading.
   * Per Rule 3 (#28): The first bill of a lease uses the move-in reading as prev. Prior readings
   * from previous tenants (before this lease's start month) must not be charged to the new tenant.
   */
  private async resolvePreviousReading(
    tx: Parameters<Parameters<Db['$tx']>[1]>[0],
    orgId: string,
    unitId: string,
    periodDate: Date,
    leaseMoveInReading?: number | null,
    leaseStartDate?: Date | string | null,
  ): Promise<number> {
    return resolvePreviousReading(tx, orgId, unitId, periodDate, leaseMoveInReading, leaseStartDate);
  }

  /**
   * Records or updates a meter reading and updates any draft bill.
   */
  async enterReading(ctx: BillingContext, input: MeterReadingInput) {
    const periodDate = parseMonthToDate(input.month);

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      // 1. Verify unit belongs to org and get building info
      const unit = await tx.unit.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: input.unitId,
          },
        },
        include: {
          building: true,
          leases: {
            where: { status: 'active' },
            select: {
              id: true,
              moveInReading: true,
              startDate: true,
            },
          },
        },
      });

      if (!unit) {
        throw ApiError.notFound('Unit not found');
      }

      if (unit.electricityMode !== 'submeter') {
        throw ApiError.badRequest(ErrorCode.VALIDATION_FAILED, 'Unit does not have an electric submeter');
      }

      // Check caretaker scope if caretaker
      if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findUnique({
          where: {
            orgId_membershipId_buildingId: {
              orgId: ctx.orgId,
              membershipId: ctx.membershipId,
              buildingId: unit.buildingId,
            },
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Building not found or not assigned');
        }
      }

      const activeLease = unit.leases[0];
      const prevReading = await this.resolvePreviousReading(
        tx,
        ctx.orgId,
        unit.id,
        periodDate,
        activeLease?.moveInReading,
        activeLease?.startDate,
      );

      // Validate reading using pure domain logic
      let elecResult: { units: number; amountPoisha: number };
      try {
        elecResult = electricityCharge({
          prev: prevReading,
          curr: input.reading,
          ratePoisha: unit.building.electricityRatePoisha,
          meterReplaced: input.meterReplaced,
          newMeterStart: input.newMeterStart,
        });
      } catch (err) {
        if (err instanceof DomainError && err.code === 'READING_LOWER_THAN_PREVIOUS') {
          throw ApiError.badRequest(ErrorCode.READING_LOWER_THAN_PREVIOUS, err.message);
        }
        throw err;
      }

      // Upsert meter reading
      const savedReading = await tx.meterReading.upsert({
        where: {
          orgId_unitId_periodMonth: {
            orgId: ctx.orgId,
            unitId: unit.id,
            periodMonth: periodDate,
          },
        },
        create: {
          orgId: ctx.orgId,
          unitId: unit.id,
          periodMonth: periodDate,
          reading: input.reading,
          meterReplaced: input.meterReplaced ?? false,
          newMeterStart: input.newMeterStart ?? null,
          enteredBy: ctx.userId,
        },
        update: {
          reading: input.reading,
          meterReplaced: input.meterReplaced ?? false,
          newMeterStart: input.newMeterStart ?? null,
          enteredBy: ctx.userId,
        },
      });

      // Update draft bill if exists
      if (activeLease) {
        // 1. Lock the lease row first (global lock order: lease -> bill to avoid deadlocks)
        await tx.$queryRawUnsafe('SELECT id FROM leases WHERE id = $1 FOR UPDATE', activeLease.id);

        // 2. Lock the bill row second
        const lockedBills = await tx.$queryRawUnsafe<Array<{ id: string; lease_id: string }>>(
          'SELECT id, lease_id FROM bills WHERE org_id = $1 AND lease_id = $2 AND period_month = $3 FOR UPDATE',
          ctx.orgId,
          activeLease.id,
          periodDate,
        );

        if (lockedBills.length > 0) {
          // 3. Read fresh bill under lock with its lines
          const bill = await tx.bill.findUnique({
            where: { id: lockedBills[0]!.id },
            include: {
              lines: true,
              lease: {
                include: {
                  unit: true,
                },
              },
            },
          });

          if (bill) {
            if (bill.status !== 'draft') {
              throw ApiError.conflict('Readings cannot be edited after the bill is issued');
            }

            const elecMeta = {
              prev: input.meterReplaced ? (input.newMeterStart ?? 0) : prevReading,
              curr: input.reading,
              units: elecResult.units,
              ratePoisha: unit.building.electricityRatePoisha,
              meterReplaced: input.meterReplaced,
            };

            // Update or insert electricity line (bm_app has no DELETE grant on bill_lines)
            const existingElecLine = bill.lines.find((l) => l.kind === 'electricity');
            if (existingElecLine) {
              await tx.billLine.update({
                where: { id: existingElecLine.id },
                data: {
                  amountPoisha: BigInt(elecResult.amountPoisha),
                  meta: elecMeta as unknown as Prisma.InputJsonValue,
                },
              });
            } else {
              await tx.billLine.create({
                data: {
                  orgId: ctx.orgId,
                  billId: bill.id,
                  kind: 'electricity',
                  label: 'Electricity',
                  amountPoisha: BigInt(elecResult.amountPoisha),
                  meta: elecMeta as unknown as Prisma.InputJsonValue,
                },
              });
            }

            // Recompute total from fresh locked lines
            const remainingLines = bill.lines.filter((l) => l.kind !== 'electricity');
            const nonElecTotal = remainingLines.reduce((sum, l) => sum + Number(l.amountPoisha), 0);
            const newTotal = nonElecTotal + elecResult.amountPoisha;

            await tx.bill.update({
              where: { id: bill.id },
              data: {
                totalPoisha: BigInt(newTotal),
                needsReading: false,
              },
            });
          }
        }
      }

      return {
        id: savedReading.id,
        unitId: unit.id,
        reading: savedReading.reading,
        units: elecResult.units,
        amountPoisha: elecResult.amountPoisha,
      };
    });
  }

  /**
   * Retrieves readings grid for a building and month.
   */
  async getReadings(ctx: BillingContext, query: GetReadingsQuery) {
    const periodDate = parseMonthToDate(query.month);

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      // Check caretaker assignment if caretaker
      if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findUnique({
          where: {
            orgId_membershipId_buildingId: {
              orgId: ctx.orgId,
              membershipId: ctx.membershipId,
              buildingId: query.buildingId,
            },
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Building not found or not assigned');
        }
      }

      const building = await tx.building.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: query.buildingId,
          },
        },
        select: {
          id: true,
          electricityRatePoisha: true,
          units: {
            where: {
              electricityMode: 'submeter',
              archivedAt: null,
            },
            select: {
              id: true,
              label: true,
              leases: {
                where: { status: 'active' },
                select: {
                  id: true,
                  moveInReading: true,
                  startDate: true,
                  bills: {
                    where: { periodMonth: periodDate },
                    select: {
                      id: true,
                      needsReading: true,
                      status: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!building) {
        throw ApiError.notFound('Building not found');
      }

      const readings = [];

      for (const unit of building.units) {
        const activeLease = unit.leases[0];
        const prevReading = await this.resolvePreviousReading(
          tx,
          ctx.orgId,
          unit.id,
          periodDate,
          activeLease?.moveInReading,
          activeLease?.startDate,
        );

        const currentReading = await tx.meterReading.findUnique({
          where: {
            orgId_unitId_periodMonth: {
              orgId: ctx.orgId,
              unitId: unit.id,
              periodMonth: periodDate,
            },
          },
        });

        const bill = activeLease?.bills[0];

        readings.push({
          unitId: unit.id,
          unitLabel: unit.label,
          prevReading,
          reading: currentReading?.reading ?? null,
          meterReplaced: currentReading?.meterReplaced ?? false,
          newMeterStart: currentReading?.newMeterStart ?? null,
          needsReading: bill?.needsReading ?? currentReading === null,
          billId: bill?.id ?? null,
        });
      }

      return readings;
    });
  }

  private async issueBillInTx(
    tx: Parameters<Parameters<Db['$tx']>[1]>[0],
    ctx: BillingContext,
    billId: string,
    todayStr: string,
  ): Promise<BillResponse> {
    const billRef = await tx.bill.findUnique({
      where: {
        orgId_id: {
          orgId: ctx.orgId,
          id: billId,
        },
      },
      select: { leaseId: true },
    });

    if (!billRef) {
      throw ApiError.notFound('Bill not found');
    }

    // 1. Lock the lease row first (global lock order: lease -> bill to avoid deadlocks)
    await tx.$queryRawUnsafe('SELECT id FROM leases WHERE id = $1 FOR UPDATE', billRef.leaseId);

    // 2. Lock the bill row second
    const lockedRows = await tx.$queryRawUnsafe<Array<{ id: string; lease_id: string }>>(
      'SELECT id, lease_id FROM bills WHERE org_id = $1 AND id = $2 FOR UPDATE',
      ctx.orgId,
      billId,
    );

    if (!lockedRows || lockedRows.length === 0) {
      throw ApiError.notFound('Bill not found');
    }

    // 3. Read fresh bill under lock
    const bill = await tx.bill.findUnique({
      where: {
        orgId_id: {
          orgId: ctx.orgId,
          id: billId,
        },
      },
      include: {
        lines: true,
      },
    });

    if (!bill) {
      throw ApiError.notFound('Bill not found');
    }

    if (bill.status !== 'draft') {
      throw ApiError.conflict('Only draft bills can be issued');
    }

    if (bill.needsReading) {
      throw new ApiError(ErrorCode.READING_REQUIRED, 'Submeter reading required before issuing bill');
    }

    // Check available credit on the lease under lock
    const creditSumRow = await tx.$queryRaw<Array<{ sum: string | null }>>`
      SELECT coalesce(sum(amount_poisha), 0)::text as sum
      FROM credit_entries
      WHERE org_id = ${ctx.orgId}::uuid AND lease_id = ${bill.leaseId}::uuid
    `;
    const creditAvailable = parseInt(creditSumRow[0]?.sum ?? '0', 10);

    let newStatus: 'issued' | 'partially_paid' | 'paid' = 'issued';
    let appliedCredit = 0;

    if (creditAvailable > 0) {
      const creditRes = applyCreditToBill({
        creditPoisha: creditAvailable,
        bill: {
          totalPoisha: Number(bill.totalPoisha),
          paidPoisha: Number(bill.paidPoisha),
        },
      });

      appliedCredit = creditRes.appliedPoisha;
      newStatus = creditRes.status;

      if (appliedCredit > 0) {
        // Record deduction from credit entries (negative amount to reduce balance)
        await tx.creditEntry.create({
          data: {
            orgId: ctx.orgId,
            leaseId: bill.leaseId,
            billId: bill.id,
            amountPoisha: BigInt(-appliedCredit),
            kind: 'applied',
          },
        });
      }
    }

    const updatedBill = await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: newStatus,
        paidPoisha: BigInt(appliedCredit),
        issuedAt: clock.now(),
        issuedBy: ctx.userId,
      },
      include: { lines: true },
    });

    // Write outbox event for bill.issued
    await tx.outboxMessage.createMany({
      data: [
        {
          orgId: ctx.orgId,
          type: 'bill.issued',
          payload: {
            billId: bill.id,
            leaseId: bill.leaseId,
            orgId: ctx.orgId,
          },
        },
      ],
    });

    return toBillDto(updatedBill, todayStr);
  }

  /**
   * Issues a single draft bill.
   */
  async issueBill(ctx: BillingContext, billId: string) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      return this.issueBillInTx(tx, ctx, billId, todayStr);
    });
  }

  /**
   * Issues all drafts in a building for a month that do not need readings.
   */
  async issueReadyBills(ctx: BillingContext, input: IssueReadyBillsInput) {
    const periodDate = parseMonthToDate(input.month);
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      // Find building to confirm org ownership
      const building = await tx.building.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: input.buildingId,
          },
        },
        select: { id: true },
      });

      if (!building) {
        throw ApiError.notFound('Building not found');
      }

      // Find draft bills for units in this building
      const draftBills = await tx.bill.findMany({
        where: {
          orgId: ctx.orgId,
          periodMonth: periodDate,
          status: 'draft',
          lease: {
            unit: {
              buildingId: input.buildingId,
            },
          },
        },
        select: {
          id: true,
          needsReading: true,
        },
      });

      let issued = 0;
      let skipped = 0;

      for (const b of draftBills) {
        if (b.needsReading) {
          skipped++;
        } else {
          try {
            await this.issueBillInTx(tx, ctx, b.id, todayStr);
            issued++;
          } catch (err) {
            if (err instanceof ApiError && (err.status === 409 || err.code === ErrorCode.CONFLICT)) {
              // Concurrently issued or no longer draft: count as skipped and continue batch
              skipped++;
            } else {
              throw err;
            }
          }
        }
      }

      return { issued, skipped };
    });
  }

  /**
   * Adds an adjustment (charge or discount) to a draft or issued bill.
   */
  async addAdjustment(ctx: BillingContext, billId: string, input: AddAdjustmentInput) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      const billRef = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        select: { leaseId: true },
      });

      if (!billRef) {
        throw ApiError.notFound('Bill not found');
      }

      // 1. Lock the lease row first (global lock order: lease -> bill to avoid deadlocks)
      await tx.$queryRawUnsafe('SELECT id FROM leases WHERE id = $1 FOR UPDATE', billRef.leaseId);

      // 2. Lock the bill row second
      const lockedRows = await tx.$queryRawUnsafe<Array<{ id: string; lease_id: string }>>(
        'SELECT id, lease_id FROM bills WHERE org_id = $1 AND id = $2 FOR UPDATE',
        ctx.orgId,
        billId,
      );

      if (!lockedRows || lockedRows.length === 0) {
        throw ApiError.notFound('Bill not found');
      }

      // 3. Read fresh bill under lock
      const bill = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
      });

      if (!bill) {
        throw ApiError.notFound('Bill not found');
      }

      if (bill.status === 'paid' || bill.status === 'void') {
        throw ApiError.conflict('Adjustments cannot be added to paid or void bills');
      }

      const newTotal = Number(bill.totalPoisha) + input.amountPoisha;
      if (newTotal < 0) {
        throw ApiError.badRequest(ErrorCode.VALIDATION_FAILED, 'Adjusted total cannot be negative');
      }
      if (newTotal < Number(bill.paidPoisha)) {
        throw ApiError.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Adjustment cannot reduce total below amount already paid',
        );
      }

      // Recompute status
      let newStatus: 'draft' | 'issued' | 'partially_paid' | 'paid' = bill.status;
      if (bill.status !== 'draft') {
        const newBalance = newTotal - Number(bill.paidPoisha);
        if (newBalance === 0) {
          newStatus = 'paid';
        } else if (Number(bill.paidPoisha) > 0) {
          newStatus = 'partially_paid';
        } else {
          newStatus = 'issued';
        }
      }

      // Create adjustment line
      await tx.billLine.create({
        data: {
          orgId: ctx.orgId,
          billId: bill.id,
          kind: 'adjustment',
          label: 'Adjustment',
          amountPoisha: BigInt(input.amountPoisha),
          reason: input.reason,
          createdBy: ctx.userId,
        },
      });

      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          totalPoisha: BigInt(newTotal),
          status: newStatus,
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
      });

      return toBillDto(updatedBill, todayStr);
    });
  }

  /**
   * Waives a late fee on a bill (sets the fee to 0 with a reason).
   */
  async waiveLateFee(ctx: BillingContext, billId: string, input: WaiveLateFeeInput) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      const billRef = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        select: { leaseId: true },
      });

      if (!billRef) {
        throw ApiError.notFound('Bill not found');
      }

      // 1. Lock the lease row first (global lock order: lease -> bill to avoid deadlocks)
      await tx.$queryRawUnsafe('SELECT id FROM leases WHERE id = $1 FOR UPDATE', billRef.leaseId);

      // 2. Lock the bill row second
      const lockedRows = await tx.$queryRawUnsafe<Array<{ id: string; lease_id: string }>>(
        'SELECT id, lease_id FROM bills WHERE org_id = $1 AND id = $2 FOR UPDATE',
        ctx.orgId,
        billId,
      );

      if (!lockedRows || lockedRows.length === 0) {
        throw ApiError.notFound('Bill not found');
      }

      // 3. Read fresh bill under lock
      const bill = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
      });

      if (!bill) {
        throw ApiError.notFound('Bill not found');
      }

      if (bill.status === 'void') {
        throw ApiError.conflict('Cannot waive late fee on a void bill');
      }

      const lateFeeLine = bill.lines.find((l) => l.kind === 'late_fee');
      if (!lateFeeLine) {
        throw ApiError.notFound('Bill has no late fee to waive');
      }

      const currentFee = Number(lateFeeLine.amountPoisha);
      const newTotal = Number(bill.totalPoisha) - currentFee;
      if (newTotal < Number(bill.paidPoisha)) {
        throw ApiError.conflict('Cannot waive late fee that has already been paid');
      }

      const waiveResult = pureWaiveLateFee({
        currentFeePoisha: currentFee,
        reason: input.reason,
      });

      await tx.billLine.update({
        where: { id: lateFeeLine.id },
        data: {
          amountPoisha: BigInt(0),
          reason: waiveResult.reason,
        },
      });

      let newStatus: 'draft' | 'issued' | 'partially_paid' | 'paid' = bill.status;
      if (bill.status !== 'draft') {
        const newBalance = newTotal - Number(bill.paidPoisha);
        if (newBalance === 0) {
          newStatus = 'paid';
        } else if (Number(bill.paidPoisha) > 0) {
          newStatus = 'partially_paid';
        } else {
          newStatus = 'issued';
        }
      }

      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          totalPoisha: BigInt(newTotal),
          status: newStatus,
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
      });

      return toBillDto(updatedBill, todayStr);
    });
  }

  /**
   * Voids a bill if no payments/allocations have been made.
   */
  async voidBill(ctx: BillingContext, billId: string, input?: VoidBillInput) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      const billRef = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        select: { leaseId: true },
      });

      if (!billRef) {
        throw ApiError.notFound('Bill not found');
      }

      // 1. Lock the lease row first (global lock order: lease -> bill to avoid deadlocks)
      await tx.$queryRawUnsafe('SELECT id FROM leases WHERE id = $1 FOR UPDATE', billRef.leaseId);

      // 2. Lock the bill row second
      const lockedRows = await tx.$queryRawUnsafe<Array<{ id: string; lease_id: string }>>(
        'SELECT id, lease_id FROM bills WHERE org_id = $1 AND id = $2 FOR UPDATE',
        ctx.orgId,
        billId,
      );

      if (!lockedRows || lockedRows.length === 0) {
        throw ApiError.notFound('Bill not found');
      }

      // 3. Read fresh bill under lock
      const bill = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
      });

      if (!bill) {
        throw ApiError.notFound('Bill not found');
      }

      if (bill.status === 'void') {
        throw ApiError.conflict('Bill is already void');
      }

      if (bill.status === 'paid') {
        throw ApiError.conflict('Cannot void a paid bill');
      }

      if (bill.status !== 'draft' && bill.status !== 'issued') {
        throw ApiError.conflict(`Cannot void a bill with status ${bill.status}`);
      }

      if (Number(bill.paidPoisha) > 0) {
        throw ApiError.conflict('Cannot void a bill that has payments or credit applied');
      }

      const allocationsCount = await tx.paymentAllocation.count({
        where: {
          orgId: ctx.orgId,
          billId: bill.id,
        },
      });

      if (allocationsCount > 0) {
        throw ApiError.conflict('Cannot void a bill that has payment allocations');
      }

      const updatedBill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          status: 'void',
          voidReason: input?.reason ?? null,
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
      });

      return toBillDto(updatedBill, todayStr);
    });
  }

  /**
   * Lists bills with role scoping and filters.
   */
  async listBills(ctx: BillingContext, query: ListBillsQuery) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      const where: Record<string, unknown> = {
        orgId: ctx.orgId,
      };

      if (query.status) {
        where.status = query.status;
      }

      if (query.month) {
        where.periodMonth = parseMonthToDate(query.month);
      }

      if (query.leaseId) {
        where.leaseId = query.leaseId;
      }

      if (ctx.role === 'caretaker') {
        const assignments = await tx.caretakerBuilding.findMany({
          where: {
            orgId: ctx.orgId,
            membershipId: ctx.membershipId,
          },
          select: { buildingId: true },
        });
        const buildingIds = assignments.map((a) => a.buildingId);
        where.lease = {
          unit: {
            buildingId: { in: buildingIds },
          },
        };
      } else if (ctx.role === 'tenant') {
        where.lease = {
          tenants: {
            some: {
              membershipId: ctx.membershipId,
            },
          },
        };
        // Tenants must NEVER see draft bills
        where.status = { not: 'draft' };
      } else if (query.buildingId) {
        where.lease = {
          unit: {
            buildingId: query.buildingId,
          },
        };
      }

      const limit = Number(query.limit) || 50;
      const findArgs: Prisma.BillFindManyArgs = {
        where,
        include: {
          lines: true,
          lease: {
            include: {
              unit: true,
            },
          },
        },
        orderBy: [{ periodMonth: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      };

      if (query.cursor) {
        findArgs.cursor = { id: query.cursor };
        findArgs.skip = 1;
      }

      const bills = await tx.bill.findMany(findArgs);
      const hasMore = bills.length > limit;
      if (hasMore) {
        bills.pop();
      }
      const nextCursor = hasMore && bills.length > 0 ? bills[bills.length - 1]!.id : null;

      return {
        bills: bills.map((b) => toBillDto(b, todayStr)),
        nextCursor,
      };
    });
  }

  /**
   * Retrieves single bill detail with role permission verification.
   */
  async getBillById(ctx: BillingContext, billId: string) {
    const todayStr = toDateString(clock.now());

    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      const bill = await tx.bill.findUnique({
        where: {
          orgId_id: {
            orgId: ctx.orgId,
            id: billId,
          },
        },
        include: {
          lines: true,
          lease: {
            include: {
              unit: {
                include: { building: true },
              },
              tenants: true,
            },
          },
        },
      });

      if (!bill) {
        throw ApiError.notFound('Bill not found');
      }

      if (ctx.role === 'tenant') {
        const isAssociated = bill.lease.tenants.some((t) => t.membershipId === ctx.membershipId);
        if (!isAssociated || bill.status === 'draft') {
          throw ApiError.notFound('Bill not found');
        }
      } else if (ctx.role === 'caretaker') {
        const assignment = await tx.caretakerBuilding.findUnique({
          where: {
            orgId_membershipId_buildingId: {
              orgId: ctx.orgId,
              membershipId: ctx.membershipId,
              buildingId: bill.lease.unit.buildingId,
            },
          },
        });
        if (!assignment) {
          throw ApiError.notFound('Bill not found');
        }
      }

      return toBillDto(bill, todayStr);
    });
  }

  /**
   * Gets dues and credit for the tenant's active lease.
   */
  async getDues(ctx: BillingContext): Promise<DuesResponse> {
    return this.prisma.$tx(this.getTenantCtx(ctx), async (tx) => {
      // Find tenant's active lease
      const leaseTenant = await tx.leaseTenant.findFirst({
        where: {
          orgId: ctx.orgId,
          membershipId: ctx.membershipId,
          lease: {
            status: { in: ['active', 'notice'] },
          },
        },
        select: { leaseId: true },
      });

      if (!leaseTenant) {
        return {
          bills: [],
          creditPoisha: 0,
          totalPoisha: 0,
        };
      }

      const leaseId = leaseTenant.leaseId;

      // Unpaid bills ordered by period_month ASC
      const unpaidBills = await tx.bill.findMany({
        where: {
          orgId: ctx.orgId,
          leaseId,
          status: { in: ['issued', 'partially_paid'] },
        },
        orderBy: { periodMonth: 'asc' },
        select: {
          id: true,
          periodMonth: true,
          dueDate: true,
          totalPoisha: true,
          paidPoisha: true,
        },
      });

      // Credit balance
      const creditSumRow = await tx.$queryRaw<Array<{ sum: string | null }>>`
        SELECT coalesce(sum(amount_poisha), 0)::text as sum
        FROM credit_entries
        WHERE org_id = ${ctx.orgId}::uuid AND lease_id = ${leaseId}::uuid
      `;
      const creditPoisha = parseInt(creditSumRow[0]?.sum ?? '0', 10);

      let totalDues = 0;
      const formattedBills = unpaidBills.map((b) => {
        const total = Number(b.totalPoisha);
        const paid = Number(b.paidPoisha);
        const balance = total - paid;
        totalDues += balance;
        return {
          id: b.id,
          periodMonth: toDateString(b.periodMonth),
          dueDate: toDateString(b.dueDate),
          totalPoisha: total,
          paidPoisha: paid,
          balancePoisha: balance,
        };
      });

      return {
        bills: formattedBills,
        creditPoisha,
        totalPoisha: totalDues,
      };
    });
  }
}
