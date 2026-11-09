# 08 — Tasks

Rules: `rules/basamanager.md`. Team and dispatch: `11-AGENT-TEAM.md`. The lead works **in order**; parts
of one task marked ∥ may run in parallel worktrees. Mark a task `— in progress: lead` when starting; tick
`[x]` + a one-line note when merged; PROGRESS.md session entry + METRICS.md rows after **every** task.
Every task's definition of done includes its **learning docs** (`10-LEARNING.md`) and its tests. Every task with UI
also adds its routes to `layout.spec.ts` and `states.spec.ts` and must pass both (`mobile-layout-qa`, `ui-states`).

```
V0 Preflight ─▶ V1 Monorepo + CI ─▶ V2 Design ─▶ V3 Infra walking skeleton ─▶ V4 Schema + RLS
   ─▶ V5 Auth ─▶ V6 Org, buildings, staff ─▶ V7 Leases ─▶ V8 Billing ─▶ V9 Manual payments + receipts
   ─▶ V10 SSLCommerz ─▶ V11 Notifications ─▶ V12 Maintenance ─▶ V13 Notices + documents
   ─▶ V14 Dashboards, reports, admin ─▶ V15 Move-out, deletion, retention ─▶ V16 Hardening ─▶ V17 Release + handoff
```

---

- [x] **V0 Preflight** — 2026-11-08: all ✅; agy edit-only loop proved; region indiasouthcentral; versions pinned (PROGRESS).
  - Read `AGENTS.md`, every file in `.agent/`. If PROGRESS.md has no **Builder setup** table, run `/project-config`; stop if any ❌ blocks the build.
  - Versions: Node, pnpm, Docker, `gh`, `az`, `agy`. Secrets present by length only.
  - Skills are already in `.claude/skills/` (copied with overrides on 2026-11-07, plus the project skills `mobile-layout-qa` and `ui-states`). Verify each `SKILL.md` exists and starts with its `## BasaManager override`; re-copy only if one is missing.
  - Create `.claude/agents/*.md` checks: each agent file exists with the right `model`.
  - **Prove the agy loop:** throwaway repo in the scratch folder → worktree → `agy -p` (gemini-3.8-flash-high) adds a function + its Vitest test and runs it → parse JSON → follow-up with `--conversation` → remove worktree. Record duration/tokens.
  - Research and record latest stable versions of every package in `02-ARCHITECTURE.md` (Environment facts).
  - Check Azure B2s availability in Southeast Asia / Central India / East Asia; record the region.
  - **AC:** Preflight table in PROGRESS.md all ✅ (or ❌ with a Human step); agy loop proof recorded in METRICS.md.

- [x] **V1 Monorepo, tooling, CI, docs skeleton** — 2026-11-08: PR #1 + review follow-up; all layers green in CI.
  - pnpm workspace per the folder tree in 02; TS configs; ESLint (flat) + Prettier; token-lint script from `frontend-implementation`; Vitest configs (unit + `vitest.int.config.ts`), Playwright config (`desktop`, `mobile`, setup project), `infra/compose.dev.yml` + `compose.test.yml`.
  - `apps/api` minimal: env.ts (Zod), logger with redaction, error handler + shared error format, `/health`, `/ready`, graceful shutdown. `apps/web` minimal Vite app + `/api/public-config` fetch. `apps/worker` boots and logs. `apps/docs` VitePress with the site structure from `10-LEARNING.md` (stub pages) and the mermaid plugin.
  - Private repo `RHRONY05/BasaManager`, branch protection on `main` (CI + 1 review), `ci.yml` from 09-TESTING, PR template with the evidence checklist.
  - Web: router with role layouts (placeholder pages), 404 page, i18n setup incl. the `en-XA` pseudo-locale.
  - **UI-quality harness** (built once, used by every later task): `queryClient` defaults, query-key factory, `PrefetchLink`, top progress bar, Suspense boundaries inside layouts, route `errorElement`, skeleton primitives (`data-skeleton`), per `ui-states`; `tests/helpers/layout-audit.ts` + `layout.spec.ts` and `states.spec.ts` skeletons, `tests/fixtures/stress.ts`, query counter, `size-limit`, per `mobile-layout-qa`. Docs: `overview/repo-map.md`, `overview/request-lifecycle.md`, `concepts/testing-strategy.md`, `concepts/environments.md` (first version), `concepts/logging.md`, ADR-001 monorepo.
  - **Tests:** a sample unit, integration (`/ready` with real Postgres+Redis) and e2e (home loads, both projects).
  - **AC:** `pnpm dev` starts everything; `pnpm test:all` green locally and in CI on the first PR; docs site builds.

