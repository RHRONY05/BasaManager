# Theme Studio — Panel Architecture & Build Order

The Theme Studio is an interactive design-system playground where the **user** chooses the look.
The agent builds it as a feature (`features/theme-studio/`) with a dedicated route.

## Placement: Dev-Only

Theme Studio is tooling, not product. It must never ship to production users.
- **Vite/React:** register the route only when `import.meta.env.DEV` is true.
- **Next.js (App Router):** `src/app/(dev)/theme-studio/page.tsx` that calls `notFound()` when `process.env.NODE_ENV === "production"`.
- Match the project's language (`.tsx` if the project uses TypeScript).
- Theme Studio code may contain raw hex values in its **palette data files** (that's the data being chosen); its own components still use tokens.

**Adaptability:** not every project needs every panel. Assess complexity from `docs/frontend-plan.md`. A simple portfolio might need Panels 1, 2, 4, 5. Panel 2 (Accessibility) is always required.

---

## Panel Architecture

Build these panels **one at a time** in the order listed. Get user feedback after each.

### Panel 1: Palette Selection & Customization
- 6–8 curated palettes as horizontal color strips.
- Balanced: minimum 3 Light and 3 Dark palettes with clear `Light` / `Dark` pill badges.
- Clicking a palette applies it to the whole studio instantly (by writing CSS variables on the studio root).
- **Decoupled state:** changing palette never alters typography or shape/motion choices.
- Optional: click a swatch to open a color picker for per-color editing; edited palettes show a "Custom" badge.

### Panel 2: Accessibility Dashboard (Non-Negotiable)
- Live contrast for every text-on-background pair in `contrast-utils.md` → Required Checks.
- WCAG AA badges (4.5:1 body, 3:1 large text / UI components), AAA shown as a bonus.
- Any palette where `textPrimary` on `bgCanvas` fails AA → **critical failure** banner.
- Re-runs on every palette change, swatch edit, role swap and shuffle.

### Panel 3: Semantic Role Inspector, Role Swap & Shuffle
Shows which color does which job, and lets the user explore re-assignments **without leaving the palette**.

- **Role table:** each role → swatch → hex → where it's used ("Primary buttons, links, focus rings").
- **Swap pairs (deliberate):** one-click swaps of meaningful pairs, e.g.:
  - `accentPrimary ↔ accentSecondary` (and `btnPrimary/btnHover` follow the new primary)
  - `bgCanvas ↔ bgSurface`
  - `bgSurface ↔ bgCard`
  - `textPrimary ↔ textSecondary`
  - Custom: pick any two roles from dropdowns and swap them.
- **Shuffle within groups (exploratory):** randomly permutes colors **only inside compatible groups** — backgrounds among backgrounds, accents among accents, text among text. Never moves a background color into a text role.
  - After each shuffle, run the critical checks (`textPrimary/bgCanvas`, `textPrimary/bgCard`, `btnText/btnPrimary`). If any fails, retry (up to ~20 attempts); if no valid permutation exists, show "No accessible shuffle for this palette" instead of applying a broken one.
- **Reset:** returns to the palette's original role mapping.
- **History:** show the applied swaps as removable chips (e.g. "Accent primary ⇄ secondary ✕") so the user understands what changed. Approved swaps are exported to `docs/design-tokens.md`.
- **State colors:** success, warning, error, info shown with their contrast on `bgCard`.

### Panel 4: Typography Selection & Scale
- Independent font-system selector (never coupled to palettes).
- Enforce harmonious typography (single-family scale, superfamily, or matched serifs).
- Type scale preview from `xs` (12px) through `4xl`–`6xl` with real product copy (not "The quick brown fox"), including the second script if the product is multilingual.
- Weights in use (e.g. 400 / 600 / 800), line-heights for headings vs body, tabular numerals demo for prices/tables.

### Panel 5: Component Showcase (All States)
Real components using the active tokens:

| Component | States |
|-----------|--------|
| Button (Primary) | Idle, Hover, Active, Focus-visible, Disabled, Loading |
| Button (Secondary / Ghost) | Idle, Hover, Active, Focus-visible, Disabled |
| Card | Default, Hover, Selected |
| Input Field | Empty, Focused, Filled, Error, Disabled |
| Badge/Tag | Default, Success, Warning, Error, Info |
| Alert/Toast | Success, Warning, Error, Info |
| Skeleton | Loading shimmer |

Add domain components (e.g. a menu item card, a seat, an order ticket). Include a **light/dark toggle** if the product supports both.

### Panel 6: Neutral / Gray Scale
- 7-step scale from near-white to near-black, tinted to the palette's temperature.
- Each step labelled with its UI job (borders, disabled text, muted text, …).

### Panel 7: Shape, Depth & Motion
The non-color personality of the UI — the user picks, the agent explains each option in one line:

| Control | Options → token effect |
|---|---|
| Radius personality | **Sharp** (`--radius-sm/md/lg` ≈ 2/4/6px) · **Soft** (≈ 6/10/14px) · **Round** (≈ 10/18/24px, pill buttons) |
| Shadow style | **Flat** (borders only, no shadows) · **Soft** (low-opacity, palette-tinted) · **Lifted** (stronger elevation for floating UI) |
| Density | **Compact** (smaller paddings, 40px controls on desktop — admin tools) · **Comfortable** (default, 44px+ controls) |
| Motion personality | **Calm** (slower, fades) · **Snappy** (default) · **Playful** (faster, small spring overshoot) — see `design-canvas/references/motion.md` |

Preview: the Panel 5 components re-render live; a "play" button demos press feedback, a toast, a sheet opening and a list stagger with the chosen motion tokens. Respect `prefers-reduced-motion`.

---

## Build Order

1. Scaffold `features/theme-studio/` and the dev-only route
2. Palette data layer (`palettes.ts`) from `ui-ux-pro-max` results
3. Font data layer (`fonts.ts`) from typography results
4. Shape/motion presets (`shape-presets.ts`)
5. Contrast utilities (`utils/contrast.ts`) — read `contrast-utils.md`
6. Role swap/shuffle utilities (`utils/roles.ts`)
7. Panel 1 PalettePicker → 2 AccessibilityDashboard → 3 RoleInspector → 4 TypographyPanel → 5 ComponentShowcase → 6 NeutralScale → 7 ShapeMotionPanel
8. Export action: writes the approved choices into the token file format (see SKILL.md Step 4) — or prints it for the agent to write

---

## File Structure

```
features/theme-studio/
├── palettes.ts                     ← curated palette data with semantic roles
├── fonts.ts                        ← font system data
├── shape-presets.ts                ← radius / shadow / density / motion presets
├── utils/
│   ├── contrast.ts                 ← WCAG contrast functions
│   └── roles.ts                    ← swapRoles(), shuffleWithinGroups(), resetRoles()
├── components/
│   ├── PalettePicker.tsx           ← Panel 1
│   ├── AccessibilityDashboard.tsx  ← Panel 2
│   ├── RoleInspector.tsx           ← Panel 3 (swap, shuffle, reset, history)
│   ├── TypographyPanel.tsx         ← Panel 4
│   ├── ComponentShowcase.tsx       ← Panel 5
│   ├── NeutralScale.tsx            ← Panel 6
│   └── ShapeMotionPanel.tsx        ← Panel 7
└── ThemeStudioPage.tsx             ← assembles all panels
```
