# 02 — Architecture

## Shape of the system
```
                         Cloudflare DNS (records for basamanager* only)
                                      │
                          Azure VM (Ubuntu 24.04, Docker)
                                      │
                     Caddy (edge, TLS, routing, security headers)
        ┌──────────────────────┬──────┴──────────────┬────────────────────────┐
  basamanager.rhrony05.me  staging.basamanager…   docs.basamanager…
        │ prod stack            │ staging stack        └─ docs (static VitePress)
        ├─ /            → web (static React build)
        ├─ /api/*       → api  (Express 5 + Socket.io)  ──┐
        └─ /socket.io/* → api                             │
                                                          ├─ Postgres 17 (own container per env)
                         worker (cron, outbox, PDFs) ─────┤
                                                          └─ Redis 7 (own container per env)
  External: Cloudinary (files) · Azure Blob (backups) · Resend SMTP · Web Push services · SSLCommerz sandbox · Sentry
```
- **Same origin.** The browser only ever talks to one host per environment. Caddy sends `/api` and
  `/socket.io` to the API container and everything else to the static web build. No CORS, and auth
  cookies stay simple (`SameSite=Lax`, host-only).
- **Two processes.** `api` handles HTTP + websockets. `worker` runs schedules, delivers the notification
  outbox, renders PDFs. The worker sends real-time events through the Socket.io **Redis emitter**, so it
  doesn't need its own socket server.
- **Locally**, Vite (`:5173`) proxies `/api` and `/socket.io` to the API (`:4000`); Postgres, Redis
  and Mailpit run in Docker; uploads go to `.data/uploads` (local storage driver) (`infra/compose.dev.yml`).

## Stack
Exact versions: V0 picks the **latest stable** release of each package on the build date, records them in
PROGRESS.md "Environment facts", and pins them (no `^` for runtime deps in `apps/*`). Major versions below are the expected ones.

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 LTS, pnpm 12 (via Corepack) workspaces, TypeScript 5 strict | `"type": "module"` everywhere |
| Web | React 19, Vite, React Router 7 (data router), TanStack Query 5, react-hook-form + `@hookform/resolvers/zod`, Tailwind v4, shadcn/ui (Radix), lucide-react, react-i18next, socket.io-client, `vite-plugin-pwa` (Workbox), Leaflet + react-leaflet, `@sentry/react` | Never call `fetch` from components: all API calls go through `apps/web/src/lib/api/` typed with `packages/shared` |
| API | Express 5, Prisma 7 + `@prisma/adapter-pg` + `pg` (Prisma 7 talks to Postgres through a driver adapter), Zod 4, Pino + pino-http, helmet, cookie-parser, argon2, jose, arctic (Google OAuth), express-rate-limit + rate-limit-redis, multer (memory storage, limits), file-type, socket.io 4 + `@socket.io/redis-adapter`, ioredis, `cloudinary` (Node SDK v2), `sharp`, nodemailer, web-push, `@sentry/node`, `@date-fns/tz` + date-fns | No other runtime deps without a PROGRESS.md decision line |
| Worker | node-cron, `@socket.io/redis-emitter`, puppeteer, `@react-email/components` + `@react-email/render`, shares `apps/api/src/modules/*` services | Puppeteer launched per job and closed (memory) |
| Shared | `packages/shared` (Zod schemas for every request/response, enums, error codes, i18n keys), `packages/domain` (pure billing/settlement/allocation functions, no I/O) | Both are imported by web and api, so the contract can't drift |
| Docs | VitePress + `vitepress-plugin-mermaid` in `apps/docs`, content in `/docs` | |
| Tests | Vitest (unit + integration), Supertest, Playwright + `@axe-core/playwright`, k6, `msw` (node) for the SSLCommerz + Resend + push mocks, `size-limit` (bundle budgets) | |
| Infra | Docker + Compose v2, Caddy 2, GitHub Actions, GHCR, Azure CLI, Cloudflare API | |

