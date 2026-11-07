# Handoff — From Approved Screens to Production Code

The approved canvas is the **spec**. `frontend-implementation` builds from it; it does not redesign.

---

## 1. Write `docs/design-handoff.md`

```md
# Design Handoff — <Project>

Canvas: design/canvas.html · Tokens: <path to app token file> · Approved on: <date>

## Screen → Route map
| Artboard | File | Route / component | States designed |
|---|---|---|---|
| G1 · Menu home | screens/guest/menu-home.html | /t/[table] | populated, empty, loading |

## Kit class → Component map
| kit.css class | Component | Props / variants |
|---|---|---|
| .btn--primary | <Button variant="primary"> | size, loading, disabled |
| .menu-item | <MenuItemCard> | item, soldOut, onAdd |

## Motion spec
| Moment | Spec (tokens) | Where |
|---|---|---|
| Add to cart | button→stepper morph --dur-base --ease-out; cart pill bump --ease-spring | MenuItemCard, CartPill |

## Decisions & open questions
- …
```

Collect motion specs from every screen's `note` in `canvas.js` and the Motion section of `brief.md`.

---

## 2. Rules for the Implementation Phase

1. **Tokens are already shared** — the app imports the same token file the screens used. Do not copy values.
2. **kit.css classes become components first** (Stage 2 of `frontend-implementation`), then screens are assembled from them.
3. **1:1 fidelity check:** after building a page statically, screenshot it at the artboard size and compare with the approved PNG:
   ```bash
   node <skills-dir>/design-canvas/scripts/shoot.mjs --url http://localhost:3000/t/5 --size 390x844 --out impl__menu-home
   ```
   Put both images side by side; differences in spacing, hierarchy, or type are bugs, not "close enough".
4. **States** designed on the canvas (empty / loading / error) are implemented exactly in Stage 3.
5. **Design changes after approval:** layout or visual changes go to the canvas **first** (edit the screen, re-run critique, get approval), then into code. Tiny fixes found during coding (a 4px misalignment) can go code-first, but must be back-ported to the screen file so the canvas never lies.

---

## 3. Bridge Message

> "The design is approved and documented in `docs/design-handoff.md`. Next, use the `frontend-implementation` skill: build the kit components first, then assemble pages in user-flow order, checking each against its approved artboard."
