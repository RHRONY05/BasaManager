# ADR-001: One pnpm monorepo

- **Status:** accepted (planning, 2026-11-07; built in task V1)
- **Deciders:** Rony (owner) with the planning agent

## Context

BasaManager is several programs that must agree with each other: a React web app, an Express API, a background
worker, a documentation site, and two libraries of shared code (the request/response contract, and the pure
billing logic). The web app and the API in particular must agree on **every** request and response shape. If
they disagree, the bug appears at runtime in front of a user.

The team that builds it is a set of AI agents working in parallel, each on its own branch. That raises the
cost of any setup where one change needs several repositories, several pull requests and several deploys to
stay consistent.

## Options considered

| Option                                          | For                                                                                    | Against                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Separate repos** (web, api, worker, shared)   | Hard boundaries; independent deploys                                                   | A contract change is 3 PRs and a version bump; shared code needs publishing; easy to drift   |
| **Monorepo + pnpm workspaces** (chosen)         | One PR changes api, web and the contract together; one lockfile; one CI; no publishing | Everything shares one repo and one CI; needs discipline about who may import what            |
| Monorepo + a build orchestrator (Turborepo, Nx) | Task caching and a dependency-aware task graph                                         | Another tool to learn and explain; the project is small enough that the gain is not worth it |

## Decision

One Git repository with **pnpm workspaces** (`pnpm-workspace.yaml` lists `apps/*` and `packages/*`), and no
extra orchestration tool.

- Apps: `@bm/api`, `@bm/web`, `@bm/worker`, `@bm/docs`.
- Packages: `@bm/shared` (Zod schemas, types, error codes, used by web **and** api) and `@bm/domain` (pure
  business logic with no I/O).
- Packages are consumed **as TypeScript source**: `packages/shared/package.json` points `exports` at
  `./src/*.ts`. There is no build step for libraries; Vite, `tsx` and Vitest read the `.ts` files directly.
- Root scripts fan out with `pnpm -r` (for example `typecheck`) or call one tool for the whole repo (Vitest,
  Playwright, ESLint).
- Dependencies are pinned to exact versions, and pnpm's `minimumReleaseAge` policy refuses packages published in
  the last day (a supply-chain safety margin).

## Consequences

**Good**

- A change to a request shape is **one pull request**: edit the schema in `packages/shared`, and the API and
  the web app both fail to compile until they agree. The contract cannot drift.
- One install, one lockfile, one CI pipeline, one place to run `pnpm test:all`.
- The docs, the infra files and the code that they describe live together, so a reviewer can check that they
  match in the same diff.

**Costs and rules we now live with**

- **Import direction is a rule, not something the tooling enforces.** `web` may import `shared`; `api` may
  import `shared` and `domain`; `shared` and `domain` import nothing from the apps. Today one rule bends:
  `apps/worker` imports code from `apps/api` (the worker shares its services, see 02-ARCHITECTURE).
  It does so through the `exports` map in `apps/api/package.json` (`@bm/api/config/*`, `@bm/api/lib/*`, later
  `@bm/api/modules/*`), never by a relative path across packages. A Docker build for the worker must therefore
  copy `apps/api` too.
- **Shared code must stay "erasable" TypeScript** (no `enum`, no `namespace`): `scripts/openapi.mjs` runs the
  `shared` sources directly with Node's type stripping.
- **A failure anywhere blocks everyone.** CI has six required checks; a red check in a package you did not touch
  still stops your merge. The upside is that you learn immediately that you broke something.
- **Parallel work needs separate ports and databases.** Several worktrees running at once would collide, hence
  `scripts/ports.mjs` (see [Environments & config](/concepts/environments)).
- **`packages/domain` is only a shell** until task V8; its `package.json` and `tsconfig.json` exist, its code
  does not.

## Where to see it

`pnpm-workspace.yaml`, the root `package.json` (scripts), `packages/shared/package.json`, and the
[Repo map](/overview/repo-map).