## Folder tree
```
BasaManager/
├── AGENTS.md · CLAUDE.md · README.md · package.json · pnpm-workspace.yaml · tsconfig.base.json
├── .agent/ …                        planning pack (this)
├── .claude/agents/ · .claude/skills/  agent team definitions + pinned skill copies
├── apps/
│   ├── web/  src/
│   │   ├── app/          router.tsx, providers.tsx, layouts/ (AuthLayout, LandlordLayout, TenantLayout, AdminLayout)
│   │   ├── pages/        one folder per route group: auth/, landlord/, caretaker/, tenant/, admin/, shared/
│   │   ├── components/   ui/ (shadcn, token-styled), domain/ (BillCard, LineItemTable, StatusStepper…)
│   │   ├── lib/          api/ (typed client per module), socket.ts, push.ts, i18n.ts, format.ts (money/dates), auth.tsx
│   │   ├── styles/       tokens.css (from design/), globals.css
│   │   ├── locales/en/   *.json
│   │   └── sw.ts         service worker (push + offline shell)
│   ├── api/  src/
│   │   ├── config/       env.ts (Zod), db.ts (Prisma + tenant extension), redis.ts, storage/ (index.ts interface, cloudinary.ts, local.ts), mailer.ts, sentry.ts
│   │   ├── middleware/   requestId, logger, auth (requireUser), org (requireMembership/requireRole), csrf, rateLimit, validate, errorHandler
│   │   ├── modules/<name>/  <name>.routes.ts · <name>.controller.ts · <name>.service.ts · <name>.repo.ts (only if needed)
│   │   │                  modules: auth, users, orgs, buildings, units, leases, invites, billing, readings, payments,
│   │   │                  sslcommerz, receipts, maintenance, notices, documents, files, notifications, push, reports, admin, health
│   │   ├── realtime/     io.ts (server, auth handshake, rooms), emit.ts
│   │   ├── lib/          ApiError.ts, clock.ts (injectable now()), ids.ts, money.ts, pagination.ts
│   │   ├── app.ts · server.ts (fail-fast startup + graceful shutdown)
│   │   └── prisma/       schema.prisma · migrations/ · seed.ts
│   ├── worker/ src/      jobs/ (generateBills, issueReminders, applyLateFees, deliverOutbox, autoCloseRequests,
│   │                     recheckPaymentIntents, monthlyStatements, retention, backupVerify) · pdf/ · emails/ · index.ts
│   └── docs/             .vitepress/config.ts
├── packages/shared/src/ · packages/domain/src/billing/ · packages/domain/src/settlement/
├── docs/                 learning docs (10-LEARNING.md), diagrams/
├── infra/
│   ├── compose.dev.yml · compose.test.yml · compose.server.yml (one file, run as project `bm-staging` / `bm-prod` with different .env)
│   ├── caddy/Caddyfile · docker/ (api.Dockerfile, worker.Dockerfile, web.Dockerfile, docs.Dockerfile)
│   ├── azure/create-vm.sh · server/bootstrap.sh (docker, ufw, fail2ban, unattended-upgrades, deploy user)
│   └── scripts/ deploy.sh · backup.sh · restore.sh · rollback.sh
├── tests/ e2e/ · load/ (k6) · fixtures/ · helpers/
└── .github/workflows/ ci.yml · deploy.yml · weekly.yml (restore drill, dependency audit)
```

## Environments
| | dev | test | staging | prod |
|---|---|---|---|---|
| Where | laptop | laptop / GitHub Actions | VM, `bm-staging` | VM, `bm-prod` |
| URL | localhost:5173 | localhost (Playwright) | staging.basamanager.rhrony05.me | basamanager.rhrony05.me |
| Postgres | container, db `basamanager_dev` | container/service, db `basamanager_test[_<task>]`, reset per suite | own container + volume | own container + volume |
| Files | local driver (`.data/uploads`) | local driver (temp dir) | Cloudinary `basamanager/staging/…` | Cloudinary `basamanager/prod/…` |
| Backups | — | — | Azure Blob `backups/staging/` | Azure Blob `backups/prod/` |
| Email | Mailpit (UI :8025) | Mailpit / msw | Resend (to real inboxes) | Resend |
| Payments | SSLCommerz mock (msw) or sandbox | msw mock | SSLCommerz sandbox | SSLCommerz sandbox |
| Deploy | — | — | every merge to `main` | every `v*` tag |
| Seed | demo org (`pnpm db:seed`) | per-test factories | demo org + role test users | admin user only (+ demo org flagged `is_demo`) |

