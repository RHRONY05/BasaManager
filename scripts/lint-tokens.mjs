#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, 'apps', 'web', 'src');
const EXCLUDED_FILE = path.normalize(path.join(ROOT, 'apps', 'web', 'src', 'styles', 'tokens.css'));

// ---------------------------------------------------------------- regexes
const HEX_IN_CODE = /(?<=['"`\s:(,[])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*(?!var\()/gi;
const NAMED_COLOR =
  /(?<![\w-])(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|navy|teal|silver|gold)(?![\w-])/i;
const COLOR_PROPS =
  /^(color|background|background-color|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color)$/i;

// Tailwind arbitrary checks
const TW_ARBITRARY_MATCH = /(?<![\w-])(?:[\w:-]+)?-\[([^\]]+)\]/g;
const TW_ARBITRARY_SIZING_PREFIX =
  /(?<![\w-])(?:[\w:-]*:)?(p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|text|rounded(?:-[\w]+)?|space-[xy]|inset|top|left|right|bottom|tracking|leading|w|h|min-w|min-h|max-w|max-h|size|z)-\[/;
const PX_LITERAL = /\b\d+(?:\.\d+)?px\b/i;

// Inline style object
const INLINE_STYLE_OBJ = /style=\{\{([^}]*)\}\}/g;
const STYLE_ATTR = /\sstyle\s*=\s*"([^"]*)"/g;

function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.css'].includes(ext)) {
          if (path.normalize(fullPath) !== EXCLUDED_FILE) {
            files.push(fullPath);
          }
        }
      }
    }
  }

  walk(dir);
  return files;
}

