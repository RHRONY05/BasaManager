#!/usr/bin/env node
/**
 * Design-token & quality linter — stack-aware.
 *
 * Run from the PROJECT ROOT (or pass --root):
 *   node <skills-dir>/frontend-implementation/scripts/lint-tokens.js [--root <dir>] [--json] [--quiet]
 *
 * Detects every frontend package in the repo (root, frontend/, client/, web/, apps/*, packages/*),
 * its framework (Next, Nuxt, Vue, SvelteKit, Svelte, Astro, Angular, Solid, React/Vite) and styling
 * (Tailwind v3/v4, Sass, Less, CSS-in-JS), then scans that stack's source folders.
 *
 * Escape hatches (use sparingly, with a reason):
 *   // token-lint-ignore            → ignore this line (or put it on the line above)
 *   /* token-lint-disable-file *\/  → ignore the whole file
 *
 * Exit code 1 when errors are found.
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const ROOT = path.resolve(opt('root') || process.cwd());
const JSON_OUT = flag('json');
const QUIET = flag('quiet');

const RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', BOLD = '\x1b[1m', DIM = '\x1b[2m';

// ---------------------------------------------------------------- stack detection
const IGNORED_DIRS = new Set([
  'node_modules', '.next', 'dist', 'build', 'out', '.nuxt', '.output', '.svelte-kit', '.astro', '.angular',
  'coverage', 'public', 'static', '.turbo', '.vercel', '.git', '__tests__', '__mocks__', 'tests', 'test', 'e2e',
  'test-results', 'playwright-report', 'storybook-static', 'design',
]);

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function candidatePackageDirs() {
  const dirs = [ROOT];
  for (const sub of ['frontend', 'client', 'web', 'ui', 'site', 'www']) dirs.push(path.join(ROOT, sub));
  for (const group of ['apps', 'packages']) {
    const g = path.join(ROOT, group);
    if (fs.existsSync(g)) for (const d of fs.readdirSync(g)) dirs.push(path.join(g, d));
  }
  return dirs.filter((d) => fs.existsSync(path.join(d, 'package.json')));
}

function majorOf(range) {
  const m = String(range || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function installedMajor(dir, pkg) {
  for (let d = dir; ; d = path.dirname(d)) {
    const p = readJson(path.join(d, 'node_modules', pkg, 'package.json'));
    if (p) return majorOf(p.version);
    if (d === path.dirname(d) || d.length < ROOT.length) return null;
  }
}

function detectStack(dir) {
  const pkg = readJson(path.join(dir, 'package.json')) || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);

  let framework = null;
  if (has('next')) framework = 'Next.js';
  else if (has('nuxt')) framework = 'Nuxt';
  else if (has('@sveltejs/kit')) framework = 'SvelteKit';
  else if (has('astro')) framework = 'Astro';
  else if (has('@angular/core')) framework = 'Angular';
  else if (has('@remix-run/react') || has('react-router')) framework = 'React Router/Remix';
  else if (has('solid-js')) framework = 'Solid';
  else if (has('svelte')) framework = 'Svelte';
  else if (has('vue')) framework = 'Vue';
  else if (has('react')) framework = has('vite') ? 'React + Vite' : 'React';
  if (!framework) return null; // not a frontend package

  const twMajor = has('tailwindcss') ? (installedMajor(dir, 'tailwindcss') ?? majorOf(deps.tailwindcss)) : null;
  const styling = [];
  if (twMajor) styling.push(`Tailwind v${twMajor}`);
  if (has('sass') || has('sass-embedded')) styling.push('Sass');
  if (has('less')) styling.push('Less');
  if (has('styled-components')) styling.push('styled-components');
  if (has('@emotion/react') || has('@emotion/styled')) styling.push('Emotion');
  if (!styling.length) styling.push('CSS');

  // Source folders by convention — only those that exist are scanned.
  const byFramework = {
    'Next.js': ['src', 'app', 'pages', 'components', 'features', 'lib', 'styles'],
    Nuxt: ['app', 'components', 'pages', 'layouts', 'assets', 'composables', 'src'],
    SvelteKit: ['src'],
    Svelte: ['src'],
    Astro: ['src'],
    Angular: ['src'],
    Vue: ['src'],
    Solid: ['src'],
    'React Router/Remix': ['app', 'src'],
    'React + Vite': ['src'],
    React: ['src'],
  };
  const sourceDirs = byFramework[framework].map((d) => path.join(dir, d)).filter((d) => fs.existsSync(d));
  // Root-level single-file components (Nuxt app.vue, etc.)
  const rootFiles = fs.readdirSync(dir).filter((f) => /\.(vue|svelte|astro)$/.test(f)).map((f) => path.join(dir, f));

  return { dir, name: pkg.name || path.basename(dir), framework, tailwind: twMajor, styling, sourceDirs, rootFiles };
}

// ---------------------------------------------------------------- file collection
const SOURCE_EXT = /\.(jsx?|tsx?|mjs|cjs|css|scss|sass|less|vue|svelte|astro|html)$/i;
const SKIP_FILE = /(\.d\.ts|\.test\.|\.spec\.|\.stories\.|\.min\.)|^(tailwind|postcss|next|vite|nuxt|astro|svelte|eslint|vitest|playwright)\.config\./i;
// Files where raw colors are legitimately required (no CSS variables available)
const RAW_COLOR_OK = /^(opengraph-image|twitter-image|icon|apple-icon)\.(t|j)sx?$|^manifest\.(t|j)s$/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) { out.push(dir); return out; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(path.join(dir, entry.name), out);
    } else if (SOURCE_EXT.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// ---------------------------------------------------------------- rules
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const HEX_IN_CODE = /(?<=['"`\s:(,[])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!var\()/g;
const NAMED_COLOR = /(?<![\w-])(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|navy|teal|silver|gold)(?![\w-])/;
const COLOR_PROPS = /^(color|background|background-color|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule|column-rule-color)$/;
const SPACING_PROPS = /^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|font-size|border-radius|letter-spacing|line-height)(-\w+)?$/;
const RAW_PX = /(?<![\w.-])(?:[2-9]|\d{2,})(?:\.\d+)?px\b/;
const TW_COLORS = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const TW_COLOR_UTIL = new RegExp(
  `(?<![\\w-])(?:[\\w-]+:)*(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|from|via|to|fill|stroke|divide|placeholder|accent|caret|decoration|shadow)-(?:(?:${TW_COLORS})-(?:50|[1-9]00|950)|white|black)(?:\\/\\d+)?(?![\\w-])`, 'g');
const TW_ARBITRARY_COLOR = /(?<![\w-])[\w:-]*-\[(?:#|rgba?\(|hsla?\(|oklch\()[^\]]*\]/g;
const TW_ARBITRARY_PX = /(?<![\w-])[\w:-]*(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|text|rounded(?:-[\w]+)?|space-[xy]|inset|top|left|right|bottom|tracking|leading)-\[\d+(?:\.\d+)?px\]/g;
const TW_ARBITRARY_FONT = /(?<![\w-])font-\[['"][^\]]+\]/g;
const TW_Z_MAGIC = /(?<![\w-])z-\[\d+\]/g;
const IMG_NO_ALT = /<(img|Image|NuxtImg|enhanced:img)\b(?![^>]*\balt\s*=)[^>]*>/g;
const CLICKABLE_DIV = /<(div|span)\b[^>]*\b(onClick|@click|v-on:click|on:click|\(click\))\s*=/g;
const INLINE_STYLE_OBJ = /style=\{\{([^}]*)\}\}/g;
const STYLE_ATTR = /\sstyle\s*=\s*"([^"]*)"/g;

function isTokenFile(file, text) {
  const base = path.basename(file).toLowerCase();
  if (/^(tokens|theme|globals?|index|variables|_variables|_tokens|app)\.(css|scss|sass|less)$/.test(base)) return true;
  return /:root\s*\{|@theme\b|\[data-theme/.test(text);
}

function lintFile(file, stack, report) {
  const text = fs.readFileSync(file, 'utf-8');
  if (text.includes('token-lint-disable-file')) return;
  const base = path.basename(file);
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const ext = path.extname(file).toLowerCase();
  const isCssFile = ['.css', '.scss', '.sass', '.less'].includes(ext);
  const isSfc = ['.vue', '.svelte', '.astro', '.html'].includes(ext);
  const isThemeStudioData = /theme-studio/.test(rel) && /^(palettes|fonts|shape-presets|presets)\./.test(base);
  if (isThemeStudioData || RAW_COLOR_OK.test(base)) return;
  const tokenFile = isCssFile && isTokenFile(file, text);

  const lines = text.split('\n');
  const issues = [];
  const add = (level, rule, line, msg, snippet) => {
    const prev = lines[line - 2] || '';
    const cur = lines[line - 1] || '';
    if (cur.includes('token-lint-ignore') || prev.includes('token-lint-ignore')) return;
    issues.push({ level, rule, line, msg, snippet: (snippet ?? cur).trim().slice(0, 140) });
  };
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;

  // CSS declaration checks (CSS files, <style> blocks, style="" attributes)
  const checkDecls = (chunk, line, ctx) => {
    for (const seg of chunk.split(/[;{}]/)) {
      const i = seg.indexOf(':');
      if (i < 0) continue;
      const prop = seg.slice(0, i).trim().toLowerCase();
      const value = seg.slice(i + 1).replace(/\/\*.*?\*\//g, '');
      if (!/^-{0,2}[a-z][\w-]*$/.test(prop)) continue; // selectors like a:hover, &:focus
      if (prop.startsWith('--')) {
        HEX.lastIndex = 0;
        if (!tokenFile && (HEX.test(value) || /\b(?:rgba?|hsla?|oklch)\(\s*(?!var\()/.test(value))) {
          add('warn', 'local-token', line, `Raw color in custom property ${prop} — define tokens only in the token file.`);
        }
        HEX.lastIndex = 0;
        continue;
      }
      HEX.lastIndex = 0; COLOR_FN.lastIndex = 0;
      if (HEX.test(value) || COLOR_FN.test(value)) add('error', 'hardcoded-color', line, `Hardcoded color in ${prop} → use var(--…) token.`);
      else if (COLOR_PROPS.test(prop) && NAMED_COLOR.test(value)) add('warn', 'named-color', line, `Named color in ${prop} → use a token.`);
      if (prop === 'font-family' && !/var\(|inherit|initial|unset/.test(value)) add('error', 'hardcoded-font', line, 'Raw font-family → use var(--font-display / --font-body).');
      if (SPACING_PROPS.test(prop) && RAW_PX.test(value) && !/var\(/.test(value)) add('warn', 'raw-px', line, `Raw px in ${prop} → use --space-* / --text-* / --radius-* tokens.`);
      if (prop === 'z-index' && /^\s*\d{2,}/.test(value)) add('warn', 'z-magic', line, 'Magic z-index → use --z-* tokens.');
      if (/^(transition|animation)(-duration)?$/.test(prop) && /\d(ms|s)\b/.test(value) && !/var\(--dur/.test(value)) add('warn', 'raw-duration', line, `Raw duration in ${prop} → use --dur-* / --ease-* tokens.`);
    }
  };

  let inStyle = isCssFile;
  let inBlockComment = false;
  lines.forEach((raw, idx) => {
    const n = idx + 1;
    let line = raw;
    // strip block comments spanning lines
    if (inBlockComment) { const end = line.indexOf('*/'); if (end < 0) return; line = line.slice(end + 2); inBlockComment = false; }
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0) { inBlockComment = true; line = line.slice(0, open); }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('<!--')) return;

    if (isSfc && /<style\b/.test(line)) { inStyle = true; return; }
    if (isSfc && /<\/style>/.test(line)) { inStyle = false; return; }

    if (inStyle) {
      if (/^\s*@apply\b/.test(line) && stack.tailwind) checkTailwind(line, n);
      checkDecls(line, n, 'css');
      return;
    }

    // ---- code / markup lines
    if (/\bthemeColor\b/.test(line)) return; // Next.js viewport/metadata needs a literal
    HEX_IN_CODE.lastIndex = 0;
    let m;
    while ((m = HEX_IN_CODE.exec(line))) {
      const before = line.slice(0, m.index);
      if (/(href|to|id|xlink:href)=\s*["'`]?$/.test(before) || /url\(\s*['"]?$/.test(before)) continue;
      if (/\.(fillStyle|strokeStyle|shadowColor)\s*=\s*['"`]?$/.test(before)) {
        add('warn', 'canvas-color', n, `Canvas color ${m[0]} → read the token at runtime: getComputedStyle(document.documentElement).getPropertyValue('--…').`);
        break;
      }
      add('error', 'hardcoded-color', n, `Hardcoded color ${m[0]} → use a token (var(--…) or a token-mapped utility).`);
      break;
    }
    COLOR_FN.lastIndex = 0;
    if (COLOR_FN.test(line) && /['"`]/.test(line)) add('error', 'hardcoded-color', n, 'Raw rgb()/hsl()/oklch() color → use a token.');
    if (/fontFamily\s*:\s*['"`](?![^'"`]*var\()/.test(line)) add('error', 'hardcoded-font', n, 'Raw fontFamily → use var(--font-…).');
    if (/zIndex\s*:\s*\d{2,}/.test(line)) add('warn', 'z-magic', n, 'Magic zIndex → use a --z-* token.');
    if (stack.tailwind) checkTailwind(line, n);
  });

  function checkTailwind(line, n) {
    TW_COLOR_UTIL.lastIndex = 0; TW_ARBITRARY_COLOR.lastIndex = 0; TW_ARBITRARY_PX.lastIndex = 0; TW_ARBITRARY_FONT.lastIndex = 0; TW_Z_MAGIC.lastIndex = 0;
    const palette = line.match(TW_COLOR_UTIL);
    if (palette) add('error', 'tw-palette', n, `Tailwind palette color ${[...new Set(palette)].slice(0, 3).join(' ')} bypasses tokens → map tokens in ${stack.tailwind >= 4 ? '@theme' : 'tailwind.config theme.extend'} and use those utilities.`);
    const arbColor = line.match(TW_ARBITRARY_COLOR);
    if (arbColor && !/var\(/.test(arbColor.join(''))) add('error', 'tw-arbitrary-color', n, `Arbitrary color ${arbColor[0]} → use a token utility.`);
    const arbPx = line.match(TW_ARBITRARY_PX);
    if (arbPx) add('warn', 'tw-arbitrary-px', n, `Arbitrary px ${[...new Set(arbPx)].slice(0, 3).join(' ')} → use the spacing/type scale.`);
    const arbFont = line.match(TW_ARBITRARY_FONT);
    if (arbFont) add('error', 'hardcoded-font', n, `Arbitrary font ${arbFont[0]} → use a token font utility.`);
    if (TW_Z_MAGIC.test(line)) add('warn', 'z-magic', n, 'Arbitrary z-[…] → use a z token.');
  }

  // ---- whole-file (multi-line) checks for markup
  if (!isCssFile) {
    let m;
    IMG_NO_ALT.lastIndex = 0;
    while ((m = IMG_NO_ALT.exec(text))) add('error', 'img-alt', lineAt(m.index), `<${m[1]}> missing alt (use alt="" for decorative images).`, m[0]);
    CLICKABLE_DIV.lastIndex = 0;
    while ((m = CLICKABLE_DIV.exec(text))) add('error', 'clickable-div', lineAt(m.index), `Clickable <${m[1]}> → use <button> or a link.`, m[0]);
    INLINE_STYLE_OBJ.lastIndex = 0;
    while ((m = INLINE_STYLE_OBJ.exec(text))) {
      if (/(margin|padding|gap|fontSize|borderRadius|top|left|right|bottom|letterSpacing)\w*\s*:\s*(['"`]\d+px['"`]|(?:[2-9]|\d{2,})\b(?!\s*[%a-z]))/.test(m[1])) {
        add('error', 'inline-px', lineAt(m.index), 'Inline style with raw spacing/size → use a class with var(--space-…) tokens.', m[0]);
      }
    }
    if (isSfc) {
      STYLE_ATTR.lastIndex = 0;
      while ((m = STYLE_ATTR.exec(text))) checkDecls(m[1], lineAt(m.index), 'attr');
    }
  }

  if (issues.length) report.push({ file: rel, issues });
}

// ---------------------------------------------------------------- main
function main() {
  const stacks = candidatePackageDirs().map(detectStack).filter(Boolean);
  const report = [];
  let scanned = 0;

  if (!JSON_OUT) console.log(`\n${BOLD}🔍 Design Token & Quality Linter${RESET}  ${DIM}${ROOT}${RESET}`);

  if (!stacks.length) {
    if (JSON_OUT) console.log(JSON.stringify({ stacks: [], scanned: 0, errors: 0, warnings: 0, files: [] }));
    else console.log(`${YELLOW}ℹ No frontend package found (no package.json with next/react/vue/svelte/astro/angular/solid). Nothing to lint yet.${RESET}\n`);
    process.exit(0);
  }

  const seen = new Set();
  for (const stack of stacks) {
    const files = [...stack.sourceDirs.flatMap((d) => walk(d, [])), ...stack.rootFiles].filter((f) => !seen.has(f) && seen.add(f));
    if (!JSON_OUT) {
      const dirs = stack.sourceDirs.map((d) => path.relative(ROOT, d).replace(/\\/g, '/') || '.').join(', ') || '(none found)';
      console.log(`${CYAN}▸ ${stack.name}${RESET}: ${stack.framework} · ${stack.styling.join(' + ')} · scanning ${dirs} (${files.length} files)`);
    }
    for (const f of files) { lintFile(f, stack, report); scanned++; }
  }

  const errors = report.reduce((s, r) => s + r.issues.filter((i) => i.level === 'error').length, 0);
  const warnings = report.reduce((s, r) => s + r.issues.filter((i) => i.level === 'warn').length, 0);

  if (JSON_OUT) {
    console.log(JSON.stringify({ stacks: stacks.map(({ name, framework, tailwind, styling }) => ({ name, framework, tailwind, styling })), scanned, errors, warnings, files: report }, null, 2));
    process.exit(errors ? 1 : 0);
  }

  console.log('');
  for (const { file, issues } of report) {
    const shown = QUIET ? issues.filter((i) => i.level === 'error') : issues;
    if (!shown.length) continue;
    console.log(`${BOLD}${file}${RESET}`);
    for (const i of shown) {
      const tag = i.level === 'error' ? `${RED}✖ error${RESET}` : `${YELLOW}⚠ warn ${RESET}`;
      console.log(`  ${tag} ${CYAN}:${i.line}${RESET} ${i.msg} ${DIM}[${i.rule}]${RESET}`);
      console.log(`         ${DIM}${i.snippet}${RESET}`);
    }
  }

  const byRule = {};
  report.forEach((r) => r.issues.forEach((i) => { byRule[i.rule] = (byRule[i.rule] || 0) + 1; }));
  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`Scanned files: ${scanned}`);
  console.log(`Errors:   ${errors ? RED : GREEN}${errors}${RESET}`);
  console.log(`Warnings: ${warnings ? YELLOW : GREEN}${warnings}${RESET}`);
  if (Object.keys(byRule).length) console.log(`By rule:  ${Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  if (errors) {
    console.log(`${RED}❌ Token validation failed. Replace hardcoded values with design tokens before shipping.${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}✨ Design token compliance: clean.${RESET}\n`);
}

main();
