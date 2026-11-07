# Motion — Purposeful Animation Spec

Motion is designed on the canvas, not invented during coding. Every animation must have a job.

---

## 1. The Four Jobs of Motion

| Job | Example | If missing… |
|---|---|---|
| **Feedback** — "I heard you" | Button press scale, add-to-cart count bump, toggle slide | UI feels dead or broken |
| **Orientation** — "where did that come from / go" | Sheet slides up from the bottom, item flies to the cart pill | User loses context |
| **Continuity** — "this is the same thing, changed" | Card expands into detail view, status step fills | Changes feel like jumps |
| **Delight** — personality, used rarely | Steam curl on an empty cup, confetti once on first order | Fine to skip; never block the user |

If an animation has none of these jobs, delete it.

---

## 2. Motion Tokens (defined in tokens.css)

```css
--dur-instant: 80ms;   /* press feedback, color changes */
--dur-fast:   140ms;   /* hovers, small toggles, chips */
--dur-base:   220ms;   /* menus, dropdowns, toasts, cards */
--dur-slow:   320ms;   /* sheets, modals, page-level */
--dur-slower: 480ms;   /* large orchestrated sequences only */

--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);    /* entering — fast start, soft landing */
--ease-in:     cubic-bezier(0.7, 0, 0.84, 0);    /* exiting — gets out of the way */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* moving/morphing on screen */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);/* playful overshoot — sparingly */
```

The **motion personality** chosen in Theme Studio scales these:
- **Calm** — durations ×1.25, no spring, fades and gentle slides.
- **Snappy** (default) — values as above.
- **Playful** — durations ×0.9, spring allowed on feedback moments, small overshoots.

---

## 3. Rules

1. **Animate only `transform` and `opacity`** (and `filter`/`clip-path` rarely). Never animate width, height, top, left, margin — they cause layout jank.
2. **Duration scales with distance and size:** a 16px chip change ≈ 140ms, a full-height sheet ≈ 320ms. Nothing user-triggered exceeds ~500ms.
3. **Enter with ease-out, exit with ease-in, exits are ~20–30% faster than entries.**
4. **Stagger lists at 30–50ms per item, max ~6 items** (then animate the rest together). Never make users wait for a stagger to finish to interact.
5. **Small distances:** entrance slides travel 8–24px, not across the screen.
6. **Never animate on every scroll** for app UIs; scroll-reveal is acceptable only on marketing/landing pages, once per element.
7. **Loading:** skeletons with a slow shimmer (≈1.2–1.6s loop) matching the content shape; show nothing for the first ~150ms to avoid flashes on fast responses.
8. **Respect `prefers-reduced-motion`:** replace movement with instant or opacity-only changes. Mandatory.
9. **No infinite decorative loops** in product UI (pulsing badges, bouncing arrows) except a clear "live" indicator.
10. **Motion must not hide content or block input.** A user tapping during an animation gets the result immediately.

---

## 4. Standard Micro-interactions (use these before inventing new ones)

| Moment | Spec |
|---|---|
| Button press | `transform: scale(0.97)` over `--dur-instant`; release `--dur-fast` `--ease-out` |
| Hover (desktop) | background/elevation change over `--dur-fast`; no movement > 2px |
| Focus-visible | ring appears instantly (no animation on focus rings) |
| Add to cart | button → quantity stepper morph (`--dur-base`), cart pill count bumps (scale 1 → 1.15 → 1, `--ease-spring`) |
| Toggle / switch | knob translate `--dur-fast` `--ease-in-out` |
| Bottom sheet / modal | enter: translateY(16px→0) + opacity, `--dur-slow` `--ease-out`; backdrop fade `--dur-base`; exit faster with `--ease-in` |
| Toast | slide 12px + fade in, auto-dismiss 4–6s, exit fade `--dur-fast` |
| Tab / segmented control | active indicator slides between tabs `--dur-base` `--ease-in-out` |
| Status progress (e.g. order placed → preparing → ready) | step fill `--dur-slow`, the new current step gets one soft pulse — not an infinite loop |
| List entrance (first load) | fade + 8px rise, stagger 40ms, max 6 |
| Page transition | cross-fade `--dur-base`; avoid full-page slides in web apps |

---

## 5. How Motion Is Shown on the Canvas

Screens are static HTML, but they can and should carry real CSS motion:

- Hover/focus/press states in `kit.css` use the tokens above — they work live in the canvas.
- A screen may include a **load-in** animation (list stagger, hero fade) using `@keyframes` + tokens, wrapped in `@media (prefers-reduced-motion: no-preference)`.
- Interactions that need state (stepper, tabs, sheet open) may use a few lines of vanilla JS marked with a `data-proto` attribute — prototype only, never production logic.
- Everything else is written as a **motion note** on the screen's `note` field in `canvas.js`, using the table format above (moment → spec). The implementation skill turns those notes into code.

Also add a **"Motion" section to `design/brief.md`** listing the personality and the 3–6 signature moments of the product (e.g. "add to cart", "order status advances", "order ready").
