# Repo map

Every folder, and what lives in it, as the repo is after task V1. Folders marked "empty so far" exist so
later tasks have a place to put things.

## The shape in one view

```
BasaManager/
├── apps/
│   ├── api/        Express 5 API (the only thing that talks to Postgres for requests)
│   ├── worker/     background process: cron jobs, outbox delivery, PDFs (boots and logs so far)
│   ├── web/        React + Vite PWA (what users see)
│   └── docs/       the VitePress project: config + theme in .vitepress/, builds the Markdown in ../../docs
├── packages/
│   ├── shared/     Zod schemas, types and error codes used by BOTH web and api
│   └── domain/     pure business logic (billing, settlement). Empty so far
├── docs/           these learning docs (Markdown) + diagrams + the VitePress config
├── infra/          Docker Compose files and Postgres init script
├── scripts/        small Node scripts the root package.json calls
├── tests/          Playwright end-to-end specs and their helpers
├── .github/        CI workflow and the pull request template
├── .agent/         the planning pack (product, architecture, database, API, tasks, progress)
└── .claude/        the agent team: subagents, commands, skills
```

## The apps

### `apps/api`

The HTTP API. Modules go `routes → controller → service → Prisma`; controllers never touch Prisma. Today only
the health module exists.

| Path                             | What it is                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/server.ts`         | The entry point: load env, connect, **verify DB and Redis before opening a port**, listen, shut down gracefully                 |
| `apps/api/src/app.ts`            | `createApp(deps)`: builds the Express app and wires the middleware chain (see [Request lifecycle](/overview/request-lifecycle)) |
| `apps/api/src/config/env.ts`     | Zod schema for every environment variable; the process refuses to start on a bad config                                         |
| `apps/api/src/config/db.ts`      | Prisma client factory (Prisma 7 + the `pg` driver adapter) and `pingDb`                                                         |
| `apps/api/src/config/redis.ts`   | ioredis client factory and `pingRedis`                                                                                          |
| `apps/api/src/middleware/`       | `requestId`, `logger` (pino-http), `validate` (Zod), `notFound`, `errorHandler`                                                 |
| `apps/api/src/modules/health/`   | `/api/health`, `/api/ready`, `/api/public-config`: routes, controller, unit test                                                |
| `apps/api/src/lib/`              | `ApiError` (typed errors), `clock` (injectable "now"), `ids`, `logger` (Pino setup + redaction list)                            |
| `apps/api/src/generated/prisma/` | The Prisma client. **Generated** by `postinstall`, git-ignored; never edit it                                                   |
| `apps/api/prisma/schema.prisma`  | The database schema (no tables yet; the architect fills it in task V4)                                                          |
| `apps/api/prisma.config.ts`      | Prisma 7 config: where migrations connect                                                                                       |
| `apps/api/test/`                 | Integration tests (`*.int.test.ts`) and their global setup                                                                      |

### `apps/worker`

A separate Node process for work that must not block web requests: scheduled jobs, notification delivery,
PDF rendering. After V1 it only loads config (`@bm/api/config/env`), creates a logger (`@bm/api/lib/logger`),
connects to Redis and exits 1 if it cannot (fail fast, like the API), logs `worker started` and shuts down
cleanly on SIGTERM/SIGINT.

| Path                             | What it is                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/worker/src/index.ts`       | Boot and graceful shutdown                                                         |
| `apps/worker/src/boot.ts`        | `startWorker`: pings Redis, exits 1 when unreachable (tested)                      |
| `apps/worker/src/jobs/index.ts`  | The job registry: an empty `jobs` array of `{ name, schedule, ttlMs, run }`        |
| `apps/worker/src/lib/jobLock.ts` | `withJobLock`: a Redis lock so two workers never run the same job at once (tested) |

### `apps/web`

The React app. Desktop-first for landlords and caretakers, mobile-first for tenants.

