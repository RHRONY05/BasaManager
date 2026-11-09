# 11 — The agent team

How BasaManager is built without a human after planning: who does what, on which model, how work is
handed over, and what must be true before anything merges. This doc is also the **experiment**:
the lead records metrics so the owner can judge what the agents could and couldn't do.

## Principles
1. **The plan is the contract.** Agents build what `.agent/` says. A gap in the docs is fixed in the
   docs first (by the lead or architect), then built. Nobody improvises product or design decisions.
2. **Writer ≠ reviewer, and preferably different model families.** Gemini writes most code; Claude
   reviews it. For critical logic, Claude writes the tests *before* Gemini writes the code, so the tests
   are an independent check, not code that confirms itself.
3. **CI is the referee.** Nothing merges to `main` with a red check or without reviewer approval.
4. **Small, isolated units.** One task = one branch = one git worktree = one PR. Parallel sessions
   never touch the same files.
5. **Secrets stay with Claude DevOps.** `agy` sessions never get `BasaManager.env` and never run deploys.
6. **Evidence, not claims.** "Done" means test output, screenshots and the PR link, attached to the PR.

## Roles and models
| Role | Runs as | Model | Owns |
|---|---|---|---|
| **Lead / orchestrator** | Main Claude Code session | **Sonnet 5.5** (medium effort, owner decision) | Reads PROGRESS + TASKS, splits each task into briefs, dispatches, merges, tags releases, keeps PROGRESS.md and METRICS.md, escalates |
| **Architect** | Claude subagent `architect` | **Opus 5.5** | Prisma schema, SQL migrations + RLS, `packages/shared` Zod contracts, OpenAPI file. Contracts are frozen before parallel FE/BE work starts |
| **Designer** | Claude subagent `designer` | **Opus 5.5** | Autonomous design in V2: tokens, kit, every screen desktop + mobile, critique loop |
| **Test designer** | Claude subagent `test-designer` | **Sonnet 5.5** | Writes failing tests first for billing, auth, payments, permissions/RLS, allocation (from `07-BILLING.md` examples and `04-API.md` error cases) |
| **Backend implementer** | `agy -p` in a worktree | **Gemini 3.8 Flash (High)** | Express routes, services, worker jobs. Makes the given tests pass and adds the routine ones |
| **Frontend implementer** | `agy -p` in a worktree | **Gemini 3.8 Flash (High)** | Pages and components, exactly to `design/`, token-lint clean |
| **E2E writer** | `agy -p` in a worktree | **Gemini 3.8 Flash (High)** | Playwright specs from the table in `09-TESTING.md` |
| **Reviewer** | Claude subagent `reviewer` | **Sonnet 5.5**; **Opus 5.5** for PRs touching auth, payments, billing, RLS/migrations, file access | Two passes per PR: (1) spec compliance against the task's AC and docs, (2) code quality + security. Approves or requests changes with exact file/line items |
| **Debugger** | Claude subagent `debugger` | **Sonnet 5.5**, escalates to **Opus 5.5** after 2 failed attempts | Red CI, flaky tests, production errors from Sentry. Root cause first, no guess-fixes |
| **DevOps** | Claude subagent `devops` | **Sonnet 5.5** | Azure VM, Docker, Caddy, Cloudflare DNS, GitHub Actions, secrets, backups, deploys, rollback |
| **Docs writer** | Claude subagent `docs` | **Sonnet 5.5** (Opus spot-checks one feature page per milestone against the code) | `docs/` per `10-LEARNING.md`: diagrams, code walks, data lifecycle, self-checks |

**Antigravity is used only with Gemini 3.8 Flash (High).** Never dispatch `agy` with its Claude models.
If the Claude Code quota runs out, the lead records the state in PROGRESS.md and **waits** for it to reset
instead of switching models.

## The loop for one task
```
lead reads 08-TASKS (next task) + PROGRESS
  │
  ├─ 1. brief: lead writes .agent/briefs/<task>-<part>.md per part (backend / frontend / tests / docs)
  │       each brief = goal, files allowed to change, contracts to use, tests that must pass, AC, "do not" list
  ├─ 2. contracts: architect updates schema/contracts if the task needs it → merged first
  ├─ 3. tests first: test-designer writes failing tests for critical logic → committed on the task branch
  ├─ 4. implement: lead creates a worktree and dispatches agy (command below) in the foreground and waits for it
  ├─ 5. verify: lead runs typecheck, lint, unit, integration, e2e for the area itself; failures go back
  │       to the same agy conversation (--conversation <id>) with the exact failing output, max 3 rounds,
  │       then the debugger takes over
  ├─ 6. docs: docs agent writes/updates the feature's learning pages from the final code
  ├─ 7. PR: opened with evidence (test summary, screenshots desktop + mobile, Lighthouse when relevant)
  ├─ 8. review: reviewer two-pass review; changes go back to step 5
  ├─ 9. merge: squash merge when CI is green + approved → staging deploys automatically → smoke tests
  └─ 10. record: PROGRESS.md session entry + METRICS.md row; worktree removed
```

