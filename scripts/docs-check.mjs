#!/usr/bin/env node
// Acceptance checks for the learning docs (.agent/10-LEARNING.md "Acceptance checks for docs").
// Run by `pnpm docs:check` AFTER `pnpm --filter @bm/docs build`. Node only, no dependencies.
//
//   (a) every feature page exists and has all 15 template headings, in order
//       (every concept page has its 6 standard headings; every page in the site structure exists)
//   (b) every .svg a page references exists
//   (c) every repo path a page mentions exists: inline code like `apps/api/src/app.ts` (optionally with
//       :line), relative links that leave docs/, and links to github.com/RHRONY05/BasaManager/blob/main/...
//       Fenced code blocks are skipped (directory trees and shell examples are not claims).
//   (d) VitePress reported no dead links: the build fails on them because `ignoreDeadLinks` is false, so
//       this script checks that the build ran and that the config still says false.
//
// Exit code 1 with a list of problems when anything fails.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const DIST = path.join(ROOT, 'apps', 'docs', '.vitepress', 'dist');
const CONFIG = path.join(ROOT, 'apps', 'docs', '.vitepress', 'config.ts');

// ---------------------------------------------------------------- the expected site (10-LEARNING.md)

const FEATURE_HEADINGS = [
  'What it does',
  'Explain it in 2 minutes',
  'Level 0 diagram',
  'Level 1 diagram',
  'Level 2 diagram',
  'Sequence diagrams',
  'Code walk',
  'Where the data lives',
  'Data lifecycle',
  'Edge cases & failure modes',
  'Security',
  'Concepts used',
  'Tests',
  'Try it yourself',
  'Self-check',
];

const CONCEPT_HEADINGS = [
  'What problem it solves',
  'How it works here',
  'Diagram',
  'Gotchas',
  'Where in code',
  'Self-check',
];

const FEATURES = [
  'auth',
  'organisations-and-staff',
  'buildings-and-units',
  'tenants-and-leases',
  'billing',
  'payments',
  'receipts-and-statements',
  'maintenance',
  'notifications',
  'notices',
  'documents',
  'dashboards-and-reports',
  'admin',
];

const CONCEPTS = [
  'authentication-and-sessions',
  'authorization',
  'multi-tenancy-and-rls',
  'validation-with-zod',
  'transactions-and-locking',
  'idempotency',
  'money-and-rounding',
  'dates-and-timezones',
  'realtime-socketio',
  'background-jobs',
  'notification-pipeline-outbox',
  'web-push-from-zero',
  'file-uploads-and-signed-urls',
  'payment-gateways-and-webhooks',
  'pdf-generation',
  'caching-and-rate-limiting',
  'logging',
  'sentry-from-zero',
  'environments',
  'ci-cd',
  'docker-and-vps',
  'backups',
  'security-checklist',
  'testing-strategy',
  'data-lifecycle-and-deletion',
];

const OTHER_PAGES = [
  'index.md',
  'learning-path.md',
  'features/index.md',
  'concepts/index.md',
  'overview/system-context.md',
  'overview/architecture.md',
  'overview/request-lifecycle.md',
  'overview/repo-map.md',
  'overview/data-map.md',
  'overview/glossary.md',
  'operations/index.md',
  'operations/deploy.md',
  'operations/rollback.md',
  'operations/backup-and-restore.md',
  'operations/rotate-a-secret.md',
  'operations/incident-playbook.md',
  'operations/reading-logs-and-sentry.md',
  'decisions/index.md',
  'decisions/ADR-001-monorepo.md',
  'reference/index.md',
  'reference/env-vars.md',
  'reference/error-codes.md',
];

// ---------------------------------------------------------------- helpers

