---
name: frontend-design
description: Design-system phase (tokens). Dual-path palette & typography discovery via ui-ux-pro-max, anti-slop creative direction, an interactive Theme Studio where the USER chooses palette, fonts, role swaps, shape, depth and motion, WCAG contrast validation, and export of one centralized token file (color, type, spacing, radius, shadow, motion). Hands off to design-canvas for screen design.
---

## BasaManager override (read first — wins over everything below)
- **Not used as a workflow** (its Theme Studio needs a human picking colours). The designer may read `references/token-role-reference.md` for token names and `references/contrast-utils.md` for WCAG checks. Ignore every approval step.


# Frontend Design — Visual Direction & Token Architecture

Use this skill **after** `plan-project` (`docs/frontend-plan.md` exists) and **before** `design-canvas`.

```
plan-project ──► frontend-design ──► design-canvas ──► frontend-implementation
                 (YOU ARE HERE:       (screens on a      (code)
                  tokens)              canvas)
```

This phase decides **how things look** (the token system). It does not decide layouts — that is `design-canvas`.

**Core principle:** the user chooses; the agent curates, explains and validates. Never pick the final palette or font yourself.

---

## Step 1: Research — Palette & Typography Discovery

Run the `ui-ux-pro-max` search tool (it lives in that skill's folder: `<skills-dir>/ui-ux-pro-max/scripts/search.py`, e.g. `~/.gemini/config/skills/...`, or `.agents/skills/...` if the project has a local copy):

```bash
# Palette + font + style recommendations for the product
python <skills-dir>/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system -p "<ProjectName>"

# Targeted follow-ups
python <skills-dir>/ui-ux-pro-max/scripts/search.py "<keywords>" --domain color
python <skills-dir>/ui-ux-pro-max/scripts/search.py "<keywords>" --domain typography
python <skills-dir>/ui-ux-pro-max/scripts/search.py "<keywords>" --domain style
```

Curate **6–8 palette options** and **4–6 font systems** as structured data.

### Palette requirements
- **Balanced light/dark:** at least **3 light** and **3 dark** palettes, tagged `mode: 'light' | 'dark'`. Never default to dark-only.
- **Semantic role mapping:** every hex value is assigned to a role (`bgCanvas`, `bgSurface`, `bgCard`, `bgCardHover`, `textPrimary`, `textSecondary`, `textMuted`, `accentPrimary`, `accentSecondary`, `btnPrimary`, `btnHover`, `btnText`, `borderSubtle`, `borderFocus`, `stateSuccess/Warning/Error/Info`). See `references/token-role-reference.md`.
- **Tinted neutrals:** greys lean toward the palette's hue (warm palette → warm greys).
- **State colors** differ from each other in lightness (not hue only) and never look like the accent.
- **If the product needs dark mode**, each light palette option includes its dark counterpart (designed, not just inverted).

### Typography requirements
- **Harmonious DNA:** no jarring cross-classification pairings (e.g. a high-contrast Didone with a neo-grotesque).
- **Allowed structures:**
  1. **Single-family scale** — weight/tracking contrast within one family (Outfit 800 + 400).
  2. **Harmonious superfamily** — shared DNA (Barlow Condensed + Barlow, IBM Plex Sans + Plex Serif).
  3. **Matched inscriptional/book serifs** — shared x-height and rhythm (Cinzel + Lusitana).
- **Multiscript products** (e.g. Bangla + English): every option names the matching script font (Hind Siliguri, Noto Sans Bengali, Anek Bangla…) and is previewed with real text in both scripts.
- **Anti-default:** don't lead with reflex fonts (Inter, Roboto, Arial, Poppins, Montserrat, Open Sans). They may appear as one option if they genuinely fit — the user decides.

### Direction options
Alongside palettes and fonts, propose **2–3 named visual directions** (e.g. "Warm neighbourhood café", "Quiet editorial", "Bold street-food") with a one-line rationale each. The chosen direction guides the shape/depth/motion defaults and becomes the starting point of `design/brief.md` in `design-canvas`.

If `ui-ux-pro-max` is unavailable, curate manually (Color Hunt, Coolors, Realtime Colors, Google Fonts) — still mapped to semantic roles, never raw hex lists.

**Present the curated options. Wait for the user's initial direction before building.**

---

## Step 2: Build & Launch Theme Studio

Build the interactive Theme Studio **as a dev-only route** in the app — read `references/theme-studio-spec.md` for panels, placement and build order.

**Mandatory acceptance checklist (all required):**
1. **Decoupled controls:** palette, typography and shape/motion are separate state (`activePalette`, `activeFont`, `activeShape`). Changing one never resets another.
2. **Role swap + constrained shuffle:** Panel 3 lets the user deliberately **swap role pairs** (e.g. primary ↔ secondary accent, canvas ↔ surface) and **shuffle within role groups** (backgrounds with backgrounds, accents with accents), recalculating contrast instantly, with **Reset**. Swaps that break critical contrast are flagged (see spec).
3. **Light/dark balance:** palette picker shows both modes with clear badges.
4. **Contrast dashboard (non-negotiable):** live WCAG 2.1 AA/AAA checks — see `references/contrast-utils.md`.
5. **Interactive component showcase:** real components in all states reacting live to every token change.
6. **Shape, depth & motion panel:** the user picks radius personality, shadow style, density and motion personality, previewed live.

**Present the Theme Studio to the user for exploration.**

---

## Step 3: User Approval Gate

The user:
- Picks a palette (and optionally edits swatches or swaps roles)
- Picks a font system
- Picks shape, depth, density and motion personality
- Reviews the contrast dashboard — **every critical check must pass**
- Previews components in all states, in light and (if used) dark

**Do NOT proceed until the user explicitly approves.**

---

## Step 4: Export & Document

1. **Write ONE token file** — the single source of truth — e.g. `frontend/src/styles/tokens.css` (Vite/React) or `src/app/tokens.css` (Next.js). Shape: `<skills-dir>/design-canvas/assets/tokens.template.css`.
   - Contains **only**: the Google Fonts `@import`, `:root { … }` variables, and `[data-theme="dark"] { … }` overrides. No resets, no Tailwind directives — so plain HTML artboards in `design-canvas` can load the very same file.
   - CSS variable names = kebab-case of the role names: `bgCanvas` → `--bg-canvas`, `textPrimary` → `--text-primary`, `btnText` → `--btn-text`.
   - Includes non-color tokens: `--font-*`, `--text-*` scale, `--weight-*`, `--leading-*`, `--tracking-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--dur-*`, `--ease-*`, `--z-*`, `--touch-min`, `--container-max`, `--focus-ring`, `--scrim`.
2. **Import it** from the app's global stylesheet (`index.css` / `globals.css`: `@import "./styles/tokens.css";`).
   With **Tailwind v4**, map tokens inside `@theme` (e.g. `--color-bg-canvas: var(--bg-canvas);`) so utilities resolve to tokens; with **Tailwind v3**, map them in `tailwind.config` `theme.extend`. Never put raw values in the Tailwind config.
3. **Save `docs/design-tokens.md`:**
   - Chosen direction, palette name and every role → hex (light and dark)
   - Role swaps applied (if any)
   - Font system (display + body + script fallback) and type scale
   - Shape / depth / density / motion choices and their token values
   - Contrast results table (pass/fail)
4. **Bridge:**
   > "Your design system is locked in. Next, use the `design-canvas` skill to design the actual screens (mobile and desktop) on a canvas and approve them **before** any page code is written. After that, `frontend-implementation` builds the approved screens."
