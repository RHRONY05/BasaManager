import { z } from 'zod';
import { uuidSchema, dataEnvelope } from './common';
import { lateFeeTypeSchema, unitTypeSchema, electricityModeSchema } from '../enums';

export const unitChargeSchema = z
  .object({
    id: uuidSchema.optional(),
    name: z.string().min(1, 'Charge name is required').max(100),
    amountPoisha: z.number().int().nonnegative('Amount must be non-negative'),
  })
  .meta({ id: 'UnitCharge' });

export type UnitCharge = z.infer<typeof unitChargeSchema>;

export const createBuildingRequestSchema = z
  .object({
    name: z.string().min(1, 'Building name is required').max(100),
    address: z.string().min(1, 'Address is required').max(255),
    area: z.string().min(1, 'Area is required').max(100),
    city: z.string().min(1, 'City is required').max(100),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    billDay: z.number().int().min(1).max(28).default(1),
    dueDay: z.number().int().min(1).max(28).default(10),
    graceDays: z.number().int().min(0).max(15).default(0),
    lateFeeType: lateFeeTypeSchema.default('none'),
    lateFeeValue: z.number().int().min(0).default(0),
    electricityRatePoisha: z.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.lateFeeType === 'percent' && data.lateFeeValue > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent late fee cannot exceed 10000 basis points (100%)',
        path: ['lateFeeValue'],
      });
    }
    if (data.dueDay < data.billDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Due day must be on or after bill day',
        path: ['dueDay'],
      });
    }
  })
  .meta({ id: 'CreateBuildingRequest' });

export type CreateBuildingRequest = z.infer<typeof createBuildingRequestSchema>;

export const updateBuildingRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    address: z.string().min(1).max(255).optional(),
    area: z.string().min(1).max(100).optional(),
    city: z.string().min(1).max(100).optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    billDay: z.number().int().min(1).max(28).optional(),
    dueDay: z.number().int().min(1).max(28).optional(),
    graceDays: z.number().int().min(0).max(15).optional(),
    lateFeeType: lateFeeTypeSchema.optional(),
    lateFeeValue: z.number().int().min(0).optional(),
    electricityRatePoisha: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lateFeeType === 'percent' && data.lateFeeValue !== undefined && data.lateFeeValue > 10000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent late fee cannot exceed 10000 basis points (100%)',
        path: ['lateFeeValue'],
      });
    }
    if (data.dueDay !== undefined && data.billDay !== undefined && data.dueDay < data.billDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Due day must be on or after bill day',
        path: ['dueDay'],
      });
    }
  })
  .meta({ id: 'UpdateBuildingRequest' });

export type UpdateBuildingRequest = z.infer<typeof updateBuildingRequestSchema>;

export const buildingSchema = z
  .object({
    id: uuidSchema,
    orgId: uuidSchema.optional(),
    name: z.string(),
    address: z.string(),
    area: z.string(),
    city: z.string(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    billDay: z.number(),
    dueDay: z.number(),
    graceDays: z.number(),
    lateFeeType: lateFeeTypeSchema,
    lateFeeValue: z.number(),
    electricityRatePoisha: z.number(),
    archivedAt: z.union([z.string(), z.date()]).nullable().optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    unitCount: z.number().optional(),
    occupiedCount: z.number().optional(),
    noticeCount: z.number().optional(),
  })
  .meta({ id: 'Building' });

export type Building = z.infer<typeof buildingSchema>;

export const buildingResponseSchema = dataEnvelope(buildingSchema).meta({
  id: 'BuildingResponse',
});

export type BuildingResponse = z.infer<typeof buildingResponseSchema>;

export const buildingsListResponseSchema = dataEnvelope(z.array(buildingSchema)).meta({
  id: 'BuildingsListResponse',
});

export type BuildingsListResponse = z.infer<typeof buildingsListResponseSchema>;

// ── Unit Schemas ─────────────────────────────────────────────────────────────

export const createUnitRequestSchema = z
  .object({
    label: z.string().min(1, 'Unit label is required').max(50),
    floor: z.number().int().min(-5).max(150),
    type: unitTypeSchema,
    defaultRentPoisha: z.number().int().nonnegative('Rent must be non-negative'),
    electricityMode: electricityModeSchema,
    charges: z
      .array(
        z.object({
          name: z.string().min(1, 'Charge name is required').max(100),
          amountPoisha: z.number().int().nonnegative('Amount must be non-negative'),
        }),
      )
      .optional()
      .refine(
        (charges) => {
          if (!charges) return true;
          const names = charges.map((c) => c.name.trim().toLowerCase());
          return new Set(names).size === names.length;
        },
        { message: 'Charge names must be unique' },
      ),
  })
  .meta({ id: 'CreateUnitRequest' });

export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = z
  .object({
    label: z.string().min(1).max(50).optional(),
    floor: z.number().int().min(-5).max(150).optional(),
    type: unitTypeSchema.optional(),
    defaultRentPoisha: z.number().int().nonnegative().optional(),
    electricityMode: electricityModeSchema.optional(),
    charges: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          amountPoisha: z.number().int().nonnegative(),
        }),
      )
      .optional()
      .refine(
        (charges) => {
          if (!charges) return true;
          const names = charges.map((c) => c.name.trim().toLowerCase());
          return new Set(names).size === names.length;
        },
        { message: 'Charge names must be unique' },
      ),
  })
  .meta({ id: 'UpdateUnitRequest' });

export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const unitSummarySchema = z
  .object({
    id: uuidSchema,
    buildingId: uuidSchema.optional(),
    label: z.string(),
    floor: z.number(),
    type: unitTypeSchema,
    defaultRentPoisha: z.number(),
    electricityMode: electricityModeSchema,
    archivedAt: z.union([z.string(), z.date()]).nullable().optional(),
    charges: z.array(unitChargeSchema).default([]),
    lease: z
      .object({
        id: uuidSchema.optional(),
        status: z.string(),
        tenantName: z.string().optional(),
        monthlyRentPoisha: z.number().optional(),
      })
      .nullable()
      .optional(),
  })
  .meta({ id: 'UnitSummary' });

export type UnitSummary = z.infer<typeof unitSummarySchema>;

export const unitResponseSchema = dataEnvelope(unitSummarySchema).meta({
  id: 'UnitResponse',
});

export type UnitResponse = z.infer<typeof unitResponseSchema>;

export const unitsListResponseSchema = dataEnvelope(z.array(unitSummarySchema)).meta({
  id: 'UnitsListResponse',
});

export type UnitsListResponse = z.infer<typeof unitsListResponseSchema>;
