---
name: mobile-layout-qa
description: BasaManager's mobile layout rules and automated layout audit. Prevents and catches the classic agent-made mobile bugs — text overflowing its box, button/nav labels wrapping onto two badly-centred lines, horizontal scroll, clipped text, tiny or overlapping tap targets, content hidden behind the bottom nav. Use when designing mobile artboards, building or reviewing any page or component, and in the layout e2e spec.
---

# Mobile layout QA

Desktop usually comes out fine; mobile breaks in small ways that nobody notices until a real phone. The fix
is two-sided: **build so it can't break** (rules below) and **measure so it can't hide** (the audit). A page is
not done until the audit passes at every width.

## Widths
Check every screen at **320, 360, 390, 414** (phones) and **768** (tablet) plus 1440. Design artboards are
390, but Bangladeshi users often have 360-wide Androids, and 320 catches everything that is "just barely fine".

## Stress content (always use it, in design and in tests)
Realistic worst cases, kept in `tests/fixtures/stress.ts` and used by the seed's `stress` org and the designer's
stress artboards:
- Names: `Mohammad Abdur Rahman Chowdhury`, `মোহাম্মদ আব্দুর রহমান চৌধুরী`, `Nusrat Jahan Binte Kamal`
- Building: `Al-Madina Tower, House 12/B, Road 5, Block C, Nasirabad Housing Society`
- Money: `৳1,25,00,000`, `−৳12,500`, `৳0`. Counts: badge `99+`, `1,234 units`
- IDs: bKash TrxID `9ABCD1EFGH`, receipt `BM-2026-000123`, unbroken 40-char strings
- **Pseudo-locale `en-XA`**: every UI string padded by 40% and wrapped in brackets (`[Ŕéçőŕð þåýméñţ·····]`). The i18n
  setup ships it in dev/test. Bangla text is usually longer and taller than English, so if `en-XA` fits, Bangla will.

