---
name: frontend-implementation
description: Production frontend coding standard (Sequential page assembly, asset approval workflow, zero-hardcode token discipline, 4-state async machines, and automated token linting).
---

## BasaManager override (read first — wins over everything below)
- **No user approval gates** and **no `generate_image`** step (this app has no AI-generated images). The reviewer agent replaces "present to the user".
- Inputs: `.agent/design/` (artboards + README component map) and `.agent/06-UI.md`.
- Token lint: `node .claude/skills/frontend-implementation/scripts/lint-tokens.js --quiet` (repo copy, not the `~/.gemini` path). Errors must be 0.
- The 4-state async rule is extended by `.claude/skills/ui-states/SKILL.md` (navigation, skeleton timing, prefetching). Mobile rules: `.claude/skills/mobile-layout-qa/SKILL.md`. Both are mandatory.


# Frontend Implementation & Assembly Standard

Use this skill when turning the approved design into working production frontend code. Inputs, in order of authority:
1. **Approved screens** — `design/canvas.html` + `docs/design-handoff.md` (from `design-canvas`). These are the visual spec: match them 1:1.
2. **Tokens** — the app's token file + `docs/design-tokens.md` (from `frontend-design`).
3. **Plan** — `docs/frontend-plan.md` (screen inventory, flows, data).

If a screen has no approved artboard, say so and suggest designing it in `design-canvas` first; for minor screens, build it from existing kit components and patterns.

---

## 1. Sequential Page-by-Page Workflow (User Flow Order)

**Kit first:** before the first page, build the reusable components listed in `docs/design-handoff.md` → "Kit class → Component map" (buttons, inputs, cards, nav, domain components), each matching the kit artboard in all its states.

Then never attempt to build multiple pages at once. Always proceed sequentially through the user journey defined in `docs/frontend-plan.md` (e.g., Home → Details → Selection → Checkout → Confirmation):

1. **Pick the Next Page:** Identify the current active page in the flow and open its approved artboard(s) — phone and/or desktop.
2. **Decompose Components:** Break down the page into its discrete components (Header, Hero, Grid, Cards, Modals, Action Bar), reusing kit components.
3. **Assemble Through 4 Stages:** Build the page following Section 4.
4. **Approval Gate:** Present the completed page to the user in the browser. **STOP and wait for user approval** before moving on to the next page in the journey.

---

## 2. Zero Hardcoding Rule: Strict Token Discipline

As the blueprint of the project, all frontend code must strictly obey the design tokens:

* **Zero Hardcoded Colors:** NEVER write raw hex codes (`#FFFFFF`, `#121212`), `rgb()`, or `rgba()` in JSX styles or component CSS. Every single color must reference a semantic CSS variable (e.g., `var(--bg-canvas)`, `var(--accent-primary)`, `var(--text-muted)`) or a Tailwind utility mapped to those variables.
* **Zero Hardcoded Fonts:** NEVER declare arbitrary `font-family` strings in components. All typography must inherit from typography tokens (`var(--font-display)`, `var(--font-body)`, `var(--text-*)`, `var(--weight-*)`).
* **Zero Hardcoded Shape/Space/Motion:** spacing, radius, shadows, durations and easings come from `--space-*`, `--radius-*`, `--shadow-*`, `--dur-*`, `--ease-*`. Token names are defined in `frontend-design/references/token-role-reference.md` — don't invent parallel names.
* **Universal Theming Guarantee:** Every element must respond dynamically when the user toggles themes in the Theme Studio without broken contrast or style leaks.

---

## 3. Asset Alignment & Pre-Generation Approval

Never generate images blindly or leave components with broken `<img>` tags or generic gray placeholder boxes:

1. **Asset Inventory Chat:** Before calling `generate_image`, the agent MUST chat with the user and present an asset inventory table:
   | Placement | Asset Type | Aspect Ratio | Visual Concept / Prompt |
   |-----------|------------|--------------|-------------------------|
   | Hero Section | Backdrop Banner | 16:9 | High-budget sci-fi city cinematic lighting |
   | Trending Grid | Movie Poster | 2:3 | Prestige noir detective thriller |
   | Header Profile | User Avatar | 1:1 | Minimalist geometric avatar |

2. **Wait for Approval:** Discuss the list with the user and get explicit confirmation on the asset concepts, dimensions, and quantities.
3. **Generate & Store:** Once approved, generate the assets via `generate_image`, save to `frontend/src/assets/` or `frontend/public/` using descriptive kebab-case names, and provide descriptive `alt` text for each image.

---

## 4. Deterministic 4-Stage Page Assembly

Always build each page sequentially through these 4 distinct stages:

* **Stage 1 (Layout Shell):**
  * Set up routing, page wrappers, max-width containers, and responsive grid/flex scaffolding.
