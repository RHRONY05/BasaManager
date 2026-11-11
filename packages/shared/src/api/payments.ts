import { z } from 'zod';
import {
  paymentMethodSchema,
  paymentStatusSchema,
  receiptStatusSchema,
  paymentIntentStatusSchema,
  type PaymentMethod,
  type PaymentStatus,
  type ReceiptStatus,
  type PaymentIntentStatus,
} from '../enums';
import { cursorQuerySchema } from './common';

export type { PaymentMethod, PaymentStatus, ReceiptStatus, PaymentIntentStatus };

export const isValidCalendarDate = (val: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  if (val < '2000-01-01') return false;
  const d = new Date(`${val}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === val;
};

export const isNotFarFuture = (val: string): boolean => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const maxDhakaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(tomorrow);
  return val <= maxDhakaDate;
};

export const paidOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'paidOn must be in YYYY-MM-DD format')
  .refine(isValidCalendarDate, { message: 'paidOn must be a valid calendar date on or after year 2000' })
  .refine(isNotFarFuture, { message: 'paidOn cannot be in the future' });

export const paymentAmountPoishaSchema = z
  .number()
  .int('Payment amount must be an integer')
  .positive('Payment amount must be positive')
  .max(100_000_000_00, 'Payment amount exceeds maximum limit');

export const createPaymentClaimSchema = z.object({
  leaseId: z.string().uuid(),
  amountPoisha: paymentAmountPoishaSchema,
  method: z.enum(['cash', 'bkash', 'nagad', 'bank']),
  reference: z.string().trim().max(100).optional().nullable(),
  paidOn: paidOnSchema,
  proofFileId: z.string().uuid().optional().nullable(),
});
export type CreatePaymentClaimInput = z.infer<typeof createPaymentClaimSchema>;

export const recordPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  amountPoisha: paymentAmountPoishaSchema,
  method: z.enum(['cash', 'bkash', 'nagad', 'bank']),
  reference: z.string().trim().max(100).optional().nullable(),
  paidOn: paidOnSchema,
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

export const receiptDownloadResponseSchema = z.union([
  z.object({
    downloadUrl: z.string().url(),
  }),
  z.object({
    status: z.literal('rendering'),
  }),
]);
export type ReceiptDownloadResponse = z.infer<typeof receiptDownloadResponseSchema>;

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

// ── SSLCommerz Online Payments ──────────────────────────────────────────────

export const initOnlinePaymentSchema = z.object({
  leaseId: z.string().uuid(),
  amountPoisha: z
    .number()
    .int('Amount must be an integer')
    .min(100_00, 'Minimum payment is ৳100 (10,000 poisha)')
    .positive('Payment amount must be positive'),
});
export type InitOnlinePaymentInput = z.infer<typeof initOnlinePaymentSchema>;

export const initOnlinePaymentResponseSchema = z.object({
  gatewayUrl: z.string().url(),
  tranId: z.string(),
});
export type InitOnlinePaymentResponse = z.infer<typeof initOnlinePaymentResponseSchema>;

export const paymentIntentResponseSchema = z.object({
  id: z.string().uuid(),
  tranId: z.string(),
  status: paymentIntentStatusSchema,
  amountPoisha: z.number().int(),
  paymentId: z.string().uuid().nullable().optional(),
  receiptId: z.string().uuid().nullable().optional(),
  receiptNumber: z.string().nullable().optional(),
});
export type PaymentIntentResponse = z.infer<typeof paymentIntentResponseSchema>;

export const sslcommerzReturnResultSchema = z.enum(['success', 'fail', 'cancel']);
export type SslcommerzReturnResult = z.infer<typeof sslcommerzReturnResultSchema>;

export const sslcommerzIpnSchema = z
  .object({
    tran_id: z.string().optional(),
    val_id: z.string().optional(),
    status: z.string().optional(),
    amount: z.string().optional(),
    currency: z.string().optional(),
    currency_type: z.string().optional(),
  })
  .passthrough();
export type SslcommerzIpnInput = z.infer<typeof sslcommerzIpnSchema>;

export const paymentIntentParamSchema = z.object({
  tranId: z.string().min(1, 'Transaction ID is required'),
});
export type PaymentIntentParam = z.infer<typeof paymentIntentParamSchema>;