function lintFile(filePath, issues) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const text = fs.readFileSync(filePath, 'utf-8');

  if (text.includes('token-lint-disable-file')) {
    return;
  }

  const lines = text.split('\n');
  const isCss = filePath.endsWith('.css');
  let inBlockComment = false;

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    let line = rawLine;

    // Handle block comments across lines
    if (inBlockComment) {
      const endComment = line.indexOf('*/');
      if (endComment === -1) return;
      line = line.slice(endComment + 2);
      inBlockComment = false;
    }

    line = line.replace(/\/\*.*?\*\//g, '');
    const startComment = line.indexOf('/*');
    if (startComment !== -1) {
      inBlockComment = true;
      line = line.slice(0, startComment);
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('<!--')) {
      return;
    }

    // Check escape hatches: current or previous line
    const prevLine = lines[idx - 1] || '';
    if (rawLine.includes('// token-lint-ignore') || prevLine.includes('// token-lint-ignore')) {
      return;
    }

    const addIssue = (col, rule, msg) => {
      issues.push({
        file: relPath,
        line: lineNum,
        col: Math.max(1, col),
        rule,
        msg,
      });
    };

    // 1. Hex color literals
    let hexMatch;
    HEX_IN_CODE.lastIndex = 0;
    while ((hexMatch = HEX_IN_CODE.exec(line)) !== null) {
      const before = line.slice(0, hexMatch.index);
      if (/(href|to|id|xlink:href)=\s*["'`]?$/.test(before) || /url\(\s*['"]?$/.test(before)) {
        continue;
      }
      addIssue(
        hexMatch.index + 1,
        'hardcoded-color',
        `Hardcoded color ${hexMatch[0]} → use a token (var(--…) or token utility).`,
      );
    }

    // 2. Color functions (rgb, rgba, hsl, oklch, etc.)
    let fnMatch;
    COLOR_FN.lastIndex = 0;
    while ((fnMatch = COLOR_FN.exec(line)) !== null) {
      addIssue(
        fnMatch.index + 1,
        'hardcoded-color',
        `Raw color function ${fnMatch[0]} → use a token (var(--…) or token utility).`,
      );
    }

    // 3. Named colours used as CSS values
    if (isCss) {
      const segments = line.split(/[;{}]/);
      for (const seg of segments) {
        const colonIdx = seg.indexOf(':');
        if (colonIdx === -1) continue;
        const prop = seg.slice(0, colonIdx).trim().toLowerCase();
        const val = seg.slice(colonIdx + 1).trim();
        if (COLOR_PROPS.test(prop) && !val.includes('var(')) {
          const namedMatch = NAMED_COLOR.exec(val);
          if (namedMatch) {
            const col = line.indexOf(namedMatch[0]) + 1;
            addIssue(
              col > 0 ? col : 1,
              'named-color',
              `Named color '${namedMatch[0]}' used in ${prop} → use a token.`,
            );
          }
        }
      }
    }

    // 4. Tailwind arbitrary colour & size values:
    // Disallowed: bg-[#...], text-[13px], p-[7px], etc.
    // Allowed: [var(--...)], [env(...)], [overflow-wrap:anywhere]
    let twMatch;
    TW_ARBITRARY_MATCH.lastIndex = 0;
    while ((twMatch = TW_ARBITRARY_MATCH.exec(line)) !== null) {
      const fullUtility = twMatch[0];
      const bracketContent = twMatch[1].trim();

      // Allowed exceptions
      if (
        bracketContent.startsWith('var(--') ||
        bracketContent.startsWith('env(') ||
        bracketContent === 'overflow-wrap:anywhere' ||
        fullUtility === '[overflow-wrap:anywhere]'
      ) {
        continue;
      }

      // Check arbitrary colors
      if (
        bracketContent.startsWith('#') ||
        /\b(?:rgba?|hsla?|oklch|oklab)\(/i.test(bracketContent) ||
        NAMED_COLOR.test(bracketContent)
      ) {
        addIssue(
          twMatch.index + 1,
          'tw-arbitrary-color',
          `Tailwind arbitrary color ${fullUtility} → use a token utility or var(--…).`,
        );
        continue;
      }

      // Check arbitrary sizing/spacing/pixel values
      const beforeBracket = line.slice(0, twMatch.index + fullUtility.indexOf('[') + 1);
      if (TW_ARBITRARY_SIZING_PREFIX.test(beforeBracket) || PX_LITERAL.test(bracketContent)) {
        addIssue(
          twMatch.index + 1,
          'tw-arbitrary-size',
          `Tailwind arbitrary size/spacing ${fullUtility} → use scale or var(--…) token.`,
        );
      }
    }

    // 5. Inline style={{ ... }} checks
    if (!isCss) {
      let inlineMatch;
      INLINE_STYLE_OBJ.lastIndex = 0;
      while ((inlineMatch = INLINE_STYLE_OBJ.exec(line)) !== null) {
        const styleBody = inlineMatch[1];
        if (HEX_IN_CODE.test(styleBody) || COLOR_FN.test(styleBody)) {
          addIssue(
            inlineMatch.index + 1,
            'inline-style-color',
            `Inline style contains raw color literal → use a token class or var(--…).`,
          );
        }
        if (
          /(color|backgroundColor|borderColor)\s*:\s*['"`](white|black|red|green|blue|gray)['"`]/i.test(
            styleBody,
          )
        ) {
          addIssue(
            inlineMatch.index + 1,
            'inline-style-color',
            `Inline style contains named color literal → use a token.`,
          );
        }
        if (
          /(margin|padding|gap|fontSize|borderRadius|top|left|right|bottom|width|height)\w*\s*:\s*(['"`]\d+px['"`]|(?:[2-9]|\d{2,})\b(?!\s*[%a-z]))/.test(
            styleBody,
          )
        ) {
          addIssue(
            inlineMatch.index + 1,
            'inline-style-spacing',
            `Inline style contains raw spacing/size literal → use a token class.`,
          );
        }
      }

      let attrMatch;
      STYLE_ATTR.lastIndex = 0;
      while ((attrMatch = STYLE_ATTR.exec(line)) !== null) {
        const styleBody = attrMatch[1];
        if (HEX_IN_CODE.test(styleBody) || COLOR_FN.test(styleBody)) {
          addIssue(
            attrMatch.index + 1,
            'inline-style-color',
            `style="..." attribute contains raw color literal → use a token.`,
          );
        }
      }
    }
  });
}

function main() {
  const files = collectFiles(TARGET_DIR);
  const issues = [];

  for (const file of files) {
    lintFile(file, issues);
  }

  if (issues.length === 0) {
    console.log('token lint: 0 errors');
    process.exit(0);
  }

  // Print file:line:col rule message
  for (const issue of issues) {
    console.log(`${issue.file}:${issue.line}:${issue.col} ${issue.rule} ${issue.msg}`);
  }

  const fileSet = new Set(issues.map((i) => i.file));
  console.log(`\ntoken lint: ${issues.length} error(s) found across ${fileSet.size} file(s)`);
  process.exit(1);
}

main();
