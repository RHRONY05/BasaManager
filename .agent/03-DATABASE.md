# 03 — Database

PostgreSQL 17. Schema in `apps/api/prisma/schema.prisma`. Anything Prisma can't express (roles, RLS,
check constraints, partial indexes, triggers) goes in hand-written SQL migrations in the same folder.
The architect owns this file and the schema; implementers never change the schema.

## Conventions
- PKs `uuid` (`gen_random_uuid()`), `created_at timestamptz default now()`, `updated_at` via Prisma `@updatedAt`.
- Money `bigint` poisha, `check (x >= 0)` unless the column says signed. Dates of the billing calendar are
  `date` (Asia/Dhaka calendar day); instants are `timestamptz` (UTC).
- Enums are Postgres enums (Prisma `enum`).
- Table names snake_case plural; Prisma models PascalCase singular with `@@map`.
- Soft delete only where the table says so (`deleted_at`/`archived_at`); otherwise rows are immutable
  history (payments, bill lines, events) or truly deleted.

## Database roles (migration `0001_roles.sql`, idempotent)
| Role | Used by | Rights |
|---|---|---|
| `bm_owner` | migrations only | owns all tables |
| `bm_app` | API | `select/insert/update/delete` on tables, `NOBYPASSRLS`. No `delete` grant on `payments`, `bill_lines`, `payment_allocations`, `receipts`, `maintenance_events`, `credit_entries` (history is never deleted) |
| `bm_worker` | worker | same grants as `bm_app` + `BYPASSRLS` |
| `bm_readonly` | `db-docs`, backups verification | `select` only |

## Tables

### Identity & access
| Table | Columns (beyond id/created_at/updated_at) | Constraints / notes |
|---|---|---|
| `users` | `email citext unique`, `email_verified_at`, `password_hash null`, `full_name`, `phone null`, `is_platform_admin bool default false`, `failed_login_count int default 0`, `locked_until null`, `deleted_at null` | No RLS (not org-owned). Access only through the auth/users services. Anonymised on deletion |
| `oauth_accounts` | `user_id → users`, `provider ('google')`, `provider_user_id` | `unique(provider, provider_user_id)` |
| `sessions` | `user_id`, `family_id uuid`, `token_hash bytea unique`, `expires_at`, `rotated_at null`, `revoked_at null`, `revoke_reason null`, `user_agent`, `ip inet` | Index `(user_id) where revoked_at is null`. Rows older than 60 days after expiry are deleted by retention |
| `auth_tokens` | `kind ('email_verify','password_reset')`, `user_id`, `token_hash bytea unique`, `expires_at`, `used_at null` | Single use: `update … set used_at=now() where token_hash=$1 and used_at is null and expires_at>now() returning *` |
| `organizations` | `name`, `slug unique`, `status ('active','suspended')`, `is_demo bool`, `created_by → users` | RLS: members see their own org; admin context may read |
| `memberships` | `org_id`, `user_id`, `role ('landlord','caretaker','tenant')`, `status ('active','removed')`, `removed_at` | `unique(org_id, user_id)`. Exactly one active landlord per org (partial unique index `(org_id) where role='landlord' and status='active'`) |
| `caretaker_buildings` | `org_id`, `membership_id`, `building_id` | PK `(membership_id, building_id)` |
| `invitations` | `org_id`, `email citext`, `role ('caretaker','tenant')`, `building_ids uuid[]` (caretaker), `lease_id null` (tenant), `token_hash bytea unique`, `expires_at`, `accepted_at null`, `revoked_at null`, `invited_by` | Partial unique `(org_id, email, role) where accepted_at is null and revoked_at is null` |

### Property
| Table | Columns | Constraints / notes |
|---|---|---|
| `buildings` | `org_id`, `name`, `address`, `area`, `city`, `lat numeric(9,6) null`, `lng numeric(9,6) null`, `bill_day smallint default 1`, `due_day smallint default 10`, `grace_days smallint default 0`, `late_fee_type ('none','flat','percent')`, `late_fee_value int` (poisha for flat, basis points for percent: 500 = 5%), `electricity_rate_poisha int default 0`, `archived_at null` | `check (bill_day between 1 and 28)`, `check (due_day between 1 and 28)`, `check (grace_days between 0 and 15)` |
| `units` | `org_id`, `building_id`, `label`, `floor smallint`, `type ('family_flat','bachelor_flat','room','shop')`, `default_rent_poisha bigint`, `electricity_mode ('none','prepaid','submeter')`, `archived_at null` | `unique(building_id, label)`. Can't archive while a lease is active |
| `unit_charges` | `org_id`, `unit_id`, `name`, `amount_poisha bigint` | `unique(unit_id, name)` |

