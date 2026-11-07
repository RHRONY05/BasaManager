#!/usr/bin/env node
/**
 * design-canvas screenshot + design checks.
 *
 * Run from the PROJECT ROOT (Playwright is resolved from the project's node_modules):
 *   node <skills-dir>/design-canvas/scripts/shoot.mjs [designDir=design] [--only <text>] [--theme <name>] [--no-full]
 *   node <skills-dir>/design-canvas/scripts/shoot.mjs --url http://localhost:3000/x --size 390x844 --out impl__home [--dir design]
 *   node <skills-dir>/design-canvas/scripts/shoot.mjs --check        (setup: installs Playwright if missing)
 *
 * Playwright is taken from the project if present, else from a shared tools folder (~/.design-canvas),
 * which is installed automatically on first use. Pass --no-install to disable auto-install.
 *
 * Output: <designDir>/shots/*.png and <designDir>/shots/report.md. Exit code 1 when any check errors.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Shared, one-time tool install used when the project itself has no Playwright.
// Keeps project package.json untouched. Override with DESIGN_CANVAS_TOOLS=<dir>.
const TOOL_DIR = process.env.DESIGN_CANVAS_TOOLS || path.join(os.homedir(), ".design-canvas");

const RED = "\x1b[31m", YEL = "\x1b[33m", GRN = "\x1b[32m", CYN = "\x1b[36m", DIM = "\x1b[2m", RST = "\x1b[0m";

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) {
      const name = k.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { a[name] = next; i++; } else a[name] = true;
    } else a._.push(k);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));

async function chromiumFrom(baseDir) {
  const req = createRequire(path.join(baseDir, "package.json"));
  for (const name of ["playwright", "@playwright/test", "playwright-core"]) {
    try {
      const mod = await import(pathToFileURL(req.resolve(name)).href);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return { chromium, dir: baseDir };
    } catch { /* try next */ }
  }
  return null;
}

function run(cmd, cwd) {
  console.log(`${DIM}$ ${cmd}   (in ${cwd})${RST}`);
  const r = spawnSync(cmd, { cwd, shell: true, stdio: "inherit" });
  return r.status === 0;
}

async function loadChromium() {
  const found = (await chromiumFrom(process.cwd())) || (await chromiumFrom(TOOL_DIR));
  if (found || args["no-install"]) return found;
  console.log(`${YEL}Playwright not found — installing it once into ${TOOL_DIR} (shared by all projects, project files untouched)…${RST}`);
  fs.mkdirSync(TOOL_DIR, { recursive: true });
  const pkg = path.join(TOOL_DIR, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, JSON.stringify({ name: "design-canvas-tools", private: true }, null, 2));
  if (!run("npm install playwright@1 --no-audit --no-fund --loglevel=error", TOOL_DIR)) return null;
  return chromiumFrom(TOOL_DIR);
}

async function tryLaunch(chromium) {
  let last;
  for (const opt of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    try { return await chromium.launch(opt); } catch (e) { last = e; }
  }
  throw last;
}

async function launch({ chromium, dir }) {
  try { return await tryLaunch(chromium); }
  catch (e) {
    if (args["no-install"]) throw e;
    console.log(`${YEL}No usable browser (bundled Chromium, Chrome or Edge) — downloading Chromium for Playwright…${RST}`);
    if (!run("npx playwright install chromium", dir)) throw e;
    return tryLaunch(chromium);
  }
}

function installHelp() {
  console.log(`\n${RED}Could not install Playwright automatically.${RST} Check network/npm, then run:
  ${CYN}cd "${TOOL_DIR}" && npm install playwright@1 && npx playwright install chromium${RST}\n`);
}

