-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "oauth_provider" AS ENUM ('google');

-- CreateEnum
CREATE TYPE "auth_token_kind" AS ENUM ('email_verify', 'password_reset');

-- CreateEnum
CREATE TYPE "org_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('landlord', 'caretaker', 'tenant');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "invitation_role" AS ENUM ('caretaker', 'tenant');

-- CreateEnum
CREATE TYPE "late_fee_type" AS ENUM ('none', 'flat', 'percent');

-- CreateEnum
CREATE TYPE "unit_type" AS ENUM ('family_flat', 'bachelor_flat', 'room', 'shop');

-- CreateEnum
CREATE TYPE "electricity_mode" AS ENUM ('none', 'prepaid', 'submeter');

-- CreateEnum
CREATE TYPE "lease_status" AS ENUM ('pending', 'active', 'notice', 'ended', 'ended_with_dues');

-- CreateEnum
CREATE TYPE "deposit_entry_kind" AS ENUM ('received', 'refunded', 'applied_to_dues');

-- CreateEnum
CREATE TYPE "bill_status" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'void');

-- CreateEnum
CREATE TYPE "bill_line_kind" AS ENUM ('rent', 'fixed_charge', 'electricity', 'adjustment', 'late_fee');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'bkash', 'nagad', 'bank', 'sslcommerz');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending_claim', 'confirmed', 'rejected', 'void');

-- CreateEnum
CREATE TYPE "credit_entry_kind" AS ENUM ('overpayment', 'applied', 'reversed');

-- CreateEnum
CREATE TYPE "payment_intent_status" AS ENUM ('initiated', 'confirmed', 'failed', 'cancelled', 'expired', 'flagged');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('valid', 'void');

-- CreateEnum
CREATE TYPE "maintenance_category" AS ENUM ('plumbing', 'electrical', 'gas', 'lift', 'cleaning', 'security', 'other');

-- CreateEnum
CREATE TYPE "maintenance_priority" AS ENUM ('low', 'normal', 'urgent');

