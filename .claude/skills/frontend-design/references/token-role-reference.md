# Semantic Token Role Reference

Recommended token set for frontend projects. Use this as a **starting point, not a rigid contract**.

**Adaptability Rule:** The agent must tailor the token set to the actual project:
- **Remove** tokens the project doesn't need (e.g., a portfolio site probably doesn't need `seatAvailable` or `stateWarning`)
- **Add** tokens the project requires that aren't listed here (e.g., a dashboard might need `bgSidebar`, `bgToolbar`, chart color scales, gradient tokens)
- **Derive** the token list from the component inventory in `docs/frontend-plan.md` — if a component exists in the plan, its color states need tokens

The one non-negotiable rule: never use raw hex values in component code. Every color must have a named semantic role, whatever that role is.

---

## Recommended Starting Set

### Backgrounds (60% — Dominant)
| Token | Purpose | Example |
|-------|---------|---------|
| `bgCanvas` | Page background, largest surface | `#0b132b` |
| `bgSurface` | Navigation bars, sidebars, section containers | `#141e3d` |
| `bgCard` | Cards, modals, elevated surfaces | `#1a274e` |
| `bgCardHover` | Card hover state (slightly lighter than bgCard) | `#233464` |

### Text
| Token | Purpose | Contrast Requirement |
|-------|---------|---------------------|
| `textPrimary` | Headings, titles, important content | ≥ 4.5:1 on bgCanvas |
| `textSecondary` | Body text, subtitles, descriptions | ≥ 4.5:1 on bgCanvas |
| `textMuted` | Meta text, placeholders, captions | ≥ 4.5:1 on bgCanvas **and** bgSurface (the most common failure) |
| `textOnAccent` / `btnText` | Text on accent-colored backgrounds | ≥ 4.5:1 on btnPrimary |

### Accents (10% — Focal Points)
| Token | Purpose |
|-------|---------|
| `accentPrimary` | Main CTA color, links, selected states, focus rings |
| `accentSecondary` | Secondary highlights, badges, subtle accents |

### Interactive Elements
| Token | Purpose |
|-------|---------|
| `btnPrimary` | Primary button background (often same as accentPrimary) |
| `btnHover` | Button hover state |
| `btnText` | Text on primary button |

### Borders & Dividers
| Token | Purpose |
|-------|---------|
| `borderSubtle` | Card borders, dividers (low opacity) |
| `borderFocus` | Focus rings, active state borders |

### Semantic States
| Token | Purpose | Notes |
|-------|---------|-------|
| `stateSuccess` | Confirmation, completed actions | Must look distinct from accentPrimary |
| `stateWarning` | Caution, pending actions | |
| `stateError` | Errors, destructive actions, failures | |
| `stateInfo` | Informational messages, tips | |

---

### Overlays
| Token | Purpose |
|-------|---------|
| `scrim` | Semi-transparent layer behind modals/sheets and under text placed on images |
| `shadowColor` | RGB triplet (e.g. `31 26 22`) used to tint shadows with the palette's darkest hue |

---

## CSS Variable Naming

Role names are camelCase in data (`palettes.ts`) and **kebab-case** as CSS variables:
`bgCanvas` → `--bg-canvas`, `textMuted` → `--text-muted`, `btnText` → `--btn-text`, `stateError` → `--state-error`.
Use exactly these names everywhere (Theme Studio, token file, `design-canvas` screens, app components). Do not invent parallel names like `--color-bg-primary`.

---

## Non-Color Tokens (Required)

Color alone does not make a design system. The token file must also define:

| Group | Tokens | Notes |
|---|---|---|
| Font families | `--font-display`, `--font-body`, `--font-mono` | From the approved font system; include script fallback (e.g. Hind Siliguri) |
| Type scale | `--text-xs` … `--text-4xl` (+ `--text-5xl`, `--text-6xl` for marketing/display) | Modular ratio ≈1.2 (mobile) – 1.25/1.333 (desktop) |
| Weights | `--weight-regular`, `--weight-medium`, `--weight-semibold`, `--weight-bold` | Use 2–3 per screen |
| Line height | `--leading-tight`, `--leading-snug`, `--leading-normal`, `--leading-relaxed` | Headings ~1.15, body ~1.5, Bengali/Devanagari ≥1.6 |
| Tracking | `--tracking-tight`, `--tracking-normal`, `--tracking-wide` | Tight for display, wide for small caps labels |
| Spacing | `--space-1` (4px) … `--space-24` (96px) | 4px base; never off-scale values |
| Radius | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill` | From the chosen radius personality |
| Elevation | `--shadow-1`, `--shadow-2`, `--shadow-3` | Tinted with `--shadow-color`; dark mode relies on lighter surfaces instead |
| Motion | `--dur-instant/fast/base/slow/slower`, `--ease-out/in/in-out/spring` | From the motion personality |
| Interaction | `--touch-min` (44px), `--focus-ring` | Focus ring uses `--border-focus` |
| Layout | `--container-max`, `--gutter` | Breakpoints are documented literals (CSS vars can't be used in media queries) |
| Layers | `--z-sticky`, `--z-dropdown`, `--z-sheet`, `--z-toast`, `--z-modal` | No magic z-index numbers in components |

The full file shape lives in `design-canvas/assets/tokens.template.css`.

---

## The 60-30-10 Rule

A balanced UI follows this approximate color distribution:

| Proportion | Role | Tokens |
|-----------|------|--------|
| **60%** | Dominant — page and section backgrounds | `bgCanvas`, `bgSurface` |
| **30%** | Secondary — cards, containers, navigation | `bgCard`, neutral scale |
| **10%** | Accent — buttons, links, badges, alerts | `accentPrimary`, `accentSecondary`, semantic states |

If accent colors cover more than ~15% of the visible page, the design feels noisy.
If there's no clear accent (everything is the same tone), the design feels flat with no visual hierarchy.

---

## Palette Structure in Code

Every palette in `palettes.js` must follow this shape:

```javascript
{
  id: 'palette-slug',
  name: 'Human Readable Name',
  description: 'One-line description of the mood/vibe.',
  mode: 'light',            // 'light' | 'dark'
  darkVariant: 'palette-slug-dark', // optional: id of its designed dark counterpart
  roles: {
    // Backgrounds
    bgCanvas: '#hex',
    bgSurface: '#hex',
    bgCard: '#hex',
    bgCardHover: '#hex',
    // Text
    textPrimary: '#hex',
    textSecondary: '#hex',
    textMuted: '#hex',
    // Accents
    accentPrimary: '#hex',
    accentSecondary: '#hex',
    // Interactive
    btnPrimary: '#hex',
    btnHover: '#hex',
    btnText: '#hex',
    // Borders
    borderSubtle: 'rgba(...)',
    borderFocus: '#hex',
    // Semantic States (include only what the project uses)
    stateSuccess: '#hex',
    stateWarning: '#hex',
    stateError: '#hex',
    stateInfo: '#hex',
    // Overlays
    scrim: 'rgba(...)',
    shadowColor: 'R G B',
    // Domain-specific (add whatever the project needs)
    // Examples: seatAvailable, seatSelected, chartLine1, bgSidebar,
    //           gradientStart, gradientEnd, tagBg, avatarRing...
  }
}
```
