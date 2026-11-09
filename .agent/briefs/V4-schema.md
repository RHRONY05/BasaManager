# Brief V4-schema (for: architect subagent)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md` (Database), `.agent/03-DATABASE.md` (everything), `.agent/02-ARCHITECTURE.md` (Multi-tenancy and RLS, Environments), `.agent/04-API.md` (enums used by routes), `.agent/09-TESTING.md`, `.agent/08-TASKS.md` V4, `.agent/PROGRESS.md` Decisions, the skill `.claude/skills/db-docs/SKILL.md` (override first), and the **failing tests the test-designer wrote** in `apps/api/test/*.int.test.ts` + `apps/api/test/helpers/` on this branch (don't edit them; if one is wrong, stop and explain).

Work in the git worktree `D:\Projects\bm-wt\V4` (branch `feat/V4`). Commit as you go (`feat(db):` …, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); don't push.

## Goal
The full schema of 03 as Prisma models + SQL migrations (roles, RLS + force + policies, checks, partial indexes, views `admin_org_overview` / `admin_health` as `security_barrier`), the Prisma tenant extension (`db.$tx`, `TenantContextMissing`), shared enums/IDs in `packages/shared`, `tests/helpers/queryCounter.ts`, the dev seed skeleton, and `pnpm db:docs` (ER diagram via tbls) — so every test in this branch passes.

## Must do
- Migrations from zero: `0001_roles.sql` (idempotent: create roles if missing **without passwords** — passwords are set per environment by compose init / devops; grants per 03, incl. no `delete` on history tables; default privileges for future tables), the Prisma-generated tables migration, `0002_rls.sql` (every org table + the three special policies), checks/partial indexes/views migration(s). Expand-only. `prisma migrate reset --force --skip-seed` with `DATABASE_OWNER_URL` must work on a clean DB; `migrate deploy` must work on staging later.
- `db.ts`: implement `withTenantExtension` (the V1 slot): `$tx(ctx, fn)` = interactive transaction whose first statement is one `select set_config('app.org_id', …, true), set_config('app.user_id', …, true), set_config('app.role', …, true), set_config('app.is_admin', …, true)`; a query extension that throws `TenantContextMissing` for org-owned models outside `$tx` (keep the org-model list derived from the schema so it can't drift — e.g. generated from models that have an `orgId` field). Document the ctx type for later tasks.
- `packages/shared/src/enums.ts` (every Postgres enum as a Zod enum + type, names matching 03) and `ids.ts` (uuid helpers); export from `index.ts`. Keep shared code erasable TypeScript (openapi script runs it with type stripping).
- `apps/api/prisma/seed.ts` skeleton (`pnpm db:seed`): the demo org "Rahman Properties" with users `landlord@demo.test`, `caretaker@demo.test`, `tenant1..8@demo.test`, `admin@demo.test` (password hash from `SEED_PASSWORD` via argon2id — add `argon2` 0.45.2 to `@bm/api` if missing, exact pin), memberships, the 2 Chattogram buildings and 10 units with charges per 03 "Seed". Leases, bills, payments, requests, notices are added by the tasks that build those services (say so in a comment + 03). Through thin repo functions where services don't exist yet.
- `tests/helpers/queryCounter.ts` (09 "Speed checks": count Prisma queries per request via `$on('query')` / a query extension) with a unit test.
- `pnpm db:docs` per the `db-docs` skill (tbls via Docker against the test DB), output into `docs/database/` (ER diagram + per-table docs), linked from `docs/overview/data-map.md`.
- `.env.test.example` / `.env.example`: add `DATABASE_OWNER_URL` and `DATABASE_WORKER_URL` if missing.
- Update 03 for anything you had to decide; PROGRESS decision lines for the lead are in your reply.

## Must pass
`corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:cov`, `corepack pnpm test:int` (test compose up, `.env.test` from the example — remove it after), `corepack pnpm docs:check`; `pnpm db:docs` produces the ER diagram. Clean DB from zero in CI (the integration job runs the init SQL then your migrations via global-setup).

## When done, reply with
Files/migrations, test output, decisions, and anything later tasks must know (ctx usage, model names, seed growth plan).
