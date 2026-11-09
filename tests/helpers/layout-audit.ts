import type { Page } from '@playwright/test';

export type Violation = { rule: string; selector: string; detail: string };

export async function auditLayout(page: Page): Promise<Violation[]> {
  return page.evaluate(() => {
    const out: { rule: string; selector: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const sel = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const tid = el.getAttribute('data-testid');
      return tid
        ? `[data-testid="${tid}"]`
        : `${el.tagName.toLowerCase()}${id}.${[...el.classList].slice(0, 3).join('.')}`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        cs.opacity !== '0'
      );
    };
    const lineCount = (el: Element) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      // A line is a vertical band; rects whose centre lies inside an existing band are the same line,
      // so a label mixing font sizes (14 px text + 12 px count) is one line, not two.
      const bands: { top: number; bottom: number }[] = [];
      let node = walker.nextNode();
      while (node) {
        if (node.textContent && node.textContent.trim().length > 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            if (r.width > 1) {
              const mid = (r.top + r.bottom) / 2;
              if (!bands.some((b) => mid >= b.top && mid <= b.bottom))
                bands.push({ top: r.top, bottom: r.bottom });
            }
          }
        }
        node = walker.nextNode();
      }
      return bands.length;
    };

    // 1. horizontal page scroll
    if (document.documentElement.scrollWidth > vw + 1)
      out.push({
        rule: 'page-horizontal-scroll',
        selector: 'html',
        detail: `${document.documentElement.scrollWidth} > ${vw}`,
      });

    const all = [...document.querySelectorAll('body *')].filter(visible);
    for (const el of all) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const ignore = el.closest('[data-layout-ignore]');
      if (ignore) continue;
      // 2. element sticks out of the viewport
      if (r.right > vw + 1 && !el.closest('[data-scroll-x]'))
        out.push({
          rule: 'outside-viewport',
          selector: sel(el),
          detail: `right=${Math.round(r.right)} vw=${vw}`,
        });
      // 3. text spilling out of its own box
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 1) {
        if (cs.overflowX === 'visible')
          out.push({
            rule: 'text-overflow',
            selector: sel(el),
            detail: `scroll ${el.scrollWidth} > client ${el.clientWidth}`,
          });
        else if (cs.textOverflow === 'ellipsis' && !el.getAttribute('title') && !el.closest('[title]'))
          out.push({
            rule: 'truncated-without-full-text',
            selector: sel(el),
            detail: el.textContent!.trim().slice(0, 40),
          });
        else if (cs.textOverflow !== 'ellipsis' && cs.overflowX === 'hidden')
          out.push({
            rule: 'clipped-text',
            selector: sel(el),
            detail: el.textContent!.trim().slice(0, 40),
          });
      }
      // 4. small text
      if (hasText && parseFloat(cs.fontSize) < 11)
        out.push({ rule: 'text-too-small', selector: sel(el), detail: cs.fontSize });
    }

    const controls = [
      ...document.querySelectorAll(
        'button, [role="button"], [role="tab"], nav a, a[data-button], [data-single-line]',
      ),
    ].filter(visible);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      // 5. wrapped labels
      if (!el.hasAttribute('data-allow-wrap') && el.textContent!.trim() && lineCount(el) > 1)
        out.push({
          rule: 'wrapped-label',
          selector: sel(el),
          detail: el.textContent!.trim().slice(0, 40),
        });
      // 6. label centred in its button
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      if (
        t.width > 0 &&
        el.matches('button, [role="button"], a[data-button]') &&
        getComputedStyle(el).textAlign !== 'left'
      ) {
        const dx = Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2);
        const dy = Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2);
        if (dx > 3 || dy > 3)
          out.push({
            rule: 'label-not-centred',
            selector: sel(el),
            detail: `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}`,
          });
      }
      // 7. tap target size (mobile widths only)
      if (vw < 768 && !el.closest('p, li > span') && (r.width < 44 || r.height < 44))
        out.push({
          rule: 'tap-target-small',
          selector: sel(el),
          detail: `${Math.round(r.width)}×${Math.round(r.height)}`,
        });
    }
    // 8. overlapping tap targets
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!.getBoundingClientRect(),
          b = controls[j]!.getBoundingClientRect();
        if (controls[i]!.contains(controls[j]!) || controls[j]!.contains(controls[i]!)) continue;
        // Geometry ignores stacking: a control scrolled under a fixed bar is not a real overlap.
        const fixedBar = '[data-bottom-nav], .action-bar';
        if (!!controls[i]!.closest(fixedBar) !== !!controls[j]!.closest(fixedBar)) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left),
          oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2)
          out.push({
            rule: 'overlapping-targets',
            selector: `${sel(controls[i]!)} × ${sel(controls[j]!)}`,
            detail: `${ox.toFixed(0)}×${oy.toFixed(0)}`,
          });
      }
    // 9. inputs below 16px (iOS zoom)
    for (const el of document.querySelectorAll('input, select, textarea'))
      if (visible(el) && vw < 768 && parseFloat(getComputedStyle(el).fontSize) < 16)
        out.push({
          rule: 'input-font-below-16',
          selector: sel(el),
          detail: getComputedStyle(el).fontSize,
        });
    // 10. content hidden behind the fixed bottom nav
    const nav = document.querySelector('[data-bottom-nav]');
    const main = document.querySelector('main');
    if (nav && main && visible(nav)) {
      const pad = parseFloat(getComputedStyle(main).paddingBottom);
      if (pad + 1 < nav.getBoundingClientRect().height)
        out.push({
          rule: 'content-under-bottom-nav',
          selector: 'main',
          detail: `padding-bottom ${pad} < nav ${nav.getBoundingClientRect().height}`,
        });
    }
    return out;
  });
}
