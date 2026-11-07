---
name: design-canvas
description: High-fidelity screen design phase (between Theme Studio and coding). Generates mobile and desktop UI artboards as token-only HTML on a pan/zoom design canvas, with a design brief, component kit, anti-slop craft rules, motion spec, Playwright screenshot checks, a scored self-critique loop, user approval gates, and a handoff to frontend-implementation.
---

## BasaManager override (read first — wins over everything below)
- **No human approval gates.** Every "present / wait for approval" step becomes: run the critique loop, log the score in `design/review.md`, then the `reviewer` agent (Opus) does a design review. Only the reviewer can set `approved`.
- Inputs come from `.agent/01-PRODUCT.md` and `.agent/06-UI.md` (not `docs/frontend-plan.md`); tokens come from the designer's own choices (no Theme Studio).
- Output folder is `.agent/design/` (format: plan-for-agent-build `references/design-pack.md`); viewports 1440×900 and 390×844, and every mobile artboard is also checked at **360 and 320** wide.
- Apply `.claude/skills/mobile-layout-qa/SKILL.md` to every mobile artboard and `.claude/skills/ui-states/SKILL.md` for state variants.


# Design Canvas — Screens Before Code

Use this skill **after** `frontend-design` (tokens approved) and **before** `frontend-implementation`.
It produces the thing professional teams hand to engineers: approved high-fidelity screens for every key view, in every needed state, on one canvas.

```
plan-project ──► frontend-design ──► design-canvas ──► frontend-implementation
(what & flows)   (tokens: color,     (screens: layout,   (code that matches
                  type, shape,        hierarchy, states,  the approved
                  motion)             motion — approved)  screens 1:1)
```

**Why this phase exists:** tokens decide how things *look*; screens decide *what goes where*. Skipping screens means the agent makes layout decisions while coding — the most expensive place to change them.

---

## Non-Negotiable Rules

1. **Read before acting:** `references/craft.md` (whole file) before Step 1; `references/screen-format.md` before Step 0; `references/motion.md` before Step 2; `references/critique.md` before the first critique.
2. **Tokens only.** No hex/rgb/hsl or raw spacing/font sizes in screens or `kit.css`. Missing value → add a token, tell the user.
3. **Fonts and palette are the user's choice** (from Theme Studio). Never swap them for "better" ones.
4. **Real content, no filler** — no lorem ipsum, no invented stats/testimonials, no "Item 1".
5. **Every screen passes the critique loop** (screenshot + automated checks + scored rubric) before the user sees it.
6. **Approval gates are real:** stop and wait at each gate. Never mark anything `approved` yourself.
7. **One file at a time:** write a screen → add it to `canvas.js` → shoot → critique → fix. Do not write ten screens and check later.
8. **Run the tooling yourself.** The agent executes `shoot.mjs` (and its one-time Playwright setup) on its own — don't ask the user to run it. Tell the user briefly what was installed. Long-running dev servers still follow the project's AGENTS.md rules.

---

## Step 0: Preconditions & Setup

Check these exist; if not, run the missing skill first and stop:
- `docs/frontend-plan.md` with Screen Inventory, User Flows and Components & Wireframes (from `plan-project`).
- `docs/design-tokens.md` and the app's token file (from `frontend-design`), including shape/depth/motion tokens.

Then set up `design/` (see `references/screen-format.md` §1):
1. Copy `assets/canvas.html` → `design/canvas.html` (unchanged).
2. Copy `assets/canvas.js` → `design/canvas.js` and set the title and `themes`.
3. Create `design/tokens.css` as the one-line `@import` bridge to the app token file (or copy `assets/tokens.template.css` if the app has no token file yet, filled with the approved values).
4. Create `design/kit.css` starting from `assets/kit.base.css`.
5. Add `design/shots/` to `.gitignore`.
6. Prepare screenshots: run `node <skills-dir>/design-canvas/scripts/shoot.mjs --check` from the project root.
   It uses the project's Playwright if present; otherwise it installs Playwright **once** into a shared folder (`~/.design-canvas`, no project files touched) and uses the installed Chrome/Edge, downloading Chromium only if no browser works. Only if it reports a failure (e.g. no network), tell the user.

---

## Step 1: Design Brief (Gate 1)

