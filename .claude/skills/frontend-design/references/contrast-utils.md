# WCAG Contrast Ratio Utilities

Bake these functions into `features/theme-studio/utils/contrast.js`.
The agent should implement these exactly — the formulas are standardized by WCAG 2.1.

---

## Core Functions

```javascript
/**
 * Convert hex color to RGB array
 * @param {string} hex - Color in '#RRGGBB' or '#RGB' format
 * @returns {[number, number, number]} RGB values (0-255)
 */
export function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3
    ? cleaned.split('').map(c => c + c).join('')
    : cleaned;
  return [
    parseInt(full.substring(0, 2), 16),
    parseInt(full.substring(2, 4), 16),
    parseInt(full.substring(4, 6), 16)
  ];
}

/**
 * Calculate relative luminance per WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Relative luminance (0-1)
 */
export function relativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 * @param {string} hex1 - First color hex
 * @param {string} hex2 - Second color hex
 * @returns {number} Contrast ratio (1:1 to 21:1)
 */
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(...hexToRgb(hex1));
  const l2 = relativeLuminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color pair meets WCAG thresholds
 * @param {string} textHex - Text color
 * @param {string} bgHex - Background color
 * @returns {{ ratio: number, aa: boolean, aaLarge: boolean, aaa: boolean }}
 */
export function checkContrast(textHex, bgHex) {
  const ratio = contrastRatio(textHex, bgHex);
  return {
    ratio: Math.round(ratio * 100) / 100,
    aa: ratio >= 4.5,        // Normal text (< 18pt)
    aaLarge: ratio >= 3.0,   // Large text (≥ 18pt or ≥ 14pt bold) and UI components
    aaa: ratio >= 7.0        // Enhanced contrast
  };
}
```

---

## Required Checks

When the agent builds the Accessibility Dashboard (Panel 2), it must check these combinations:

| Check | Text Token | Background Token | Threshold |
|-------|-----------|-----------------|-----------|
| Body on page | `textPrimary` | `bgCanvas` | AA (4.5:1) |
| Body on card | `textPrimary` | `bgCard` | AA (4.5:1) |
| Body on surface | `textPrimary` | `bgSurface` | AA (4.5:1) |
| Secondary on page | `textSecondary` | `bgCanvas` | AA (4.5:1) |
| Secondary on card | `textSecondary` | `bgCard` | AA (4.5:1) |
| Button text | `btnText` | `btnPrimary` | AA (4.5:1) |
| Accent on page | `accentPrimary` | `bgCanvas` | AA-Large (3:1) |
| Accent on card | `accentPrimary` | `bgCard` | AA-Large (3:1) |
| Muted on page | `textMuted` | `bgCanvas` | AA (4.5:1) |
| Muted on surface | `textMuted` | `bgSurface` | AA (4.5:1) — most commonly failed check |
| Button hover text | `btnText` | `btnHover` | AA (4.5:1) |
| Focus ring | `borderFocus` | `bgCanvas` | UI component (3:1) |
| State colors | `stateSuccess/Warning/Error/Info` | `bgCard` | UI component (3:1); 4.5:1 if used as text |
| Text on state badge | `btnText` (or the badge text token) | each `state*` | AA (4.5:1) |

Run every check for **each theme** the product ships (light and dark).

Any palette where `textPrimary` on `bgCanvas` fails AA should be flagged as **critical failure**.
The **critical set** used by Role Shuffle to reject a permutation: `textPrimary/bgCanvas`, `textPrimary/bgCard`, `btnText/btnPrimary`.

---

## Alpha Colors

`borderSubtle`, `scrim` and some surfaces use `rgba()`. Before measuring, composite the color over what it sits on:

```javascript
// fg/bg as {r,g,b,a}; returns opaque {r,g,b}
export function composite(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
}
```
