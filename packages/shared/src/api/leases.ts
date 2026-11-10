import { z } from 'zod';
import { leaseStatusSchema, depositEntryKindSchema } from '../enums';

export const leaseChargeInputSchema = z.object({
  name: z.string().trim().min(1, 'Charge name is required').max(100),
  amountPoisha: z.number().int().nonnegative('Amount must be non-negative integer'),
});
export type LeaseChargeInput = z.infer<typeof leaseChargeInputSchema>;

export const createLeaseSchema = z.object({
  unitId: z.string().uuid(),
  tenantEmail: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
  tenantName: z.string().trim().min(1, 'Tenant name is required').max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  monthlyRentPoisha: z.number().int().nonnegative('Rent must be non-negative integer'),
  depositPoisha: z.number().int().nonnegative('Deposit must be non-negative integer').default(0),
  householdSize: z.number().int().min(1, 'Household size must be at least 1').max(20).default(1),
  charges: z.array(leaseChargeInputSchema).optional().default([]),
  moveInReading: z.number().int().min(0).optional(),
});
export type CreateLeaseInput = z.infer<typeof createLeaseSchema>;

export const listLeasesQuerySchema = z.object({
  status: leaseStatusSchema.optional(),
  buildingId: z.string().uuid().optional(),
});
export type ListLeasesQuery = z.infer<typeof listLeasesQuerySchema>;

export const recordDepositSchema = z.object({
  kind: depositEntryKindSchema,
  amountPoisha: z.number().int().positive('Amount must be a positive integer'),
  note: z.string().trim().max(500).optional(),
});
export type RecordDepositInput = z.infer<typeof recordDepositSchema>;

export const leaseUnitResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  floor: z.number().int(),
  type: z.string(),
  buildingId: z.string().uuid(),
  buildingName: z.string(),
});

export const leaseChargeResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  amountPoisha: z.number().int(),
});

export const leaseTenantResponseSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  isPrimary: z.boolean(),
  joinedAt: z.string(),
});

export const leaseResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  unitId: z.string().uuid(),
  unit: leaseUnitResponseSchema.optional(),
  status: leaseStatusSchema,
  startDate: z.string(),
  endDate: z.string().nullable(),
  noticeDate: z.string().nullable(),
  monthlyRentPoisha: z.number().int(),
  depositPoisha: z.number().int(),
  depositHeldPoisha: z.number().int(),
  householdSize: z.number().int(),
  moveInReading: z.number().int().nullable(),
  charges: z.array(leaseChargeResponseSchema),
  tenants: z.array(leaseTenantResponseSchema),
  creditPoisha: z.number().int(),
  duesPoisha: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const leasesListResponseSchema = z.object({
  data: z.array(leaseResponseSchema),
});

export const singleLeaseResponseSchema = z.object({
  data: leaseResponseSchema,
});

export const depositEntryResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    kind: depositEntryKindSchema,
    amountPoisha: z.number().int(),
    note: z.string().nullable(),
    createdAt: z.date().or(z.string()),
  }),
});

export interface LeaseChargeDto {
  id: string;
  name: string;
  amountPoisha: number;
}

export interface LeaseTenantDto {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  isPrimary: boolean;
  joinedAt: string;
}

export interface LeaseUnitDto {
  id: string;
  label: string;
  floor: number;
  type: string;
  buildingId: string;
  buildingName: string;
}

export interface LeaseDto {
  id: string;
  orgId: string;
  unitId: string;
  unit: LeaseUnitDto;
  status: z.infer<typeof leaseStatusSchema>;
  startDate: string;
  endDate: string | null;
  noticeDate: string | null;
  monthlyRentPoisha: number;
  depositPoisha: number;
  depositHeldPoisha: number;
  householdSize: number;
  moveInReading: number | null;
  charges: LeaseChargeDto[];
  tenants: LeaseTenantDto[];
  creditPoisha: number;
  duesPoisha: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantHistoryDto {
  tenant: {
    membershipId: string;
    userId: string;
    fullName: string;
    email: string;
    status: string;
    createdAt: string;
  };
  leases: LeaseDto[];
  bills: Array<{
    id: string;
    leaseId: string;
    periodMonth: string;
    totalPoisha: number;
    status: string;
    dueDate: string;
  }>;
  payments: Array<{
    id: string;
    leaseId: string;
    amountPoisha: number;
    method: string;
    status: string;
    receiptNumber?: string | null;
    createdAt: string;
  }>;
}