### Leases
| Table | Columns | Constraints / notes |
|---|---|---|
| `leases` | `org_id`, `unit_id`, `start_date date`, `end_date date null`, `notice_date null`, `monthly_rent_poisha`, `deposit_poisha`, `household_size smallint`, `status ('pending','active','notice','ended','ended_with_dues')`, `move_in_reading int null`, `move_out_reading int null`, `settlement_json jsonb null`, `created_by` | Partial unique `(unit_id) where status in ('pending','active','notice')` = one live lease per unit. `pending` = invited but tenant hasn't accepted yet |
| `lease_tenants` | `org_id`, `lease_id`, `membership_id`, `is_primary bool` | PK `(lease_id, membership_id)`; one primary per lease (partial unique) |
| `lease_charges` | `org_id`, `lease_id`, `name`, `amount_poisha` | Copied from `unit_charges` at lease start; editable before the first bill |
| `deposit_entries` | `org_id`, `lease_id`, `kind ('received','refunded','applied_to_dues')`, `amount_poisha`, `note`, `recorded_by` | Deposit held = Σ received − refunded − applied |

### Billing & payments
| Table | Columns | Constraints / notes |
|---|---|---|
| `meter_readings` | `org_id`, `unit_id`, `period_month date`, `reading int`, `meter_replaced bool`, `new_meter_start int null`, `entered_by` | `unique(unit_id, period_month)`; `check (period_month = date_trunc('month', period_month))` |
| `bills` | `org_id`, `lease_id`, `period_month date`, `due_date date`, `status ('draft','issued','partially_paid','paid','void')`, `needs_reading bool`, `total_poisha bigint`, `paid_poisha bigint default 0`, `issued_at`, `issued_by`, `late_fee_applied_at null`, `void_reason null` | `unique(lease_id, period_month)` (idempotent generation). `check (paid_poisha <= total_poisha)`. Index `(org_id, status, due_date)` |
| `bill_lines` | `org_id`, `bill_id`, `kind ('rent','fixed_charge','electricity','adjustment','late_fee')`, `label`, `amount_poisha bigint` (signed: discounts negative), `meta jsonb` (factor, prev, curr, rate…), `reason null`, `created_by null` | Partial unique `(bill_id) where kind='late_fee'` = never two late fees. Lines are frozen once the bill is issued, except: adjustment add (B7) and late-fee waive (B6) |
| `payments` | `org_id`, `lease_id`, `amount_poisha`, `method ('cash','bkash','nagad','bank','sslcommerz')`, `status ('pending_claim','confirmed','rejected','void')`, `reference null`, `proof_file_id null`, `paid_on date`, `submitted_by`, `confirmed_by null`, `confirmed_at null`, `rejected_reason null`, `void_reason null`, `voided_by null` | Partial unique `(method, reference) where method in ('bkash','nagad') and status <> 'rejected'` = the same TrxID can't be claimed twice |
| `payment_allocations` | `org_id`, `payment_id`, `bill_id`, `amount_poisha > 0` | Sum per bill = `bills.paid_poisha` (asserted in tests) |
| `credit_entries` | `org_id`, `lease_id`, `amount_poisha` (signed), `payment_id null`, `bill_id null`, `kind ('overpayment','applied','reversed')` | Lease credit = Σ amount, never negative (checked in service + test) |
| `payment_intents` | `org_id`, `lease_id`, `tran_id text unique`, `amount_poisha`, `status ('initiated','confirmed','failed','cancelled','expired','flagged')`, `session_key`, `val_id null`, `gateway_response jsonb null`, `payment_id null`, `created_by` | Index `(status, created_at)` for the re-check job |
| `receipt_counters` | `org_id`, `year smallint`, `last_seq int` | PK `(org_id, year)`. Allocation: `insert … on conflict (org_id, year) do update set last_seq = receipt_counters.last_seq + 1 returning last_seq` **inside** the payment transaction = gapless, no duplicates |
| `receipts` | `org_id`, `payment_id unique`, `number text`, `status ('valid','void')`, `file_id null` | `unique(org_id, number)`. Format `BM-<year>-<seq 6 digits>` |

### Operations
| Table | Columns | Constraints / notes |
|---|---|---|
| `maintenance_requests` | `org_id`, `building_id`, `unit_id`, `lease_id`, `created_by`, `category`, `priority ('low','normal','urgent')`, `title`, `description`, `status ('open','assigned','in_progress','resolved','closed')`, `assigned_to membership_id null`, `resolved_at`, `closed_at`, `reopen_count smallint` | Transitions enforced in the service (state machine in `packages/domain/src/maintenance.ts`) |
| `maintenance_events` | `org_id`, `request_id`, `actor_id`, `kind ('created','status','assigned','comment','photo')`, `from_status`, `to_status`, `body`, `file_id` | Append-only timeline |
| `notices` | `org_id`, `building_id`, `title`, `body`, `pinned bool`, `expires_at null`, `created_by`, `deleted_at null` | |
| `files` | `org_id`, `provider ('cloudinary','local')`, `public_id unique`, `resource_type ('image','raw')`, `thumb_public_id null`, `format`, `mime`, `size_bytes`, `sha256`, `kind ('maintenance_photo','payment_proof','document','receipt_pdf','statement_pdf','settlement_pdf')`, `uploaded_by null`, `deleted_at null`, `object_deleted_at null` | |
| `documents` | `org_id`, `lease_id`, `kind ('nid_front','nid_back','agreement','other')`, `file_id`, `uploaded_by` | Extra RLS: invisible when `app.role = 'caretaker'` |
| `notifications` | `org_id null`, `user_id`, `type`, `title`, `body`, `link`, `read_at null` | Index `(user_id, read_at, created_at desc)`. RLS by `app.user_id` |
| `notification_preferences` | `user_id`, `type`, `channel ('in_app','email','push')`, `enabled bool` | PK `(user_id, type, channel)`. Missing row = default from `packages/shared/notifications.ts` |
| `push_subscriptions` | `user_id`, `endpoint text unique`, `p256dh`, `auth`, `user_agent`, `last_success_at` | |
| `outbox` | `org_id null`, `type`, `payload jsonb`, `status ('pending','processing','done','failed')`, `attempts`, `next_attempt_at`, `last_error`, `locked_at` | Index `(status, next_attempt_at)`. Worker claims with `for update skip locked` |
| `job_runs` | `job`, `started_at`, `finished_at`, `status ('ok','failed','skipped')`, `details jsonb` | Admin health |

