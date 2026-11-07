# Design Craft — How to Make Screens That Don't Look AI-Generated

Read this file **in full** before writing the design brief and again before the first screen.
These rules are what separates a designed interface from "AI slop". They are not suggestions.

---

## 1. Commit to a Direction Before Drawing Anything

A screen without a point of view becomes the average of every website the model has seen.
Before the first pixel, write in `design/brief.md`:

- **A nameable direction** in 2–4 words — e.g. "Warm neighbourhood café", "Quiet editorial", "Dense operator console", "Playful arcade".
- **Three adjectives** the UI must feel like (e.g. *warm, quick, honest*).
- **An explicit NOT list** — three things this design must never look like (e.g. *not a SaaS landing page, not a food-delivery clone, not neon/dark gamer*).
- **One signature element** — a single recurring, ownable detail that makes the product recognisable (a receipt-style cart, a ticket-stub card edge, a hand-drawn underline on active tabs, a coffee-ring empty state). Exactly one. It appears on several screens, never on every element.
- **Voice** — how the copy speaks (short and friendly? formal? bilingual?).

Every later decision is checked against this. If a choice could belong to any product, it is the wrong choice.

---

## 2. Hierarchy — The Most Important Skill

- **One primary action per screen.** It gets the accent color and the strongest weight. Everything else is secondary (outline/ghost) or tertiary (text link). Two accent-filled buttons side by side = no hierarchy.
- **Build a contrast ladder** using, in this order of preference: size → weight → color/opacity → position → decoration. Use the fewest steps needed. Most screens need only 3 text levels: title, body, meta.
- **Squint test:** blur your eyes at the screenshot. You should still see (1) where you are, (2) the main content, (3) the main action. If everything is the same grey mush, hierarchy failed.
- **De-emphasise instead of emphasising.** Make secondary text quieter (`--text-secondary`, smaller) rather than making primary text louder, bolder and bigger.
- **Labels are secondary to values.** In data displays, "৳ 240" matters more than "Price". Make the value big; the label small and muted — or drop the label if the format is self-explanatory.

---

## 3. Layout & Spacing

- **Use only the spacing scale** (`--space-*`, 4px base). No 13px, no 22px.
- **Proximity rule:** space *inside* a group < space *between* groups. Typical rhythm: 8 inside a component, 16 between related items, 24–32 between sections, 48–96 between page sections on desktop.
- **Generous by default, dense on purpose.** Consumer screens breathe. Operator/admin screens (counters, dashboards, tables) can be dense — that is a decision recorded in the brief, not an accident.
- **Align to one grid.** Every left edge on a screen should line up with a small number of vertical lines. Random indents look amateur.
- **Line length** for reading text: 45–75 characters (`max-width: 65ch`).
- **Containers:** content max-width 1200–1280px on desktop; full bleed only for deliberate hero/media moments.
- **Break the grid once, deliberately** (an image overlapping a section edge, a price tag hanging off a card) — it creates interest. Breaking it everywhere creates chaos.
- **Avoid the "everything is a card" reflex.** Not every group needs a box, border and shadow. Lists, dividers and whitespace are often better.
- **Avoid symmetric monotony.** Three equal columns of icon-title-text repeated down the page is the #1 template smell. Vary section shapes: a wide + narrow split, a list, a single statement, a media row.

---

## 4. Typography

- Fonts come **only** from the approved tokens (`--font-display`, `--font-body`, `--font-mono`). Never introduce another family.
- **Type scale** from tokens only. Use a modular ratio: ~1.2 on phones, ~1.25–1.333 on desktop.
- **2–3 weights** total on a screen (e.g. 400, 600, 800). Five different weights = noise.
- **Display sizes**: tight line-height (1.05–1.2) and slightly negative tracking (`--tracking-tight`). **Body**: line-height 1.5–1.6, normal tracking. **ALL-CAPS labels**: small, positive tracking (`--tracking-wide`), used sparingly.
- **Numbers:** prices, quantities, times and tables use `font-variant-numeric: tabular-nums` so columns don't jitter.
- **Minimum sizes:** body ≥ 16px on phones (inputs must be ≥ 16px or iOS zooms on focus); meta text ≥ 12px; never below 11px.
- **Multiscript (e.g. Bangla + English):** the token font stack must include a matching script font (e.g. Hind Siliguri / Noto Sans Bengali); check line-height — Bengali needs more (≥1.6) or matras clip.
- **Real hierarchy through type alone:** a well-set screen should read correctly even in greyscale.

---

## 5. Color

- **Only token variables.** No hex, rgb or hsl outside `tokens.css`. If a needed color has no token, stop and add a token (and tell the user) — don't improvise.
- **60-30-10:** ~60% canvas/background, ~30% surfaces/cards/neutrals, ~10% accent. If accent covers more than ~15% of a screen, it stops meaning "important".
- **Accent is for meaning:** primary action, current selection, active nav, key data. Not decoration.
- **Neutrals are tinted** toward the brand hue (warm palette → warm greys). Pure #808080 greys look dead next to a warm brand.
- **State colors** (success / warning / error / info) must differ from each other in **lightness**, not only hue, and must not be confused with the accent. Never rely on color alone — pair with an icon or text.
- **Dark mode is not inverted light mode:** elevation is shown by *lighter* surfaces, not shadows; desaturate and slightly lighten accents; avoid pure #000 backgrounds and pure #FFF text (use the tokens).
- **Contrast:** body text 4.5:1, large text (≥24px, or ≥18.7px bold) and UI component boundaries 3:1. Text over images needs a scrim token.

