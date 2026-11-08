#!/usr/bin/env node
// Design checks for .agent/design (designer tooling, not app code).
//   node --experimental-strip-types .agent/design/tools/check.mjs --out <scratch-dir> [--only <text>] [--no-shoot] [--no-audit] [--theme light]
// 1. Runs design-canvas shoot.mjs (screenshots light + dark, token/contrast/touch/font checks) into <out>/shots.
// 2. Runs tests/helpers/layout-audit.ts auditLayout() on every mobile artboard at 390, 360 and 320 (light + dark),
//    saving screenshots to <out>/audit. Writes <out>/audit/report.md and report.json.
// 3. Checks every data-lucide icon name exists in lucide-react (the app's icon set).
// Screenshots never go into the repo: --out is required and must be outside .agent/.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const designDir = path.resolve(here, '..');
const repo = path.resolve(designDir, '..', '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined; };
const out = opt('out');
if (!out || out === true) { console.error('--out <scratch dir> is required'); process.exit(2); }
const outDir = path.resolve(String(out));
if (outDir.startsWith(path.join(repo, '.agent'))) { console.error('--out must be outside the repo design folder'); process.exit(2); }
const only = opt('only');
fs.mkdirSync(outDir, { recursive: true });

// ---- manifest
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(designDir, 'screens.js'), 'utf8'), sandbox);
const C = sandbox.window.CANVAS;
const all = [];
for (const g of C.groups) for (const s of g.screens) all.push({ ...s, group: g.id });
const pick = all.filter((s) => !only || s.file.includes(only) || (s.title || '').includes(only));

// ---- 1. shoot.mjs into scratch (split groups per device so file names never collide)
if (!args.includes('--no-shoot')) {
  const groups = {};
  for (const s of pick) {
    const dev = s.w < 768 ? 'm' : 'd';
    const id = `${s.group}-${dev}`;
    (groups[id] ||= { id, title: id, screens: [] }).screens.push({ ...s, file: path.relative(outDir, path.join(designDir, s.file)).replace(/\\/g, '/') });
  }
  const manifest = { title: C.title, themes: C.themes, groups: Object.values(groups) };
  fs.writeFileSync(path.join(outDir, 'canvas.js'), 'window.CANVAS = ' + JSON.stringify(manifest, null, 2) + ';\n');
  const r = spawnSync(process.execPath, [path.join(repo, '.claude/skills/design-canvas/scripts/shoot.mjs'), outDir, ...(opt('theme') ? ['--theme', String(opt('theme'))] : [])], { cwd: repo, stdio: 'inherit' });
  if (r.status === 2) process.exit(2);
}

// ---- 3. icon names
const lucideDir = (() => {
  const req = createRequire(path.join(repo, 'apps/web/package.json'));
  return path.join(path.dirname(req.resolve('lucide-react/package.json')), 'dist/esm/icons');
})();
const iconErrors = [];
for (const s of pick) {
  const html = fs.readFileSync(path.join(designDir, s.file), 'utf8');
  for (const m of html.matchAll(/data-lucide="([\w-]+)"/g)) if (!fs.existsSync(path.join(lucideDir, m[1] + '.mjs'))) iconErrors.push(`${s.file}: unknown lucide icon "${m[1]}"`);
}