## RLS (migration `0002_rls.sql`)
For **every** table with `org_id`:
```sql
alter table <t> enable row level security;
alter table <t> force row level security;
create policy org_isolation on <t>
  using (org_id = current_setting('app.org_id', true)::uuid)
  with check (org_id = current_setting('app.org_id', true)::uuid);
```
Plus:
```sql
-- documents: caretakers never see them
create policy no_caretaker on documents as restrictive
  using (coalesce(current_setting('app.role', true), '') <> 'caretaker');
-- notifications: own rows only
create policy own_rows on notifications
  using (user_id = current_setting('app.user_id', true)::uuid)
  with check (user_id = current_setting('app.user_id', true)::uuid);
-- organizations: own org, or platform-admin context
create policy org_self on organizations
  using (id = current_setting('app.org_id', true)::uuid
         or current_setting('app.is_admin', true) = 'true');
```
Admin endpoints set `app.is_admin = 'true'` and read only through the views `admin_org_overview` (org
name, status, counts of buildings/units/active leases) and `admin_health` (job runs, failed outbox,
flagged intents). Those views are `security_barrier` and expose **no** personal or financial row data.
A CI test (`rls.int.test.ts`) lists every table with an `org_id` column from `information_schema` and
fails if any lacks RLS + force + policy.

## Derived values (who keeps them right)
| Value | Source of truth | Kept by |
|---|---|---|
| `bills.total_poisha` | Σ `bill_lines.amount_poisha` | billing service, in the same tx as any line change |
| `bills.paid_poisha` | Σ `payment_allocations` of confirmed, non-void payments | payments service tx |
| `bills.status` | total, paid, issued/void | `packages/domain` `billStatus()` called in the same tx |
| overdue | `status in (issued, partially_paid) and due_date < today(Dhaka)` | computed at query time, never stored |
| lease credit | Σ `credit_entries` | payments service tx |
| deposit held | Σ `deposit_entries` | leases service |
| unit occupancy | live lease exists / status | query |

Concurrency: confirming a payment, voiding it, issuing a bill and applying credit all start with
`select … from leases where id = $1 for update` so two of them on the same lease run one after another.

## Lifecycle & deletion
| Event | What happens |
|---|---|
| Lease ends | Status `ended`/`ended_with_dues`; memberships of its tenants stay active while they have any live lease in the org, else become `removed` (they can still sign in to see their history read-only); documents kept **365 days**, then the retention job deletes the files and rows |
| Tenant removed from org | Same as lease end, history kept |
| Caretaker removed | Membership `removed`, `caretaker_buildings` rows deleted, sockets disconnected; events they authored keep their name |
| User deletes account (A8) | Blocked if they're the active landlord of an org (must ask admin). Otherwise in one tx: `users` → `email = 'deleted+<id>@invalid'`, `full_name = 'Former user #<short id>'`, `phone/password_hash = null`, `deleted_at = now()`; sessions, oauth accounts, push subscriptions, preferences, auth tokens deleted; memberships `removed`; their **documents** deleted (files too). Bills, payments, receipts, maintenance history stay (the landlord needs them) and now show the anonymised name |
| Building/unit "delete" | Only archive; blocked while a live lease exists |
| Notice delete | Soft delete (`deleted_at`), hidden everywhere |
| Document delete (D3) | Row deleted, file soft-deleted + object deleted immediately |
| Payment "delete" | Not possible; only void (Rule 6) |
| Org suspended | Members see the suspended screen; jobs skip it; nothing deleted |

## Seed (`prisma/seed.ts`)
Demo org "Rahman Properties" (`is_demo`): 2 buildings in Chattogram (one submeter, one prepaid), 10 units,
8 active leases, 3 months of bills in mixed states, payments of every method incl. one pending claim,
5 maintenance requests across statuses, 2 notices. Users (password from env `SEED_PASSWORD`, dev/staging
only): `landlord@demo.test`, `caretaker@demo.test`, `tenant1@demo.test` … `tenant8@demo.test`,
`admin@demo.test`. The seed goes through the real services (not raw inserts), so it also tests them.
