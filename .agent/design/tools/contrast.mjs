#!/usr/bin/env node
// Contrast table for every text/background (and key non-text) token pair, light + dark.
// Usage (from repo root): node .agent/design/tools/contrast.mjs [--md]
// Reads .agent/design/tokens.css; exits 1 if any pair fails its WCAG 2.2 AA target.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, '..', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(re) {
  const m = re.exec(css);
  if (!m) throw new Error('block not found: ' + re);
  const start = css.indexOf('{', m.index) + 1;
  let depth = 1, i = start;
  while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
  const vars = {};
  for (const d of css.slice(start, i - 1).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  return vars;
}
const light = block(/:root\s*\{/);
const dark = { ...light, ...block(/:root\[data-theme='dark'\]\s*\{/) };

function rgb(v) {
  v = v.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
  throw new Error('cannot parse colour ' + v);
}
const lum = ({ r, g, b }) => [r, g, b].map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const surfaces = ['--bg-app', '--bg-surface', '--bg-surface-hover', '--bg-muted'];
const pairs = [];
for (const fg of ['--fg-default', '--fg-secondary', '--fg-muted', '--accent-text']) for (const bg of surfaces) pairs.push([fg, bg, 4.5, 'text']);
for (const t of ['success', 'warning', 'danger', 'info']) {
  for (const bg of ['--bg-surface', '--bg-app']) pairs.push([`--${t}-text`, bg, 4.5, 'text']);
  pairs.push([`--${t}-text`, `--${t}-soft`, 4.5, 'badge/banner text']);
  pairs.push([`--${t}-primary`, '--bg-surface', 3, 'icon / bar (non-text)']);
}
pairs.push(['--neutral-text', '--neutral-soft', 4.5, 'badge text']);
pairs.push(['--accent-text', '--accent-soft', 4.5, 'selected nav text']);
pairs.push(['--fg-default', '--accent-soft', 4.5, 'selected row text']);
pairs.push(['--fg-muted', '--accent-soft', 4.5, 'selected row meta']);
pairs.push(['--fg-default', '--highlight', 4.5, 'realtime highlight']);
pairs.push(['--accent-fg', '--accent-primary', 4.5, 'primary button']);
pairs.push(['--accent-fg', '--accent-hover', 4.5, 'primary button hover']);
pairs.push(['--accent-fg', '--accent-pressed', 4.5, 'primary button pressed']);
pairs.push(['--danger-fg', '--danger-primary', 4.5, 'danger button']);
pairs.push(['--danger-fg', '--danger-hover', 4.5, 'danger button hover']);
pairs.push(['--fg-inverse', '--bg-inverse', 4.5, 'toast']);
for (const bg of ['--bg-surface', '--bg-app']) {
  pairs.push(['--border-strong', bg, 3, 'input outline (non-text)']);
  pairs.push(['--focus-ring', bg, 3, 'focus ring (non-text)']);
  pairs.push(['--accent-primary', bg, 3, 'accent indicator (non-text)']);
}
pairs.push(['--chart-collected', '--bg-surface', 3, 'chart bar (non-text)']);
pairs.push(['--chart-collected', '--bg-muted', 3, 'collected fill vs billed track (non-text)']);

let fails = 0;
const rows = [];
for (const [name, vars] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg, need, use] of pairs) {
    const r = ratio(rgb(vars[fg]), rgb(vars[bg]));
    const ok = r >= need;
    if (!ok) fails++;
    rows.push({ theme: name, fg, bg, r: r.toFixed(2), need, ok, use });
  }
}
if (process.argv.includes('--md')) {
  console.log('| Theme | Foreground | Background | Ratio | Target | Use | |\n|---|---|---|---|---|---|---|');
  for (const x of rows) console.log(`| ${x.theme} | \`${x.fg}\` | \`${x.bg}\` | ${x.r}:1 | ${x.need}:1 | ${x.use} | ${x.ok ? 'pass' : '**FAIL**'} |`);
} else {
  for (const x of rows) console.log(`${x.ok ? 'ok  ' : 'FAIL'} ${x.theme.padEnd(5)} ${x.fg.padEnd(18)} on ${x.bg.padEnd(20)} ${x.r.padStart(6)} (need ${x.need})  ${x.use}`);
}
console.error(`\n${rows.length} pairs, ${fails} failing`);
process.exit(fails ? 1 : 0);
