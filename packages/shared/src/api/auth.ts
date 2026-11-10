import { z } from 'zod';
import { uuidSchema, dataEnvelope } from './common';
import { membershipRoleSchema, membershipStatusSchema } from '../enums';

// ── Auth Schemas ─────────────────────────────────────────────────────────────

export const signupRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(10, 'Password must be at least 10 characters'),
    fullName: z.string().min(1, 'Full name is required').max(200),
    orgName: z.string().min(1, 'Organization name is required').max(200),
  })
  .meta({ id: 'SignupRequest' });

export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const verifyEmailRequestSchema = z
  .object({
    token: z.string().min(1, 'Token is required'),
  })
  .meta({ id: 'VerifyEmailRequest' });

export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  })
  .meta({ id: 'LoginRequest' });

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const forgotPasswordRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .meta({ id: 'ForgotPasswordRequest' });

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(10, 'Password must be at least 10 characters'),
  })
  .meta({ id: 'ResetPasswordRequest' });

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const acceptInviteRequestSchema = z
  .object({
    password: z.string().min(10, 'Password must be at least 10 characters').optional(),
    fullName: z.string().min(1, 'Full name is required').max(200).optional(),
  })
  .meta({ id: 'AcceptInviteRequest' });

export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const invitePreviewSchema = z
  .object({
    orgName: z.string(),
    role: z.string(),
    inviterName: z.string(),
    email: z.string(),
    emailMatchesCurrentUser: z.boolean().optional(),
    userExists: z.boolean().optional(),
  })
  .meta({ id: 'InvitePreview' });

export type InvitePreview = z.infer<typeof invitePreviewSchema>;

export const invitePreviewResponseSchema = dataEnvelope(invitePreviewSchema).meta({
  id: 'InvitePreviewResponse',
});

export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

// ── User / Me Schemas ────────────────────────────────────────────────────────

export const userProfileSchema = z
  .object({
    id: uuidSchema,
    email: z.string().email(),
    fullName: z.string(),
    phone: z.string().nullable().optional(),
    emailVerified: z.boolean(),
  })
  .meta({ id: 'UserProfile' });

export type UserProfile = z.infer<typeof userProfileSchema>;

export const userMembershipSchema = z
  .object({
    orgId: uuidSchema,
    orgName: z.string(),
    role: membershipRoleSchema,
    status: membershipStatusSchema,
  })
  .meta({ id: 'UserMembership' });

export type UserMembership = z.infer<typeof userMembershipSchema>;

export const meResponseSchema = dataEnvelope(
  z.object({
    user: userProfileSchema,
    memberships: z.array(userMembershipSchema),
  }),
).meta({ id: 'MeResponse' });

export type MeResponse = z.infer<typeof meResponseSchema>;

export const updateMeRequestSchema = z
  .object({
    fullName: z.string().min(1, 'Full name cannot be empty').max(200).optional(),
    phone: z.string().min(1, 'Phone cannot be empty').max(50).nullable().optional(),
  })
  .meta({ id: 'UpdateMeRequest' });

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(10, 'New password must be at least 10 characters'),
  })
  .meta({ id: 'ChangePasswordRequest' });

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const sessionDeviceSchema = z
  .object({
    id: uuidSchema,
    userAgent: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
    createdAt: z.union([z.string(), z.date()]),
    current: z.boolean(),
  })
  .meta({ id: 'SessionDevice' });

export type SessionDevice = z.infer<typeof sessionDeviceSchema>;

export const sessionsListResponseSchema = dataEnvelope(z.array(sessionDeviceSchema)).meta({
  id: 'SessionsListResponse',
});

export type SessionsListResponse = z.infer<typeof sessionsListResponseSchema>;

// ── Org Schemas ──────────────────────────────────────────────────────────────

export const orgResponseSchema = dataEnvelope(
  z.object({
    id: uuidSchema.optional(),
    name: z.string(),
    slug: z.string().optional(),
  }),
).meta({ id: 'OrgResponse' });

export type OrgResponse = z.infer<typeof orgResponseSchema>;

export { updateOrgRequestSchema, type UpdateOrgRequest } from './org';
