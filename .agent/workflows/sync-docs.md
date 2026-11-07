---
description: Audit the .agent/ pack and docs/ against the code and fix every place where they disagree
---

Use when a session starts after many fixes, before each milestone tag, or when the owner asks.

1. Read `AGENTS.md`, `.agent/rules/basamanager.md` ("Docs follow code") and `.agent/PROGRESS.md`.
2. Find what changed since the last `docs: sync` commit: `git log --oneline`, "Changes outside tasks" in `08-TASKS.md`, "Decisions" in PROGRESS.md.
3. Compare each owner doc with the code:
   - **Data:** `apps/api/prisma/schema.prisma` + migrations vs `03-DATABASE.md`; regenerate `pnpm db:docs`.
   - **API:** routes + `packages/shared/src/api/*` vs `04-API.md` (paths, inputs, outputs, codes, events, jobs).
   - **UI:** pages vs `06-UI.md`. **Billing:** `packages/domain` vs `07-BILLING.md` (examples must still equal the tests).
   - **Tests:** `tests/**`, `*.test.ts` vs `09-TESTING.md`. **Stack/env/infra:** `02-ARCHITECTURE.md`, `.env.example`, README, `infra/`.
   - **Learning docs:** every code path in `docs/features/*` code walks exists; diagrams match the flow; data-lifecycle sections match 03.
4. Classify each difference: doc stale → fix the doc; code wrong → bug task (fix now if small); unclear → lead decides and logs.
5. Run `pnpm test:all` if a billing example changed. Commit `docs: sync docs with code (<n> fixes)` + PROGRESS.md entry.
6. Report a table `doc · what was stale · now says`, then bugs found.
