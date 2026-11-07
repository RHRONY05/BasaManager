# PROGRESS — the project's memory

**Every agent reads this first and updates it before ending any session.**
`08-TASKS.md` is the *plan* (what to build). This file is the *state* (where we are).

---

## Now
| | |
|---|---|
| **Phase** | Planned. `/project-config` done; Builder setup all ✅ |
| **Next task** | Owner pastes GOAL.md into the lead session |
| **Blocked on** | — |
| **Production URL** | — (will be https://basamanager.rhrony05.me) |
| **Last updated** | 2026-11-08 by Claude (lead, /project-config) |

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
