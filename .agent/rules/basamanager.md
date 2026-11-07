# BasaManager — always-on rules

Every agent (Claude or Antigravity) follows these. If a rule conflicts with a task or a skill, **the
rule wins**. The lead decides how to resolve it and logs the decision in PROGRESS.md.

## Workflow
- Start every session by reading `AGENTS.md` and `.agent/PROGRESS.md`. Implementers also read the brief they were given and the docs it lists.
- Work only on what the brief/task says. Don't invent features that aren't in `01-PRODUCT.md`; never build anything on its "Out of scope" list.
- If docs are missing or contradict each other: implementers stop and report it in their final output; the lead decides (simpler option), fixes the doc, logs it under "Decisions made during the build".
- **Definition of done** (per PR):
  - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e` (affected specs locally, all in CI), `pnpm docs:check` pass.
  - The task's AC are checked in a real browser at **1440×900** and **390×844**, against the matching `design/` file (light + dark), with screenshots attached to the PR (plus **360** wide for mobile).
  - UI work follows `.claude/skills/mobile-layout-qa` and `.claude/skills/ui-states`: `layout.spec.ts` (0 violations at 320–768 with stress content + `en-XA`) and `states.spec.ts` green for the touched routes.
  - The feature's learning docs are written/updated per `10-LEARNING.md`, diagrams rendered and looked at.
  - No `console.log`, no commented-out code, no `any`/`as` casts without a comment saying why, no TODO without a task line.
  - Reviewer approved. PROGRESS.md session entry + METRICS.md rows. Conventional commit (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`, `infra:`).
- Never force-push to `main`, never merge red CI, never skip hooks.

## Docs follow code
The `.agent/` pack and `docs/` describe the app **as it is**. Any change updates the owning doc **in the same commit**:

| You changed | Update |
|---|---|
| a feature, a limit, scope | `01-PRODUCT.md` |
| a dependency, folder, env var, infra | `02-ARCHITECTURE.md` (+ `.env.example`, README) |
| a table, column, constraint, policy, role | `03-DATABASE.md` (+ `pnpm db:docs`) |
| a route, event, job, input/output, error code | `04-API.md` |
| a page's behaviour, copy, shortcut | `06-UI.md` |
| a billing rule, formula, example | `07-BILLING.md` (and its test) |
| a test file/case/target | `09-TESTING.md` |
| how a feature works, where its data lives, its edge cases | `docs/features/<feature>.md` and its diagrams |
| team process, models, skills | `11-AGENT-TEAM.md` |
| a decision the docs didn't cover | PROGRESS.md "Decisions" **and** the doc above |

A change outside a task gets a line under "Changes outside tasks" in `08-TASKS.md`. Edit docs in place; history lives in git.
Never change design or scope to match drifted code: fix the code. When unsure, run `/sync-docs`.

## Database
- Only the architect changes `schema.prisma` and migrations. Every change is a migration; never edit an applied migration; expand → contract (02).
- Every org-owned table: `org_id`, RLS enabled + forced + policy (the RLS test enforces it).
- All app queries on org tables go through `db.$tx(ctx, …)`. Multi-step writes are one transaction; lock the lease row (`for update`) before money changes.
- Money is integer poisha. Never floats, never `Number(x) * 1.05` on money: use `packages/domain/money`.
- Tests run against migrations (`prisma migrate reset`), **never** `prisma db push`.

## Security
- Validate every boundary input with the shared Zod schema. Return `NOT_FOUND` for "exists but not yours".
- Authorisation is checked in the service for every resource (membership + role + building/lease scope), even when RLS would also stop it.
- Never log secrets, tokens, cookies, passwords, file URLs or request bodies of auth/files/payment routes.
- No raw SQL with string concatenation (`$queryRaw` with tagged templates only).
- Payment state changes **only** from the validated IPN or the re-check job, never from the browser return.
- Files: sniff type, size limit, `type: authenticated` uploads only, expiring signed URLs only (never store or log them).

## Secrets
- Never commit secrets. `.env.example` lists names only. `BasaManager.env` is read only by the Claude DevOps agent; `agy` sessions never get it and never run deploy scripts.
- Never print a secret value anywhere (presence by length only).
- Generated secrets: CSPRNG, stored only in GitHub Environment secrets and VPS `.env` (mode 600).

## Infrastructure
- Only touch resources this project created: resource group `rg-basamanager`, DNS records named `basamanager*` on `rhrony05.me`, the Cloudinary folder `basamanager/` (never other folders in that account), the Azure storage account in `rg-basamanager`, Sentry projects `basamanager-*` (created by the owner; agents only send events and releases), GitHub repo `RHRONY05/BasaManager`.
- Never delete the VM, the resource group, DNS records you didn't create, or Cloudinary assets outside `basamanager/`. Never upgrade any plan. Anything that costs money → Human step.
- Prod deploys only from a `v*` tag after staging smoke tests pass.

## Code style
- TypeScript strict, ESM. Modules: `routes → controller (HTTP only) → service (rules, transactions) → prisma`. Controllers never touch Prisma.
- Pure logic in `packages/domain` with unit tests; time via `clock.now()`; no `Date.now()` / `new Date()` in domain or services.
- Web: data fetching only through TanStack Query hooks in `lib/api`; forms with react-hook-form + shared Zod schemas; every string through i18n (`t('…')`), no hard-coded user-facing English in components.
- **Do not design.** Layout, colours, spacing, type and copy come from `.agent/design/`. Tokens only (token lint = 0 errors). Use shadcn components restyled by tokens, not new ad-hoc ones.
- New runtime dependency not in `02-ARCHITECTURE.md` → only with a PROGRESS.md decision line by the lead.

## Quality bar
- Every async action: idle / loading (disabled) / success / error with retry. Nothing fails silently.
- Visible focus, labelled icon buttons, AA contrast, touch targets ≥ 44 px, `prefers-reduced-motion` respected.
- Pages work on a cheap Android phone on 4G: route-level code splitting, images sized, no blocking third-party scripts.