Write `design/brief.md` using `craft.md` §1:
- **Direction** (2–4 words), **three adjectives**, **NOT list** (3 items), **signature element** (exactly one), **voice**.
- **Scope:** which screens get artboards. Default: every screen in the inventory for small apps; for large apps the **key screens** (entry, main task, checkout/confirm, a list, a detail, a settings/admin screen) — others follow the same patterns in code.
- **Devices per group:** phone / desktop / both (from the plan's device targets). Staff/admin tools often need desktop *and* phone.
- **States to design** per screen (craft.md §9).
- **Motion:** personality (from tokens) + 3–6 signature moments (motion.md §5).
- **Assets:** list images needed; use labelled `.ph` placeholders until the asset inventory in `frontend-implementation` is approved.

Optionally run `ui-ux-pro-max` for pattern research (`--domain ux`, `--domain landing`, `--domain web`) — use it for patterns, never to override the approved tokens.

**Present the brief. Wait for approval.**

---

## Step 2: Component Kit (Gate 2)

Build `design/kit.css` and `design/screens/_kit/components.html` (desktop artboard, e.g. 1440 × 2200):
- Every component from the plan's Components & Wireframes, in every state: idle, hover, focus-visible, active, disabled, loading, selected; plus error for fields.
- Base: buttons (primary/secondary/ghost/icon), inputs/select/textarea with labels and errors, chips, badges, cards, list rows, top bar, bottom nav or side nav, sheet/modal, toast, skeletons, empty-state block, `.ph` placeholder.
- Domain components (e.g. menu item card, order ticket, table tile, status stepper).
- The **signature element**, shown once.
- Motion for hover/press/toggle states using motion tokens.

Run the critique loop on the kit sheet. **Present it. Wait for approval** — screens reuse it, so fixing it later is expensive.

---

## Step 3: Screens, Group by Group (Gate 3 per group)

For each group in user-flow order, for each screen in flow order:
1. Copy `assets/screen-template.html` → `design/screens/<group>/<screen>.html`.
2. Compose the screen from kit classes; screen `<style>` holds layout only.
3. Add the entry to `design/canvas.js` with `status: "draft"` and size.
4. Run the **critique loop** (`references/critique.md`): shoot → fix errors → look at PNG → score → fix, max 3 rounds. Log in `design/review.md`.
5. Set `status: "review"`.

**Phone + desktop groups:** finish the phone artboard first, then create the desktop artboard as a **recomposition** (craft.md §10), not a stretched phone layout.

After the group is done: present it (critique.md §5). **Wait for approval** before the next group.

---

## Step 4: States & Motion Pass

For screens whose brief lists extra states, add variant files (`<screen>--empty.html`, `--loading.html`, `--error.html`, …) right after their main artboard in `canvas.js`.
Write motion notes on each screen's `note` (motion.md §4 format). Run the critique loop on variants too.

---

## Step 5: Final Review (Gate 4)

1. Run `shoot.mjs design` on everything; resolve any errors.
2. Tell the user to open the canvas (screen-format.md §7) and review end-to-end.
3. Apply requested changes through the critique loop.
4. All screens `approved` → continue.

---

## Step 6: Handoff

Follow `references/handoff.md`: write `docs/design-handoff.md` (screen→route map, kit→component map, motion spec, decisions), update `.agents/project_tracker.md`, and bridge to `frontend-implementation`.

---

## Files in This Skill

| Path | Purpose |
|---|---|
| `references/craft.md` | Design rules: direction, hierarchy, spacing, type, color, depth, icons, content, states, mobile vs desktop, anti-slop list |
| `references/motion.md` | Motion tokens, rules, standard micro-interactions, how to spec motion |
| `references/screen-format.md` | Folder layout, token bridge, kit.css, sizes, screen template rules, canvas.js manifest, viewing |
| `references/critique.md` | Automated checks, visual rubric, scoring threshold, review log, user review |
| `references/handoff.md` | design-handoff.md template and implementation rules |
| `assets/canvas.html` | Pan/zoom canvas viewer (reads `canvas.js`) |
| `assets/canvas.js` | Manifest starter |
| `assets/screen-template.html` | Artboard starter |
| `assets/kit.base.css` | Reset + base component classes using tokens |
| `assets/tokens.template.css` | Token file shape (only when the app has none yet) |
| `scripts/shoot.mjs` | Playwright screenshots + automated design checks → `design/shots/report.md` |