// ---- 2. layout audit
const auditRows = [];
if (!args.includes('--no-audit')) {
  const { auditLayout } = await import(pathToFileURL(path.join(repo, 'tests/helpers/layout-audit.ts')).href);
  const pw = await import(pathToFileURL(createRequire(path.join(repo, 'package.json')).resolve('@playwright/test')).href);
  const chromium = pw.chromium || pw.default.chromium;
  const browser = await chromium.launch();
  const auditDir = path.join(outDir, 'audit');
  fs.mkdirSync(auditDir, { recursive: true });
  const themes = opt('theme') ? [opt('theme')] : ['light', 'dark'];
  for (const s of pick.filter((x) => x.w < 768 && !x.noAudit)) {
    for (const w of [390, 360, 320]) {
      for (const theme of themes) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(pathToFileURL(path.join(designDir, s.file)).href + '?theme=' + theme, { waitUntil: 'networkidle' }).catch(() => {});
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        // Audit with the viewport as tall as the artboard: a fixed bottom nav then sits below all content, as on
        // the artboard. (At 844 high, anything scrolled under a fixed nav is reported as overlapping-targets.)
        const full = await page.evaluate(() => document.documentElement.scrollHeight);
        if (full > 844) { await page.setViewportSize({ width: w, height: full }); await page.waitForTimeout(100); }
        const v = await auditLayout(page);
        // icons the Lucide UMD build could not render (unknown name) stay as empty <i data-lucide>
        for (const n of await page.evaluate(() => [...document.querySelectorAll('i[data-lucide]')].map((i) => i.getAttribute('data-lucide'))))
          v.push({ rule: 'icon-not-rendered', selector: `i[data-lucide=${n}]`, detail: 'unknown in lucide UMD' });
        const base = `${path.basename(s.file, '.html')}.${w}.${theme}`;
        if (theme === 'light' && w !== 390) await page.screenshot({ path: path.join(auditDir, base + '.png'), fullPage: true });
        auditRows.push({ file: s.file, w, theme, violations: v, height: full });
        await ctx.close();
      }
    }
  }
  // desktop artboards: run the same audit at 1440 (overflow / clipped / wrapped-label rules apply at any width)
  for (const s of pick.filter((x) => x.w >= 768 && !x.noAudit)) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(designDir, s.file)).href + '?theme=light', { waitUntil: 'networkidle' }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const v = await auditLayout(page);
    for (const n of await page.evaluate(() => [...document.querySelectorAll('i[data-lucide]')].map((i) => i.getAttribute('data-lucide'))))
      v.push({ rule: 'icon-not-rendered', selector: `i[data-lucide=${n}]`, detail: 'unknown in lucide UMD' });
    const full = await page.evaluate(() => document.documentElement.scrollHeight);
    auditRows.push({ file: s.file, w: s.w, theme: 'light', violations: v, height: full });
    await ctx.close();
  }
  await browser.close();
  const md = ['# auditLayout() report', '', `Generated ${new Date().toISOString()}`, '', '| Artboard | Width | Theme | Violations |', '|---|---|---|---|'];
  for (const r of auditRows) md.push(`| ${r.file} | ${r.w} | ${r.theme} | ${r.violations.length}${r.violations.length ? ': ' + r.violations.map((x) => `${x.rule} ${x.selector} (${x.detail})`).join('; ') : ''} |`);
  fs.writeFileSync(path.join(auditDir, 'report.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(auditDir, 'report.json'), JSON.stringify(auditRows, null, 2));
}

// keep manifest heights equal to the real artboard height at its design width (gallery + shoot use them)
if (!args.includes('--no-audit')) {
  let src = fs.readFileSync(path.join(designDir, 'screens.js'), 'utf8');
  for (const r of auditRows) {
    if (r.theme !== 'light' || (r.w !== 390 && r.w < 768) || !r.height) continue;
    const at = src.indexOf(`file: '${r.file}'`);
    if (at < 0) continue;
    const hAt = src.indexOf('h: ', at) + 3;
    const end = hAt + /^\d+/.exec(src.slice(hAt))[0].length;
    src = src.slice(0, hAt) + Math.max(r.w < 768 ? 844 : 900, r.height) + src.slice(end);
  }
  fs.writeFileSync(path.join(designDir, 'screens.js'), src);
}

let bad = 0;
for (const r of auditRows) if (r.violations.length) { bad++; console.log(`AUDIT ✖ ${r.file} @${r.w} ${r.theme}`); for (const x of r.violations.slice(0, 8)) console.log(`   ${x.rule}  ${x.selector}  ${x.detail}`); }
for (const e of iconErrors) console.log('ICON  ✖ ' + e);
console.log(`\nauditLayout: ${auditRows.length} runs, ${bad} with violations · icons: ${iconErrors.length} unknown`);
process.exit(bad || iconErrors.length ? 1 : 0);
