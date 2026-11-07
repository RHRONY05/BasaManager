# Brief V1-docs (for: docs subagent)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/10-LEARNING.md` (in full), `.claude/skills/visual-diagram/SKILL.md` (BasaManager override first), and the **merged V1 code** in your worktree (the code is the truth, not the briefs): `apps/api/src/**`, `apps/worker/src/**`, `apps/web/src/**`, `packages/shared/src/**`, `infra/compose.*.yml`, `.github/workflows/ci.yml`, root configs, `tests/**`.

## Goal
The VitePress docs site skeleton with the full site structure from 10-LEARNING (stub pages where the feature doesn't exist yet), the `docs:check` script, and the V1 learning pages written from the real code.

## Scope — files you may create or change
- `docs/**` (content + `docs/.vitepress/config.ts` + theme files for the diagram palette), `apps/docs/**`
- `scripts/docs-check.mjs`
- `.agent/02-ARCHITECTURE.md` only to correct the docs folder layout if VitePress needs `.vitepress/` inside `docs/` (it does when building `../../docs`); `.gitignore` docs cache/dist paths to match.

## Build
1. VitePress (1.6.4) + `vitepress-plugin-mermaid` (2.0.17, `withMermaid`), local search, sidebar per section (Overview, Concepts, Features, Operations, Decisions, Reference), the diagram pastel palette from `visual-diagram` applied to Mermaid `themeVariables`. Build command is `pnpm --filter @bm/docs build` (runs `vitepress build ../../docs`).
2. Site structure exactly as 10-LEARNING "Site structure". Every concept and feature page listed there exists: features as **stubs** containing all 15 template headings with "Written in task Vn" under each (n from 08-TASKS); concepts as stubs with their standard sections and "Written in task Vn".
3. Written now (complete, from the code): `index.md`, `overview/repo-map.md`, `overview/request-lifecycle.md` (with an SVG diagram of the middleware chain as it exists in `apps/api/src/app.ts` today), `concepts/testing-strategy.md`, `concepts/environments.md` (first version: dev/test from compose + env files; staging/prod marked "from V3"), `concepts/logging.md` (pino-http redaction list from the code), `decisions/ADR-001-monorepo.md`, `learning-path.md` (ordered checklist; first steps point at the pages that exist).
4. `scripts/docs-check.mjs` (Node, no new deps): after the build, verify (a) every feature in 10-LEARNING has a page containing all 15 headings, (b) every `.svg` referenced from a page exists, (c) every repo path in a code walk / link to the repo exists (paths like `apps/api/src/app.ts`; ignore `http(s)://`), (d) VitePress reports no dead links (set `ignoreDeadLinks: false`). Exit 1 with a list on failure.
5. Render every SVG you add with a headless browser screenshot (the `chrome-devtools` MCP or Playwright) and look at it: no overlaps, arrows visible. Screenshots go to your scratch folder, never the repo.

## Must pass
`corepack pnpm docs:check` green.

## When done, reply with
Files written, the docs:check output, and anything in the code that looked wrong or undocumented.