/* ------------------------------------------------------------------ */
/* In-page checks (runs inside the artboard)                          */
/* ------------------------------------------------------------------ */
function pageChecks({ touchMin }) {
  const out = { errors: [], warnings: [] };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (el.classList.length) s += "." + [...el.classList].slice(0, 2).join(".");
    const label = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 32);
    return label ? `${s} "${label}"` : s;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Overflow
  const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const culprits = [...document.body.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().right > vw + 1 && !el.closest("[data-scroll-x]"))
      .slice(0, 3).map(desc);
    out.errors.push(`Horizontal overflow: content is ${sw}px wide in a ${vw}px artboard (e.g. ${culprits.join(", ")}). Mark intentional scrollers with data-scroll-x.`);
  }

  // Headings
  const h1 = document.querySelectorAll("h1").length;
  if (h1 !== 1) out.warnings.push(`Expected exactly one <h1>, found ${h1}.`);

  // Images
  document.querySelectorAll("img:not([alt])").forEach((img) => out.errors.push(`<img> without alt: ${img.getAttribute("src")}`));

  // Clickable divs
  document.querySelectorAll("div[onclick], span[onclick]").forEach((el) => out.errors.push(`Clickable ${desc(el)} — use <button> or <a href>.`));

  // Icon-only buttons without a name
  document.querySelectorAll("button, a[href]").forEach((el) => {
    if (!visible(el)) return;
    const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
    if (!name) out.errors.push(`Interactive element with no accessible name: ${desc(el)} — add aria-label.`);
  });

  // Touch targets
  const small = [];
  document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], summary').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li, td")) return; // inline text links are exempt
    let r = el.getBoundingClientRect();
    if (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio")) {
      const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${el.id}"]`));
      if (lab) r = lab.getBoundingClientRect();
    }
    if (r.width < touchMin - 0.5 || r.height < touchMin - 0.5) small.push(`${desc(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  });
  if (small.length) out.errors.push(`Touch targets under ${touchMin}px (${small.length}): ${small.slice(0, 6).join("; ")}${small.length > 6 ? " …" : ""}`);

  // Contrast
  const parse = (c) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((x) => (x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x)));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bot) => ({
    r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = ({ r, g, b }) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none" && !n.classList.contains("skeleton")) return { unknown: true };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const fails = new Map();
  let unknownBg = 0, unparsed = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode;
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (!visible(el) || el.closest("script, style, [disabled], [aria-disabled='true'], .sr-only, [aria-hidden='true']")) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) { unparsed++; continue; }
    const bg = bgOf(el);
    if (bg.unknown) { unknownBg++; continue; }
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const fgc = fg.a < 1 ? over(fg, bg) : fg;
    const r = ratio(fgc, bg);
    if (r < need) {
      const k = `${hex(fgc)} on ${hex(bg)}`;
      if (!fails.has(k)) fails.set(k, { r, need, sample: t.textContent.trim().replace(/\s+/g, " ").slice(0, 36), count: 0 });
      fails.get(k).count++;
    }
  }
  for (const [k, f] of fails) out.errors.push(`Contrast ${f.r.toFixed(2)}:1 (needs ${f.need}:1) — ${k}, ${f.count}× e.g. "${f.sample}"`);
  if (unknownBg) out.warnings.push(`${unknownBg} text element(s) sit on images/gradients — check contrast visually (use the --scrim token).`);
  if (unparsed) out.warnings.push(`${unparsed} text color(s) in a non-rgb color space were not contrast-checked.`);

  // Fonts
  const rootCS = getComputedStyle(document.documentElement);
  const first = (stack) => (stack || "").split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
  const tokenFams = ["--font-display", "--font-body", "--font-mono"].map((v) => rootCS.getPropertyValue(v)).filter((s) => s.trim());
  if (!tokenFams.length) out.errors.push("No --font-* tokens found — is tokens.css loading?");
  const allowed = new Set(tokenFams.map(first));
  const generic = new Set(["system-ui", "sans-serif", "serif", "monospace", "ui-monospace", "ui-sans-serif", "ui-serif", "inherit"]);
  const foreign = new Map();
  seen.forEach((el) => {
    const f = first(getComputedStyle(el).fontFamily);
    if (f && !allowed.has(f) && !generic.has(f)) foreign.set(f, (foreign.get(f) || 0) + 1);
  });
  for (const [f, n] of foreign) out.errors.push(`Font "${f}" used on ${n} element(s) but is not a token font.`);
  const faces = [...document.fonts];
  faces.filter((f) => f.status === "error").forEach((f) => out.errors.push(`Font failed to load: ${f.family} ${f.weight}`));
  allowed.forEach((fam) => {
    if (generic.has(fam) || fam.startsWith("ui-") || fam === "sfmono-regular" || fam === "consolas") return;
    if (!faces.some((f) => f.family.replace(/["']/g, "").toLowerCase() === fam))
      out.warnings.push(`Token font "${fam}" has no @font-face — check the Google Fonts @import in tokens.css.`);
  });

  out.scrollHeight = document.documentElement.scrollHeight;
  return out;
}

/* ------------------------------------------------------------------ */
/* Static source scan (hardcoded values)                              */
/* ------------------------------------------------------------------ */
function scanSource(html) {
  const errors = [], warnings = [];
  const blocks = [];
  html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => { blocks.push(css); return ""; });
  html.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_, a, b) => { blocks.push(a ?? b); return ""; });
  const colorRe = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g;
  const pxRe = /(?<![\w-])(?:[2-9]|\d{2,})(?:\.\d+)?px\b/;
  const spacingProps = /^(margin|padding|gap|row-gap|column-gap|top|right|bottom|left|inset|font-size|border-radius|line-height|letter-spacing|box-shadow)/;
  const hard = new Set(), px = new Set();
  for (const block of blocks) {
    const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const seg of clean.split(/[;{}]/)) {
      const i = seg.indexOf(":");
      if (i < 0) continue;
      const prop = seg.slice(0, i).trim().toLowerCase();
      const value = seg.slice(i + 1);
      if (prop.startsWith("--")) { hard.add(`custom property ${prop} defined in a screen — tokens belong in tokens.css`); continue; }
      let m;
      colorRe.lastIndex = 0;
      while ((m = colorRe.exec(value))) {
        if (value.slice(m.index + m[0].length).trimStart().startsWith("var(")) continue; // rgb(var(--shadow-color) / .1)
        hard.add(`${prop}: ${value.trim().slice(0, 60)}`);
      }
      if (spacingProps.test(prop) && pxRe.test(value)) px.add(`${prop}: ${value.trim().slice(0, 60)}`);
    }
  }
  hard.forEach((h) => errors.push(`Hardcoded color → use a token: ${h}`));
  px.forEach((p) => warnings.push(`Raw px value → use a --space/--text/--radius/--shadow token: ${p}`));
  return { errors, warnings };
}

/* ------------------------------------------------------------------ */
async function shoot(browser, { url, w, h, outBase, shotsDir, full }) {
  const errors = [], warnings = [];
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`Console error: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => errors.push(`Script error: ${String(e.message).slice(0, 160)}`));
  page.on("requestfailed", (r) => errors.push(`Failed to load: ${r.url()} (${r.failure()?.errorText || "failed"})`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    warnings.push(`Page did not reach network idle (${String(e.message).split("\n")[0]}) — screenshot taken anyway.`);
  }
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
  const files = [];
  const shot = path.join(shotsDir, `${outBase}.png`);
  await page.screenshot({ path: shot });
  files.push(shot);
  const res = await page.evaluate(pageChecks, { touchMin: w < 1024 ? 44 : 24 }).catch((e) => ({ errors: [`Checks failed: ${e.message}`], warnings: [], scrollHeight: h }));
  if (full && res.scrollHeight > h + 2) {
    const fullShot = path.join(shotsDir, `${outBase}.full.png`);
    await page.screenshot({ path: fullShot, fullPage: true });
    files.push(fullShot);
    warnings.push(`Content is ${res.scrollHeight}px tall in a ${h}px artboard — see .full.png; raise "h" in canvas.js if reviewers should see it all.`);
  }
  await context.close();
  return { errors: [...errors, ...res.errors], warnings: [...warnings, ...res.warnings], files };
}