## Build rules (prevention)
**Text and boxes**
- Every flex/grid child that contains text gets `min-w-0` (the #1 cause of text escaping cards).
- User-provided text (names, addresses, descriptions): `break-words` (`overflow-wrap: break-word`); IDs, TrxIDs,
  emails, URLs: `[overflow-wrap:anywhere]`.
- Money and dates: `whitespace-nowrap tabular-nums`; the row layout gives them room (amount column `shrink-0`,
  label column `min-w-0 flex-1`).
- Never fixed `height` on anything containing text: use `min-height` + padding. No fixed widths on text containers.
- Intentional truncation only: `truncate` (one line) or `line-clamp-2`, **and** the full text is reachable
  (`title`, a detail view, or an expand control).

**Buttons and labels**
- Buttons: `inline-flex items-center justify-center gap-2 text-center whitespace-nowrap`. A label never wraps.
  If a label doesn't fit at 320: shorten it (≤ 2 words on mobile, via an i18n `short` key), make the button full
  width, or use icon + `aria-label`. Never let the browser wrap it.
- Button groups on mobile: stack full width (`flex-col sm:flex-row`), primary first, instead of squeezing side by side.
- Bottom tab bar: ≤ 5 items, one-word labels ≤ 10 characters, 11–12 px, `truncate`, icon above label, equal-width
  items (`flex-1 basis-0`), height ≥ 56 px + `pb-[env(safe-area-inset-bottom)]`.
- Tabs/segmented controls that can't fit: horizontal scroll container with `snap-x` and fade edges, never wrapping.
- Badges/chips: `whitespace-nowrap`, `shrink-0`.

**Layout**
- Tables become card lists below `md`. No horizontal-scroll tables on phones, except the readings grid, which
  is a deliberate scroll container with a sticky first column.
- Main content gets bottom padding equal to the bottom nav height + safe area, so nothing hides behind it.
- Full-height screens use `min-h-dvh` (not `100vh`, which jumps on mobile browsers).
- Dialogs become bottom sheets on mobile: `max-h-[90dvh]`, internal scroll, sticky footer actions.
- Inputs: font-size ≥ 16 px (iOS zooms otherwise), full width, label above.
- Headings use the fluid type tokens (`clamp`), never a desktop size scaled by hand.
- Tap targets ≥ 44×44 px with ≥ 8 px between neighbouring targets.
- Images/avatars/maps: fixed aspect-ratio boxes so loading doesn't shift layout.

## The audit (detection)
`tests/helpers/layout-audit.ts` exports `auditLayout(page)` which runs this in the page and returns
violations. `tests/e2e/layout.spec.ts` visits every route per role at every width above, in light and dark,
with the stress org and with `en-XA`, and fails on any violation. The designer runs the same function on
artboards through `shoot.mjs`.

```ts
// tests/helpers/layout-audit.ts (reference implementation; keep this behaviour)
export type Violation = { rule: string; selector: string; detail: string };

export async function auditLayout(page: import('@playwright/test').Page): Promise<Violation[]> {
  return page.evaluate(() => {
    const out: { rule: string; selector: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const sel = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const tid = el.getAttribute('data-testid'); 
      return tid ? `[data-testid="${tid}"]` : `${el.tagName.toLowerCase()}${id}.${[...el.classList].slice(0, 3).join('.')}`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const lineCount = (el: Element) => {
      const range = document.createRange(); range.selectNodeContents(el);
      const tops = new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top)));
      return tops.size;
    };

    // 1. horizontal page scroll
    if (document.documentElement.scrollWidth > vw + 1)
      out.push({ rule: 'page-horizontal-scroll', selector: 'html', detail: `${document.documentElement.scrollWidth} > ${vw}` });

    const all = [...document.querySelectorAll('body *')].filter(visible);
    for (const el of all) {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const ignore = el.closest('[data-layout-ignore]');
      if (ignore) continue;
      // 2. element sticks out of the viewport
      if (r.right > vw + 1 && !el.closest('[data-scroll-x]'))
        out.push({ rule: 'outside-viewport', selector: sel(el), detail: `right=${Math.round(r.right)} vw=${vw}` });
      // 3. text spilling out of its own box
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent!.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 1) {
        if (cs.overflowX === 'visible') out.push({ rule: 'text-overflow', selector: sel(el), detail: `scroll ${el.scrollWidth} > client ${el.clientWidth}` });
        else if (cs.textOverflow === 'ellipsis' && !el.getAttribute('title') && !el.closest('[title]'))
          out.push({ rule: 'truncated-without-full-text', selector: sel(el), detail: el.textContent!.trim().slice(0, 40) });
        else if (cs.textOverflow !== 'ellipsis' && cs.overflowX === 'hidden')
          out.push({ rule: 'clipped-text', selector: sel(el), detail: el.textContent!.trim().slice(0, 40) });
      }
      // 4. small text
      if (hasText && parseFloat(cs.fontSize) < 11)
        out.push({ rule: 'text-too-small', selector: sel(el), detail: cs.fontSize });
    }

    const controls = [...document.querySelectorAll('button, [role="button"], [role="tab"], nav a, a[data-button], [data-single-line]')].filter(visible);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      // 5. wrapped labels
      if (!el.hasAttribute('data-allow-wrap') && el.textContent!.trim() && lineCount(el) > 1)
        out.push({ rule: 'wrapped-label', selector: sel(el), detail: el.textContent!.trim().slice(0, 40) });
      // 6. label centred in its button
      const range = document.createRange(); range.selectNodeContents(el); const t = range.getBoundingClientRect();
      if (t.width > 0 && el.matches('button, [role="button"], a[data-button]') && getComputedStyle(el).textAlign !== 'left') {
        const dx = Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2);
        const dy = Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2);
        if (dx > 3 || dy > 3) out.push({ rule: 'label-not-centred', selector: sel(el), detail: `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}` });
      }
      // 7. tap target size (mobile widths only)
      if (vw < 768 && !el.closest('p, li > span') && (r.width < 44 || r.height < 44))
        out.push({ rule: 'tap-target-small', selector: sel(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}` });
    }
    // 8. overlapping tap targets
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect();
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) out.push({ rule: 'overlapping-targets', selector: `${sel(controls[i])} × ${sel(controls[j])}`, detail: `${ox.toFixed(0)}×${oy.toFixed(0)}` });
    }
    // 9. inputs below 16px (iOS zoom)
    for (const el of document.querySelectorAll('input, select, textarea'))
      if (visible(el) && vw < 768 && parseFloat(getComputedStyle(el).fontSize) < 16)
        out.push({ rule: 'input-font-below-16', selector: sel(el), detail: getComputedStyle(el).fontSize });
    // 10. content hidden behind the fixed bottom nav
    const nav = document.querySelector('[data-bottom-nav]');
    const main = document.querySelector('main');
    if (nav && main && visible(nav)) {
      const pad = parseFloat(getComputedStyle(main).paddingBottom);
      if (pad + 1 < nav.getBoundingClientRect().height)
        out.push({ rule: 'content-under-bottom-nav', selector: 'main', detail: `padding-bottom ${pad} < nav ${nav.getBoundingClientRect().height}` });
    }
    return out;
  });
}
```
Escape hatches, used rarely and only with a code comment: `data-layout-ignore` (a decorative element), `data-scroll-x`
(a deliberate horizontal scroller), `data-allow-wrap` (a multi-line button, e.g. a large category tile).

## Also check by eye (screenshots)
The audit catches geometry; a reviewer still looks at the 360 and 390 screenshots for: visual rhythm, hierarchy,
awkward short lines (use `text-balance` on headings), widows in buttons, misaligned icons, sticky elements
covering content while scrolling, and keyboard-open states for forms (input stays visible above the keyboard).

## Definition of done (mobile)
`layout.spec.ts` green for the touched routes at 320/360/390/414/768 × light/dark × stress + `en-XA`; screenshots at
360 and 390 attached to the PR; reviewer checked them by eye.