## Environment variables (`.env.example`)
```dotenv
# ── core ───────────────────────────────────────────────
NODE_ENV=development                 # development | test | production
APP_ENV=dev                          # dev | test | staging | prod  (drives behaviour; NODE_ENV only drives tooling)
APP_URL=http://localhost:5173        # public origin, used in emails, OAuth redirect, SSLCommerz URLs
PORT=4000
LOG_LEVEL=info
# ── database (server only) ─────────────────────────────
DATABASE_URL=postgresql://bm_app:...@localhost:5432/basamanager_dev        # app role: NOBYPASSRLS
DATABASE_OWNER_URL=postgresql://bm_owner:...@localhost:5432/basamanager_dev # migrations only, never used by the running app
DATABASE_WORKER_URL=postgresql://bm_worker:...@localhost:5432/basamanager_dev # worker role (BYPASSRLS, see 03)
REDIS_URL=redis://:...@localhost:6379/0
# ── auth (server only; generated by agents) ────────────
JWT_SECRET=                          # 32+ random bytes, HS256 access tokens
JWT_ACCESS_TTL_SECONDS=900
REFRESH_TTL_DAYS=30
COOKIE_SECURE=false                  # true outside dev/test
GOOGLE_OAUTH_CLIENT_ID=              # human (CREDENTIALS-GUIDE §6)
GOOGLE_OAUTH_CLIENT_SECRET=          # human
# ── file storage ───────────────────────────────────────
STORAGE_DRIVER=local                 # local (dev/test) | cloudinary (staging/prod; dev may opt in)
STORAGE_LOCAL_DIR=.data/uploads      # local driver only
STORAGE_URL_SECRET=                  # local driver: HMAC key for signed URLs (generated)
STORAGE_FOLDER=basamanager/dev       # cloudinary root folder per env: basamanager/staging | basamanager/prod
CLOUDINARY_CLOUD_NAME=               # human (CREDENTIALS-GUIDE §4)
CLOUDINARY_API_KEY=                  # human
CLOUDINARY_API_SECRET=               # human, server only
# ── backups (VM + CI only, never the app) ──────────────
AZURE_BACKUP_ACCOUNT=                # storage account name (created by devops)
AZURE_BACKUP_SAS=                    # container-scoped SAS token (generated by devops, 60-day expiry)
# ── email ──────────────────────────────────────────────
SMTP_URL=smtp://localhost:1025       # staging/prod: smtps://resend:${RESEND_API_KEY}@smtp.resend.com:465
MAIL_FROM="BasaManager <no-reply@notify.basamanager.rhrony05.me>"
# ── web push (generated by agents) ─────────────────────
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=                   # server only
VAPID_SUBJECT=mailto:muhammadrony147@gmail.com
# ── payments ───────────────────────────────────────────
SSLCOMMERZ_STORE_ID=                 # human (§8)
SSLCOMMERZ_STORE_PASSWORD=           # human, server only
SSLCOMMERZ_SANDBOX=true              # env.ts refuses false in every environment (live payments are out of scope)
PAYMENTS_MOCK=false                  # true only in dev/test; env.ts refuses true when APP_ENV is staging|prod
# ── observability ──────────────────────────────────────
SENTRY_DSN_API=                      # human (CREDENTIALS-GUIDE §7)
SENTRY_DSN_WORKER=                   # human
SENTRY_DSN_WEB=                      # human; public, served by GET /api/public-config
SENTRY_AUTH_TOKEN=                   # CI only (org:ci scope: releases + source maps), never in the app
SENTRY_RELEASE=                      # git SHA, injected at build
# ── seed & test only ───────────────────────────────────
SEED_PASSWORD=                       # demo users' password (dev/staging seed only; generated by agents)
E2E_PASSWORD=                        # e2e users' password (.env.test only)
CLOCK_OVERRIDE=                      # ISO datetime; env.ts refuses it unless APP_ENV is dev|test
```
- `apps/api/src/config/env.ts` parses `process.env` with Zod at boot and exits with a clear message on any
  error. Nothing else reads `process.env`.
- The web app has **no build-time secrets**: it fetches `GET /api/public-config` (`sentryDsn`,
  `vapidPublicKey`, `appEnv`) at startup, so one web image runs in both staging and prod.

