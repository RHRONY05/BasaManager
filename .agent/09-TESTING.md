# 09 — Testing and performance

All layers must be green before a PR merges (CI enforces it). Each task names the specs it adds.

| Layer | Tool | Command | Covers |
|---|---|---|---|
| Unit | Vitest | `pnpm test` | `packages/domain` (billing, allocation, settlement, maintenance state machine), `packages/shared` schemas, pure helpers in api/web (money, dates, permissions), React components with logic (Testing Library) |
| Integration | Vitest + Supertest, real Postgres + Redis + Mailpit, local storage driver (`infra/compose.test.yml` / CI services) | `pnpm test:int` | Every route in `04-API.md`: happy path, validation, 401/403/404, conflicts, concurrency; RLS; jobs; outbox; SSLCommerz flow with mocked gateway |
| E2E | Playwright (`desktop` 1440×900, `mobile` 390×844 `isMobile`), axe | `pnpm test:e2e` | Real browser flows per role against the full local stack |
| Load | k6 | `pnpm test:load` (V16 + manual) | Smoke load on staging |
| Lighthouse | `performance-audit` skill / chrome-devtools `lighthouse_audit` | — | Targets below, recorded in PROGRESS.md |
| Docs | VitePress build + link and path checker | `pnpm docs:check` | `10-LEARNING.md` acceptance checks |

Coverage thresholds (CI fails below): `packages/domain` **95%** lines and branches; `apps/api` **80%** lines;
`apps/web` no global threshold (logic-heavy hooks/components are unit-tested).

## Test data, users and isolation
- Test DB per run: `basamanager_test` (or `basamanager_test_<task>` in a worktree). `globalSetup` runs
  `prisma migrate reset --force --skip-seed` with the **owner** URL, then tests connect as `bm_app` (so RLS
  is exercised exactly like prod). **Never** `prisma db push`.
- Factories in `tests/helpers/factories.ts` (`makeOrg`, `makeBuilding`, `makeLease`, `makeBill`, …) create data
  through services where possible. Each integration file truncates org-owned tables in `beforeEach`.
- `tests/helpers/auth.ts`: `loginAs(role, org)` returns a Supertest agent with cookies + CSRF.
- E2E seed: `pnpm e2e:seed` creates two orgs (A and B) with users `landlord.a@e2e.test`, `caretaker.a@e2e.test`,
  `tenant.a1@e2e.test`, `tenant.a2@e2e.test`, `landlord.b@e2e.test`, `admin@e2e.test`, password from
  `E2E_PASSWORD` (`.env.test`). Playwright setup project logs each role in once and saves storage state.
- **Clock:** all code reads time via `clock.now()`. Tests set `CLOCK_OVERRIDE` (api/worker) or call
  `clock.set()`; e2e sets it through `POST /api/test/clock` (route exists only when `APP_ENV=test`).
- **Mocks:** SSLCommerz via `msw` (init, validation, transaction query; scenarios: valid, invalid, amount
  mismatch, timeout); email captured by Mailpit (tests read its API to get verify/reset/invite links);
  web push via an injected sender that records calls; files = the `local` storage driver (temp dir per run); the Cloudinary driver has unit tests with the SDK mocked (public ids, `type: authenticated`, expiry passed, destroy called with `invalidate`). `PAYMENTS_MOCK=true` makes the web
  "Continue to SSLCommerz" go to a local mock gateway page that posts back like the real one.
- `env.ts` refuses `PAYMENTS_MOCK=true`, `CLOCK_OVERRIDE` or test routes when `APP_ENV` is staging/prod.

## Integration tests (minimum, beyond each route's happy path)
- **RLS:** `rls.int.test.ts` (every org table has RLS + force + policy); for each module, landlord B reading/
  updating org A ids → 404; a raw query with org A context can't see org B rows.
- **Roles:** caretaker can't see documents (API 404 and SQL returns 0 rows), can't act on unassigned
  buildings, can't issue/void/waive; tenant can't read another tenant's bill/lease/request in the same org.
- **Auth:** signup → verify → login; wrong password ×5 → locked; refresh rotation; reusing an old refresh
  token revokes the family and the new one stops working; reset password revokes other sessions; invite
  single-use, expired, wrong email; Google callback with mocked token: link existing verified email, refuse
  unverified email linking, invite acceptance; CSRF missing/wrong → 403; logout-all disconnects sockets.
- **Billing:** generation idempotent (run twice, and two concurrent runs → one bill); proration on lease start;
  reading validation; issue applies credit; late fee once (job run twice); waive; adjustment on issued bill.
- **Payments:** concurrent confirm of two claims on one lease allocates correctly (no lost update);
  duplicate TrxID → 409; void after credit was used; receipt numbers gapless under 20 concurrent payments
  across one org; rollback when the receipt insert fails (nothing saved).
- **SSLCommerz:** IPN valid → paid once; same IPN twice → one payment; amount mismatch → `flagged`, no
  payment; browser success return without IPN → nothing paid; re-check job confirms a missed IPN.
