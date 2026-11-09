import { z } from 'zod';
import { uuidSchema, dataEnvelope } from './common';
import { membershipRoleSchema, membershipStatusSchema, orgStatusSchema } from '../enums';

// ── Org Details ──────────────────────────────────────────────────────────────

export const orgDetailSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(200),
    slug: z.string(),
    status: orgStatusSchema,
  })
  .meta({ id: 'OrgDetail' });

export type OrgDetail = z.infer<typeof orgDetailSchema>;

export const orgDetailResponseSchema = dataEnvelope(orgDetailSchema).meta({
  id: 'OrgDetailResponse',
});
export type OrgDetailResponse = z.infer<typeof orgDetailResponseSchema>;

export const updateOrgRequestSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(200),
  })
  .meta({ id: 'UpdateOrgRequest' });

export type UpdateOrgRequest = z.infer<typeof updateOrgRequestSchema>;

// ── Members ──────────────────────────────────────────────────────────────────

export const memberUserSchema = z
  .object({
    id: uuidSchema.optional(),
    fullName: z.string(),
    email: z.string().email(),
    phone: z.string().nullable().optional(),
  })
  .meta({ id: 'MemberUser' });

export type MemberUser = z.infer<typeof memberUserSchema>;

export const orgMemberSchema = z
  .object({
    id: uuidSchema,
    userId: uuidSchema,
    role: membershipRoleSchema,
    status: membershipStatusSchema,
    user: memberUserSchema,
    buildingIds: z.array(uuidSchema).optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
  })
  .meta({ id: 'OrgMember' });

export type OrgMember = z.infer<typeof orgMemberSchema>;

export const orgMembersResponseSchema = dataEnvelope(z.array(orgMemberSchema)).meta({
  id: 'OrgMembersResponse',
});

export type OrgMembersResponse = z.infer<typeof orgMembersResponseSchema>;

export const updateCaretakerBuildingsRequestSchema = z
  .object({
    buildingIds: z.array(uuidSchema),
  })
  .meta({ id: 'UpdateCaretakerBuildingsRequest' });

export type UpdateCaretakerBuildingsRequest = z.infer<typeof updateCaretakerBuildingsRequestSchema>;

// ── Invites ──────────────────────────────────────────────────────────────────

export const inviteCaretakerRequestSchema = z
  .object({
    email: z.string().email('Valid email is required'),
    role: z.literal('caretaker'),
    buildingIds: z.array(uuidSchema),
  })
  .meta({ id: 'InviteCaretakerRequest' });

export type InviteCaretakerRequest = z.infer<typeof inviteCaretakerRequestSchema>;

export const orgInviteSchema = z
  .object({
    id: uuidSchema,
    email: z.string().email(),
    role: z.string(),
    buildingIds: z.array(uuidSchema),
    expiresAt: z.union([z.string(), z.date()]),
    createdAt: z.union([z.string(), z.date()]),
  })
  .meta({ id: 'OrgInvite' });

export type OrgInvite = z.infer<typeof orgInviteSchema>;

export const orgInvitesResponseSchema = dataEnvelope(z.array(orgInviteSchema)).meta({
  id: 'OrgInvitesResponse',
});

export type OrgInvitesResponse = z.infer<typeof orgInvitesResponseSchema>;