## Request lifecycle (API)
`Caddy → requestId (X-Request-Id) → pino-http (redacted) → helmet → json body (100 kB; uploads via multer 5 MB)
→ cookie-parser → rateLimit (route-specific) → csrf (unsafe methods) → requireUser (verify access JWT)
→ requireMembership(orgId from X-Org-Id header) → requireRole(...) → validate(Zod schema from shared)
→ controller → service (business rules, `db.$tx` with tenant context) → response envelope`
→ errors bubble to `errorHandler` (ApiError → shared error format; unknown → 500 + Sentry, no stack in body).

## Auth model (summary — routes in 04, edge cases in the learning docs)
- **Passwords:** argon2id (`m=19456, t=2, p=1`), min 10 chars, checked against the top-10k common list.
- **Access token:** JWT HS256, 15 min, claims `sub` (user id), `sid` (session id), `adm` (platform admin).
  Cookie `bm_at`: `HttpOnly; Secure; SameSite=Lax; Path=/`.
- **Refresh token:** 32 random bytes, stored only as SHA-256 in `sessions`. Cookie `bm_rt`: `HttpOnly; Secure;
  SameSite=Strict; Path=/api/auth`. Every refresh **rotates** it. Presenting an already-rotated token =
  theft signal → revoke the whole family (all sessions with that `family_id`) and emit a security email.
- **CSRF:** unsafe methods require header `X-CSRF-Token` equal to the non-HttpOnly cookie `bm_csrf`
  (double submit) **and** an `Origin` equal to `APP_URL`.
- **Google:** arctic, authorization code + PKCE + `state` (stored in a 10-minute signed cookie). Login
  links to an existing user only if Google says `email_verified` and the emails match; otherwise creates
  a landlord account (or completes an invite).
- **Org context:** the client sends `X-Org-Id`; the server checks an active membership and loads the role.
  Never trust a role sent by the client.
- **Sockets:** the handshake reads `bm_at` from the cookie header; invalid → connection refused. On
  membership change or logout-all the server disconnects that user's sockets (`io.in('user:<id>').disconnectSockets()`).

## Multi-tenancy and RLS (summary — SQL in 03)
- Every org-owned table has `org_id uuid not null`. The service layer always filters by the current org,
  **and** Postgres enforces it: the app connects as `bm_app` (not the table owner, `NOBYPASSRLS`), and
  `db.$tx(ctx, fn)` runs `select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true),
  set_config('app.role', $3, true)` as the first statement of every transaction. Policies compare against
  `current_setting('app.org_id', true)::uuid`. A forgotten `where org_id` returns nothing instead of
  another landlord's data.
- Any query on org tables outside `db.$tx` fails in tests (a Prisma extension throws if no tenant context
  is set), so nobody can bypass it by accident.
- The worker uses `bm_worker` (`BYPASSRLS`) because jobs span all organisations; every worker query still
  filters by `org_id` explicitly and skips suspended orgs.

## Real-time
Rooms: `user:<id>`, `org:<id>`, `building:<id>`, `request:<id>`. Joining `building:`/`request:` rooms is
checked server-side against membership/role. Events are listed in `04-API.md`. Events carry IDs and a
small summary only; the client refetches through the API (TanStack Query invalidation), so permission
checks always happen in one place.

## Notifications pipeline
```
service transaction ── insert domain change ──┬── insert outbox row (same tx)
                                              ▼
worker deliverOutbox (every 15 s, SKIP LOCKED batch of 50)
  → fan out per recipient + preference → insert notifications row (in-app) → emit socket `notification:new`
  → email (React Email → nodemailer)   → web push (web-push; 404/410 = delete subscription)
  → mark done | retry with backoff 1m,5m,30m,2h,12h | after 5 tries: failed (admin health screen)
```

## Files
`apps/api/src/config/storage/` exposes one interface: `put(file, {kind, orgId})`, `signedUrl(file, {ttlSeconds,
download, variant})`, `remove(file)`. Two drivers: **cloudinary** (staging/prod) and **local** (dev/test).
- Upload `POST /api/files` (multer memory, 5 MB) → sniff with `file-type` (allow jpeg/png/webp/pdf; reject on
  mismatch) → images: `sharp` rotate + re-encode (strips EXIF/GPS), max 2000 px, plus a 400 px thumbnail →
  public id `<STORAGE_FOLDER>/org/<orgId>/<kind>/<uuid>` → Cloudinary `upload_stream` with `type: 'authenticated'`
  (`resource_type: 'image'` for images, `'raw'` for PDFs) → `files` row.
