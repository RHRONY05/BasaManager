import { z } from 'zod';

/**
 * Every Postgres enum of 03-DATABASE.md as a Zod enum + type (the single contract for web and api).
 * Values are the database values; each comment names the Postgres type. Erasable TypeScript only (no `enum`
 * keyword): `scripts/openapi.mjs` runs this file with Node type stripping.
 * Kept equal to the Prisma enums by `apps/api/src/config/enums.test.ts`: change `schema.prisma` (with a
 * migration) and this file together.
 */

/** `oauth_provider` */
export const oauthProviderSchema = z.enum(['google']);
export type OauthProvider = z.infer<typeof oauthProviderSchema>;

/** `auth_token_kind` */
export const authTokenKindSchema = z.enum(['email_verify', 'password_reset']);
export type AuthTokenKind = z.infer<typeof authTokenKindSchema>;

/** `org_status` */
export const orgStatusSchema = z.enum(['active', 'suspended']);
export type OrgStatus = z.infer<typeof orgStatusSchema>;

/** `membership_role` */
export const membershipRoleSchema = z.enum(['landlord', 'caretaker', 'tenant']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

/** `membership_status` */
export const membershipStatusSchema = z.enum(['active', 'removed']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/** `invitation_role` */
export const invitationRoleSchema = z.enum(['caretaker', 'tenant']);
export type InvitationRole = z.infer<typeof invitationRoleSchema>;

/** `late_fee_type` */
export const lateFeeTypeSchema = z.enum(['none', 'flat', 'percent']);
export type LateFeeType = z.infer<typeof lateFeeTypeSchema>;

/** `unit_type` */
export const unitTypeSchema = z.enum(['family_flat', 'bachelor_flat', 'room', 'shop']);
export type UnitType = z.infer<typeof unitTypeSchema>;

/** `electricity_mode` */
export const electricityModeSchema = z.enum(['none', 'prepaid', 'submeter']);
export type ElectricityMode = z.infer<typeof electricityModeSchema>;

/** `lease_status` */
export const leaseStatusSchema = z.enum(['pending', 'active', 'notice', 'ended', 'ended_with_dues']);
export type LeaseStatus = z.infer<typeof leaseStatusSchema>;

/** `deposit_entry_kind` */
export const depositEntryKindSchema = z.enum(['received', 'refunded', 'applied_to_dues']);
export type DepositEntryKind = z.infer<typeof depositEntryKindSchema>;

/** `bill_status` */
export const billStatusSchema = z.enum(['draft', 'issued', 'partially_paid', 'paid', 'void']);
export type BillStatus = z.infer<typeof billStatusSchema>;

/** `bill_line_kind` */
export const billLineKindSchema = z.enum(['rent', 'fixed_charge', 'electricity', 'adjustment', 'late_fee']);
export type BillLineKind = z.infer<typeof billLineKindSchema>;

/** `payment_method` */
export const paymentMethodSchema = z.enum(['cash', 'bkash', 'nagad', 'bank', 'sslcommerz']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** `payment_status` */
export const paymentStatusSchema = z.enum(['pending_claim', 'confirmed', 'rejected', 'void']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** `credit_entry_kind` */
export const creditEntryKindSchema = z.enum(['overpayment', 'applied', 'reversed']);
export type CreditEntryKind = z.infer<typeof creditEntryKindSchema>;

/** `payment_intent_status` */
export const paymentIntentStatusSchema = z.enum(['initiated', 'confirmed', 'failed', 'cancelled', 'expired', 'flagged']);
export type PaymentIntentStatus = z.infer<typeof paymentIntentStatusSchema>;

/** `receipt_status` */
export const receiptStatusSchema = z.enum(['valid', 'void']);
export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;

/** `maintenance_category` */
export const maintenanceCategorySchema = z.enum(['plumbing', 'electrical', 'gas', 'lift', 'cleaning', 'security', 'other']);
export type MaintenanceCategory = z.infer<typeof maintenanceCategorySchema>;

/** `maintenance_priority` */
export const maintenancePrioritySchema = z.enum(['low', 'normal', 'urgent']);
export type MaintenancePriority = z.infer<typeof maintenancePrioritySchema>;

/** `maintenance_status` */
export const maintenanceStatusSchema = z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed']);
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

/** `maintenance_event_kind` */
export const maintenanceEventKindSchema = z.enum(['created', 'status', 'assigned', 'comment', 'photo']);
export type MaintenanceEventKind = z.infer<typeof maintenanceEventKindSchema>;

/** `file_provider` */
export const fileProviderSchema = z.enum(['cloudinary', 'local']);
export type FileProvider = z.infer<typeof fileProviderSchema>;

/** `file_resource_type` */
export const fileResourceTypeSchema = z.enum(['image', 'raw']);
export type FileResourceType = z.infer<typeof fileResourceTypeSchema>;

/** `file_kind` */
export const fileKindSchema = z.enum(['maintenance_photo', 'payment_proof', 'document', 'receipt_pdf', 'statement_pdf', 'settlement_pdf']);
export type FileKind = z.infer<typeof fileKindSchema>;

/** `document_kind` */
export const documentKindSchema = z.enum(['nid_front', 'nid_back', 'agreement', 'other']);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** `notification_channel` */
export const notificationChannelSchema = z.enum(['in_app', 'email', 'push']);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** `outbox_status` */
export const outboxStatusSchema = z.enum(['pending', 'processing', 'done', 'failed']);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

/** `job_run_status` */
export const jobRunStatusSchema = z.enum(['ok', 'failed', 'skipped']);
export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

/** Every enum by its Prisma name (the enums test compares this with the generated client). */
export const dbEnums = {
  OauthProvider: oauthProviderSchema,
  AuthTokenKind: authTokenKindSchema,
  OrgStatus: orgStatusSchema,
  MembershipRole: membershipRoleSchema,
  MembershipStatus: membershipStatusSchema,
  InvitationRole: invitationRoleSchema,
  LateFeeType: lateFeeTypeSchema,
  UnitType: unitTypeSchema,
  ElectricityMode: electricityModeSchema,
  LeaseStatus: leaseStatusSchema,
  DepositEntryKind: depositEntryKindSchema,
  BillStatus: billStatusSchema,
  BillLineKind: billLineKindSchema,
  PaymentMethod: paymentMethodSchema,
  PaymentStatus: paymentStatusSchema,
  CreditEntryKind: creditEntryKindSchema,
  PaymentIntentStatus: paymentIntentStatusSchema,
  ReceiptStatus: receiptStatusSchema,
  MaintenanceCategory: maintenanceCategorySchema,
  MaintenancePriority: maintenancePrioritySchema,
  MaintenanceStatus: maintenanceStatusSchema,
  MaintenanceEventKind: maintenanceEventKindSchema,
  FileProvider: fileProviderSchema,
  FileResourceType: fileResourceTypeSchema,
  FileKind: fileKindSchema,
  DocumentKind: documentKindSchema,
  NotificationChannel: notificationChannelSchema,
  OutboxStatus: outboxStatusSchema,
  JobRunStatus: jobRunStatusSchema,
} as const;