/** Problems, as { check, file, line, message }. */
const problems = [];
const warnings = [];
const fail = (check, file, line, message) => problems.push({ check, file, line, message });

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const norm = (title) => title.toLowerCase().replace(/\(s\)/g, 's').replace(/\s+/g, ' ').trim();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vitepress') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Lines of a Markdown file with `inFence` flagged (``` or ~~~ blocks). */
function readLines(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let fence = null;
  return lines.map((text, i) => {
    const m = /^\s*(```+|~~~+)/.exec(text);
    let inFence = fence !== null;
    if (m) {
      if (fence === null) {
        fence = m[1][0];
        inFence = true;
      } else if (m[1][0] === fence) {
        fence = null;
        inFence = true; // the closing line is still part of the block
      }
    }
    return { n: i + 1, text, inFence };
  });
}

function headingsOf(file) {
  const found = [];
  for (const { n, text, inFence } of readLines(file)) {
    if (inFence) continue;
    const m = /^##\s+(.+?)\s*$/.exec(text);
    if (m) found.push({ n, title: m[1] });
  }
  return found;
}

// ---------------------------------------------------------------- (a) pages and headings

function checkPages() {
  const expected = [
    ...OTHER_PAGES,
    ...FEATURES.map((s) => `features/${s}.md`),
    ...CONCEPTS.map((s) => `concepts/${s}.md`),
  ];
  for (const page of expected) {
    if (!fs.existsSync(path.join(DOCS, page)))
      fail('a', `docs/${page}`, 0, 'page from the site structure is missing');
  }

  for (const slug of fs.existsSync(path.join(DOCS, 'features'))
    ? fs
        .readdirSync(path.join(DOCS, 'features'))
        .filter((f) => f.endsWith('.md') && f !== 'index.md')
        .map((f) => f.slice(0, -3))
    : []) {
    const file = path.join(DOCS, 'features', `${slug}.md`);
    const headings = headingsOf(file).map((h) => {
      const m = /^(\d+)\.\s+(.+)$/.exec(h.title);
      return { ...h, num: m ? Number(m[1]) : null, text: m ? m[2] : h.title };
    });
    const numbered = headings.filter((h) => h.num !== null);
    if (numbered.length !== FEATURE_HEADINGS.length) {
      fail(
        'a',
        rel(file),
        0,
        `has ${numbered.length} numbered "## n. Title" headings, expected ${FEATURE_HEADINGS.length}`,
      );
    }
    FEATURE_HEADINGS.forEach((title, i) => {
      const h = numbered[i];
      if (!h || h.num !== i + 1 || norm(h.text) !== norm(title)) {
        fail(
          'a',
          rel(file),
          h ? h.n : 0,
          `heading ${i + 1} should be "## ${i + 1}. ${title}"${h ? `, found "## ${h.title}"` : ''}`,
        );
      }
    });
  }

  for (const slug of CONCEPTS) {
    const file = path.join(DOCS, 'concepts', `${slug}.md`);
    if (!fs.existsSync(file)) continue;
    const titles = headingsOf(file).map((h) => norm(h.title));
    for (const title of CONCEPT_HEADINGS) {
      if (!titles.includes(norm(title)))
        fail('a', rel(file), 0, `concept page lacks the "## ${title}" section`);
    }
  }
}

// ---------------------------------------------------------------- (b) and (c) per Markdown file

const INLINE_CODE = /`([^`\n]+)`/g;
const LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const IMG_TAG = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
const GITHUB = /^https:\/\/github\.com\/RHRONY05\/BasaManager\/(?:blob|tree)\/main\/(.+)$/;

// First path segments / root files that mark a string as "a repo path".
const KNOWN_ROOTS = new Set([
  'apps',
  'packages',
  'infra',
  'scripts',
  'tests',
  'docs',
  '.github',
  '.agent',
  '.claude',
]);
const ROOT_FILES = new Set([
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.base.json',
  'playwright.config.ts',
  'vitest.config.ts',
  'vitest.int.config.ts',
  'eslint.config.js',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'RETRO.md',
  '.gitignore',
  '.gitattributes',
  '.gitleaks.toml',
  '.prettierrc.json',
  '.prettierignore',
  '.env.example',
  '.env.test.example',
]);
const GLOB_OR_PLACEHOLDER = /[*?<>{}$()|…\s[\]=,;'"]/;

/** Returns the repo-relative path a string stands for, or null when it is not a repo path claim. */
function asRepoPath(raw) {
  let s = raw.trim();
  s = s.replace(/#.*$/, '').replace(/:\d+(?:-\d+)?$/, '');
  if (!s || GLOB_OR_PLACEHOLDER.test(s)) return null;
  if (!/^[\w.@/-]+$/.test(s)) return null;
  if (s.startsWith('./')) s = s.slice(2);
  const first = s.split('/')[0];
  if (s.includes('/')) return KNOWN_ROOTS.has(first) ? s : null;
  return ROOT_FILES.has(s) ? s : null;
}

function checkMarkdown(file) {
  const dir = path.dirname(file);
  const referencedSvgs = new Set();
  for (const { n, text, inFence } of readLines(file)) {
    if (inFence) continue;

    // (b) svg references: image/link targets and <img src>
    const targets = [];
    for (const m of text.matchAll(LINK)) targets.push(m[1]);
    for (const m of text.matchAll(IMG_TAG)) targets.push(m[1]);
    for (const target of targets) {
      const clean = target.replace(/[#?].*$/, '');
      if (/^https?:\/\//.test(clean)) continue;
      if (clean.toLowerCase().endsWith('.svg')) {
        const abs = clean.startsWith('/') ? path.join(DOCS, clean) : path.resolve(dir, clean);
        referencedSvgs.add(abs);
        if (!fs.existsSync(abs)) fail('b', rel(file), n, `references ${clean}, which does not exist`);
      }
    }

    // (c) repo paths in links
    for (const target of targets) {
      const gh = GITHUB.exec(target);
      if (gh) {
        const p = gh[1].replace(/[#?].*$/, '');
        if (!fs.existsSync(path.join(ROOT, p)))
          fail('c', rel(file), n, `link points at ${p}, which does not exist in the repo`);
        continue;
      }
      const clean = target.replace(/[#?].*$/, '');
      if (
        !clean ||
        /^[a-z][a-z0-9+.-]*:/i.test(clean) ||
        clean.startsWith('/') ||
        clean.endsWith('.md') ||
        clean.toLowerCase().endsWith('.svg')
      ) {
        continue; // external, site route, page (VitePress checks those) or svg (checked above)
      }
      const abs = path.resolve(dir, clean);
      const inRepo = rel(abs);
      if (!inRepo.startsWith('..') && !fs.existsSync(abs))
        fail('c', rel(file), n, `relative link ${clean} does not exist`);
    }

    // (c) repo paths in inline code
    for (const m of text.matchAll(INLINE_CODE)) {
      const p = asRepoPath(m[1]);
      if (p && !fs.existsSync(path.join(ROOT, p)))
        fail('c', rel(file), n, `mentions ${p}, which does not exist in the repo`);
    }
  }
  return referencedSvgs;
}

function checkSvgAndPaths() {
  const referenced = new Set();
  for (const file of walk(DOCS).filter((f) => f.endsWith('.md'))) {
    for (const svg of checkMarkdown(file)) referenced.add(path.normalize(svg));
  }
  const diagramsDir = path.join(DOCS, 'diagrams');
  if (fs.existsSync(diagramsDir)) {
    for (const svg of walk(diagramsDir).filter((f) => f.endsWith('.svg'))) {
      if (!referenced.has(path.normalize(svg))) warnings.push(`${rel(svg)} is not referenced from any page`);
    }
  }
}

// ---------------------------------------------------------------- (d) dead links

function checkBuild() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    fail(
      'd',
      rel(DIST),
      0,
      'no build output: run `pnpm --filter @bm/docs build` first (pnpm docs:check does)',
    );
  }
  const config = fs.existsSync(CONFIG) ? fs.readFileSync(CONFIG, 'utf8') : '';
  if (!/ignoreDeadLinks:\s*false/.test(config)) {
    fail('d', rel(CONFIG), 0, 'ignoreDeadLinks must be `false` so VitePress fails the build on dead links');
  }
}

// ---------------------------------------------------------------- run

checkPages();
checkSvgAndPaths();
checkBuild();

for (const w of warnings) process.stdout.write(`warning: ${w}\n`);

if (problems.length > 0) {
  const label = {
    a: '(a) pages and headings',
    b: '(b) svg files',
    c: '(c) repo paths',
    d: '(d) build and dead links',
  };
  process.stderr.write(`\ndocs:check FAILED: ${problems.length} problem(s)\n`);
  for (const key of ['a', 'b', 'c', 'd']) {
    const list = problems.filter((p) => p.check === key);
    if (list.length === 0) continue;
    process.stderr.write(`\n${label[key]}\n`);
    for (const p of list) process.stderr.write(`  ${p.file}${p.line ? `:${p.line}` : ''}  ${p.message}\n`);
  }
  process.exit(1);
}

const pages = walk(DOCS).filter((f) => f.endsWith('.md')).length;
process.stdout.write(
  `docs:check OK: ${pages} pages, ${FEATURES.length} features x ${FEATURE_HEADINGS.length} headings, ${CONCEPTS.length} concepts, svg and repo paths resolve, build has no dead links\n`,
);