- [x] **V2 Design (designer agent, autonomous)** — merged afe9217 (PR #4), staging green 2026-11-09
  - Inputs: `01-PRODUCT.md`, `06-UI.md`, role list. Skills: `ui-ux-pro-max` (research), `design-canvas` (craft, critique, `shoot.mjs`) with overrides from `11-AGENT-TEAM.md`; plan-for-agent-build `references/design-pack.md` for the folder format.
  - Output `.agent/design/`: `brief.md` (direction, adjectives, NOT list, signature element, voice, and **why** for every choice), `tokens.css` (light + dark), `ui.css` kit, `README.md` (component map, rules, how to view), `index.html` gallery, `states.html`, and artboards at 1440 and 390 for: landing, login/signup, invite accept, landlord dashboard (with first-run), building detail (units tab), lease new stepper, lease detail, billing (drafts + readings grid), bill detail, payments (pending claims), maintenance board + detail drawer, tenant home (due / all paid / overdue), tenant bill detail, pay result, maintenance new + detail (tenant), notices, account, admin orgs. Icons: lucide. Fonts: Latin + a matching Bengali family loaded but unused (i18n-ready).
  - Every screen has a mobile **and** desktop artboard. Each mobile artboard is also rendered at 360 and 320 and run through `auditLayout()` (`mobile-layout-qa`); the main screens get a **stress-content** variant (longest names, ৳1,25,00,000, `en-XA`). `states.html` shows pending skeleton / refreshing / error / empty for every data region (`ui-states`).
  - Critique loop on every screen (score ≥ threshold in `design-canvas/references/critique.md`), then a **design review by the reviewer agent** (Opus) against 06-UI behaviour + accessibility (contrast AA, 44 px targets). Fix until approved.
  - **AC:** gallery opens; every screen at both sizes, light + dark; `shoot.mjs` report and `auditLayout()` have 0 errors at 390/360/320; stress variants clean; design review approved; no lorem ipsum.

- [x] **V3 Infra walking skeleton** (DevOps) — merged feddf21, staging deploy green 2026-11-09 (prod tag v0.1.0 pending)
  - `infra/azure/create-vm.sh` → VM up; `bootstrap.sh`; Caddyfile for prod, staging, docs; Cloudflare DNS records via API (only new records named `basamanager*`); read the zone SSL mode and choose proxied vs DNS-only per 02 (never change zone settings); Caddy automatic HTTPS.
  - Dockerfiles (multi-stage, non-root); `compose.server.yml`; `deploy.yml` (main → staging, tag → prod, smoke + auto-rollback); `deploy.sh`, `rollback.sh`, `backup.sh` (+ VM cron), `restore.sh`, `weekly.yml` restore drill.
  - Azure storage account + private `backups` container + 30-day lifecycle rule + container SAS (60 days) via `az`. Cloudinary: verify the account; test `private_download_url` with expiry on the free plan for an image and a raw PDF.
  - Sentry: the owner created the 3 projects; DSNs into env secrets; CI creates a release per SHA and uploads source maps with `sentry-cli` + the `org:ci` token; a test error from each of api/worker/web visible in Sentry, then the test-error route removed. UptimeRobot monitors (optional).
  - Docs: `concepts/docker-and-vps.md`, `concepts/ci-cd.md`, `concepts/sentry-from-zero.md`, `concepts/backups.md`, `operations/*` runbooks (deploy, rollback, restore, rotate a secret, read logs, incident), architecture L1 diagram (SVG).
  - **AC:** `https://staging.basamanager.rhrony05.me/api/health` and prod `/api/health` return the deployed SHA; `docs.` serves the site; a deliberately failing smoke test triggers rollback (proved once, logged); a backup file exists in the Azure `backups` container and the restore drill passes; on staging, a Cloudinary upload → expiring download URL → refused after expiry works for an image and a PDF (or the API-stream fallback is chosen and logged).

- [x] **V4 Schema, roles, RLS, seed** (architect)
  - Full Prisma schema + SQL migrations per `03-DATABASE.md` (roles, RLS, checks, partial indexes, views). Prisma tenant extension (`db.$tx` sets context; throws without it). Seed through services (stub services where needed, completed in later tasks). `db-docs` set up (`pnpm db:docs`).
  - Shared Zod enums and IDs in `packages/shared`.
  - Docs: `overview/data-map.md`, `concepts/multi-tenancy-and-rls.md` (with L0/L1 SVG), ER from tbls, `concepts/transactions-and-locking.md` (first version).
  - **Tests:** `rls.int.test.ts`, cross-org isolation on a sample table, role grants (bm_app can't delete payments).
  - **AC:** migrations apply from zero on a clean DB in CI and on staging; RLS test green; ER diagram generated.

- [ ] **V5 Auth & accounts** — A1–A7 (A8 in V15)
  - ∥ test-designer: auth integration tests from 09 first. ∥ backend (agy): routes in 04 Auth. ∥ frontend (agy): auth pages + `AuthProvider`, refresh-on-401 single-flight, org switcher, route guards per role.
  - Google OAuth with arctic; email templates (verify, reset, security alert); rate limits; lockout; socket handshake auth. Landing page `/`; `/account` (profile, change password, sessions/devices; preferences come in V11, deletion in V15).
  - Docs: `features/auth.md` (all 15 sections — the flagship page: signup, login, refresh rotation + reuse detection, logout-all, reset, Google, invites; where each token lives; every edge case), `concepts/authentication-and-sessions.md`, `concepts/authorization.md`, `concepts/validation-with-zod.md`, `concepts/caching-and-rate-limiting.md`.
  - **Tests:** auth integration list (09); `auth.spec.ts`.
  - **AC:** all auth e2e green both projects; old refresh token reuse visibly signs out the other session; Google login works on staging with the owner's test Gmail.

- [ ] **V6 Organisation, buildings, units, staff** — O1–O5
  - Routes + pages (landlord buildings, building detail tabs, unit drawer, team). Caretaker invites + assignment. Leaflet map.
  - Docs: `features/organisations-and-staff.md`, `features/buildings-and-units.md`.
  - **Tests:** integration for every route incl. caretaker scope; `onboarding.spec.ts`.
  - **AC:** landlord creates 2 buildings with units/charges; caretaker invited, assigned to one building, sees only it.

- [ ] **V7 Tenants & leases** — T1, T2, T4, T5
  - Lease creation stepper, invite accept for tenants, lease detail (overview, history), deposits, tenant `/t/lease`.
  - Docs: `features/tenants-and-leases.md`.
  - **Tests:** one live lease per unit (concurrent create → one wins with 409); invite flows; `tenant-invite.spec.ts`.
  - **AC:** tenant accepts invite on mobile, sees the lease; second lease on the same unit refused.

- [ ] **V8 Billing engine** — B1–B4, B6 (job), B7, B8
  - test-designer first: every `07-BILLING.md` example + listed cases as unit tests (red). ∥ agy: `packages/domain/billing`, then generation job, readings grid, issue flow, bill pages (landlord + tenant), dues.
  - Docs: `features/billing.md` (L0/L1/L2 SVG: generation → readings → issue → credit; proration and late-fee worked examples), `concepts/money-and-rounding.md`, `concepts/dates-and-timezones.md`, `concepts/idempotency.md`, `concepts/background-jobs.md`.
  - **Tests:** all billing unit tests; billing integration list; `billing.spec.ts`, `late-fee.spec.ts`.
  - **AC:** with the clock on bill day, drafts appear once; readings drive the electricity line; tenant sees "1,240 → 1,395 = 155 units × ৳9.00".

- [ ] **V9 Manual payments & receipts** — P2–P6
  - Claims, direct record, confirm/reject, allocation + credit (Rule 5), void (Rule 6), receipt counter + PDF (Puppeteer in worker), file uploads (proof photos) via `/files`.
  - Docs: `features/payments.md` (manual part, allocation L2 diagram, concurrency story), `features/receipts-and-statements.md`, `concepts/transactions-and-locking.md` (complete), `concepts/file-uploads-and-signed-urls.md`, `concepts/pdf-generation.md`.
  - **Tests:** payments integration list; `pay-claim.spec.ts`.
  - **AC:** 20 concurrent payments → receipts 1…20 with no gaps; void after credit use recalculates correctly; receipt PDF downloads.

- [ ] **V10 SSLCommerz online payments** — P1
  - Init, IPN + validation, return pages, intent polling, re-check job, mock gateway for dev/test.
  - Docs: `features/payments.md` (online part: sequence diagram with the "never trust the redirect" failure path), `concepts/payment-gateways-and-webhooks.md`.
  - **Tests:** SSLCommerz integration list; `pay-online.spec.ts`. Manual staging check with an SSLCommerz sandbox test card, logged with screenshots.
  - **AC:** a sandbox payment on staging marks the bill paid via IPN; replaying the same IPN changes nothing.

- [ ] **V11 Notifications** — N1–N4, B5
  - Outbox + worker delivery, in-app bell (live), email templates (React Email), web push (VAPID, service worker, opt-in UX, iOS guidance), preferences, reminder + late-fee jobs wired to outbox, `/notifications`.
  - Docs: `features/notifications.md`, `concepts/realtime-socketio.md`, `concepts/notification-pipeline-outbox.md`, `concepts/web-push-from-zero.md`.
  - **Tests:** outbox integration list; push sender mock; preference rules; reminders dedup; e2e bell updates.
  - **AC:** issuing a bill on staging delivers in-app + email + push (desktop Chrome) to the tenant within 30 s.

- [ ] **V12 Maintenance** — M1–M4
  - State machine in `packages/domain`, routes, photos, board/list, live timeline, auto-close job.
  - Docs: `features/maintenance.md` (state diagram in Mermaid, L1 SVG).
  - **Tests:** state machine unit tests (every valid/invalid transition); integration; `maintenance.spec.ts`.
  - **AC:** two browser contexts show live updates without reload; invalid transition returns 409 and the button isn't shown.

- [ ] **V13 Notices & documents** — N5, D1–D3
  - Docs: `features/notices.md`, `features/documents.md` (who can see what, signed URLs, retention).
  - **Tests:** caretaker document invisibility (API + SQL); upload sniffing; `notices.spec.ts`, `documents.spec.ts`.
  - **AC:** caretaker gets 404 for a document URL copied from the landlord; deleted document's object is gone from storage.

- [ ] **V14 Dashboards, reports, admin** — R1–R4, X1–X3
  - Landlord/caretaker/tenant dashboards, monthly statements job + on-demand, admin pages + views.
  - Docs: `features/dashboards-and-reports.md`, `features/admin.md`.
  - **Tests:** dashboard numbers equal sums from fixtures; admin can't read financial rows (SQL + API); `admin.spec.ts`.
  - **AC:** dashboard figures match the seed's hand-computed totals (documented in the test).

- [ ] **V15 Move-out, account deletion, retention** — T3, A8
  - Notice, settlement preview + end lease (Rule 7) + settlement PDF; account deletion flow; retention job.
  - Docs: lifecycle sections across feature pages updated; `concepts/data-lifecycle-and-deletion.md`.
  - **Tests:** settlement unit tests; deletion integration; `move-out.spec.ts`, `account.spec.ts`.
  - **AC:** after a tenant deletes their account, the landlord still sees their payments under "Former user #…", and their NID files are gone.

- [ ] **V16 Hardening**
  - Opus reviewer full security review (OWASP Top 10 checklist in `concepts/security-checklist.md`), dependency audit, CSP tightened, rate limits verified, headers (securityheaders.com grade A on staging).
  - `isolation.spec.ts`, `a11y.spec.ts`, `visual.spec.ts`, `pwa.spec.ts`; k6 load on staging; local prod-build Lighthouse (targets in 09); restore drill run manually once.
  - **AC:** no high/critical findings open; load and Lighthouse targets met (or each miss explained in PROGRESS.md).

- [ ] **V17 Release, docs completion, handoff**
  - Tag `v1.0.0` → prod deploy; prod Lighthouse; prod smoke with the admin + demo org.
  - Docs pass: every feature page complete with 15 sections, diagrams rendered and checked, `learning-path.md`, decisions/ADRs complete; `generate-qa-review` Q&A guide (`docs/revision-guide.md`); `codebase-tutor` initialised for the owner (`.learn/`).
  - `README.md` (what, local setup, scripts, envs, deploy, where the docs are). `RETRO.md` from METRICS.md.
  - Final message to the owner: URLs, demo logins (staging), Lighthouse table, the learning path's first 3 steps, cleanup reminder (CREDENTIALS-GUIDE "Cleanup").
  - **AC:** `pnpm test:all` green on the tag; prod healthy; docs check green; RETRO written.

---

## Changes outside tasks
Fixes and changes made outside a task above. One line each, newest last: date · what changed · which docs were updated, or "no doc change: <why>".
- 2026-11-08 · V1 review follow-up (fix/V1-review): logging self-check, client-4xx error mapping, CLOCK_OVERRIDE ISO, `?lng=` gate, all routes in layout/states specs, worker imports `@bm/api` exports + Redis fail-fast, dev script `--wait`/`--raw` · docs: 02, 04, 09, ADR-001, repo-map, logging, request-lifecycle, testing-strategy, error-codes
- 2026-11-09 · V3 follow-up (fix/V3-followup): ci images step `shell: bash`, deploy.sh housekeeping non-fatal, rollback.sh usage + unknown-step error, weekly audit green (`@size-limit/file` replaces `preset-app` to drop estimo/puppeteer chain; override `vitepress>vite` 6.4.5; `--audit-level high` unchanged) · docs: rollback.md

## Questions for the human
(The build never waits on these; the lead decides and logs. The owner may answer later.)
