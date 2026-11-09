# Brief V4-tests (for: test-designer subagent) — tests first

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/03-DATABASE.md` (all of it: roles, every table, RLS section, lifecycle), `.agent/02-ARCHITECTURE.md` (Multi-tenancy and RLS), `.agent/09-TESTING.md` (Test data, Integration → RLS/Roles), `.agent/08-TASKS.md` V4.

Work in the git worktree `D:\Projects\bm-wt\V4` (branch `feat/V4`). Commit your tests there (`test:` …, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); don't push.

## Goal
Failing integration tests that define "tenant isolation works", written before the schema exists, so the architect's implementation is checked independently.

## Interface you test against (the architect implements exactly this)
- Migrations in `apps/api/prisma/migrations/` applied by `prisma migrate reset --force --skip-seed` with `DATABASE_OWNER_URL` (as `bm_owner`) in `apps/api/test/global-setup.ts` (extend it; today it only loads `.env.test`). Tests then connect as `bm_app` (`DATABASE_URL`) and, for worker checks, `bm_worker` (`DATABASE_WORKER_URL`; add it to `.env.test.example` if missing: `postgresql://bm_worker:bm_worker_dev@localhost:5433/basamanager_test`).
- `apps/api/src/config/db.ts`: `createPrisma(url)` returns a client with the tenant extension: `db.$tx(ctx, fn)` where `ctx = { orgId: string | null, userId: string, role: 'landlord'|'caretaker'|'tenant'|null, isAdmin?: boolean }` runs `fn(tx)` in one interactive transaction whose **first statement** sets `app.org_id`, `app.user_id`, `app.role`, `app.is_admin` with `set_config(..., true)`. Any query on an org-owned model **outside** `$tx` throws `TenantContextMissing` (an `Error` subclass exported from `db.ts`). Non-org tables (`users`, `sessions`, `oauth_accounts`, `auth_tokens`, `notification_preferences`, `push_subscriptions`, `job_runs`, `outbox`) can be queried without context.
- Table and column names exactly as in 03 (snake_case tables, Prisma models PascalCase).

## Tests to write (`apps/api/test/*.int.test.ts`)
1. `rls.int.test.ts`: from `information_schema.columns`, every base table in `public` with an `org_id` column has `relrowsecurity` **and** `relforcerowsecurity` true and at least one policy (`pg_policies`). Fails listing the offenders. Also: `documents` has the restrictive `no_caretaker` policy; `notifications` has `own_rows`; `organizations` has `org_self`.
2. `tenant-isolation.int.test.ts`: create org A and org B (raw inserts as `bm_owner` are fine for fixtures, or `bm_worker`), each with a building. Inside `db.$tx({orgId: A, …})` as `bm_app`: `building.findMany()` returns only A's; `findUnique` of B's id returns null; `update`/`delete` of B's id affects 0 rows / throws not-found; `create` with `orgId: B` is rejected by the `with check` policy. A raw `$queryRaw` with A's context can't see B rows. With **no** context set (a plain `bm_app` connection, `set_config` absent), `select * from buildings` returns 0 rows (the policy compares to NULL).
3. `tenant-extension.int.test.ts`: `db.building.findMany()` outside `$tx` throws `TenantContextMissing`; `db.user.findMany()` outside works; `$tx` sets all four settings (read them back with `current_setting`); settings don't leak to the next transaction on the same pooled connection (`set_config(..., true)` is transaction-local).
4. `role-grants.int.test.ts`: as `bm_app`, `delete from payments`, `bill_lines`, `payment_allocations`, `receipts`, `maintenance_events`, `credit_entries` each fail with permission denied (42501) even with a valid org context; `select`/`insert` on them work in context. `bm_app` is `NOBYPASSRLS`, `bm_worker` is `BYPASSRLS` (check `pg_roles`) and sees both orgs' buildings without context. `bm_readonly` can `select` but not `insert`.
5. `documents-caretaker.int.test.ts`: in an org with a document row, `$tx` with `role: 'caretaker'` sees 0 documents; `role: 'landlord'` sees it.
6. `constraints.int.test.ts` (a few key checks from 03 that later tasks rely on): one live lease per unit (second `pending/active/notice` lease on the same unit → unique violation 23505), `bills unique(lease_id, period_month)`, `bills check (paid_poisha <= total_poisha)`, `bill_lines` partial unique late fee, `payments` duplicate bKash reference, `receipt_counters` upsert returns 1 then 2, `buildings` `bill_day` 29 rejected, exactly one active landlord per org, `meter_readings` `period_month` must be the 1st.

Use factories in `apps/api/test/helpers/` (`makeOrg`, `makeUser`, `makeBuilding`, `makeUnit`, `makeLease` — minimal, raw SQL or Prisma as `bm_worker`; the real service-based factories come with later tasks). Run them now: they must fail for the right reason (no tables / no `$tx`), not typos. Report the red output.

## When done, reply with
Files, the red output (last lines per file), and any interface decision you had to make (tell me if 03 was ambiguous).