- Download: permission check in the service → `cloudinary.utils.private_download_url(publicId, format, {type:
  'authenticated', resource_type, expires_at: now + 300, attachment})`. Nothing is ever public; URLs are never
  stored or logged. The local driver returns `/api/files/local/<id>?exp=…&sig=…` (HMAC with `STORAGE_URL_SECRET`).
- **Fallback** (decided in V3 if the free plan refuses expiring download URLs): the API streams the file itself
  after the permission check (`GET /api/files/:id/content`), fetching it from Cloudinary with signed admin credentials.
- Delete: DB row soft-deleted and `uploader.destroy(publicId, {type: 'authenticated', resource_type, invalidate: true})`
  in the same request (thumbnail too); the retention job retries failed deletes.
- Free-plan limits (25 credits/month, 10 MB per file) are far above this app's use; the admin health page shows
  usage from the Cloudinary Admin API.

## PDFs
React-email-style HTML templates rendered by Puppeteer in the worker (`receipt`, `statement`,
`settlement`). The API enqueues an outbox `pdf.render` job; the file is stored through the `storage` interface (raw PDF) and linked; the
client polls/listens for `file:ready`. Receipt numbers are allocated in the payment transaction, not at render time.

## Infrastructure & deploy
- **VM:** created by `infra/azure/create-vm.sh` (resource group `rg-basamanager`, region **`indiasouthcentral`**
  (the subscription's policy allows only uaenorth, indonesiacentral, eastasia, indiasouthcentral, koreacentral; it is the
  closest to Bangladesh that offers Standard_B2s, checked in V0), Standard_B2s, Ubuntu 24.04,
  static public IP, NSG: 22 open but **SSH key-only** (password and root login disabled, fail2ban), because GitHub-hosted runners deploy from changing IPs, 80/443 open (restricted to Cloudflare IP ranges only when records are proxied)).
  `bootstrap.sh`: deploy user, SSH key-only, ufw, fail2ban, unattended-upgrades, Docker, 2 GB swap.
- **TLS (never touch zone settings):** the zone's SSL mode is shared with the owner's other sites, so agents
  only **read** it. If it is already *Full* or *Full (strict)*, records are **proxied** (orange cloud). Otherwise
  they're **DNS-only** (grey cloud). Either way Caddy gets its own Let's Encrypt certificates (HTTP-01), which is
  valid in both modes. The chosen mode is recorded in PROGRESS.md "Environment facts".
- **Caddy:** automatic HTTPS (Let's Encrypt); HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`; gzip/zstd; long cache for hashed assets, `no-cache` for `index.html` and `sw.js`.
- **Images:** `ghcr.io/rhrony05/basamanager-{api,worker,web,docs}:<git-sha>`, multi-stage, non-root user.
- **Deploy (`deploy.sh <env> <sha>`):** pull images → take a pre-deploy `pg_dump` → run
  `prisma migrate deploy` with `DATABASE_OWNER_URL` in a one-off container → `docker compose up -d` (api,
  worker, web) → wait for `/ready` → smoke tests (`tests/smoke.ts`: health, login of the smoke user, one
  read) → on failure redeploy the previous SHA and fail the job.
- **Migrations are expand → contract:** a release may only add (columns nullable/with defaults, new tables);
  removals happen in a later release. That's what makes "roll back the image" safe.
- **Backups:** `backup.sh` nightly 03:00 Dhaka from the VM's cron: `pg_dump -Fc` → `az storage blob upload` with the SAS to
  `backups/<env>/YYYY-MM-DD.dump`; the container's lifecycle rule deletes blobs after 30 days. `weekly.yml` restores the
  latest staging dump into a throwaway container and runs row-count checks.

## Observability
- Pino JSON to stdout (Docker keeps logs, `max-size 20m`, 5 files). Redact: `req.headers.cookie`,
  `req.headers.authorization`, `*.password`, `*.token`, `*.refreshToken`, `res.headers["set-cookie"]`. Never log
  request/response bodies of `/api/auth/*`, `/api/files/*`, `/api/payments/sslcommerz/*`.
- Sentry in api, worker and web: `release = SENTRY_RELEASE`, `environment = APP_ENV`, `sendDefaultPii: false`,
  `beforeSend` strips cookies and headers; user context = user id only. Source maps uploaded in CI, not served.
- `GET /health` (process up) and `GET /ready` (DB + Redis reachable). `job_runs` table + admin health page.
