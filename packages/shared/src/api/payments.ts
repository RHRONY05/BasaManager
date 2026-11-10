import { z } from 'zod';
import { paymentMethodSchema, paymentStatusSchema, receiptStatusSchema } from '../enums';
import { cursorQuerySchema } from './common';

export const createPaymentClaimSchema = z.object({
  leaseId: z.string().uuid(),
  amountPoisha: z.number().int().positive('Payment amount must be positive'),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank']),
  reference: z.string().trim().max(100).optional().nullable(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'paidOn must be in YYYY-MM-DD format'),
  proofFileId: z.string().uuid().optional().nullable(),
});
export type CreatePaymentClaimInput = z.infer<typeof createPaymentClaimSchema>;

export const recordPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  amountPoisha: z.number().int().positive('Payment amount must be positive'),
  method: z.enum(['cash', 'bkash', 'nagad', 'bank']),
  reference: z.string().trim().max(100).optional().nullable(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'paidOn must be in YYYY-MM-DD format'),
  proofFileId: z.string().uuid().optional().nullable(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const listPaymentsQuerySchema = cursorQuerySchema.extend({
  cursor: z.string().uuid('Cursor must be a valid UUID').optional(),
  leaseId: z.string().uuid().optional(),
  status: paymentStatusSchema.optional(),
  buildingId: z.string().uuid().optional(),
});
export type ListPaymentsQuery = z.input<typeof listPaymentsQuerySchema>;
export type ListPaymentsParsedQuery = z.infer<typeof listPaymentsQuerySchema>;

export const paymentAllocationResponseSchema = z.object({
  id: z.string().uuid(),
  billId: z.string().uuid(),
  periodMonth: z.string().optional(),
  amountPoisha: z.number().int(),
  createdAt: z.string(),
});
export type PaymentAllocationResponse = z.infer<typeof paymentAllocationResponseSchema>;

export const receiptResponseSchema = z.object({
  id: z.string().uuid(),
  number: z.string(),
  status: receiptStatusSchema,
  fileId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
});
export type ReceiptResponse = z.infer<typeof receiptResponseSchema>;

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  leaseId: z.string().uuid(),
  amountPoisha: z.number().int(),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  reference: z.string().nullable().optional(),
  proofFileId: z.string().uuid().nullable().optional(),
  paidOn: z.string(),
  submittedBy: z.string().uuid(),
  confirmedBy: z.string().uuid().nullable().optional(),
  confirmedAt: z.string().nullable().optional(),
  rejectedReason: z.string().nullable().optional(),
  voidReason: z.string().nullable().optional(),
  voidedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  allocations: z.array(paymentAllocationResponseSchema).optional(),
  receipt: receiptResponseSchema.nullable().optional(),
  tenantName: z.string().optional(),
  unitLabel: z.string().optional(),
  buildingName: z.string().optional(),
});
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;
