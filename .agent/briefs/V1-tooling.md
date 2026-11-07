# Brief V1-tooling (for: agy gemini-3.8-flash-high)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/02-ARCHITECTURE.md` (Stack, Folder tree), `.agent/09-TESTING.md` (Layers, coverage thresholds, Scripts, Speed checks), `.claude/skills/frontend-implementation/SKILL.md` (override + token-lint section) and `.claude/skills/frontend-implementation/scripts/lint-tokens.js`.

**You cannot run shell commands in this session (they are denied); do not try. Use only your file read/write/edit tools.** The lead installs packages and runs every command after you finish, then sends you the exact errors.

## Goal
Repo-wide lint/format/test tooling: ESLint flat config, Prettier, the token-lint script, the root Vitest configs (unit + integration), the worktree port helper, and the `tests/` TypeScript config.

## Scope — files you may create or change
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- `scripts/lint-tokens.mjs`, `scripts/ports.mjs`
- `vitest.config.ts`, `vitest.int.config.ts`
- `tests/tsconfig.json`
**Do not touch:** `package.json` files (the lead adds dependencies), `apps/**`, `packages/**`, `infra/**`, `.github/**`, `.agent/**`.

## Installed tools you can use (already in root devDependencies)
`eslint` 10, `@eslint/js`, `typescript-eslint` 8 (use the `typescript-eslint` package's `tseslint.config()`/`configs.recommended`), `eslint-plugin-react-hooks` 7 (its flat `configs['recommended-latest']` or `configs.recommended` — check the package's `index.d.ts`/README in `node_modules/eslint-plugin-react-hooks`), `eslint-config-prettier` (flat: `eslint-config-prettier/flat`), `globals`, `prettier` 3, `vitest` 5 + `@vitest/coverage-v8`. Read their files under `node_modules` to get the exact export names for these versions instead of guessing.

## Requirements
1. **ESLint** (`eslint.config.js`, ESM): ignores `**/node_modules`, `**/dist`, `**/coverage`, `**/generated/**`, `.agent/**`, `.claude/**`, `docs/.vitepress/cache/**`, `docs/.vitepress/dist/**`, `playwright-report/**`, `test-results/**`. JS recommended + typescript-eslint recommended for `**/*.{ts,tsx}`; React hooks rules for `apps/web/**/*.{ts,tsx}`; Node globals for `apps/api`, `apps/worker`, `scripts`, `tests`; browser globals for `apps/web`. Rules: `no-console: error` everywhere except `scripts/**` and `tests/**`; `@typescript-eslint/no-explicit-any: error`; `@typescript-eslint/no-unused-vars` with `_` prefix ignored; `eslint-config-prettier` last.
2. **Prettier**: `singleQuote: true`, `printWidth: 110`, `trailingComma: 'all'`, `semi: true`. `.prettierignore`: `.agent`, `.claude`, `pnpm-lock.yaml`, `**/generated`, `docs/reference/openapi.json`, `**/dist`, `coverage`, `playwright-report`, `test-results`, `docs/.vitepress/cache`, `docs/.vitepress/dist`, `*.md` under `docs/` is fine to format.
3. **Token lint** `scripts/lint-tokens.mjs` (Node ESM, no deps): port the rules of the skill's `lint-tokens.js` to this repo. Scan `apps/web/src/**/*.{ts,tsx,css}` except `apps/web/src/styles/tokens.css`. Errors: raw colour literals (`#rgb`/`#rrggbb[aa]`, `rgb(`, `rgba(`, `hsl(`, `oklch(`, named colours like `white`/`black` used as CSS values), Tailwind arbitrary colour/size values (`bg-[#…]`, `text-[13px]`, `p-[7px]`, etc. — `[var(--…)]` and `[env(…)]`/`[overflow-wrap:anywhere]` are allowed), and inline `style={{ color: '…' }}` with literals. Print `file:line:col rule message`, a summary, exit 1 on any error, exit 0 with "token lint: 0 errors" otherwise. Keep it fast (<1 s on 500 files).
4. **Vitest unit** `vitest.config.ts`: `test.projects` for `packages/shared` (node), `packages/domain` (node), `apps/api` (node; include `src/**/*.test.ts`, exclude `**/*.int.test.ts`), `apps/worker` (node), `apps/web` (jsdom, `setupFiles: ['apps/web/src/test/setup.ts']`, include `src/**/*.test.{ts,tsx}`). Projects whose folder has no tests must not fail the run (`passWithNoTests: true`). Coverage (v8) `include` the source folders; thresholds: `packages/domain/src/**` 95% lines + branches, `apps/api/src/**` 80% lines (glob thresholds). Coverage only runs with `--coverage`.
5. **Vitest integration** `vitest.int.config.ts`: include `apps/api/test/**/*.int.test.ts`, node env, `globalSetup: ['apps/api/test/global-setup.ts']` (the api part writes it), `fileParallelism: false`, `testTimeout: 20000`, `hookTimeout: 60000`, `passWithNoTests: false`.
6. **Ports** `scripts/ports.mjs`: exports `ports(taskId?)` and as a CLI prints `KEY=value` lines. Base: `API_PORT=4000`, `WEB_PORT=5173`, `E2E_API_PORT=4100`, `E2E_WEB_PORT=4173`. With a task id (env `BM_TASK` or the worktree folder name like `V5-api`), add an offset `10 × (1 + hash(taskId) % 40)` to every port and also print `TEST_DB_NAME=basamanager_test_<task id lowercased, non-alnum → _>`. No task id → no offset and `TEST_DB_NAME=basamanager_test`.
7. **`tests/tsconfig.json`**: extends `../tsconfig.base.json`, `lib` ES2023 + DOM, `types: ["node"]`, include `**/*.ts`.

## Acceptance criteria
After the lead runs `pnpm install`: `pnpm exec eslint .` runs (it may report problems in other parts' code later, but the config itself loads), `node scripts/lint-tokens.mjs` exits 0 on an empty `apps/web/src`, `pnpm exec vitest run` passes with no tests, `node scripts/ports.mjs` prints the base ports and `BM_TASK=V5-api node scripts/ports.mjs` prints offset ports.

## Do not
Add dependencies, edit package.json, make design decisions, or create files outside the scope list.

## When done, reply with
1. Files written. 2. Anything ambiguous in the docs. 3. Anything you could not finish and why.
