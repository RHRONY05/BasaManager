# Brief V1-api (for: agy gemini-3.8-flash-high)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/02-ARCHITECTURE.md` (Folder tree, Environment variables, Request lifecycle, Observability), `.agent/04-API.md` (Conventions, `GET /public-config`, Health, Test-only routes), `.agent/09-TESTING.md` (Integration, Test data, Clock), `.claude/skills/backend-standards/SKILL.md` (**the BasaManager override section first; it wins over the rest of the skill**).

**You cannot run shell commands in this session (they are denied); do not try. Use only your file read/write/edit tools.** The lead runs install, typecheck, lint and tests after you finish and sends you the exact errors. Read installed packages' type definitions under `node_modules/<pkg>` to get APIs right for these versions (Express 5.3, pino 10, pino-http 11, ioredis 6, zod 4, Prisma 7.10 with `@prisma/adapter-pg`, supertest 7, vitest 5).

## Goal
A minimal, production-shaped API and worker: Zod-validated env, redacting logger, request ids, shared error format, `/api/health`, `/api/ready`, `/api/public-config`, fail-fast startup and graceful shutdown; a worker that boots, logs and shuts down cleanly; unit + one integration test.

## Scope — files you may create or change
- `apps/api/src/**` **except** `apps/api/src/config/db.ts` and `apps/api/src/generated/**` (architect-owned; import from them)
- `apps/api/test/**` (integration tests + `global-setup.ts`)
- `apps/worker/src/**`
**Do not touch:** `apps/api/prisma/**`, `packages/**`, `apps/web/**`, root configs, `package.json` files, `infra/**`, `.github/**`, `.agent/**`.

## Contracts to use (merged before you run)
- `@bm/shared/errors`: `ErrorCode`, `errorStatus`, `errorBodySchema`.
- `@bm/shared/api/common`: `dataEnvelope`, `listEnvelope`, `cursorQuerySchema`, `appEnvSchema`.
- `@bm/shared/api/health`: `healthResponseSchema`, `readyResponseSchema`, `publicConfigSchema`.
- `apps/api/src/config/db.ts`: `createPrisma(url)`, `pingDb(prisma, timeoutMs)`.
(If an export name differs, read the file and use what exists.)

