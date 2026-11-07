# Brief V1-ci (for: devops subagent)

Read first: `AGENTS.md`, `.agent/rules/basamanager.md` (Infrastructure, Secrets), `.agent/02-ARCHITECTURE.md` (Environments, Env vars, Folder tree), `.agent/09-TESTING.md` (CI section, test data, mocks), `.agent/11-AGENT-TEAM.md` (Merge gates), `.agent/PROGRESS.md` (Environment facts, Decisions).

Work in the worktree `D:\Projects\bm-wt\V1-ci` (branch `feat/V1-ci`). Commit there with Conventional Commits (`ci:`/`infra:`).

## Goal
Local service containers for dev and test, the GitHub repository with CI, and the PR template — so the first V1 PR runs every CI gate.

## Decided conventions (use exactly)
- Dev ports: Postgres 5432, Redis 6379, Mailpit SMTP 1025 / UI 8025. Test ports: Postgres 5433, Redis 6380, Mailpit 1026 / 8026. API dev 4000 / test 4100; web dev 5173 / e2e preview 4173.
- Postgres 17: superuser `bm_owner` (password `bm_owner_dev`). An init script `infra/postgres/init/01-roles.sql` creates login roles `bm_app` (`NOBYPASSRLS`, password `bm_app_dev`), `bm_worker` (`BYPASSRLS`, `bm_worker_dev`), `bm_readonly` (`bm_readonly_dev`) and databases `basamanager_dev` (dev compose) / `basamanager_test` (test compose), owned by `bm_owner`, with `citext` and `pgcrypto` extensions. These passwords are **dev/test only** (say so in a comment); staging/prod get generated ones in V3. The V4 migration `0001_roles.sql` will be idempotent on top of this.
- Redis 7 with `requirepass redis_dev`. Mailpit `axllent/mailpit`.
- `.env.example` (root): every variable from 02 with dev values where safe (the dev passwords above, `STORAGE_DRIVER=local`, `SMTP_URL=smtp://localhost:1025`, `APP_ENV=dev`) and **empty** values for every human/generated secret. `.env.test.example`: the same for tests (test ports, `APP_ENV=test`, `NODE_ENV=test`, `PAYMENTS_MOCK=true`, `E2E_PASSWORD=e2e-only-password-123`, a fixed dev-only `JWT_SECRET`/`STORAGE_URL_SECRET` clearly marked test-only). Developers copy them to `.env` / `.env.test`.

## Scope — files you may create or change
- `infra/compose.dev.yml`, `infra/compose.test.yml` (tmpfs data for test), `infra/postgres/init/*.sql`
- `.env.example`, `.env.test.example`
- `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `.github/CODEOWNERS` (optional), `.gitleaks.toml` if needed to allow the dev-only values
- `.agent/02-ARCHITECTURE.md` (record the ports + local DB roles), `.agent/09-TESTING.md` (if CI differs from the doc), `.agent/PROGRESS.md` Environment facts (repo URL, branch protection result)

## CI (`ci.yml`, on `pull_request` and `push` to `main`)
Per 09 "CI": Node 22 + Corepack pnpm 12 with store cache. Jobs: `lint-typecheck` (`pnpm typecheck`, `pnpm lint`), `unit` (`pnpm test -- --coverage`), `integration` (services postgres:17 + redis:7 + mailpit on the **test** ports with the same init roles — run the init SQL with `psql` in a step since service containers can't mount files; copy `.env.test.example` → `.env.test`; `pnpm test:int`), `e2e` (start test services, `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`, upload `playwright-report` on failure), `docs` (`pnpm docs:check`), `security` (`pnpm audit --prod --audit-level high`, gitleaks action, CodeQL for javascript-typescript). `build-images` comes in V3 — leave it out. Scripts the jobs call may not exist yet in your worktree (other parts add them); that's expected — use the script names from 09.

## GitHub (do this, then record results)
1. `gh repo create RHRONY05/BasaManager --private --source "D:\Projects\BasaManager" --remote origin` then push `main` from `D:\Projects\BasaManager` (it holds only the planning pack + workspace skeleton commit; run a gitleaks-style grep for secrets first). Don't push feature branches.
2. Create GitHub Environments `staging` and `production` (no secrets yet).
3. Branch protection on `main`: required status checks = the CI job names above, strict (up to date), no force push, no deletion, linear history (squash merges). **Required approving reviews: 0** — the reviewer agent posts its review from the owner's own account, and GitHub doesn't let an account approve its own PR; record this in 11-AGENT-TEAM.md Merge gates ("approval = reviewer agent's APPROVE review comment; the lead checks it before merging"). If GitHub refuses branch protection on a private repo for this plan, try a repository ruleset; if that's also refused, record it in PROGRESS.md Environment facts and 11-AGENT-TEAM.md (the lead enforces the gates by hand) — don't change the plan or pay for anything.
4. Settings: allow squash merge only, auto-delete head branches.

## Must pass
- `docker compose -f infra/compose.test.yml up -d` → healthy; `psql` as `bm_app` connects to `basamanager_test`; Redis `PING` with the password; Mailpit UI responds. Same for dev compose (then `down`; leave nothing running except what you were asked).
- `actionlint` if available via `npx`/docker, else careful review.

## When done, reply with
What you created, the repo URL, branch-protection result (exact), the CI job names, and anything ambiguous.