- **Outbox:** event row written in the same tx (rollback → no row); retry with backoff; failed after 5;
  respects preferences; 410 push response deletes the subscription.
- **Files:** 6 MB → 413; `.exe` renamed to `.jpg` → 415; signed URL only for permitted users and rejected after expiry or with a tampered signature; EXIF/GPS removed from stored images; delete
  removes the object.
- **Deletion:** account deletion anonymises and keeps financial rows; landlord blocked.

## E2E specs
| Spec | Flow (both projects unless noted) |
|---|---|
| `auth.spec.ts` | signup (email from Mailpit) → verify → onboarding; logout; login errors; forgot/reset |
| `onboarding.spec.ts` | landlord adds building, units with charges, billing settings; map pin (desktop) |
| `tenant-invite.spec.ts` | landlord creates lease → tenant accepts invite (new account) → sees lease |
| `billing.spec.ts` | clock to bill day → drafts → caretaker enters readings → landlord issues → tenant sees explained bill |
| `pay-online.spec.ts` | tenant pays with mock gateway → result page → paid + receipt download; failed/cancel paths |
| `pay-claim.spec.ts` | tenant submits bKash claim with photo → caretaker confirms (live update on tenant home) / rejects with reason |
| `late-fee.spec.ts` | clock past due+grace → late fee line → landlord waives |
| `maintenance.spec.ts` | tenant creates with photos → caretaker assigns/progresses → tenant sees live updates in a second browser context → resolves → tenant closes |
| `notices.spec.ts` | notice posted → tenant bell updates live → notice on home |
| `documents.spec.ts` | landlord uploads NID → tenant views → caretaker has no Documents tab → delete |
| `move-out.spec.ts` | give notice → end lease → settlement figures → PDF |
| `account.spec.ts` | preferences, sessions revoke, delete account (tenant) |
| `admin.spec.ts` (desktop) | suspend org → landlord sees suspended screen → reactivate |
| `isolation.spec.ts` | landlord B pastes org A URLs → 404 pages |
| `pwa.spec.ts` (desktop chromium) | manifest valid, SW registered, offline banner |
| `layout.spec.ts` | `auditLayout()` from `mobile-layout-qa` on every route per role at 320/360/390/414/768 + 1440, light/dark, stress org + `en-XA`: zero violations. Each UI task adds its routes |
| `states.spec.ts` | The six checks in `ui-states` (slow API, slow chunks, cached back nav, errors, mutation pending, filters) for each role's navigation. Each UI task adds its routes |
| `a11y.spec.ts` | axe on every main page per role, light and dark: no serious/critical |
| `visual.spec.ts` | screenshot main screens per role, compared once by the designer with `design/`, then baselines |

## Speed checks in CI
- **Query count:** `tests/helpers/queryCounter.ts` counts Prisma queries per request (Prisma `$on('query')`); every
  list endpoint has a test asserting a fixed count for 5 vs 50 items (no N+1). Integration runs log any request > 200 ms.
- **Bundle size:** `size-limit` (dev dep) in `lint`: initial JS ≤ 200 KB gzip, each route chunk ≤ 100 KB gzip.

## Load (k6, against staging, V16)
50 virtual users for 5 min mixing tenant home, bill detail, landlord dashboard, list pages; 5 rps payment-claim
submissions. Targets: p95 < 400 ms for reads, < 800 ms for writes, 0 errors, VM memory < 85%.

## Lighthouse targets
Pages: `/` (landing), `/login`, tenant `/t`, tenant `/t/bills/:id`, landlord `/l`, `/l/billing`. Logged in first
for app pages. Local production build in V16, then **prod** in V17.

| Metric | Mobile | Desktop |
|---|---|---|
| Performance | ≥ 90 | ≥ 95 |
| Accessibility | 100 (≥ 95 only with a written reason) | 100 |
| Best Practices | ≥ 95 | ≥ 95 |
| SEO (landing only) | ≥ 95 | ≥ 95 |
| LCP | < 2.5 s | < 1.5 s |
| CLS | < 0.05 | < 0.05 |
| TBT | < 200 ms | < 100 ms |

## Scripts (root `package.json`)
`typecheck`, `lint` (eslint + prettier check + token lint), `test`, `test:int`, `test:e2e`, `test:load`,
`docs:check`, `test:all` (= typecheck + lint + test + test:int + test:e2e + docs:check), `db:migrate`,
`db:seed`, `e2e:seed`, `db:docs` (db-docs skill), `dev` (all apps + `compose.dev.yml`).

## CI (`.github/workflows/ci.yml`, on PR and push)
Jobs in parallel where possible: `lint+typecheck` → `unit` → `integration` (services: postgres:17, redis:7,
mailpit) → `e2e` (full stack via `compose.test.yml`, Playwright both projects, upload report +
traces on failure) · `docs` · `security` (pnpm audit --prod high, gitleaks, CodeQL) · `build-images`
(on `main` only). Cache pnpm store and Playwright browsers. Flaky tests are fixed, never retried away
(Playwright `retries: 0` locally, `1` in CI with flake report; a flaky test opens a debugger task).