### Dispatching Antigravity (turbo, owner decision 2026-11-08)
```bash
git worktree add ../bm-wt/<task>-<part> -b feat/<task>-<part>
cd ../bm-wt/<task>-<part>
agy -p "$(cat .agent/briefs/<task>-<part>.md)" --model gemini-3.8-flash-high   --dangerously-skip-permissions --output-format json --print-timeout 45m > ../bm-runs/<task>-<part>-1.json
# follow-up: same flags plus --conversation <conversation_id from the JSON>
```
- The lead runs this as a foreground Bash call with `timeout: 3000000` (50 min) and never ends its session while agy runs, so the JSON result always comes back to it. `scripts/autonomous.sh` sets `BASH_MAX_TIMEOUT_MS=3000000` to allow this; a headless session waited 640 s this way on 2026-11-08.
- Turbo probe, 2026-11-08, throwaway worktree, launched by a Claude session outside the relay: agy installed dependencies, ran Vitest, ran a Playwright test against localhost and opened localhost with its Chrome DevTools tool, with no permission prompt (185 s).
- agy runs commands itself (install, typecheck, lint, tests) and fixes its own failures; briefs say so. The lead checks the final result only.
- A worktree does not confine agy: it runs as the owner's Windows user. The owner accepted this to make the build fully autonomous. Briefs still keep agy to its task: no `gh`, `az`, `ssh`, `git push`, deploy scripts or the credentials folder (rules: Secrets).
- Antigravity reads `AGENTS.md` itself; every brief still starts with "Read AGENTS.md, rules/basamanager.md and these docs: …".
- Parallel limit: **3 agy sessions at once**. Each worktree uses its own test database
  (`basamanager_test_<task>`) and its own dev ports (from `scripts/ports.mjs`) so they never collide.
- The JSON result includes token usage; the lead copies it into METRICS.md.
- V0 Preflight proved the whole loop on a throwaway task (create worktree → agy edits files → lead runs the
  test → JSON parsed → follow-up with `--conversation` → worktree removed), 2026-11-08.

## Running without a human (relay, owner decision 2026-11-08)
The owner plans, grants permissions once and checks in; the agents do the rest. One long lead session can't finish the build, because every request re-sends its whole context. So `scripts/autonomous.sh` starts a fresh lead session (Sonnet 5.5 at medium effort, owner decision to save usage; permissions bypassed by the owner's choice) per step until the goal is reached: `scripts/autonomous.sh V5` stops once every task up to V5 is ticked, and with no argument the goal is V17 (everything). The owner can run it in stages (for example V5, then V7, then V10) and start the next stage later. A usage limit only pauses it. The files are the lead's memory: PROGRESS.md, 08-TASKS.md, briefs, git. Opus also stays for the reviews listed above and the architect and designer roles.

## Merge gates (branch protection on `main`)
CI green (lint, typecheck, unit, integration, e2e desktop + mobile, docs build, audit, gitleaks, CodeQL)
· reviewer approval · the learning docs for the feature updated · PROGRESS.md entry. Staging smoke
tests must pass before the lead tags a release; prod deploys only from a tag.

Reviewer approval = the reviewer agent's APPROVE review (or comment) on the PR; it posts from the owner's own
GitHub account, which GitHub does not let approve its own PR, so "required approving reviews" is 0 and the
**lead checks the approval before merging**. Required status checks (CI job names): `lint-typecheck`, `unit`,
`integration`, `e2e`, `docs`, `security` (pnpm audit, gitleaks, CodeQL). The repo was made **public** on
2026-11-08 (owner decision; branch protection needs Pro on private repos), and branch protection on `main` is
**on**: those six checks required and strict (branch up to date), linear history, no force-push, no deletion,
0 required reviews, admins not enforced (so the lead could bootstrap V1). Squash merge only. The lead still
checks the reviewer's APPROVE before merging, since GitHub can't enforce it.

## Escalation (instead of asking the human)
| Situation | Who decides |
|---|---|
| Docs are ambiguous or contradict each other | Lead decides, fixes the doc, logs it under "Decisions made during the build" |
| Same failure after 3 implementer rounds | Debugger (Sonnet), then Opus |
| A task is too big for one session | Lead splits it in 08-TASKS and continues |
| Something costs money or needs a new account | Stop that part, add a Human step, continue with other tasks |
| Destructive action on shared things (DNS records not ours, Cloudinary assets outside `basamanager/`, deleting the VM) | Never. Human step |

