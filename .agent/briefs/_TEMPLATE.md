# Brief <task>-<part> (for: <agy gemini-3.8-flash-high | subagent name>)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, and: <exact doc sections, design files>.

## Goal
<one or two sentences: what exists when this is done>

## Scope — files you may create or change
- <paths / globs>
**Do not touch:** `apps/api/prisma/**`, `packages/shared/**` (contracts are fixed), `.agent/**` except PROGRESS notes in your output, infra, CI, anything else not listed.

## Skills to follow
- UI work: `.claude/skills/frontend-implementation`, `.claude/skills/mobile-layout-qa`, `.claude/skills/ui-states` (read the override + rules sections)
- Backend work: `.claude/skills/backend-standards` (override first)

## Contracts to use (already merged)
- Schemas: `packages/shared/src/api/<module>.ts` → <names>
- Routes: `04-API.md` § <section>
- Interface (domain): <function signatures>

## Must pass
- Existing failing tests written for you: <paths> (don't edit them; if one seems wrong, stop and explain)
- Tests you add: <list from 09-TESTING / task>
- Commands: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:int -- <filter>` (+ `pnpm test:e2e -- <spec>` for UI)

## Acceptance criteria
<copied from 08-TASKS, made concrete: input → visible result>

## Do not
- Make design or product decisions; add dependencies; build anything in "Out of scope"; weaken tests; log secrets/bodies of auth/payment/file routes.

## When done, reply with
1. Summary of what you built (files). 2. Test output (last lines of each command). 3. Anything ambiguous you
noticed in the docs. 4. Anything you could not finish and why.
