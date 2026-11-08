# PROGRESS — the project's memory

**Every agent reads this first and updates it before ending any session.**
`08-TASKS.md` is the *plan* (what to build). This file is the *state* (where we are).

---

## Now
| | |
|---|---|
| **Phase** | **PAUSED by the owner on 2026-11-08** (weekly Claude limit). Setup is done; the owner starts the relay later. V0 ✅, V1 ✅. V2, V3, V4 built, not merged |
| **Next task** | #3 V3 is **MERGED** (squash feddf21, 2026-11-09, CI 8/8 on bb93001). Staging deploy run 42515537657 on feddf21 is GREEN and V3 is ticked. **v0.1.0 tagged on 38ebb32 (2026-11-09); prod deploy run 42516300840 GREEN; https://basamanager.rhrony05.me/api/health = 200.** `weekly` run once 2026-11-09 (run 42516601364): restore-drill **RESTORE OK** (backups/staging/2026-11-08.dump); `audit` job RED (see below). V3 METRICS row added and worktree `V3-infra` removed (2026-11-09). Follow-up PR #7 (`fix/V3-followup`, worktree `D:/Projects/bm-wt/V3-followup`) is open with CI 8/8, not merged: 3 nits + weekly `audit` green. Reviewer (Sonnet) APPROVED #7 at f57e08b (2026-11-09, 0 blockers, CI 8/8, mergeState CLEAN). **#7 MERGED (squash a2f17a7, 2026-11-09); staging deploy run 42518261355 + ci 42518261300 running.** `weekly` re-run 42518815701: audit + restore-drill both GREEN; worktree V3-followup removed. Next: fix gzip/brotli wording (09-TESTING.md, docs/overview/repo-map.md). After that: #4 V2 review, #5 V4 (merge main first), then V5 |
| **Blocked on** | — |
| **Production URL** | — (will be https://basamanager.rhrony05.me) |
| **Last updated** | 2026-11-09 by Claude (lead): `weekly` re-run green (audit + restore-drill), V3-followup worktree removed; next is the gzip/brotli wording fix |

## Resume here (written at the 2026-11-08 pause)
**First item:** ✅ done 2026-11-08: VM `vm-basamanager` started (public IP 172.198.71.173, SSH with the deploy key works). The ssh user cannot run `docker ps` (permission denied on the socket), so staging container state is unchecked; devops should check with sudo when finishing #3. **2026-11-09: devops finished all 25 V3 review items (head `fed9bc2`, CI green, blocker proved on staging, runs 42507019561 / 42507429890). Next item: devops fixes the 2026-11-09 Opus re-review of #3 (CHANGES REQUESTED, https://github.com/RHRONY05/BasaManager/pull/3#pullrequestreview-5819099087): (1) BLOCKER: install openssl in the `base` stage of `infra/docker/api.Dockerfile` and `worker.Dockerfile` (migrate fails "Can't write to @prisma/engines" on every new image); prove with a clean build + green migrate on staging. (2) Re-run both rollback drills (migrate/early failure and smoke failure) with the new scripts and record them. (3) Correct PROGRESS and `docs/operations/rollback.md`: runs 42507019561/42507429890 failed at migrate, not at a forced hook. (4) Add a CI step that builds the api image and runs migrate. (5) Nits: deploy.yml:160-161, rollback.sh:566, sentry.test.ts:215-217, provision-secrets.sh:26. Then Opus re-review, squash merge, lead tags `v0.1.0`, checks prod `/api/health`, runs `weekly` once. Environment branch policies are still unset (deployment_branch_policy null on staging and production): set via `gh api` if the token allows, else keep as an owner Human step.**

Work in order. One task at a time, no parallel Opus runs (three at once used up the 5-hour window). Everything below is in git or on disk; nothing depends on the old session.

| PR | Branch / worktree | State | To finish |
|---|---|---|---|
| [#3 V3 infra](https://github.com/RHRONY05/BasaManager/pull/3) | `feat/V3-infra`, `D:/Projects/bm-wt/V3-infra` | CI 7/7 on the last push. Opus review: CHANGES REQUESTED (1 blocker, 16 shoulds, 8 nits), posted on the PR. DevOps' fixes are **half done and uncommitted** in the worktree | DevOps finishes the review items (blocker = rollback after a failed deploy step; prove it once on staging; separate deploy key; environment branch policies), pushes, re-review, merge, wait for staging smoke, lead tags `v0.1.0`, check prod `/api/health` |
| [#4 V2 design](https://github.com/RHRONY05/BasaManager/pull/4) | `feat/V2-design`, `D:/Projects/bm-wt/V2-design` | CI 7/7. Complete and pushed. **Design review not finished** (reviewer hit the limit; nothing posted) | Run the design review again, fix, merge |
| [#5 V4 schema/RLS](https://github.com/RHRONY05/BasaManager/pull/5) | `feat/V4`, `D:/Projects/bm-wt/V4` | Complete and pushed. CI 6/7: `integration` fails 1 of 76 in `tenant-extension.int.test.ts` ("non-org tables can be queried…", expected [] but found a row; passes locally, so probably data left by another test file). **Opus review not finished** | Debugger fixes the test, Opus review again (including trying to break isolation), merge main after V3, merge |

Then V5: `.agent/briefs/V5-tests.md` and `V5-backend.md` are written (untracked in the main checkout, like this edit to PROGRESS.md). Before the first UI task, fix `auditLayout`: at a phone-height viewport it reports controls scrolled under the bottom nav as overlapping, and labels mixing font sizes as wrapped (details: `.agent/design/README.md`).

Add METRICS.md rows for V2, V3 and V4 when they merge. Token use reported by subagents: designer 571k; devops 337k (V3, before the review fixes); architect 354k (V4); V4 docs 212k; test-designer 127k.

The Azure VM is deallocated for the pause. Prod has not been deployed.

## Human steps
Things only the human can do. Agents add to this list; the human ticks them.
- [x] (2026-11-07, all 16 present by length) Follow `.agent/CREDENTIALS-GUIDE.md`: fill `D:\Projects\Project_credentials\BasaManager.env` (Cloudflare, Cloudinary, Resend, Google OAuth, Sentry, SSLCommerz, optional UptimeRobot). Start with SSLCommerz, since its email can take up to a day.
- [x] (2026-11-08, verified by /project-config: zone active, NS courtney/odin.ns.cloudflare.com) Make sure `rhrony05.me` DNS is on Cloudflare.
- [x] (2026-11-07) Installed `gh` 2.103.3 + `az` 2.92.0 (winget), Node 22.22.2 (nvm), pnpm 12.18 (Corepack), Docker Desktop running; `gh` logged in as RHRONY05 (repo, workflow, write:packages); `az` on "Azure for Students" (tenant needs MFA: `az login --tenant 7daf625a-663e-4b22-92cc-de91bdf0dff0`).
- [x] (2026-11-08, connects; `get_me` → RHRONY05) Optional: fix the `github-mcp-server` connection (failed on 2026-11-07); `gh` is the fallback.
- [x] (2026-11-08) Run `/project-config` in the lead Claude Code session. Its ❌ items are listed below.
- [x] (2026-11-08, verified: identical to the proposed file) **Permission grants:** the auto-mode classifier blocked the agent from writing `.claude/settings.local.json`. Review the proposed file the agent saved (`D:\Temp\claude\20403fb38b09e95c\4c05325e-dad8-4d7a-bdc2-7ddf984b62d8\scratchpad\settings.local.proposed.json`) and copy it to `D:\Projects\BasaManager\.claude\settings.local.json` yourself. It allows chrome-devtools/shadcn/github MCP, `pnpm/npx/node/corepack/git/gh/agy/az/docker/ssh/scp` and WebFetch for the doc hosts, and denies the unused MCP servers (supabase, vercel, StitchMCP, magic-mcp, aceternity, magicui, uiverse, Sanity) for this project only.
- [x] (2026-11-08, re-checked: free) **Free ports 5432 and 6379:** containers `shopmate_postgres` and `shopmate_redis` (another project) hold them, and BasaManager's dev Postgres/Redis need them. Run `docker stop shopmate_postgres shopmate_redis` before the build (restart them later with `docker start …`).
- [x] (2026-11-08, re-checked: 2.1.319, `claude mcp list` works) **Repair the global `claude` CLI.**
- [ ] **Rotate two non-BasaManager secrets:** `claude mcp list` printed the StitchMCP API key and the Supabase access token into the 2026-11-08 session transcript. (Done 2026-11-08: both moved out of `~/.claude.json` into `D:\Projects\Project_credentials\Mcp\mcp.env`, which `Mcp\mcp-launch.mjs` loads only into those two servers' own processes.) Rony: create new keys in Stitch and Supabase, replace the two values in `mcp.env`, revoke the old ones, restart Claude Code, then delete the backup `Mcp\claude.json.bak-2026-11-08` (it still holds the old keys). Also confirm one real Stitch/Supabase tool call works from another project (only startup + connection were verified).
- [ ] Paste the goal command into the lead session.
- [ ] When the build is done: open the production URL, try each role, then start the learning path at `docs.basamanager.rhrony05.me`.

## Environment facts (no secrets here!)
| Item | Value |
|---|---|
| GitHub repo | `RHRONY05/BasaManager`, https://github.com/RHRONY05/BasaManager — created 2026-11-08 (private), made **public** 2026-11-08 by owner decision (full-history gitleaks clean first). Environments `staging` and `production` (no secrets yet). Squash merge only, auto-delete head branches. Branch protection on `main`: required checks `lint-typecheck`, `unit`, `integration`, `e2e`, `docs`, `security` (strict), linear history, no force-push/deletion, 0 reviews, admins not enforced |
| VPS | Azure for Students, Standard B2s, Ubuntu 24.04, region `indiasouthcentral` — not created yet |
| Azure region policy | Subscription allows only uaenorth, indonesiacentral, eastasia, indiasouthcentral, koreacentral. B2s: indiasouthcentral ✅ · eastasia only B2s_v2 · indonesiacentral restricted · southeastasia/centralindia not allowed |
| Pinned versions (V0, 2026-11-08) | Rule: latest stable inside the major the docs name; else latest stable. typescript 5.9.3 (7.x exists, typescript-eslint needs <6.1) · react/react-dom 19.3.1 · vite 8.3.6 · @vitejs/plugin-react 6.2.1 · react-router 7.18.5 (8.x exists; `ui-states` is written for 7) · @tanstack/react-query 5.106.1 (5.107.1 was <1 day old) · react-hook-form 7.91.0 · @hookform/resolvers 7.0.3 · tailwindcss + @tailwindcss/vite 4.3.5 · lucide-react 1.70.0 · react-i18next 18.0.0 · i18next 27.0.1 · socket.io / socket.io-client 4.8.4 · vite-plugin-pwa 2.0.0 · leaflet 1.9.4 · react-leaflet 5.0.0 · @sentry/react + @sentry/node 11.11.0 · express 5.3.0 · prisma + @prisma/client + @prisma/adapter-pg 7.10.1 (8.0 is RC only) · pg 8.23.1 · zod 4.6.7 · pino 10.4.0 · pino-http 11.0.0 · helmet 8.3.0 · cookie-parser 1.4.7 · argon2 0.45.2 · jose 6.2.15 · arctic 3.7.0 · express-rate-limit 8.7.3 · rate-limit-redis 6.0.2 · multer 2.5.0 · file-type 22.3.0 · @socket.io/redis-adapter 8.3.0 · @socket.io/redis-emitter 5.1.0 · ioredis 6.0.0 · cloudinary 2.11.0 · sharp 0.35.5 · nodemailer 10.3.1 · web-push 4.0.0 · @date-fns/tz 1.5.0 · date-fns 4.4.0 · node-cron 4.6.0 · puppeteer 25.16.0 · @react-email/components 1.0.12 · @react-email/render 2.2.0 · vitepress 1.6.4 · vitepress-plugin-mermaid 2.0.17 · mermaid 12.3.0 · vitest + @vitest/coverage-v8 5.1.0 · supertest 7.3.2 · @playwright/test 1.65.0 · @axe-core/playwright 4.14.0 · msw 3.0.4 · size-limit + @size-limit/preset-app 14.3.0 · eslint 10.14.0 · typescript-eslint 8.72.1 · prettier 3.9.10 · tsx 4.23.15 · @asteasolutions/zod-to-openapi 9.1.0 · @testing-library/react 16.3.3 · jsdom 31.0.0 |
| agy dispatch mode | Edit-only (`--mode accept-edits`, no shell). Lead runs install/tests. See 11-AGENT-TEAM.md |

### Preflight (V0, 2026-11-08)
| Check | Status | Note |
|---|---|---|
| Builder setup table | ✅ | All ✅ above |
| Versions node/pnpm/docker/gh/az/agy | ✅ | 22.22.2 / 12.18.0 / 29.6.2 / 2.103.3 / 2.92.0 / 1.5.3 |
| Secrets by length | ✅ | 16/16 |
| Skills in `.claude/skills/` | ✅ | 12 present; 10 copied skills start with `## BasaManager override`; `mobile-layout-qa`, `ui-states` are project-written (no override needed); none has `disable-model-invocation` |
| `.claude/agents/*.md` models | ✅ | architect, designer = opus; test-designer, reviewer, debugger, devops, docs = sonnet (reviewer gets the opus override per PR) |
| agy loop proof | ✅ | Edit-only: worktree → agy wrote add() + test (63 s) → lead ran Vitest 2/2 → `--conversation` follow-up added sub() (59 s) → 3/3 → worktree removed. `--dangerously-skip-permissions` refused by the lead's environment; `--sandbox` and command allow-rules don't let print mode run commands |
| Package versions | ✅ | Pinned list above |
| Azure region with B2s | ✅ | `indiasouthcentral` |
| Domains | `basamanager.rhrony05.me`, `staging.basamanager.rhrony05.me`, `docs.basamanager.rhrony05.me` |
| Node / pnpm | 22.22.2 / 12.18.0 |
| Deploy SSH key | `~/.ssh/basamanager_ed25519` (+ `.pub`), created 2026-11-08, ACL limited to the user |
| Local port conflicts | none (shopmate containers stopped 2026-11-08; keep them stopped while building) |

### Builder setup (`/project-config`, 2026-11-08)
| Item | Status | What was done / what Rony must do |
|---|---|---|
| node | ✅ | v22.22.2 |
| pnpm (Corepack) | ✅ | 12.18.0 (`corepack pnpm` works) |
| git | ✅ | 2.47.1; global user RHRONY / muhammadrony147@gmail.com |
| docker + compose | ✅ | Engine 29.6.2 (Docker Desktop running), Compose v5.3.1 |
| Ports 5432 / 6379 | ✅ | Freed by Rony (re-checked 2026-11-08) |
| gh | ✅ | 2.103.3, logged in as RHRONY05, scopes repo, workflow, write:packages. Repo `RHRONY05/BasaManager` not created yet (V1 does it) |
| az | ✅ | 2.92.0, subscription "Azure for Students" Enabled; `rg-basamanager` not created yet (V3) |
| ssh | ✅ | OpenSSH 9.9p1; key pair `~/.ssh/basamanager_ed25519` created by the agent |
| sentry-cli | ✅ | 3.8.2 via npx; `releases list --org $SENTRY_ORG` exits 0 with the token |
| agy | ✅ | 1.5.3; `agy models` lists `gemini-3.8-flash-high` |
| MCP chrome-devtools | ✅ | `list_pages` answers (user scope) |
| MCP shadcn | ✅ | `get_project_registries` answers (no `components.json` yet, expected) |
| MCP github-mcp-server | ✅ | `get_me` → RHRONY05 (connects now; `gh` stays the default) |
| Unused MCP servers off for this project | ✅ | Deny rules for supabase, vercel, StitchMCP, magic-mcp, aceternity, magicui, uiverse, Sanity |
| Permission grants `.claude/settings.local.json` | ✅ | Put in place by Rony 2026-11-08; matches the proposed file (47 allow, 8 deny) |
| MCP keys out of `~/.claude.json` | ✅ | StitchMCP + supabase start through `Project_credentials\Mcp\mcp-launch.mjs` + `mcp.env` (user-only ACL); both Connected |
| `.gitignore` covers settings.local.json | ✅ | Minimal `.gitignore` created; V1 extends it |
| `claude` CLI | ✅ | 2.1.319; `claude mcp list`: chrome-devtools, shadcn, github-mcp-server all Connected |
| Secrets file | ✅ | All 16 present (lengths: CF token 53, CF zone 32, Cloudinary 9/15/27, Resend 36, Google 72/35, Sentry token 203, org 17, DSNs 95×3, SSLCommerz 18/22, UptimeRobot 33) |
| Cloudflare DNS | ✅ | Zone `rhrony05.me` active, NS courtney/odin.ns.cloudflare.com |

## Lighthouse
| Page | Mobile perf / a11y / BP | Desktop perf / a11y / BP |
|---|---|---|
| — | — | — |

## Decisions made during the build
Agents append one line per choice the docs didn't cover (newest last). If it changes a doc, update the doc too.
- 2026-11-07 — Planning: see `AGENTS.md` "Key decisions".
- 2026-11-07 — Owner: files on **Cloudinary** (the Supabase free plan already has 2 active projects and the owner doesn't want to share another project's storage). Backups on Azure Blob in `rg-basamanager`.
- 2026-11-07 — Owner: no Superpowers or other outside skill frameworks; the team uses only `.claude/skills/` + `.claude/agents/`.
- 2026-11-08 — Lead (V0): agy runs **edit-only** (`--mode accept-edits`); the lead runs every command (install, typecheck, lint, tests) and feeds failures back by `--conversation`. Reason: the lead's environment refuses `--dangerously-skip-permissions`, and agy print mode denies all commands without it. Updated 11-AGENT-TEAM.md.
- 2026-11-08 — Lead (V0): VM region **indiasouthcentral** (subscription policy excludes Southeast Asia/Central India; closest allowed region with Standard_B2s). Updated 02.
- 2026-11-08 — Lead (V0): versions = latest stable inside the major the docs name (TypeScript 5.9.3 because typescript-eslint supports <6.1; React Router 7.18.5 because `ui-states` targets 7; Prisma 7.10.1 because 8 is RC). New runtime deps `@prisma/adapter-pg` + `pg` (Prisma 7 needs a driver adapter). Updated 02.
- 2026-11-08 — Owner: repo made public so branch protection works on the free plan.
- 2026-11-08 — Architect (V1): HTTP status for codes 04 left open: 400 TOKEN_INVALID, READING_LOWER_THAN_PREVIOUS · 401 INVALID_CREDENTIALS, SESSION_REVOKED · 403 INVITE_EMAIL_MISMATCH · 409 LANDLORD_MUST_TRANSFER, READING_REQUIRED, DUPLICATE_REFERENCE, INVALID_TRANSITION · 423 ACCOUNT_LOCKED. Clients branch on `error.code`, never the status (refresh-on-401 only for UNAUTHENTICATED). Recorded in 04.
- 2026-11-08 — Architect (V1): `/api/health` and `/api/ready` return bare bodies (503 for not ready, same body); everything else uses the `{data}` envelope. Shared code stays erasable TypeScript (no enum/namespace) because `scripts/openapi.mjs` runs it with Node type stripping. Recorded in 04.
- 2026-11-08 — Lead (V1): Prisma client generated by `@bm/api` `postinstall` (git-ignored output); `openapi:check` is part of `pnpm lint`. Prisma folder is `apps/api/prisma/` (02 tree corrected).
- 2026-11-08 — Lead (V1): pnpm 12 refuses packages published < 1 day ago (`minimumReleaseAge`). Kept the policy (supply-chain safety) and pinned the previous release instead: @tanstack/react-query 5.106.1, concurrently 10.0.6; lockfile rebuilt with a fresh resolution. Rule for later tasks: never add a package version younger than the policy; pick the newest older one.
- 2026-11-08 — Lead (V1): `auditLayout()` counts lines of text nodes only; the reference version counted an icon above a label (bottom nav) as a wrapped label. Updated `.claude/skills/mobile-layout-qa/SKILL.md`.
- 2026-11-08 — Debugger (V1): pages are `React.lazy` components inside a `Suspense` keyed by pathname, not React Router route `lazy` (route lazy kept the old page on screen during chunk loads). Updated `ui-states` skill + 02.
- 2026-11-08 — Lead (V1): coverage excludes process bootstraps (`apps/api/src/server.ts`, `apps/worker/src/index.ts`; booted by integration/e2e), generated code and the `packages/domain` stub; thresholds unchanged (api 80% lines, domain 95%). New error code `PAYLOAD_TOO_LARGE` (413) for bodies over the limit (04 updated).
- 2026-11-08 — Lead (V1 review): Playwright `setup` project (log each role in once) moves to **V5** (no auth before then); `tests/helpers/queryCounter.ts` moves to **V4** (no Prisma models before then). Both noted in 09-TESTING.
- 2026-11-08 — Debugger (V1 review): client-caused errors with a numeric 4xx status (bad `%` path, unsupported charset/encoding, verify failures, 431) map to 400 `VALIDATION_FAILED` with a fixed message; no new 415 code (keeps `errorStatus` consistent). e2e builds the web app with `--mode test` so `en-XA` stays available to the layout audit while production builds ignore it.
- 2026-11-08 — Lead: V2 (design), V3 (infra) and the V1 follow-up run in parallel worktrees because their files do not overlap (design only `.agent/design/**`; infra `infra/**`, `.github/**`, deploy glue). Feature tasks from V4 on still go in order.

- 2026-11-08 — Owner: the build must run with no human after the initial grant. agy runs in turbo (`--dangerously-skip-permissions`); leads run as fresh Sonnet 5.5 sessions at medium effort (owner decision to save usage; Opus stays for high-risk reviews and schema work) from `scripts/autonomous.sh` with permissions bypassed. Updated 11-AGENT-TEAM.md and next-task.

## Session log
Newest at the bottom. One entry per task. Keep entries short.

```
### YYYY-MM-DD HH:MM — <agent> — <task ID>
Did: …
Tests: typecheck ✅ lint ✅ unit ✅ int ✅ e2e ✅ (N passed) build ✅ docs ✅
Commits / PR: …
Problems / surprises: …
Next: …
```

### 2026-11-07 — Claude (planning) — planning interview
Did: interview with Rony. Decided roles (admin/landlord/caretaker/tenant), full BD billing model (rent in
advance, fixed charges, flat-rate submeter electricity, proration, late fee, credit, deposit settlement),
SSLCommerz sandbox + manual payments, auth (email/password + invites + Google), extras (notice board,
tenant documents), PWA English i18n-ready, learning docs (visual-diagram SVG + Mermaid + VitePress site),
Azure VM, rhrony05.me subdomains, autonomous designer agent, lead + subagents orchestration.
Wrote `AGENTS.md`, `CLAUDE.md`, `01-PRODUCT.md`, `07-BILLING.md`, `10-LEARNING.md`, `workflows/project-config.md`.
Next: planner writes the rest of the pack (no owner input needed).

### 2026-11-07 — Claude (planning) — tooling decisions
Did: Hosting stays on the Azure VM for a ~1-month test (Heroku's $13 credit only fits one prod app with no Redis or staging).
Firebase replaced by standard Web Push (VAPID). R2 replaced by Supabase Storage via its S3 API (MinIO locally).
Sentry kept. Maps = Leaflet + OSM (no key). DNS on Cloudflare.
Audited the owner's custom skills and wrote verdicts + overrides into `11-AGENT-TEAM.md`.
Verified `agy -p` headless print mode works with gemini-3.8-flash (JSON output, conversation_id).
Wrote `CREDENTIALS-GUIDE.md` and `11-AGENT-TEAM.md`.
Next: planner writes 02, 03, 04, 06, 08, 09, rules, workflows, `.claude/agents/`.

### 2026-11-07 — Claude (planning) — spec pack complete
Did: wrote 02-ARCHITECTURE, 03-DATABASE, 04-API, 06-UI, 08-TASKS (V0–V17), 09-TESTING, rules/basamanager.md,
workflows (next-task, status, sync-docs), `.claude/commands/*`, `.claude/agents/*` (architect, designer, test-designer,
reviewer, debugger, devops, docs), briefs template, METRICS.md, GOAL.md. Owner decision: Antigravity only with
Gemini 3.8 Flash; never its Claude models; wait for quota instead.
Next: owner follows CREDENTIALS-GUIDE.md, runs /project-config, pastes GOAL.md.

### 2026-11-07 — Claude (planning) — skills in repo + UI quality
Did: moved the owner's credentials file out of the repo to `D:\Projects\Project_credentials\BasaManager.env`.
Copied 10 skills into `.claude/skills/` with BasaManager overrides. Wrote project skills `mobile-layout-qa`
(build rules + `auditLayout()` geometry audit at 320–768, stress content, `en-XA`) and `ui-states` (non-blocking
navigation, preloading, cache, four states, slow-network `states.spec.ts`), after the owner reported mobile overflow/wrap
bugs and 5–6 s frozen navigations in past agent builds. Wired them into rules, 06, 08 (V1 harness, V2 checks), 09, 11, agents.

### 2026-11-07 — Claude (planning) — storage switch
Did: files moved from Supabase Storage to Cloudinary (authenticated uploads, 5-min expiring download URLs, local driver for dev/test, API-stream fallback decided in V3). Backups moved to Azure Blob in rg-basamanager (30-day lifecycle, container SAS). Updated AGENTS, 02, 03, 04, 08, 09, 10, rules, 11, devops agent, project-config, CREDENTIALS-GUIDE.

### 2026-11-07 — Claude (planning) — Sentry setup
Did: Sentry organization tokens are fixed to `org:ci` (can't create projects), so the owner creates the 3 projects and provides the DSNs; agents keep only the CI token for releases + source maps. Updated CREDENTIALS-GUIDE §7, 02 env, 08 V3, project-config, rules.

### 2026-11-08 — Claude (lead) — /project-config
Did: checked every CLI (versions + auth) and made one live read-only call per MCP server (chrome-devtools, shadcn, github-mcp-server all ✅).
Created `~/.ssh/basamanager_ed25519` and a minimal `.gitignore`. All 16 secrets present (by length). Cloudflare zone active.
Problems / surprises: auto-mode classifier blocked writing `.claude/settings.local.json` (proposed file saved for the owner);
`shopmate_*` containers hold 5432/6379; global `claude` CLI shim broken (`claude.exe` missing).
Next: owner clears the ❌ items in Human steps, then pastes GOAL.md.

### 2026-11-08 — Claude (lead) — V0 Preflight
Did: preflight table all ✅; skills/agents verified; agy loop proved in edit-only mode (permission modes probed; `--dangerously-skip-permissions` refused by the lead's environment); Azure region chosen (indiasouthcentral, policy-limited); package versions pinned.
Docs changed: 11-AGENT-TEAM.md (dispatch = edit-only, lead runs commands), 02 (region, Prisma adapter).
Next: V1.

### 2026-11-08 — Claude (lead) — V1 Monorepo, tooling, CI, docs skeleton
Did: 6 parts (architect contracts, devops ci+repo, agy tooling/api/web, docs agent) + 2 debugger passes; PR #1 merged (reviewer APPROVE, 0 blockers; CI 7/7). Follow-up PR fixes the 5 shoulds + 4 nits.
Tests: typecheck ✅ lint ✅ unit ✅ (144, coverage thresholds met) int ✅ (6) e2e ✅ (1026 passed, 4 skipped = ui-states checks 5/6 for V5/V6) docs ✅
Commits / PR: #1 (squash dc2ebaa), follow-up fix/V1-review
Problems / surprises: agy edit-only rounds are slow (12–43 min each); web needed 3 rounds + debugger (route lazy froze the old page). Docs agent found real defects (body-parser 500s, redaction gaps, coverage not running). pnpm release-age policy rejected fresh packages. Windows: `timeout` leaves grandchild node processes.
Next: V2 design + V3 infra (parallel), then V4.

### 2026-11-09 — Claude (lead) — V3 re-review
Did: Opus reviewer re-reviewed PR #3 at fed9bc2 (CI 7/7). Verdict CHANGES REQUESTED: 1 blocker (openssl missing in the Dockerfile base stage, so `prisma migrate deploy` fails on every new image; the two "proved rollback" runs actually failed at migrate), 4 shoulds, 4 nits. Rollback logic and the separate deploy key were verified correct; 23 of 25 earlier items fixed. Posted: pullrequestreview-5819099087 (a COMMENT, since the author cannot request changes on its own PR).
Tokens: reviewer 137k.
Next: devops fixes the items listed in "Resume here", then re-review and merge.

### 2026-11-09 — Claude (lead) — V3 re-review fixes
Did: devops fixed all items of review 5819099087. openssl added to the base stage of both Dockerfiles; staging deploy 42512602747 migrate + smoke green. Both rollback drills re-run and passed (deploy-step failure run 42513127173, smoke failure run 42513431008). New CI job `images` builds both images and runs migrate. rollback.sh takes the failing step explicitly. Environment branch policies set (staging = main, production = tag v*). PROGRESS and rollback.md corrected. CI 8/8. Not merged.
Tokens: devops 91k. Details: ../bm-runs/V3-fixes-2.md
Next: Opus re-review of #3 (focus: Dockerfile fix, images job, rollback.sh step argument), squash merge, check staging, tag v0.1.0, check prod /api/health, run `weekly` once.

### 2026-11-09 — Claude (lead) — V3 second re-review
Did: Opus reviewer re-reviewed PR #3 at fd7e07f (CI 8/8). Verdict APPROVE (posted as a COMMENT, pullrequestreview-5819302341): openssl fix, `images` job, rollback step argument, both drills, doc corrections, 4 nits and branch policies all verified. 3 new non-blocking nits: ci.yml image build needs `shell: bash` (pipefail); deploy.sh:129-147 cleanup should be non-fatal after state is written; rollback.md:15 / rollback.sh:20-21 usage strings and unknown-argument error. Details: ../bm-runs/V3-rereview-2.md.
Tokens: reviewer 67k.
Next: squash merge #3, wait for staging deploy green, tick V3 in 08-TASKS, tag v0.1.0, check prod /api/health, run `weekly` once (expect RESTORE OK), METRICS rows, remove worktree. Fix the 3 nits in a small follow-up.

### 2026-11-09 — Claude (lead) — V3 merge attempt
Did: `gh pr merge 3 --squash` refused: branch behind main (strict required checks). Merged origin/main into feat/V3-infra in the worktree (clean, only docs/briefs/scripts/autonomous.sh), pushed bb93001. CI re-running.
Next: when CI is 8/8 on bb93001, squash merge #3, wait for staging deploy green, tick V3 in 08-TASKS, tag v0.1.0, check prod /api/health, run `weekly` once, METRICS rows, remove worktree, then the 3 nits follow-up.

### 2026-11-09 — Claude (lead) — V3 merged
Did: waited for CI on bb93001 (8/8 green incl. e2e and `images`), `gh pr merge 3 --squash` -> feddf21 on main.
Next: check the staging deploy run for feddf21; if green tick V3, tag v0.1.0, check prod /api/health, run `weekly`, METRICS rows, remove worktree, nits follow-up PR.

### 2026-11-09 — Claude (lead) — V3 staging verified
Did: staging deploy run 42515537657 (feddf21) all jobs green (meta, 4 image builds, sentry-release, deploy). V3 ticked in 08-TASKS. Local main had 8 PROGRESS-only commits that conflicted with the squash merge; reset to origin/main and re-applied the latest PROGRESS.md.
Next: tag v0.1.0 (prod deploy), check prod /api/health, run `weekly` once (expect RESTORE OK), METRICS rows for V3, remove worktree D:/Projects/bm-wt/V3-infra, then the 3-nit follow-up PR.

### 2026-11-09 — Claude (lead) — V3 prod release
Did: staging green on 38ebb32, tagged v0.1.0, prod deploy run 42516300840 all jobs green, prod /api/health 200 (release 38ebb32).
Next: run `weekly` once (expect RESTORE OK), METRICS rows for V3, remove worktree D:/Projects/bm-wt/V3-infra, then the 3-nit follow-up PR. After that: #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 weekly run
Did: ran `weekly` by hand (run 42516601364). restore-drill GREEN: `RESTORE OK: backups/staging/2026-11-08.dump restored (11 objects, 1 table in public)`. `audit` job RED: `pnpm audit --audit-level high` reports 17 vulns (8 high), among them vite <=6.4.3 via vitepress (apps/docs), zod <4.6.6 via size-limit>estimo>puppeteer-core>chromium-bidi (dev-only), basic-ftp via size-limit. Not caused by V3; the PR `security` job evidently passes with a different scope, so check how it differs.
Next: METRICS rows for V3, remove worktree D:/Projects/bm-wt/V3-infra, then the follow-up PR: 3 V3 nits + make the weekly audit green (pnpm overrides / bump vitepress / size-limit, or align with the PR audit scope). After that: #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 cleanup
Did: added the V3 row to METRICS.md; removed worktree D:/Projects/bm-wt/V3-infra and deleted local branch feat/V3-infra.
Next: follow-up PR `fix/V3-followup` (devops): the 3 nits (ci.yml image build `shell: bash`; deploy.sh:129-147 non-fatal cleanup after state is written; rollback.md:15 / rollback.sh:20-21 usage strings + unknown-argument error) and make the weekly `audit` job green (compare with the PR `security` job scope; pnpm overrides / bump vitepress / size-limit). Then #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 follow-up PR
Did: devops opened PR #7 (`fix/V3-followup`): ci.yml `shell: bash` on image build; deploy.sh cleanup non-fatal after state is written; rollback usage strings + unknown-argument error; weekly audit fixed by swapping `@size-limit/preset-app` for `@size-limit/file` 14.3.0 and overriding `vitepress>vite` to 6.4.5 (`pnpm audit --audit-level high` exits 0, one moderate left). CI 8/8. Not merged. Details: ../bm-runs/V3-followup.md.
Tokens: devops 62k.
Next: reviewer (Sonnet) checks #7, squash merge, staging deploy green, run `weekly` once (expect audit green), remove worktree D:/Projects/bm-wt/V3-followup. Then #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 follow-up review
Did: Sonnet reviewer APPROVED PR #7 at f57e08b (posted as a PR comment; details ../bm-runs/V3-followup-review.md). All 4 nits and the weekly audit fix verified (size-limit 118 kB of 200, frozen install OK, `pnpm audit --audit-level high` exits 0). 2 non-blocking nits: 09-TESTING.md and docs/overview/repo-map.md say gzip but size-limit reports brotli; a failed `install_bin` in deploy housekeeping is only a WARN.
Tokens: reviewer 56k.
Next: squash merge #7 (merge main first if behind), check the staging deploy runs the new deploy.sh cleanup, run `weekly` once (expect audit green), remove worktree D:/Projects/bm-wt/V3-followup, fix the gzip/brotli wording. Then #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 follow-up merged
Did: `gh pr merge 7 --squash` -> a2f17a7 on main (CI 8/8 on f57e08b, CLEAN). Local main had diverged on PROGRESS-only commits; reset to origin/main and re-applied PROGRESS.md.
Next: check staging deploy 42518261355 green, run `weekly` once (expect audit green), remove worktree D:/Projects/bm-wt/V3-followup, gzip/brotli wording fix. Then #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 follow-up staging verified
Did: staging deploy run 42518261355 (a2f17a7) all jobs green (meta, 4 image builds, sentry-release, deploy). The ci run 42518261300 shows cancelled (superseded/concurrency, not a failure).
Next: run `weekly` once (expect audit green), remove worktree D:/Projects/bm-wt/V3-followup, gzip/brotli wording fix (09-TESTING.md, docs/overview/repo-map.md). Then #4 V2 review, #5 V4.

### 2026-11-09 — Claude (lead) — V3 follow-up closed
Did: ran `weekly` (run 42518815701): `audit` and `restore-drill` both GREEN. Removed worktree D:/Projects/bm-wt/V3-followup and local branch fix/V3-followup.
Next: fix gzip/brotli wording (09-TESTING.md, docs/overview/repo-map.md). Then #4 V2 review, #5 V4 (merge main first).
