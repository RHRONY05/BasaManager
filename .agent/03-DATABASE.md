# 03 — Database

PostgreSQL 17. Schema in `apps/api/prisma/schema.prisma`. Anything Prisma can't express (roles, RLS,
check constraints, partial indexes, triggers) goes in hand-written SQL migrations in the same folder.
The architect owns this file and the schema; implementers never change the schema.

## Conventions
- PKs `uuid` (`gen_random_uuid()`), `created_at timestamptz default now()`, `updated_at timestamptz default now()`
  **and** Prisma `@updatedAt` (the DB default lets raw SQL fixtures and the worker omit it). Join tables with a
  composite PK (`caretaker_buildings`, `lease_tenants`, `receipt_counters`, `notification_preferences`) have no `id`.
- **Actor columns:** every "who did it" column (`created_by`, `submitted_by`, `actor_id`, `uploaded_by`,
  `entered_by`, `issued_by`, `confirmed_by`, `voided_by`, `invited_by`, `recorded_by`) is a FK to `users.id`.
  Only `maintenance_requests.assigned_to` references `memberships.id`.
- **Child FKs inside an org are composite `(org_id, x_id)`.** Foreign-key checks ignore RLS, so a plain
  `units.building_id → buildings.id` would let org A's row point at org B's row (and e.g. block B's unit with
  A's live lease). Every FK from an org-owned table to another org-owned table is
  `(org_id, x_id) → parent(org_id, id)` (Prisma `@relation(fields: [orgId, xId], references: [orgId, id])`), and
  every referenced parent (`memberships`, `buildings`, `units`, `leases`, `bills`, `payments`, `files`,
  `maintenance_requests`) has `@@unique([orgId, id])`; `receipts` has `unique(org_id, payment_id)` (one receipt per payment; also what Prisma
  needs for the 1:1 `Payment.receipt`). Nullable links use `on delete restrict`, never `set null` (it would
  null `org_id` too; those parents are soft-deleted or `removed`, never deleted). Links to `users` and
  `organizations` stay single-column. Composite FKs are `on update no action` (Prisma `onUpdate: NoAction`;
  Prisma's default `Cascade` would let a BYPASSRLS role re-home a parent's `org_id` and silently drag the whole
  subtree into another org; ids and `org_id` never change). `rls.int.test.ts` reads `pg_constraint` and fails
  on any org → org FK without the `org_id = org_id` pair, with `set null`, or with an update action other
  than `no action`/`restrict`.
- **Uniques on FK columns lead with `org_id`** (`unique(org_id, building_id, label)`, PK
  `(org_id, lease_id, membership_id)`, partial `(org_id, unit_id) where live` …). The meaning is the same (the
  composite FK pins the parent's org), but a unique check runs before the FK check, so `unique(unit_id)` would
  answer an org-A insert that names org B's unit with `23505` ("taken") instead of `23503`, leaking that the row
  exists. With `org_id` first the keys never collide across orgs and the FK refuses it. Global uniques
  (`users.email`, `organizations.slug`, token hashes, `payment_intents.tran_id`, `files.public_id`,
  `push_subscriptions.endpoint`, `payments (method, reference)`) are global by design and don't involve another
  org's ids; services still check ownership before writing and answer `NOT_FOUND`.
- Money `bigint` poisha (Prisma `BigInt`, JS `bigint`: convert at the API boundary, `JSON.stringify` throws on
  it), `check (x >= 0)` unless the column says signed; amounts that must be positive say `> 0`.
  `buildings.late_fee_value` and `electricity_rate_poisha` are `int`. Dates of the billing calendar are
  `date` (Asia/Dhaka calendar day); instants are `timestamptz` (UTC).
- Enums are Postgres enums (Prisma `enum Foo { … @@map("foo") }`, snake_case type names). Each one is mirrored
  as a Zod enum + type in `packages/shared/src/enums.ts` (`fooSchema`, type `Foo`, all of them in `dbEnums`);
  `apps/api/src/config/enums.test.ts` fails if the two drift.
- Partial (unique) indexes are declared in `schema.prisma` with `where: raw("…")` (preview feature
  `partialIndexes`), so `prisma migrate diff` keeps them. Check constraints, RLS, grants and views are SQL-only
  (Prisma ignores them when diffing).
- Table names snake_case plural; Prisma models PascalCase singular with `@@map`.
- Soft delete only where the table says so (`deleted_at`/`archived_at`); otherwise rows are immutable
  history (payments, bill lines, events) or truly deleted.

## Prisma setup (Prisma 7)
- `apps/api/prisma/schema.prisma`: generator `prisma-client` (ESM, `runtime = "nodejs"`) with output
  `apps/api/src/generated/prisma/` (git-ignored; regenerate with `pnpm --filter @bm/api db:generate`,
  which CI must run before `typecheck`). The datasource block has no `url` (Prisma 7).
- `apps/api/prisma.config.ts`: schema + `prisma/migrations` path, datasource URL from
  `DATABASE_OWNER_URL` (migrations run as `bm_owner`). It loads the root `.env` only when the variable
  isn't already set; `generate` works without any URL.
- Runtime: `apps/api/src/config/db.ts` `createPrisma(url, { onQuery? })` builds the client on
  `@prisma/adapter-pg` (API passes `DATABASE_URL` / `bm_app`, worker `DATABASE_WORKER_URL` / `bm_worker`).
  Code types against `Db` (its return type). `pingDb(db, timeoutMs)` → `boolean` (never throws) backs
  `GET /api/ready`. Import the client and model types from `src/generated/prisma/client`, never from
  `@prisma/client`. `onQuery` turns on Prisma's query events (tests only: `tests/helpers/queryCounter.ts`).
- **Tenant extension** (same file):
  - `db.$tx(ctx, fn, options?)`: one interactive transaction whose first statement is
    `select set_config('app.org_id', …, true), set_config('app.user_id', …, true), set_config('app.role', …, true),
    set_config('app.is_admin', …, true)`; then `fn(tx)`; commit, or rollback if `fn` throws. `options` =
    Prisma's `{ maxWait, timeout, isolationLevel }`. Returns `fn`'s result.
  - `TenantCtx = { orgId: string | null; userId: string; role: 'landlord' | 'caretaker' | 'tenant' | null;
    isAdmin?: boolean }`, built from the authenticated session only. `orgId: null` for user-only work
    (notifications) and admin screens; `isAdmin: true` only for a verified `users.is_platform_admin` on
    `/api/admin` routes. Ids must be uuids (rejects with `TypeError` otherwise).
  - `Tx` (= `Prisma.TransactionClient`) is the type services take: `async function x(tx: Tx, …)`.
  - `TENANT_MODELS` = every model with an `orgId` field + `Organization`, derived from the generated client.
    Any operation on them through `db` itself (also inside `db.$transaction`) rejects with
    `TenantContextMissing`. So does an operation on a non-tenant model whose `include` / `select` (incl.
    `_count`) / `where` / `orderBy` / `data` reaches a tenant relation, at any depth (`err.relation` = the path,
    e.g. `memberships` or `user.memberships`); the relation → model map comes from the generated client's
    runtime data model (`_runtimeDataModel`; Prisma 7's `prisma-client` has no `Prisma.dmmf`). Non-tenant models (`user`, `session`, `authToken`, `oauthAccount`,
    `notificationPreference`, `pushSubscription`, `jobRun`) work on `db` directly. Raw SQL outside `$tx` is not
    blocked, but RLS returns no org rows.
  - The worker (`bm_worker`, BYPASSRLS) uses the same client: tenant models through `db.$tx` with the org it is
    processing (or raw SQL), always filtering by `org_id` itself.
- **Prisma model names** are the singular PascalCase of the table, except `outbox` → `OutboxMessage`
  (`db.outboxMessage`). `files` → `File`, `documents` → `Document`.
- **Making a migration** (architect only): edit `schema.prisma`, then generate the SQL with
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` against a scratch
  database migrated to the current state (or `--from-migrations` with a shadow database), into
  `prisma/migrations/<yyyymmddhhmmss>_<name>/migration.sql`, plus hand-written SQL migrations for
  RLS/checks/grants/views. The first one was `--from-empty`. **Never** `prisma migrate dev` or `migrate reset`
  (Prisma refuses them for AI agents without a human's consent, and nobody bypasses that guard). Apply with
  `pnpm --filter @bm/api db:migrate` (= `prisma migrate deploy`). `pnpm --filter @bm/api db:drift` exits 2 when
  the database behind `DATABASE_OWNER_URL` and `schema.prisma` differ (0 = in sync).

## Migrations
| Folder (`apps/api/prisma/migrations/`) | Contents |
|---|---|
| `20261108000000_roles` | Idempotent: roles if missing (no passwords: set per environment by `infra/postgres/init/01-roles.sql` or DevOps), attributes re-asserted when run as superuser, `citext` + `pgcrypto`, `CONNECT`/`USAGE` grants, default privileges for the tables, views and sequences bm_owner creates later. Every fresh database needs it |
| `20261108000100_tables` | Generated by `prisma migrate diff --from-empty`: enums, tables, FKs (composite `(org_id, x_id)` inside an org), `(org_id, id)` unique keys, indexes incl. the partial ones |
| `20261108000200_rls` | RLS enable + force + policies (below), incl. `no_caretaker` on documents and `no_caretaker_documents` on files |
| `20261108000300_constraints_grants_views` | Check constraints, the history-table DELETE revokes, outbox revokes, `_prisma_migrations` revokes, the two admin views |
| `20261108000400_user_scoped_access` | `own_memberships` (no-org context only); `organizations` policies split per command (`org_self_select`, `member_orgs` (no-org context only), `org_self_insert`, `org_self_update`, no delete); function `app_find_invitation` |

All expand-only. Staging/prod run `prisma migrate deploy`. Tests build a fresh database per run (09).

## Database roles (migration `20261108000000_roles`, idempotent)
| Role | Used by | Rights |
|---|---|---|
| `bm_owner` | migrations only | owns all tables, incl. Prisma's `_prisma_migrations` (bm_app/bm_worker: no rights on it; bm_readonly: `select`) |
| `bm_app` | API | `select/insert/update/delete` on tables, `NOBYPASSRLS`. No `delete` grant on `payments`, `bill_lines`, `payment_allocations`, `receipts`, `maintenance_events`, `credit_entries` (history is never deleted). On `outbox` only `insert` (no select/update/delete). On the admin views only `select` |
| `bm_worker` | worker | same grants as `bm_app` (incl. no `delete` on history) + full access to `outbox` + `BYPASSRLS` |
| `bm_readonly` | `db-docs`, backups verification | `select` only (RLS still applies: it sees no org rows) |

`bm_owner` is the database superuser of every environment (02). The admin views rely on it: they run with
their owner's rights, which bypass RLS. `role-grants.int.test.ts` asserts `rolsuper` for `bm_owner`, so a
non-superuser owner fails loudly instead of the admin screens silently showing 0 counts (DevOps: same check in
the staging smoke).

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
| `caretaker_buildings` | `org_id`, `membership_id`, `building_id` | PK `(org_id, membership_id, building_id)` |
| `invitations` | `org_id`, `email citext`, `role ('caretaker','tenant')`, `building_ids uuid[] default '{}'` (caretaker), `lease_id null` (tenant), `token_hash bytea unique`, `expires_at`, `accepted_at null`, `revoked_at null`, `invited_by` | Partial unique `(org_id, email, role) where accepted_at is null and revoked_at is null` |

### Property
| Table | Columns | Constraints / notes |
|---|---|---|
| `buildings` | `org_id`, `name`, `address`, `area`, `city`, `lat numeric(9,6) null`, `lng numeric(9,6) null`, `bill_day smallint default 1`, `due_day smallint default 10`, `grace_days smallint default 0`, `late_fee_type ('none','flat','percent')`, `late_fee_value int` (poisha for flat, basis points for percent: 500 = 5%), `electricity_rate_poisha int default 0`, `archived_at null` | `check (bill_day between 1 and 28)`, `check (due_day between 1 and 28)`, `check (grace_days between 0 and 15)` |
| `units` | `org_id`, `building_id`, `label`, `floor smallint`, `type ('family_flat','bachelor_flat','room','shop')`, `default_rent_poisha bigint`, `electricity_mode ('none','prepaid','submeter')`, `archived_at null` | `unique(org_id, building_id, label)`. Can't archive while a lease is active |
| `unit_charges` | `org_id`, `unit_id`, `name`, `amount_poisha bigint` | `unique(org_id, unit_id, name)` |

### Leases
| Table | Columns | Constraints / notes |
|---|---|---|
| `leases` | `org_id`, `unit_id`, `start_date date`, `end_date date null`, `notice_date null`, `monthly_rent_poisha`, `deposit_poisha`, `household_size smallint`, `status ('pending','active','notice','ended','ended_with_dues')`, `move_in_reading int null`, `move_out_reading int null`, `settlement_json jsonb null`, `created_by` | Partial unique `(org_id, unit_id) where status in ('pending','active','notice')` = one live lease per unit. `pending` = invited but tenant hasn't accepted yet |
| `lease_tenants` | `org_id`, `lease_id`, `membership_id`, `is_primary bool` | PK `(org_id, lease_id, membership_id)`; one primary per lease (partial unique `(org_id, lease_id) where is_primary`) |
| `lease_charges` | `org_id`, `lease_id`, `name`, `amount_poisha` | `unique(org_id, lease_id, name)`. Copied from `unit_charges` at lease start; editable before the first bill |
| `deposit_entries` | `org_id`, `lease_id`, `kind ('received','refunded','applied_to_dues')`, `amount_poisha`, `note`, `recorded_by` | Deposit held = Σ received − refunded − applied |

### Billing & payments
| Table | Columns | Constraints / notes |
|---|---|---|
| `meter_readings` | `org_id`, `unit_id`, `period_month date`, `reading int`, `meter_replaced bool`, `new_meter_start int null`, `entered_by` | `unique(org_id, unit_id, period_month)`; `check (period_month = date_trunc('month', period_month))` |
| `bills` | `org_id`, `lease_id`, `period_month date`, `due_date date`, `status ('draft','issued','partially_paid','paid','void')`, `needs_reading bool`, `total_poisha bigint`, `paid_poisha bigint default 0`, `issued_at`, `issued_by`, `late_fee_applied_at null`, `void_reason null` | `unique(org_id, lease_id, period_month)` (idempotent generation). `check (paid_poisha <= total_poisha)`; `period_month` is the 1st of a month (check). Index `(org_id, status, due_date)` |
| `bill_lines` | `org_id`, `bill_id`, `kind ('rent','fixed_charge','electricity','adjustment','late_fee')`, `label`, `amount_poisha bigint` (signed: discounts negative), `meta jsonb` (factor, prev, curr, rate…), `reason null`, `created_by null` | Partial unique `(org_id, bill_id) where kind='late_fee'` = never two late fees. Lines are frozen once the bill is issued, except: adjustment add (B7) and late-fee waive (B6) |
| `payments` | `org_id`, `lease_id`, `amount_poisha > 0`, `method ('cash','bkash','nagad','bank','sslcommerz')`, `status ('pending_claim','confirmed','rejected','void')`, `reference null`, `proof_file_id null`, `paid_on date`, `submitted_by`, `confirmed_by null`, `confirmed_at null`, `rejected_reason null`, `void_reason null`, `voided_by null` | Partial unique `(method, reference) where method in ('bkash','nagad') and status <> 'rejected'` = the same TrxID can't be claimed twice |
| `payment_allocations` | `org_id`, `payment_id`, `bill_id`, `amount_poisha > 0` | Sum per bill + Σ (−credit_entries where kind='applied' and bill_id = bill.id) = `bills.paid_poisha` (asserted in tests) |
| `credit_entries` | `org_id`, `lease_id`, `amount_poisha` (signed), `payment_id null`, `bill_id null`, `kind ('overpayment','applied','reversed')` | Lease credit = Σ amount, never negative (checked in service + test) |
| `payment_intents` | `org_id`, `lease_id`, `tran_id text unique`, `amount_poisha > 0`, `status ('initiated','confirmed','failed','cancelled','expired','flagged')`, `session_key`, `val_id null`, `gateway_response jsonb null`, `payment_id null`, `created_by` | Index `(status, created_at)` for the re-check job |
| `receipt_counters` | `org_id`, `year smallint`, `last_seq int` | PK `(org_id, year)`. Allocation: `insert … on conflict (org_id, year) do update set last_seq = receipt_counters.last_seq + 1 returning last_seq` **inside** the payment transaction = gapless, no duplicates |
| `receipts` | `org_id`, `payment_id`, `number text`, `status ('valid','void')`, `file_id null` | `unique(org_id, payment_id)` (one receipt per payment), `unique(org_id, number)`. Format `BM-<year>-<seq 6 digits>` |

### Operations
| Table | Columns | Constraints / notes |
|---|---|---|
| `maintenance_requests` | `org_id`, `building_id`, `unit_id`, `lease_id`, `created_by`, `category ('plumbing','electrical','gas','lift','cleaning','security','other')` (enum `maintenance_category`, values from 01 M1), `priority ('low','normal','urgent')`, `title`, `description`, `status ('open','assigned','in_progress','resolved','closed')`, `assigned_to membership_id null`, `resolved_at`, `closed_at`, `reopen_count smallint` | Transitions enforced in the service (state machine in `packages/domain/src/maintenance.ts`) |
| `maintenance_events` | `org_id`, `request_id`, `actor_id`, `kind ('created','status','assigned','comment','photo')`, `from_status null`, `to_status null`, `body null`, `file_id null` | Append-only timeline |
| `notices` | `org_id`, `building_id`, `title`, `body`, `pinned bool`, `expires_at null`, `created_by`, `deleted_at null` | |
| `files` | `org_id`, `provider ('cloudinary','local')`, `public_id unique`, `resource_type ('image','raw')`, `thumb_public_id null`, `format`, `mime`, `size_bytes`, `sha256`, `kind ('maintenance_photo','payment_proof','document','receipt_pdf','statement_pdf','settlement_pdf')`, `uploaded_by null`, `deleted_at null`, `object_deleted_at null` | |
| `documents` | `org_id`, `lease_id`, `kind ('nid_front','nid_back','agreement','other')`, `file_id`, `uploaded_by` | Extra RLS: invisible when `app.role = 'caretaker'`; so is its `files` row (`kind = 'document'`) |
| `notifications` | `org_id null`, `user_id`, `type`, `title`, `body null`, `link null`, `read_at null` | Index `(user_id, read_at, created_at desc)`. RLS by `app.user_id` |
| `notification_preferences` | `user_id`, `type`, `channel ('in_app','email','push')`, `enabled bool` | PK `(user_id, type, channel)`. Missing row = default from `packages/shared/notifications.ts` |
| `push_subscriptions` | `user_id`, `endpoint text unique`, `p256dh`, `auth`, `user_agent`, `last_success_at` | |
| `outbox` | `org_id null`, `type`, `payload jsonb`, `status ('pending','processing','done','failed')`, `attempts`, `next_attempt_at`, `last_error`, `locked_at` | Index `(status, next_attempt_at)`. Worker claims with `for update skip locked`. Not tenant data but a delivery queue: the API inserts rows inside its own transaction with **`tx.outboxMessage.createMany(...)`** (an insert without `RETURNING`; `create` fails because bm_app may not read the table) |
| `job_runs` | `job`, `started_at`, `finished_at`, `status ('ok','failed','skipped') null` (null while running), `details jsonb null` | Admin health. Index `(job, started_at desc)` |

## RLS (migrations `20261108000200_rls`, `20261108000400_user_scoped_access`)
Settings are read with `nullif(current_setting(name, true), '')`: once a setting has existed on a pooled
connection, a later transaction without context reads `''`, not NULL, and `''::uuid` would raise `22P02`.
NULL compares as unknown, so "no context" = "no rows".

For **every** table with `org_id` (except `notifications` and `outbox`, below):
```sql
alter table <t> enable row level security;
alter table <t> force row level security;
create policy org_isolation on <t>
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
```
Plus:
```sql
-- documents: caretakers never see (or insert) them; RESTRICTIVE = AND-ed with org_isolation
create policy no_caretaker on documents as restrictive
  using (coalesce(nullif(current_setting('app.role', true), ''), '') <> 'caretaker');
-- files: nor the stored object behind a document (other kinds stay visible to caretakers)
create policy no_caretaker_documents on files as restrictive
  using (kind <> 'document' or coalesce(nullif(current_setting('app.role', true), ''), '') <> 'caretaker');
-- notifications: own rows only (no org_isolation: permissive policies are OR-ed); writes can't tag another org
create policy own_rows on notifications
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid
              and (org_id is null or org_id = nullif(current_setting('app.org_id', true), '')::uuid));
-- memberships: with NO org context, a signed-in user may READ their own memberships in every org
-- (OR-ed with org_isolation; inside org A only A's rows are visible)
create policy own_memberships on memberships for select
  using (nullif(current_setting('app.org_id', true), '') is null
         and user_id = nullif(current_setting('app.user_id', true), '')::uuid);
-- organizations (keyed by id), one policy per command; no delete policy (orgs are never deleted)
create policy org_self_select on organizations for select
  using (id = nullif(current_setting('app.org_id', true), '')::uuid
         or current_setting('app.is_admin', true) = 'true');
create policy member_orgs on organizations for select       -- no org context: orgs the user is a member of (any status)
  using (nullif(current_setting('app.org_id', true), '') is null and exists (select 1 from memberships m
                  where m.org_id = organizations.id
                    and m.user_id = nullif(current_setting('app.user_id', true), '')::uuid));
create policy org_self_insert on organizations for insert
  with check (id = nullif(current_setting('app.org_id', true), '')::uuid);
create policy org_self_update on organizations for update   -- the org's landlord, or the admin context
  using ((id = nullif(current_setting('app.org_id', true), '')::uuid
          and nullif(current_setting('app.role', true), '') = 'landlord')
         or current_setting('app.is_admin', true) = 'true')
  with check (/* same expression */);
-- outbox: bm_app may only insert, for its own org or with no org (its only grant is insert)
create policy app_insert on outbox for insert to bm_app
  with check (org_id is null or org_id = nullif(current_setting('app.org_id', true), '')::uuid);
```
Creating an organisation means generating its id first (`newId()` from `@bm/shared/ids`) and inserting it in
`db.$tx({ orgId: thatId, role: 'landlord', … })` (`org_self_insert`; Prisma's `create … RETURNING` then passes
`org_self_select`).

**User-scoped access without an org context** (`ctx = { orgId: null, userId }`): login, `GET /api/me` and the
org switcher read the user's memberships (`own_memberships`) and their orgs (`member_orgs`; the subquery runs
under the memberships policies and cannot recurse, since no memberships policy refers to organizations). A
membership does not open any other org table. Writes to memberships still need that org's context. Both
policies are **off as soon as `app.org_id` is set**: inside org A, `membership.findMany()` returns A's rows only
and `organization.findMany()` returns org A only.
The invite flow (`GET /api/invites/:token`, `POST …/accept`) looks the invitation up with
```sql
create function app_find_invitation(p_token_hash bytea)
returns table (id uuid, org_id uuid, email citext, role invitation_role, building_ids uuid[], lease_id uuid,
               expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz, invited_by uuid)
language sql stable security definer set search_path = public, pg_temp
as $$ select … from public.invitations i where i.token_hash = p_token_hash $$;
-- owner bm_owner; revoke all from public; grant execute to bm_app
```
wrapped by `findInvitationByTokenHash(db | tx, hash): Promise<InvitationLookup | null>` in
`apps/api/src/config/db.ts`. It never returns the hash. The service checks `expires_at` / `accepted_at` /
`revoked_at` and accepts inside `db.$tx({ orgId: invitation.orgId, … })`. `invitations` itself stays
org-isolated (no direct read without the org context).

Admin endpoints set `app.is_admin = 'true'` and read only through the views (migration
`20261108000300_constraints_grants_views`), which return no rows unless `app.is_admin = 'true'`:
- `admin_org_overview`: `id, name, slug, status, is_demo, created_at, building_count, unit_count` (not
  archived), `active_lease_count` (`active`/`notice`), `member_count` (active memberships).
- `admin_health`: one row per item, `kind ('job_run' | 'outbox_failed' | 'intent_flagged' | 'intent_stuck'), id,
  org_id, name (job name, outbox type or 'payment_intent'), status, attempts, at, finished_at`. Stuck = intent
  still `initiated` 30 min after creation. The API orders and limits (job runs: last 50).

Those views are `security_barrier`, read-only (`select` grant only) and expose **no** personal or financial
row data (no amounts, payloads, errors or emails).
A CI test (`rls.int.test.ts`) lists every table with an `org_id` column from `information_schema` and
fails if any lacks RLS + force + policy, and lists every org → org foreign key from `pg_constraint` and fails if
any is not composite on `org_id` (Conventions).

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

## Seed (`prisma/seed.ts`, `pnpm db:seed`)
Target demo org "Rahman Properties" (`is_demo`): 2 buildings in Chattogram (one submeter, one prepaid), 10 units,
8 active leases, 3 months of bills in mixed states, payments of every method incl. one pending claim,
5 maintenance requests across statuses, 2 notices. Users (password from env `SEED_PASSWORD`, min 10 chars,
argon2id `m=19456,t=2,p=1`; dev/staging only, refuses `APP_ENV=prod`): `landlord@demo.test`,
`caretaker@demo.test`, `tenant1@demo.test` … `tenant8@demo.test`, `admin@demo.test` (platform admin, no
membership). The seed goes through the real services (not raw inserts), so it also tests them.

**Built so far (V4):** users, the org (slug `rahman-properties`), memberships (landlord, caretaker, 8 tenants),
**Rahman Villa** (House 12, Road 3, Khulshi; submeter, ৳9.00/unit, bill day 1, due 10, grace 2, late fee 5 %) with
units 1A, 1B (৳12,000), 2A, 2B (৳14,000), 3A (৳15,000), 3B bachelor (৳9,000), each with Service ৳1,000, Water ৳500,
Gas ৳1,080, Garbage ৳100; **Rahman Tower** (45 CDA Avenue, Nasirabad; prepaid, due 7, no grace, flat late fee ৳500)
with G-Shop (shop, ৳20,000, Service ৳1,500 only), 2A (৳18,000), 3A bachelor (৳10,000), 4-R1 room (৳5,000), each
with Service ৳1,500, Lift ৳500, Garbage ৳100. The caretaker is assigned to Rahman Villa.
It runs as `bm_app` through `db.$tx` (RLS applies) using thin functions in `prisma/seed-repo.ts`. Idempotent:
users are upserted; if the org exists nothing else is written.

**Growth plan:** each task replaces the matching `seed-repo.ts` function with its service and adds its data:
V5 users (auth service), V6 org/buildings/units/staff, V7 the 8 leases, V8 three months of bills, V9 manual
payments of every method + one pending claim, V10 an SSLCommerz payment, V12 five maintenance requests, V13 two
notices.