-- CreateEnum
CREATE TYPE "maintenance_status" AS ENUM ('open', 'assigned', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "maintenance_event_kind" AS ENUM ('created', 'status', 'assigned', 'comment', 'photo');

-- CreateEnum
CREATE TYPE "file_provider" AS ENUM ('cloudinary', 'local');

-- CreateEnum
CREATE TYPE "file_resource_type" AS ENUM ('image', 'raw');

-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('maintenance_photo', 'payment_proof', 'document', 'receipt_pdf', 'statement_pdf', 'settlement_pdf');

-- CreateEnum
CREATE TYPE "document_kind" AS ENUM ('nid_front', 'nid_back', 'agreement', 'other');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('in_app', 'email', 'push');

-- CreateEnum
CREATE TYPE "outbox_status" AS ENUM ('pending', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "job_run_status" AS ENUM ('ok', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "oauth_provider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,
    "user_agent" TEXT,
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "auth_token_kind" NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "org_status" NOT NULL DEFAULT 'active',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caretaker_buildings" (
    "org_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caretaker_buildings_pkey" PRIMARY KEY ("membership_id","building_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "invitation_role" NOT NULL,
    "building_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "lease_id" UUID,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "invited_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "bill_day" SMALLINT NOT NULL DEFAULT 1,
    "due_day" SMALLINT NOT NULL DEFAULT 10,
    "grace_days" SMALLINT NOT NULL DEFAULT 0,
    "late_fee_type" "late_fee_type" NOT NULL DEFAULT 'none',
    "late_fee_value" INTEGER NOT NULL DEFAULT 0,
    "electricity_rate_poisha" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "floor" SMALLINT NOT NULL,
    "type" "unit_type" NOT NULL,
    "default_rent_poisha" BIGINT NOT NULL,
    "electricity_mode" "electricity_mode" NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notice_date" DATE,
    "monthly_rent_poisha" BIGINT NOT NULL,
    "deposit_poisha" BIGINT NOT NULL DEFAULT 0,
    "household_size" SMALLINT NOT NULL DEFAULT 1,
    "status" "lease_status" NOT NULL DEFAULT 'pending',
    "move_in_reading" INTEGER,
    "move_out_reading" INTEGER,
    "settlement_json" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_tenants" (
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_tenants_pkey" PRIMARY KEY ("lease_id","membership_id")
);

-- CreateTable
CREATE TABLE "lease_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "kind" "deposit_entry_kind" NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meter_readings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "reading" INTEGER NOT NULL,
    "meter_replaced" BOOLEAN NOT NULL DEFAULT false,
    "new_meter_start" INTEGER,
    "entered_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meter_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "bill_status" NOT NULL DEFAULT 'draft',
    "needs_reading" BOOLEAN NOT NULL DEFAULT false,
    "total_poisha" BIGINT NOT NULL DEFAULT 0,
    "paid_poisha" BIGINT NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(6),
    "issued_by" UUID,
    "late_fee_applied_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "kind" "bill_line_kind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL,
    "reference" TEXT,
    "proof_file_id" UUID,
    "paid_on" DATE NOT NULL,
    "submitted_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "rejected_reason" TEXT,
    "void_reason" TEXT,
    "voided_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "payment_id" UUID,
    "bill_id" UUID,
    "kind" "credit_entry_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "tran_id" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "status" "payment_intent_status" NOT NULL DEFAULT 'initiated',
    "session_key" TEXT,
    "val_id" TEXT,
    "gateway_response" JSONB,
    "payment_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_counters" (
    "org_id" UUID NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_counters_pkey" PRIMARY KEY ("org_id","year")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "receipt_status" NOT NULL DEFAULT 'valid',
    "file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "category" "maintenance_category" NOT NULL,
    "priority" "maintenance_priority" NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "maintenance_status" NOT NULL DEFAULT 'open',
    "assigned_to" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "reopen_count" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" "maintenance_event_kind" NOT NULL,
    "from_status" "maintenance_status",
    "to_status" "maintenance_status",
    "body" TEXT,
    "file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "provider" "file_provider" NOT NULL,
    "public_id" TEXT NOT NULL,
    "resource_type" "file_resource_type" NOT NULL,
    "thumb_public_id" TEXT,
    "format" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "kind" "file_kind" NOT NULL,
    "uploaded_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "object_deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "kind" "document_kind" NOT NULL,
    "file_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id","type","channel")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_success_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" "job_run_status",
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_user_id_key" ON "oauth_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_live_idx" ON "sessions"("user_id") WHERE (revoked_at IS NULL);

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_created_by_idx" ON "organizations"("created_by");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_org_id_user_id_key" ON "memberships"("org_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_one_active_landlord" ON "memberships"("org_id") WHERE ((role = 'landlord'::membership_role) AND (status = 'active'::membership_status));

-- CreateIndex
CREATE INDEX "caretaker_buildings_org_id_idx" ON "caretaker_buildings"("org_id");

-- CreateIndex
CREATE INDEX "caretaker_buildings_building_id_idx" ON "caretaker_buildings"("building_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_org_id_idx" ON "invitations"("org_id");

-- CreateIndex
CREATE INDEX "invitations_lease_id_idx" ON "invitations"("lease_id");

-- CreateIndex
CREATE INDEX "invitations_invited_by_idx" ON "invitations"("invited_by");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_one_open_per_email" ON "invitations"("org_id", "email", "role") WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL));

-- CreateIndex
CREATE INDEX "buildings_org_id_idx" ON "buildings"("org_id");

-- CreateIndex
CREATE INDEX "units_org_id_idx" ON "units"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_building_id_label_key" ON "units"("building_id", "label");

-- CreateIndex
CREATE INDEX "unit_charges_org_id_idx" ON "unit_charges"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "unit_charges_unit_id_name_key" ON "unit_charges"("unit_id", "name");

-- CreateIndex
CREATE INDEX "leases_org_id_status_idx" ON "leases"("org_id", "status");

-- CreateIndex
CREATE INDEX "leases_unit_id_idx" ON "leases"("unit_id");

-- CreateIndex
CREATE INDEX "leases_created_by_idx" ON "leases"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "leases_one_live_per_unit" ON "leases"("unit_id") WHERE (status = ANY (ARRAY['pending'::lease_status, 'active'::lease_status, 'notice'::lease_status]));

-- CreateIndex
CREATE INDEX "lease_tenants_org_id_idx" ON "lease_tenants"("org_id");

-- CreateIndex
CREATE INDEX "lease_tenants_membership_id_idx" ON "lease_tenants"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_tenants_one_primary" ON "lease_tenants"("lease_id") WHERE (is_primary);

-- CreateIndex
CREATE INDEX "lease_charges_org_id_idx" ON "lease_charges"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_charges_lease_id_name_key" ON "lease_charges"("lease_id", "name");

-- CreateIndex
CREATE INDEX "deposit_entries_org_id_idx" ON "deposit_entries"("org_id");

-- CreateIndex
CREATE INDEX "deposit_entries_lease_id_idx" ON "deposit_entries"("lease_id");

-- CreateIndex
CREATE INDEX "deposit_entries_recorded_by_idx" ON "deposit_entries"("recorded_by");

-- CreateIndex
CREATE INDEX "meter_readings_org_id_idx" ON "meter_readings"("org_id");

-- CreateIndex
CREATE INDEX "meter_readings_entered_by_idx" ON "meter_readings"("entered_by");

-- CreateIndex
CREATE UNIQUE INDEX "meter_readings_unit_id_period_month_key" ON "meter_readings"("unit_id", "period_month");

-- CreateIndex
CREATE INDEX "bills_org_id_status_due_date_idx" ON "bills"("org_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "bills_issued_by_idx" ON "bills"("issued_by");

-- CreateIndex
CREATE UNIQUE INDEX "bills_lease_id_period_month_key" ON "bills"("lease_id", "period_month");

-- CreateIndex
CREATE INDEX "bill_lines_org_id_idx" ON "bill_lines"("org_id");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_idx" ON "bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "bill_lines_created_by_idx" ON "bill_lines"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "bill_lines_one_late_fee" ON "bill_lines"("bill_id") WHERE (kind = 'late_fee'::bill_line_kind);

-- CreateIndex
CREATE INDEX "payments_org_id_status_idx" ON "payments"("org_id", "status");

-- CreateIndex
CREATE INDEX "payments_lease_id_idx" ON "payments"("lease_id");

-- CreateIndex
CREATE INDEX "payments_proof_file_id_idx" ON "payments"("proof_file_id");

-- CreateIndex
CREATE INDEX "payments_submitted_by_idx" ON "payments"("submitted_by");

-- CreateIndex
CREATE INDEX "payments_confirmed_by_idx" ON "payments"("confirmed_by");

-- CreateIndex
CREATE INDEX "payments_voided_by_idx" ON "payments"("voided_by");

-- CreateIndex
CREATE UNIQUE INDEX "payments_one_claim_per_reference" ON "payments"("method", "reference") WHERE ((method = ANY (ARRAY['bkash'::payment_method, 'nagad'::payment_method])) AND (status <> 'rejected'::payment_status));

-- CreateIndex
CREATE INDEX "payment_allocations_org_id_idx" ON "payment_allocations"("org_id");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_bill_id_idx" ON "payment_allocations"("bill_id");

-- CreateIndex
CREATE INDEX "credit_entries_org_id_idx" ON "credit_entries"("org_id");

-- CreateIndex
CREATE INDEX "credit_entries_lease_id_idx" ON "credit_entries"("lease_id");

-- CreateIndex
CREATE INDEX "credit_entries_payment_id_idx" ON "credit_entries"("payment_id");

-- CreateIndex
CREATE INDEX "credit_entries_bill_id_idx" ON "credit_entries"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_tran_id_key" ON "payment_intents"("tran_id");

-- CreateIndex
CREATE INDEX "payment_intents_status_created_at_idx" ON "payment_intents"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_intents_org_id_idx" ON "payment_intents"("org_id");

-- CreateIndex
CREATE INDEX "payment_intents_lease_id_idx" ON "payment_intents"("lease_id");

-- CreateIndex
CREATE INDEX "payment_intents_payment_id_idx" ON "payment_intents"("payment_id");

-- CreateIndex
CREATE INDEX "payment_intents_created_by_idx" ON "payment_intents"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_payment_id_key" ON "receipts"("payment_id");

-- CreateIndex
CREATE INDEX "receipts_file_id_idx" ON "receipts"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_org_id_number_key" ON "receipts"("org_id", "number");

-- CreateIndex
CREATE INDEX "maintenance_requests_org_id_status_idx" ON "maintenance_requests"("org_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_building_id_status_idx" ON "maintenance_requests"("building_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_unit_id_idx" ON "maintenance_requests"("unit_id");

-- CreateIndex
CREATE INDEX "maintenance_requests_lease_id_idx" ON "maintenance_requests"("lease_id");

-- CreateIndex
CREATE INDEX "maintenance_requests_created_by_idx" ON "maintenance_requests"("created_by");

-- CreateIndex
CREATE INDEX "maintenance_requests_assigned_to_idx" ON "maintenance_requests"("assigned_to");

-- CreateIndex
CREATE INDEX "maintenance_events_org_id_idx" ON "maintenance_events"("org_id");

-- CreateIndex
CREATE INDEX "maintenance_events_request_id_created_at_idx" ON "maintenance_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "maintenance_events_actor_id_idx" ON "maintenance_events"("actor_id");

-- CreateIndex
CREATE INDEX "maintenance_events_file_id_idx" ON "maintenance_events"("file_id");

-- CreateIndex
CREATE INDEX "notices_org_id_idx" ON "notices"("org_id");

-- CreateIndex
CREATE INDEX "notices_building_id_created_at_idx" ON "notices"("building_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notices_created_by_idx" ON "notices"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "files_public_id_key" ON "files"("public_id");

-- CreateIndex
CREATE INDEX "files_org_id_idx" ON "files"("org_id");

-- CreateIndex
CREATE INDEX "files_uploaded_by_idx" ON "files"("uploaded_by");

-- CreateIndex
CREATE INDEX "documents_org_id_idx" ON "documents"("org_id");

-- CreateIndex
CREATE INDEX "documents_lease_id_idx" ON "documents"("lease_id");

-- CreateIndex
CREATE INDEX "documents_file_id_idx" ON "documents"("file_id");

-- CreateIndex
CREATE INDEX "documents_uploaded_by_idx" ON "documents"("uploaded_by");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_org_id_idx" ON "notifications"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "outbox_status_next_attempt_at_idx" ON "outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_org_id_idx" ON "outbox"("org_id");

-- CreateIndex
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs"("job", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caretaker_buildings" ADD CONSTRAINT "caretaker_buildings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caretaker_buildings" ADD CONSTRAINT "caretaker_buildings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caretaker_buildings" ADD CONSTRAINT "caretaker_buildings_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_charges" ADD CONSTRAINT "unit_charges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_charges" ADD CONSTRAINT "unit_charges_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_tenants" ADD CONSTRAINT "lease_tenants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_tenants" ADD CONSTRAINT "lease_tenants_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_tenants" ADD CONSTRAINT "lease_tenants_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_file_id_fkey" FOREIGN KEY ("proof_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_counters" ADD CONSTRAINT "receipt_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