## Build
1. `src/config/env.ts`: Zod schema for **every** variable in 02's `.env.example`; only core ones required in V1 (`NODE_ENV`, `APP_ENV`, `APP_URL`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`); the rest optional now (later tasks make them required). Cross-field rules (refine): `SSLCOMMERZ_SANDBOX` must be `true`; `PAYMENTS_MOCK=true` refused when `APP_ENV` is `staging|prod`; `CLOCK_OVERRIDE` refused unless `APP_ENV` is `dev|test`; `COOKIE_SECURE` must be true when `APP_ENV` is `staging|prod`. Export `loadEnv(source = process.env)` (pure, throws a readable error listing every bad key) and `env` (parsed once at import by `server.ts`/worker only). Nothing else reads `process.env`.
2. `src/lib/ApiError.ts` (class with `code`, `status` from `errorStatus`, `message`, `details?`; static helpers `notFound()`, `validation(details)`, …), `src/lib/clock.ts` (`clock.now()`, `clock.set(date|null)`, honours `CLOCK_OVERRIDE`), `src/lib/ids.ts` (`newRequestId()` = `crypto.randomUUID()`).
3. `src/config/redis.ts`: `createRedis(url)` (ioredis, `lazyConnect`, `maxRetriesPerRequest: 2`), `pingRedis(redis, timeoutMs)`.
4. Middleware: `requestId` (reuse a valid incoming `X-Request-Id` ≤ 64 chars `[A-Za-z0-9-]`, else new; set the response header), `logger` (pino-http; **redact** `req.headers.cookie`, `req.headers.authorization`, `req.headers["x-csrf-token"]`, `res.headers["set-cookie"]`, `*.password`, `*.token`, `*.refreshToken`; never log bodies; `customLogLevel` 5xx=error 4xx=warn; skip `/api/health`), `errorHandler` (ApiError → shared error body with `requestId`; `ZodError` → `VALIDATION_FAILED` with `details`; unknown → 500 `INTERNAL`, message "Something went wrong", **no stack in the body**, logged with the error), `notFound` (unknown `/api/*` → `NOT_FOUND`), `validate({body?, query?, params?})` using Zod schemas (Express 5: `req.query` is a getter — store parsed values on `res.locals.validated` or a typed helper, don't assign to `req.query`).
5. `src/modules/health/health.routes.ts` + `health.controller.ts`: `GET /api/health` → **bare** `{status:'ok', release}` (no `data` envelope; `release` from `SENTRY_RELEASE` or `'dev'`); `GET /api/ready` → 200 bare `{status:'ready', checks:{db, redis}}` when DB and Redis both answer within 1 s, else **503 with the same bare body** and `status:'not_ready'` (not an error body). `GET /api/public-config` → enveloped `{data:{appEnv, sentryDsn: SENTRY_DSN_WEB||null, vapidPublicKey: VAPID_PUBLIC_KEY||null}}` (`publicConfigResponseSchema`), validated in a unit test. Type DB params as `Db` from `config/db.ts`, and import the Prisma client only from there (never from `@prisma/client`).
6. `src/app.ts`: `createApp(deps: {env, prisma, redis, logger})` → Express app in the order of 02's request lifecycle that exists so far: requestId → logger → `helmet()` → `express.json({limit:'100kb'})` → `cookie-parser` → routes under `/api` → notFound → errorHandler. `app.disable('x-powered-by')`, `trust proxy` = 1. No CORS (same origin).
7. `src/server.ts`: load env (exit 1 with the readable message on failure), create prisma + redis, **fail fast**: ping both before listening (exit 1 with a clear log if unreachable), listen on `PORT`, graceful shutdown on `SIGTERM`/`SIGINT` (stop accepting, wait for in-flight requests up to 10 s, `prisma.$disconnect()`, `redis.quit()`, exit 0).
8. `apps/worker/src/index.ts` + `src/lib/jobLock.ts`: load env (reuse the api's `loadEnv` via a relative import from `@bm/api` is not possible without exports — instead import from `../../api/src/config/env.ts` with a short comment why), create redis, log `worker started` with `appEnv`, a `withJobLock(redis, name, ttlMs, fn)` helper (`SET lock:job:<name> <token> NX PX ttl`, release only if the token matches, via a small Lua script), no jobs scheduled yet (an empty registry `src/jobs/index.ts` with the type of a job: `{name, schedule, ttlMs, run}`), graceful shutdown.
9. Tests:
   - Unit (`src/**/*.test.ts`): `loadEnv` (valid; missing `DATABASE_URL`; `PAYMENTS_MOCK=true` with `APP_ENV=prod` refused; `CLOCK_OVERRIDE` with staging refused; `SSLCOMMERZ_SANDBOX=false` refused), `ApiError` → status mapping, `errorHandler` (ApiError, ZodError, unknown error has no stack in body) with supertest on a tiny app, `requestId` reuse/replace, `clock`, `public-config` response shape, `withJobLock` with a fake redis (only one of two concurrent calls runs).
   - Integration `apps/api/test/ready.int.test.ts`: real Postgres + Redis from `.env.test` (`process.loadEnvFile('.env.test')` at repo root in `test/global-setup.ts`; the test compose runs Postgres on 5433 and Redis on 6380, database `basamanager_test`, user `bm_app`/`bm_app_dev`, Redis password `redis_dev`). `GET /api/ready` → 200 with both checks true; with a Redis client pointed at a closed port → 503 `not_ready` within ~1.5 s. `GET /api/health` → 200. `GET /api/nope` → 404 shared error body with `requestId`.

## Acceptance criteria
`pnpm --filter @bm/api typecheck` and `@bm/worker` typecheck clean; `pnpm test` green; `pnpm test:int` green with `infra/compose.test.yml` up; `pnpm --filter @bm/api dev` with a filled `.env` logs a start line and `curl localhost:4000/api/health` returns `{status:'ok',release:'dev'}`; Ctrl-C shuts down cleanly.

## Do not
Add dependencies, edit package.json/prisma, add auth or any feature beyond this brief, use `console.log`, use `any` or `as` without a comment, log bodies or secrets.

## When done, reply with
1. Files written. 2. Anything ambiguous in the docs. 3. Anything you could not finish and why.
