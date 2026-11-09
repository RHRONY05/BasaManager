# 11 — The agent team

How BasaManager is built: who does what, on which model, and what must be true before anything merges. This doc is also the **experiment**: the lead records metrics so the owner can judge what the agents could and couldn't do.

**History.** Owner decision 2026-11-09: Antigravity leads, one session per goal. Two days with a Claude lead relayed through a script used 4-5 five-hour Claude windows without finishing V5, mostly on repeated session start-up and CI waiting. That script is gone.

## Principles
1. **The plan is the contract.** Agents build what `.agent/` says. A gap in the docs is fixed in the docs first, then built. Nobody improvises product or design decisions.
2. **Writer ≠ reviewer, from different model families.** Gemini writes the code and Claude checks it. For critical logic, Claude writes the tests *before* the code, so they are an independent check.
3. **CI is the referee.** Nothing merges to `main` with a red check or without Claude's `VERDICT: APPROVE`.
4. **Small, isolated units.** One task = one branch = one PR. Parallel agents each get their own worktree and never touch the same files.
5. **Secrets stay with Claude DevOps.** Antigravity never reads `BasaManager.env` and never runs deploys.
6. **Evidence, not claims.** "Done" means test output, screenshots and the PR link, attached to the PR.
7. **Claude is the scarce resource.** Each call must have a clear job and name exactly what to read. Waiting, polling and routine fixing never use Claude.

## Roles
| Role | Runs as | Does |
|---|---|---|
| **Lead and builder** | Antigravity session, Gemini 3.8 Flash (High), started by the owner with `/goal` (`.agent/GOAL.md`) | Everything not listed below: routine tests, backend, frontend, e2e, learning docs, fixes, PRs, CI waiting, merges, `PROGRESS.md`, `METRICS.md`, release tags |
| **Test designer** | Claude, Sonnet 5.5 | Failing tests first for critical logic |
| **Reviewer** | Claude, Sonnet 5.5, or Opus 5.5 for critical areas | Two-pass review of every PR; on critical areas, also tries to break it |
| **Bug hunter** | Claude, Sonnet 5.5, or Opus 5.5 for goals 1 and 3 | One hunt at the end of each goal |
| **Debugger** | Claude, Sonnet 5.5 | Only when the same failure survives 3 Gemini rounds |
| **DevOps** | Claude, Sonnet 5.5 | Secrets, the VM, DNS, failed deploys, anything needing `BasaManager.env` |

**Critical areas:** auth, sessions, permissions/RLS, migrations, billing, allocation, payments, file access, account deletion.

Antigravity uses Gemini 3.8 Flash (High) for its own work. Schema and migration work is done by the lead and reviewed by Opus. The design is done (V2): follow `design/` and make no design decisions.

## Parallel agents
The lead may run up to **3 Gemini agents at once** when it saves time. It decides this per task, and one agent is fine when the work is small or tightly connected.

- **When:** parts that don't touch the same files, such as backend, frontend and e2e, once the shared contracts (schema, `packages/shared`) are committed on the task branch. Tasks in a goal stay in order unless they don't depend on each other.
- **Setup:** each part gets `git worktree add ../bm-wt/<task>-<part> -b feat/<task>-<part>` from the task branch. `scripts/ports.mjs` gives each worktree its own test database and dev ports, so they never collide.
- **Finish:** the lead merges the parts into the task branch, removes their worktrees, and runs the full verify itself. Each task still ends in one PR with one Claude review.
- **Claude stays one call at a time.** Three Opus runs at once used up a 5-hour window on 2026-11-08.

## Calling Claude
Run the `claude` command in the task's worktree, in the terminal, one call at a time. It starts fresh and knows nothing of this session, so name the task, PR and docs in the prompt. Save the output to a file and read that file; don't paste it into the conversation.

```bash
# Explicit Opus 5.5 (medium effort):
"" | claude -p "<prompt>" --model claude-opus-5-5 --effort medium --permission-mode bypassPermissions > D:/Projects/bm-runs/<task>-<job>.md 2>&1

# Explicit Sonnet 5.5 (medium effort):
"" | claude -p "<prompt>" --model claude-sonnet-5-5 --effort medium --permission-mode bypassPermissions > D:/Projects/bm-runs/<task>-<job>.md 2>&1

# Note: Omitting --model defaults directly to claude-opus-5-5. In PowerShell, piping empty stdin ("" | claude ...) prevents stdin wait delays.
```

A call can take 30 minutes or more, so give the terminal command a timeout of at least 60 minutes. If it runs in the background, wait for it to finish; never start a second copy of the same job.

| Job | When | Model | Prompt |
|---|---|---|---|
| Tests first | Critical task, before the code | claude-sonnet-5-5 | `Follow .claude/agents/test-designer.md for task <V#>. Commit the failing tests on this branch and push. Report under 15 lines.` |
| Review | PR is CI-green | claude-opus-5-5 if the diff touches a critical area, else claude-sonnet-5-5 | `Follow .claude/agents/reviewer.md and review PR #<n> for task <V#>. On critical areas also try to break it, with a throwaway probe you delete afterwards. Post the result with gh pr review --comment. Do not change code or merge. The last line of your final message must be exactly VERDICT: APPROVE or VERDICT: CHANGES.` |
| Bug hunt | Last task of a goal is merged | claude-opus-5-5 for goals 1 and 3, else claude-sonnet-5-5 | `Bug hunt for BasaManager goal <n>, tasks <V#–V#>. Read AGENTS.md and .agent/rules/basamanager.md, then the code merged for those tasks. Look for real defects: broken authorisation or tenant isolation, wrong money maths, missing error handling, tests that prove nothing. Change no code. Open one GitHub issue per confirmed bug, labelled bug-hunt, with file, line, how it fails and the fix, at most 10. Report under 15 lines.` |
| Debug | Same failure after 3 rounds | claude-sonnet-5-5 | `Follow .claude/agents/debugger.md. <Exact failing output and what was tried.> Find the root cause and fix it on this branch, with a regression test. Report under 15 lines.` |
| DevOps | Needs secrets, VM or a failed deploy | claude-sonnet-5-5 | `Follow .claude/agents/devops.md. <Exact request.> Open a PR for any repo change and do not merge it. Report under 15 lines.` |

**If Claude is unavailable.** If the file ends with "You've hit your … limit · resets <time>", no Claude review can happen until then. Carry on with work that doesn't need Claude, and don't merge anything that needs its approval. When nothing else is left, wait until the reset time and call it again. If it says "Not logged in", add a Human step and tell the owner. Never replace a Claude check with your own opinion, or with an Antigravity Claude model.

Fix bug-hunt issues in one PR with "Closes #n" lines, reviewed like any other.

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
