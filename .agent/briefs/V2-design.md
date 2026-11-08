# Brief V2-design (for: designer subagent, Opus)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/01-PRODUCT.md`, `.agent/06-UI.md`, `.agent/07-BILLING.md` (for real amounts and line explanations), `.agent/08-TASKS.md` task **V2** (the deliverable list and AC are the contract), your agent file `.claude/agents/designer.md`, `.agent/11-AGENT-TEAM.md` (Skills table: overrides for `design-canvas`, `ui-ux-pro-max`, `frontend-design`), and the skills: `.claude/skills/ui-ux-pro-max` (research), `.claude/skills/design-canvas` (`SKILL.md` + `references/craft.md`, `critique.md`, `motion.md`, `screen-format.md`, `handoff.md` in full; assets + `scripts/shoot.mjs`), `C:\Users\Asus\.claude\skills\plan-for-agent-build\references\design-pack.md` (folder format), `.claude/skills/mobile-layout-qa/SKILL.md`, `.claude/skills/ui-states/SKILL.md`, `.claude/skills/frontend-design/references/token-role-reference.md` + `contrast-utils.md` if present (token naming, WCAG maths).

Work in the git worktree `D:\Projects\bm-wt\V2-design` (branch `feat/V2-design`). Commit there (Conventional Commits, `design:` or `docs:`), don't push.

## Goal
`.agent/design/` complete per 08-TASKS V2: brief, tokens (light + dark), kit, README, gallery, states sheet, and every listed screen at 1440 and 390 (plus 360/320 audit runs and stress variants), critiqued to threshold. After this, implementers copy your tokens and match your artboards exactly, so **name tokens for implementation**: they become `apps/web/src/styles/tokens.css` (replacing the V1 placeholder) and are exposed through Tailwind v4 `@theme` (see `apps/web/src/styles/globals.css` and the placeholder `tokens.css` for the names V1 already uses — `--size-tap`, `--size-bottom-nav`, `--width-content`, etc.; keep or deliberately rename them and say so in README).

## Decisions are yours
No human approval gate. Wherever a skill says "ask the user", decide and write the reason in `brief.md`. After your critique loop passes, the lead sends your output to the **reviewer agent (Opus)** for a design review against 06-UI behaviour and accessibility; you'll get its findings to fix.

## Constraints that already exist (don't fight them)
- Shell layout from 06-UI Global (sidebar ≥ md; top bar + bottom tab bar ≤ 5 items on mobile; tenant column ≤ 720 px on desktop).
- Icons: `lucide` (the web app uses `lucide-react`). Fonts: one Latin family + a matching Bengali family (loaded, unused for now), both from Google Fonts with licences noted; self-hostable woff2 later.
- Money format `৳1,25,000` (en-IN grouping), dates `10 Nov 2026`, months `November 2026`.
- The layout audit is `tests/helpers/layout-audit.ts` (`auditLayout(page)`, counts **text-node** lines). Run it on every mobile artboard at 390/360/320 via `shoot.mjs` or a small Playwright script; 0 violations is the bar. Stress content: `tests/fixtures/stress.ts`.
- No lorem ipsum: real Chattogram names, areas (Nasirabad, Khulshi, GEC, Agrabad, Halishahar), ৳ amounts that add up (use 07-BILLING examples).
- Out of scope items (01-PRODUCT) must not appear on any screen.

## Output
Everything under `.agent/design/` (plus screenshots of your own checks in your scratch folder, never the repo). `README.md` must say how to open the gallery, list every artboard file with its route from 06-UI, the component map (component → kit class → shadcn primitive), and the token table.

## When done, reply with
The list of files, the critique scores per screen, the `auditLayout` result per mobile artboard × width, contrast results for every text/background token pair (light + dark), and every decision you made (also in `brief.md`).