| Path                                                             | What it is                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/src/main.tsx`                                          | Mounts React: `Providers` then `RouterProvider`                                                             |
| `apps/web/src/app/router.tsx`                                    | Every route, lazy-loaded; one layout per role (`/l`, `/c`, `/t`, `/a`) plus public auth pages               |
| `apps/web/src/app/providers.tsx`                                 | TanStack Query provider; prefetches `/api/public-config` once                                               |
| `apps/web/src/app/layouts/`                                      | `AuthLayout`, `LandlordLayout` (also used for caretakers), `TenantLayout`, `AdminLayout`                    |
| `apps/web/src/pages/`                                            | Placeholder pages, one folder per role: `auth/`, `landlord/`, `caretaker/`, `tenant/`, `admin/`, `shared/`  |
| `apps/web/src/lib/api/`                                          | The only place that calls the API: `client.ts` (`apiFetch`), `queryClient.ts`, `keys.ts`, `publicConfig.ts` |
| `apps/web/src/lib/router/`                                       | `PrefetchLink` and `preload.ts`: start loading a page before the click                                      |
| `apps/web/src/components/ui/`                                    | Skeletons, `ErrorState`, `EmptyState`, `TopProgressBar`, `RouteSkeleton`                                    |
| `apps/web/src/lib/i18n.ts`                                       | i18n setup, including the `en-XA` pseudo-locale used to stress-test layouts                                 |
| `apps/web/src/lib/format.ts`                                     | `formatMoney` (poisha to ৳, Indian digit grouping) and Dhaka-time date formatting                           |
| `apps/web/src/locales/en/common.json`                            | Every user-facing string                                                                                    |
| `apps/web/src/styles/tokens.css`                                 | Design tokens (colours, spacing). Only a placeholder until the designer task V2                             |
| `apps/web/vite.config.ts`                                        | Vite config; proxies `/api` and `/socket.io` to the API in dev and preview                                  |
| `apps/web/.size-limit.json`, `apps/web/scripts/check-chunks.mjs` | Bundle budgets (entry ≤ 200 kB, each route chunk ≤ 100 kB, gzip)                                            |

### `apps/docs`

The VitePress project. Its build script is `vitepress build .`, and `apps/docs/.vitepress/config.ts` points
`srcDir` at the Markdown in `docs/`. The project root has to be this package (not `docs/`) because that is where
`vitepress` is installed; a small Vite plugin in the config makes the pages resolve `vue` from here too.

## The packages

| Path                                | What it is                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `packages/shared/src/errors.ts`     | `ErrorCode`, `errorStatus`, the error body schema, `toErrorDetails`               |
| `packages/shared/src/api/common.ts` | `appEnvSchema`, ids, cursor pagination, `dataEnvelope` / `listEnvelope`           |
| `packages/shared/src/api/health.ts` | Schemas for `/health`, `/ready`, `/public-config`                                 |
| `packages/domain/`                  | Pure functions with no I/O (billing, allocation, settlement). Empty until task V8 |

`shared` is imported by both `apps/web` and `apps/api`, so the contract between browser and server is
**one** file per shape and cannot drift. See [ADR-001](/decisions/ADR-001-monorepo).

## Everything else

| Path                                   | What it is                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `infra/compose.dev.yml`                | Dev Postgres 17, Redis 7, Mailpit (Docker Compose project `bm-dev`)                                     |
| `infra/compose.test.yml`               | Same three services for tests, on different ports, data in RAM (project `bm-test`)                      |
| `infra/postgres/init/01-roles.sql`     | Creates the `bm_app`, `bm_worker`, `bm_readonly` login roles and extensions on first start              |
| `scripts/ports.mjs`                    | Prints per-task port numbers so parallel worktrees do not collide                                       |
| `scripts/lint-tokens.mjs`              | Fails if the web app uses a raw colour, hard-coded pixel size or inline style instead of a design token |
| `scripts/openapi.mjs`                  | Generates (or checks) `docs/reference/openapi.json` from the shared Zod schemas                         |
| `scripts/docs-check.mjs`               | The docs acceptance check behind `pnpm docs:check`                                                      |
| `tests/e2e/`                           | Playwright specs: `home.spec.ts`, `layout.spec.ts`, `states.spec.ts`                                    |
| `tests/helpers/layout-audit.ts`        | `auditLayout(page)`: the geometry check for overflow, wrapped labels, tiny tap targets                  |
| `tests/fixtures/stress.ts`             | The longest names, biggest amounts and pseudo-locale used to stress layouts                             |
| `playwright.config.ts`                 | Two projects: `desktop` (1440×900) and `mobile` (390×844); starts the API and the web preview           |
| `vitest.config.ts`                     | Unit tests: one project per workspace package; coverage thresholds                                      |
| `vitest.int.config.ts`                 | Integration tests: `apps/api/test/**/*.int.test.ts`, run one file at a time                             |
| `eslint.config.js`, `.prettierrc.json` | Lint and format rules                                                                                   |
| `tsconfig.base.json`                   | The strict TypeScript settings every package extends                                                    |
| `pnpm-workspace.yaml`                  | Says the workspace is `apps/*` and `packages/*`                                                         |
| `.github/workflows/ci.yml`             | The pull-request pipeline (see [Testing strategy](/concepts/testing-strategy))                          |
| `.github/pull_request_template.md`     | The evidence checklist every PR fills in                                                                |
| `.gitleaks.toml`                       | Secret-scanner config                                                                                   |
| `.env.example`, `.env.test.example`    | Names and safe dev/test values of every environment variable                                            |

## The commands you will use

Defined in the root `package.json`:

| Command           | What it does                                                               |
| ----------------- | -------------------------------------------------------------------------- |
| `pnpm dev`        | Starts Postgres/Redis/Mailpit in Docker, then api, worker and web together |
| `pnpm typecheck`  | TypeScript in every package                                                |
| `pnpm lint`       | ESLint, Prettier check, token lint, bundle-size check, OpenAPI freshness   |
| `pnpm test`       | Unit tests (Vitest)                                                        |
| `pnpm test:int`   | Integration tests against the real test Postgres and Redis                 |
| `pnpm test:e2e`   | Playwright, desktop and mobile                                             |
| `pnpm docs:check` | Builds this site and checks it (headings, diagrams, paths, dead links)     |
| `pnpm test:all`   | All of the above, in order                                                 |

## The planning pack and the agent team

`.agent/` is the plan: what to build (`08-TASKS.md`), the contract (`04-API.md`), the database design
(`03-DATABASE.md`), and `PROGRESS.md`, which records where the project is. `.claude/` holds the agent team
that builds it: `agents/` (architect, designer, test-designer, reviewer, debugger, devops, docs),
`commands/` and `skills/` (including the two UI-quality skills the web tests are built on). You do not need
them to run the app; you need them to understand how it was made.