function loadManifest(designDir) {
  const file = path.join(designDir, "canvas.js");
  if (!fs.existsSync(file)) throw new Error(`No manifest at ${file}`);
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file, timeout: 1000 });
  const C = sandbox.window.CANVAS;
  if (!C || !Array.isArray(C.groups)) throw new Error(`${file} must define window.CANVAS = { groups: [...] }`);
  return C;
}

async function main() {
  const pw = await loadChromium();
  if (!pw) { installHelp(); process.exit(2); }
  let browser;
  try { browser = await launch(pw); }
  catch (e) {
    console.log(`${RED}Could not launch a browser:${RST} ${String(e.message).split("\n")[0]}`);
    installHelp();
    process.exit(2);
  }
  if (args.check) {
    console.log(`${GRN}✓ Playwright ready${RST} (from ${pw.dir === process.cwd() ? "project" : pw.dir}, browser ${browser.version()}).`);
    await browser.close();
    return;
  }

  const designDir = path.resolve(args.dir || args._[0] || "design");
  const shotsDir = path.join(designDir, "shots");
  fs.mkdirSync(shotsDir, { recursive: true });
  const results = [];

  if (args.url) {
    const [w, h] = String(args.size || "1440x900").split("x").map(Number);
    const out = String(args.out || "url-shot").replace(/[^\w.-]+/g, "-");
    const r = await shoot(browser, { url: args.url, w, h, outBase: out, shotsDir, full: !args["no-full"] });
    results.push({ title: args.url, file: args.url, theme: "", ...r });
  } else {
    const C = loadManifest(designDir);
    const themes = Array.isArray(C.themes) && C.themes.length ? C.themes : ["light"];
    const useThemes = args.theme ? [String(args.theme)] : themes;
    for (const g of C.groups) {
      for (const s of g.screens || []) {
        if (args.only && !(s.file.includes(args.only) || (s.title || "").includes(args.only))) continue;
        const abs = path.join(designDir, s.file);
        if (!fs.existsSync(abs)) { results.push({ title: s.title, file: s.file, theme: "", errors: [`File not found: ${s.file}`], warnings: [], files: [] }); continue; }
        const stat = scanSource(fs.readFileSync(abs, "utf8"));
        for (const t of useThemes) {
          const base = `${g.id}__${path.basename(s.file, ".html")}${themes.length > 1 ? "." + t : ""}`;
          const url = pathToFileURL(abs).href + (themes.length > 1 ? `?theme=${encodeURIComponent(t)}` : "");
          process.stdout.write(`${DIM}shooting ${s.file}${themes.length > 1 ? " [" + t + "]" : ""}…${RST}\n`);
          const r = await shoot(browser, { url, w: +s.w || 390, h: +s.h || 844, outBase: base, shotsDir, full: !args["no-full"] });
          const firstTheme = t === useThemes[0];
          results.push({
            title: s.title, file: s.file, theme: themes.length > 1 ? t : "",
            errors: [...(firstTheme ? stat.errors : []), ...r.errors],
            warnings: [...(firstTheme ? stat.warnings : []), ...r.warnings],
            files: r.files,
          });
        }
      }
    }
  }
  await browser.close();

  // Report
  let E = 0, W = 0;
  const md = [`# Design check report`, ``, `Generated ${new Date().toISOString()}`, ``];
  for (const r of results) {
    E += r.errors.length; W += r.warnings.length;
    const head = `${r.title || r.file}${r.theme ? ` [${r.theme}]` : ""}`;
    const mark = r.errors.length ? `${RED}✖${RST}` : r.warnings.length ? `${YEL}⚠${RST}` : `${GRN}✓${RST}`;
    console.log(`${mark} ${head}`);
    r.errors.forEach((e) => console.log(`   ${RED}error${RST}  ${e}`));
    r.warnings.forEach((w) => console.log(`   ${YEL}warn${RST}   ${w}`));
    r.files.forEach((f) => console.log(`   ${DIM}${path.relative(process.cwd(), f)}${RST}`));
    md.push(`## ${r.errors.length ? "✖" : r.warnings.length ? "⚠" : "✓"} ${head}`, `File: \`${r.file}\``, "");
    r.files.forEach((f) => md.push(`- Screenshot: \`${path.relative(designDir, f).replace(/\\/g, "/")}\``));
    r.errors.forEach((e) => md.push(`- **Error:** ${e}`));
    r.warnings.forEach((w) => md.push(`- Warning: ${w}`));
    md.push("");
  }
  md.splice(3, 0, `**${results.length} artboard render(s) · ${E} error(s) · ${W} warning(s)**`, "");
  fs.writeFileSync(path.join(shotsDir, "report.md"), md.join("\n"));
  console.log(`\n${results.length} render(s) · ${E ? RED : GRN}${E} error(s)${RST} · ${W ? YEL : GRN}${W} warning(s)${RST} → ${path.relative(process.cwd(), path.join(shotsDir, "report.md"))}`);
  console.log(`${DIM}Next: open the PNGs and score them with references/critique.md.${RST}`);
  process.exit(E ? 1 : 0);
}

main().catch((e) => { console.error(`${RED}${e.stack || e}${RST}`); process.exit(2); });