## Skills: what each agent gets
The owner's custom skills were reviewed on 2026-11-07 and copied into `.claude/skills/` (so every agent uses
the same pinned version), each with a `## BasaManager override` section at the top. agy briefs point at these
paths (e.g. "follow `.claude/skills/ui-states/SKILL.md`"). **Project docs and rules always win
over a skill.** Each agent gets only its own skills (no skill sprawl).

| Skill | Verdict | Given to | Override for this project |
|---|---|---|---|
| `backend-standards` | ✅ Good baseline (fail-fast startup, env config, Pino, error envelope, transactions, test isolation) | backend (agy brief), reviewer | Validate env with **Zod**, not hand-written checks. Tests run against migrations (fresh DB per run + `prisma migrate deploy`, never `migrate reset`), **never `prisma db push`**, which skips the SQL migrations that hold RLS, so tests would pass on a database unlike prod. **Redact** cookies, tokens, passwords and document URLs from request/response logs; don't log response bodies of auth routes. **No stack traces** in prod error responses. Express 5 forwards async errors itself, so `asyncHandler` is unnecessary. Add **graceful shutdown** (SIGTERM: stop accepting, finish requests, close DB/Redis). Drop the obsolete `@types/pino-http` / `@types/ioredis` |
| `ui-ux-pro-max` | ✅ Data-backed reference | designer | Research only; the designer decides |
| `design-canvas` | ✅ Strong craft rules, critique rubric, `shoot.mjs` checks | designer | Every "wait for user approval" gate is replaced by the critique loop + a reviewer-agent design review. Inputs come from `.agent/` instead of `docs/frontend-plan.md` |
| `frontend-design` | ⚠ Not used as a workflow | — | Built around a Theme Studio where the **user** picks the palette, which doesn't fit autonomous design. The designer may read its `references/token-role-reference.md` and `contrast-utils.md` for token naming and WCAG checks |
| `frontend-implementation` | ✅ Token lint script, 4-state async machine, fidelity screenshots | frontend (agy brief), reviewer | No user approval gates; no `generate_image` asset step (no AI images in this app). Run the repo copy of `lint-tokens.js`, not the `~/.gemini` path |
| `visual-diagram` | ✅ | docs | Repo copy without `disable-model-invocation` |
| `db-docs` | ✅ Generated ER via tbls | architect, docs | Run after every migration |
| `performance-audit` | ✅ | qa / lead (Lighthouse tasks) | Targets from `09-TESTING.md` |
| `generate-qa-review` | ✅ for the final docs pass | docs | Its concept list is from an older project (bcrypt/OTP/Jest); generate questions from *this* codebase |
| `codebase-tutor` | ✅ After the build, for the owner | owner | Set up in the final task |
| `mobile-layout-qa` (project skill, written 2026-11-07) | ✅ Mandatory | designer, frontend + e2e (agy briefs), reviewer | Owner reported recurring mobile bugs (text overflowing boxes, button/nav labels wrapping on two off-centre lines). Build rules + the `auditLayout()` geometry check at 320–768 with stress content |
| `ui-states` (project skill, written 2026-11-07) | ✅ Mandatory | designer (states sheet), frontend + e2e (agy briefs), reviewer | Owner reported pages freezing 5–6 s after a click with no skeleton. Non-blocking navigation, preloading, cache rules, four states, and the slow-network `states.spec.ts` that proves it |
| `playwright` (CLI) | ❌ Not for tests | — | It forbids `@playwright/test`, but our e2e suite *is* `@playwright/test`. Agents use `@playwright/test` + the `chrome-devtools` MCP instead |
| `plan-project`, `plan-for-agent-build`, `document-architecture`, `handoff` | — Not needed during the build | — | Planning is done; `10-LEARNING.md` replaces `document-architecture` |

### No outside skill frameworks
Superpowers (obra/superpowers) was considered and **not adopted** (owner decision, 2026-11-07). Its useful
parts are already in this doc and the agent files (fresh subagent per task, two-stage review, tests first for
critical logic, root-cause debugging, verification before "done"). Its own planning skills would compete with
the `.agent/` pack, and the experiment needs a fixed set of tools. Don't install other skill frameworks or
plugins during the build.

## Metrics (the experiment)
`.agent/METRICS.md`, one row per task part:
`task · part · model · agy/claude · attempts · review rounds · CI failures · tokens (in/out) · wall time · human interventions (and why) · bugs found later`.
At the end the lead writes `.agent/RETRO.md`: what each model did well and badly, where the plan was
insufficient, and what a human would have done differently.
