# Critique — The Self-Review Loop

A first draft is never shown to the user. Every screen goes through: **render → automated checks → look at the screenshot → score → fix**, up to 3 rounds.
This loop is the single biggest quality lever. Do not skip it, do not fake it.

---

## 1. Run the Automated Checks

From the project root:

```bash
node <skills-dir>/design-canvas/scripts/shoot.mjs design --only <screen-file-substring>
```

(`<skills-dir>` is where this skill lives, e.g. `~/.gemini/config/skills`. Omit `--only` to shoot everything.)

It writes `design/shots/<group>__<screen>[.<theme>].png` and `design/shots/report.md`, and checks:

| Check | Fails when |
|---|---|
| Load errors | tokens.css / kit.css / fonts / Lucide failed to load, or console errors |
| Hardcoded values | hex / rgb / hsl in a screen's `<style>` or `style=""` |
| Horizontal overflow | page is wider than the artboard (the classic mobile bug) |
| Touch targets | interactive element < 44×44px on phone/tablet artboards (< 24px on desktop) |
| Contrast | text below 4.5:1 (3:1 for large text) against its resolved background |
| Fonts | text rendered in a family that is not a token font, or a token font that failed to load |
| Images | `<img>` without `alt` |
| Headings | not exactly one `<h1>` |

**All errors must be fixed** before visual critique. Warnings must be fixed or justified in `review.md`.
If Playwright is missing, the script installs it automatically into `~/.design-canvas` (one time, shared by all projects) — just run it. If auto-install fails, it prints why; only then involve the user.

---

## 2. Look at the Screenshot — Actually Look

Open the PNG(s) with your image-viewing ability. Critique what is **rendered**, not what you intended to write.
Look at it three ways:
1. **Squint** — is the hierarchy (where am I, main content, main action) obvious?
2. **Thumb / cursor path** — can the primary task be done without hunting?
3. **Against the brief** — does it feel like the direction's three adjectives? Is the NOT list respected? Is the signature element present (where planned)?

---

## 3. Score It (1–5 each)

| # | Criterion | 5 looks like |
|---|---|---|
| 1 | Direction fit | Unmistakably this product; matches adjectives; nothing from the NOT list |
| 2 | Hierarchy | One clear primary action; 3 text levels; passes squint test |
| 3 | Spacing & alignment | Scale-only spacing; clear grouping; few alignment lines |
| 4 | Typography | Token fonts/scale; 2–3 weights; good line-heights; tabular numbers |
| 5 | Color & contrast | 60-30-10; accent means something; all contrast passes |
| 6 | Consistency | Uses kit classes; same component looks the same everywhere |
| 7 | States & edge cases | Long text, sold-out, 0/1/many handled; required variants exist |
| 8 | Device ergonomics | Phone: thumb zone, 44px, safe area. Desktop: uses width, max-width text |
| 9 | Content & copy | Real domain content; action-specific buttons; no filler/fake stats |
| 10 | Anti-slop & distinctiveness | Nothing from craft.md §11; at least one considered detail |
| 11 | Motion spec | Interactions have token-based motion or a motion note |

**Pass:** no criterion below 3, average ≥ 4.0, zero automated errors.
Be a harsh reviewer. A 5 is rare. If every score is 4–5 on round one, you are not looking hard enough — re-check criteria 2, 3 and 10.

---

## 4. Log and Fix

Append to `design/review.md`:

```md
## G1 · Menu home — round 2
Scores: direction 4 · hierarchy 4 · spacing 3 · type 4 · color 5 · consistency 4 · states 3 · device 4 · content 4 · anti-slop 4 · motion 4 → avg 3.9 ✗
Automated: 0 errors, 1 warning (chip row 40px tall — fixed to --touch-min)
Fix list:
- Category chips and search bar compete; demote search to icon button in top bar
- Section gap 16 → --space-8 between "Popular" and "All items"
- Add sold-out + long-name items to the grid
```

Fix the **highest-impact issues first** (hierarchy and layout before polish), re-run the script, re-score.

- After **3 rounds** without passing: stop, set status `review`, and show the user the screen with your scores and the unresolved issues — ask for direction instead of looping.
- When passing: set `status: "review"` in `canvas.js` and move on.

---

## 5. Group Review With the User

After each **group** of screens passes (not after every single screen — keep the pace reasonable):
1. Tell the user which screens are ready and how to open the canvas.
2. Summarise per screen in one line: what it does + any decision you made that they might disagree with.
3. Ask for approval or changes. Approved → `status: "approved"`. Changes → `status: "changes"`, apply, re-run the loop.

Never mark a screen `approved` yourself.