---

## 6. Depth, Shape & Borders

- **One radius personality** from tokens (sharp / soft / round). Nested elements use a *smaller* radius than their container (inner radius ≈ outer radius − padding).
- **One light source:** shadows fall the same direction everywhere, are tinted with the palette's dark hue (never pure black at high opacity), and use at most 3 elevation levels (`--shadow-1..3`).
- **Border OR shadow, rarely both heavy.** A hairline border (`--border-subtle`) + a soft shadow is fine; a thick border + big shadow is not.
- **Elevation = importance/interactivity**: floating cart bar > card > page. Flat things that are not interactive should not float.

---

## 7. Icons & Imagery

- **One icon set** (default: Lucide), one stroke width, sizes 16 / 20 / 24 only. Icons inherit `currentColor`.
- **No emoji as icons**, ever, in product UI.
- **Icon-only buttons** need `aria-label` and must be universally understood (close, back, search, menu, cart). Anything else gets a text label.
- **Images:** use approved assets, or a **labelled placeholder** (`.ph` block showing aspect ratio + what goes there, e.g. "Photo — iced latte, 1:1"). Never hotlink random stock photos, never fake avatars of "smiling team members".
- **Image ratios are consistent** within a list (all 1:1 or all 4:3).

---

## 8. Content — Real, Specific, Local

- **No lorem ipsum, no "Item 1 / Item 2", no "John Doe".** Use domain-real content from `docs/` (real menu items, real prices in the project's currency, real table numbers, real statuses).
- **No invented metrics or testimonials** ("Trusted by 10,000+ users", "4.9★ from 2k reviews") unless they come from the user. Use a clearly marked placeholder: `[REVIEW COUNT]`.
- **Design the edge cases into the content:** one item with a very long name, one sold out, one with a discount, a price with 4 digits, a name in the second language.
- **Microcopy is design:** buttons say what happens ("Send order to counter", not "Submit"); empty states explain and offer the next action; errors say what went wrong and how to recover.

---

## 9. States — Every Screen Is More Than Its Happy Path

For each key screen, decide which of these need their own artboard (variant file):

| State | When it matters |
|---|---|
| Populated (typical) | Always — the main artboard |
| Empty / first-use | Lists, carts, search results, dashboards |
| Loading | Anything fetched over the network — skeletons shaped like the real content, not spinners in the middle of the page |
| Error / offline | Anything that can fail — inline, recoverable, human wording |
| Long / overflow | Very long names, many items, 2-line titles |
| Success / confirmation | After important actions (order placed, payment done) |

And every interactive component in the kit shows: idle, hover, **focus-visible**, active/pressed, disabled, loading, selected (where relevant).

---

## 10. Mobile vs Desktop — Recompose, Don't Stretch

**Phone (390×844):**
- Primary actions in the thumb zone (bottom third): sticky bottom CTA bar, bottom nav for 3–5 top destinations.
- Touch targets ≥ 44×44px with ≥ 8px between them.
- Respect safe areas (`env(safe-area-inset-bottom)` on bottom bars).
- No hover-dependent information. No tiny close buttons in corners.
- One column; horizontal scrollers only for secondary browsing (categories, chips) and they must visibly peek the next item.

**Desktop (1440 wide):**
- Use the width: multi-column layouts, side navigation, master–detail, tables with real columns. A centred 390px phone layout on a 1440 screen is a failure.
- Content still has a max-width; long lines are not allowed.
- Hover states, keyboard shortcuts and focus order matter.
- Density can be higher for staff/admin tools.

When a screen group needs both, design phone first, then design the desktop artboard as a **new composition** of the same content and components.

---

## 11. The Anti-Slop List (Banned Unless the User Explicitly Asks)

- Purple/blue/pink gradient hero backgrounds, gradient text, "aurora" blobs, mesh gradients as decoration.
- Glassmorphism on everything; neon glows on dark backgrounds.
- Cards with a thick colored left border as the main styling.
- Emoji as icons or bullet points; sparkle ✨ icons to mean "AI" or "new".
- The "three equal feature cards with an icon in a tinted circle" section — especially repeated.
- Every element with large radius + large shadow; every section centred.
- Default-reflex fonts (Inter, Roboto, Arial, Poppins, Montserrat, Open Sans) — **unless that font was explicitly approved in Theme Studio**, in which case use it with confidence.
- Badges/pills sprinkled everywhere ("New!", "Hot", "Pro") without meaning.
- Fake dashboards, fake charts, fake logos of "companies that trust us".
- Generic hero copy: "Unlock the power of…", "Elevate your…", "Seamless experience", "Revolutionize".
- Random accent color per section; rainbow category colors with no system.
- Decorative illustrations that say nothing; stock photos of laptops and handshakes.
- Placeholder grey boxes with no label.

If you notice yourself reaching for one of these, go back to the brief's direction and signature element and choose something specific instead.

---

## 12. Make It Distinctive (Taste Moves That Are Allowed)

- **One bold typographic moment** per key screen (a large display heading, a big price, a giant table number) — contrast in scale is the cheapest way to look designed.
- **Considered details:** tabular numerals, real dividers instead of boxes, aligned baselines, optical alignment of icons with text, consistent icon padding.
- **The signature element**, used 2–4 times across the product.
- **Copy with personality** that matches the voice in the brief.
- **Restraint.** Removing one decoration usually improves a screen more than adding one.