* **Stage 2 (Static Visuals & Real Assets):**
  * Build UI components using static mock props and approved real assets to verify 1:1 fidelity against the approved artboard before wiring data.
  * **Fidelity check:** screenshot the page at the artboard size and compare it side by side with the approved PNG:
    `node <skills-dir>/design-canvas/scripts/shoot.mjs --url http://localhost:<port>/<route> --size 390x844 --out impl__<screen>`
    Differences in spacing, hierarchy or type are bugs. Implement the motion notes from `docs/design-handoff.md`.
  * *(Optional: If the project uses Tailwind CSS or shadcn/ui, consult the `ui-styling` skill for pre-built accessible component primitives, forms, and utility patterns).*
* **Stage 3 (Empty & Loading States):**
  * Implement shimmer skeletons (`@keyframes skeleton-shimmer`) matching the exact layout of actual content cards.
  * Design clean, informative empty-state views (e.g., "No active bookings yet" with a primary call-to-action button).
* **Stage 4 (Action & API Wiring):**
  * Connect services, context, or custom hooks to the live backend (or mock service layer).
  * Enforce state machines on all interactive controls.

---

## 5. Mandatory 4-State Async Interaction Machine

Every asynchronous network call (fetch, form submit, payment, button click) MUST handle 4 explicit UI states:

1. **Idle:** Normal interactive button, link, or form field.
2. **Loading:**
   * Button is immediately `disabled` with an inline spinner or loading label.
   * Prevents accidental double-clicks or duplicate requests.
3. **Success:**
   * Visible confirmation (toast alert, checkmark animation, modal transition, or updated badge).
4. **Error:**
   * Human-readable error banner or toast explaining what failed (never silent `console.error` alone).
   * Provide a retry button or clear actionable recovery step for the user.

---

## 6. Responsive Layout & Semantic HTML (SEO & a11y)

* **Semantic Structure:** Use `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, and native `<button>` tags (avoid `div` soup for interactive elements).
* **SEO Heading Hierarchy:** Exactly one `<h1>` per page for search engines, followed by logical `<h2>`/`<h3>` tags.
* **Mobile-First Responsiveness:** Use fluid containers (`max-width`, `minmax()`, `flex-wrap`) so layouts naturally flow from 375px mobile screens up to desktop without horizontal overflow.

---

## 7. Quality Gate & Progress Tracking

1. **Token Lint Check:** After implementing or modifying components, run the stack-aware token linter **from the project root** (the agent runs it itself):
   ```bash
   node ~/.gemini/config/skills/frontend-implementation/scripts/lint-tokens.js          # human-readable
   node ~/.gemini/config/skills/frontend-implementation/scripts/lint-tokens.js --quiet  # errors only
   node ~/.gemini/config/skills/frontend-implementation/scripts/lint-tokens.js --json   # machine-readable
   ```
   It auto-detects every frontend package (root, `frontend/`, `client/`, `web/`, `apps/*`, `packages/*`), the framework (Next.js, Nuxt, Vue, SvelteKit/Svelte, Astro, Angular, Solid, React Router/Remix, React/Vite) and styling (Tailwind v3/v4, Sass, Less, CSS-in-JS), then scans that stack's source folders (`.js/.jsx/.ts/.tsx/.css/.scss/.less/.vue/.svelte/.astro/.html`).

   | Rule | Level | Catches |
   |---|---|---|
   | `hardcoded-color` | error | hex / rgb / hsl / oklch outside the token file (CSS values, JS strings, inline styles) |
   | `tw-palette` | error | Tailwind default palette utilities (`bg-white`, `text-gray-500`, `from-black/25`) that bypass tokens |
   | `tw-arbitrary-color` | error | `bg-[#1F120A]` and similar |
   | `hardcoded-font` | error | raw `font-family`, `fontFamily`, `font-['X']` |
   | `inline-px` | error | `style={{ padding: 12 }}` / `'12px'` spacing in inline styles |
   | `img-alt` | error | `<img>` / `<Image>` without `alt` |
   | `clickable-div` | error | `<div onClick>` / `@click` / `on:click` instead of a button |
   | `tw-arbitrary-px`, `raw-px` | warn | off-scale sizes like `text-[13.5px]`, `padding: 13px` |
   | `canvas-color` | warn | canvas `fillStyle = '#…'` — read the token at runtime via `getComputedStyle` |
   | `local-token`, `named-color`, `z-magic`, `raw-duration` | warn | raw custom properties outside the token file, `color: white`, `z-index: 999`, `transition: .3s` |

   Raw colors are allowed only in custom-property definitions inside the token file (`tokens.css`, `globals.css`, `index.css`, or any file with `:root` / `@theme` / `[data-theme]`), in Theme Studio palette data, and in files that can't use CSS variables (`opengraph-image`, `icon`, `manifest`, `themeColor`).
   Genuine exceptions: add `// token-lint-ignore` on (or above) the line, with a reason. **Errors must be 0** before a page is presented; warnings must be fixed or explained.
2. **Update Tracker:** Update the corresponding checklist item in `.agents/project_tracker.md` to record the completed page.
3. **Seek Approval:** Stop and review the completed page with the user before starting the next page.
