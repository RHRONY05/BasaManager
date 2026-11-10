import { z } from 'zod';
import { billStatusSchema, billLineKindSchema } from '../enums';
import { cursorQuerySchema } from './common';

export const monthStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
  .refine((val) => {
    const parts = val.split('-').map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    return year >= 2020 && year <= 2100 && month >= 1 && month <= 12;
  }, 'Month must be a valid calendar month');

export const runBillingSchema = z.object({
  buildingId: z.string().uuid(),
  month: monthStringSchema,
});
export type RunBillingInput = z.infer<typeof runBillingSchema>;

export const listBillsQuerySchema = cursorQuerySchema.extend({
  cursor: z.string().uuid('Cursor must be a valid UUID').optional(),
  status: billStatusSchema.optional(),
  buildingId: z.string().uuid().optional(),
  month: monthStringSchema.optional(),
  leaseId: z.string().uuid().optional(),
});
export type ListBillsQuery = z.input<typeof listBillsQuerySchema>;
export type ListBillsParsedQuery = z.infer<typeof listBillsQuerySchema>;

export const billLineResponseSchema = z.object({
  id: z.string().uuid(),
  kind: billLineKindSchema,
  label: z.string(),
  amountPoisha: z.number().int(),
  meta: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().nullable().optional(),
});
export type BillLineResponse = z.infer<typeof billLineResponseSchema>;

export const billResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  leaseId: z.string().uuid(),
  unitLabel: z.string().nullable().optional(),
  periodMonth: z.string(),
  dueDate: z.string(),
  status: billStatusSchema,
  needsReading: z.boolean(),
  totalPoisha: z.number().int(),
  paidPoisha: z.number().int(),
  balancePoisha: z.number().int(),
  overdue: z.boolean(),
  issuedAt: z.string().nullable().optional(),
  issuedBy: z.string().nullable().optional(),
  lateFeeAppliedAt: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
  createdAt: z.string(),
  lines: z.array(billLineResponseSchema).optional(),
});
export type BillResponse = z.infer<typeof billResponseSchema>;

export const issueReadyBillsSchema = z.object({
  buildingId: z.string().uuid(),
  month: monthStringSchema,
});
export type IssueReadyBillsInput = z.infer<typeof issueReadyBillsSchema>;

export const addAdjustmentSchema = z.object({
  amountPoisha: z
    .number()
    .int()
    .refine((n) => n !== 0, 'Adjustment amount must be non-zero'),
  reason: z.string().trim().min(1, 'Reason is required').max(255),
});
export type AddAdjustmentInput = z.infer<typeof addAdjustmentSchema>;

export const waiveLateFeeSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(255),
});
export type WaiveLateFeeInput = z.infer<typeof waiveLateFeeSchema>;

export const voidBillSchema = z.object({
  reason: z.string().trim().max(255).optional(),
});
export type VoidBillInput = z.infer<typeof voidBillSchema>;

export const getReadingsQuerySchema = z.object({
  buildingId: z.string().uuid(),
  month: monthStringSchema,
});
export type GetReadingsQuery = z.infer<typeof getReadingsQuerySchema>;

export const meterReadingInputSchema = z.object({
  unitId: z.string().uuid(),
  month: monthStringSchema,
  reading: z.number().int().nonnegative('Reading must be a non-negative integer'),
  meterReplaced: z.boolean().optional(),
  newMeterStart: z.number().int().nonnegative('New meter start must be a non-negative integer').optional(),
});
export type MeterReadingInput = z.infer<typeof meterReadingInputSchema>;

export const meterReadingItemSchema = z.object({
  unitId: z.string().uuid(),
  unitLabel: z.string(),
  prevReading: z.number().int().nullable(),
  reading: z.number().int().nullable(),
  meterReplaced: z.boolean(),
  newMeterStart: z.number().int().nullable().optional(),
  needsReading: z.boolean(),
  billId: z.string().uuid().nullable().optional(),
});
export type MeterReadingItem = z.infer<typeof meterReadingItemSchema>;

export const duesDueBillSchema = z.object({
  id: z.string().uuid(),
  periodMonth: z.string(),
  dueDate: z.string().optional(),
  totalPoisha: z.number().int().optional(),
  paidPoisha: z.number().int().optional(),
  balancePoisha: z.number().int(),
  overdue: z.boolean().optional(),
});

export const duesResponseSchema = z.object({
  bills: z.array(duesDueBillSchema),
  creditPoisha: z.number().int(),
  totalPoisha: z.number().int(),
});
export type DuesResponse = z.infer<typeof duesResponseSchema>;
