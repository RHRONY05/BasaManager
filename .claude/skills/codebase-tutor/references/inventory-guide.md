# Inventory Guide (Phase 1: `init`)

Goal: a feature list the student can **verify** against the running app and the
code, including everything that has no UI. Accuracy beats completeness theatre:
every row must point to real files, and anything uncertain goes in "Unsure".

## 1. Orient (5 minutes, no deep reading yet)

- Read the root README, `package.json` / `pyproject.toml` / `go.mod` etc., any
  `docker-compose*.yml`, `.env.example`, CI files, and existing docs (`docs/`,
  architecture notes, DB docs). Note the stack and how each process starts.
- Map the top-level folders: which is frontend, backend, workers, shared, infra.
- Record `git rev-parse HEAD` and today's date for the inventory header.
- **Large codebases** (company monorepos): don't scan everything. Ask the student
  which service or area they work on, inventory that, and list the rest only as
  neighbours ("talks to X via Y").

## 2. Sweep every kind of entry point

A feature is something that **starts** somewhere. Search for each kind; use the
framework's own conventions (route files, decorators, file-based routing).

| Kind | Where to look | Examples |
|---|---|---|
| UI pages & routes | router config, `pages/`, `app/`, route components | sign-up page, product list |
| UI actions without a page | modals, hooks, context providers, interceptors | add-to-cart button, token refresh interceptor |
| HTTP API endpoints | route files, controllers, decorators, OpenAPI spec | `POST /auth/signup` |
| Middleware & cross-cutting | app setup, `use(...)`, guards, filters | auth guard, rate limit, CORS, error handler, request logging |
| Real-time | websockets, SSE, streaming responses | chat streaming |
| AI / agent | LLM client calls, tool definitions, prompts, RAG, memory | chatbot, tool calling, embeddings |
| Background work | cron, schedulers, queues, workers, `setInterval` | nightly cleanup, email queue |
| Database-level | migrations, triggers, functions, RLS policies, seeds, views | `updated_at` trigger, seed data |
| Integrations & webhooks | third-party SDKs, webhook routes | payments, email, OAuth provider |
| Startup & ops | server bootstrap, env validation, health/readiness, graceful shutdown | `/health`, fail-fast DB check |
| Config & infra | Docker, compose, CI/CD, deploy configs, scripts | build pipeline, prod compose |
| Dev tooling | tests, linters, codegen, doc generators | e2e tests, schema docs |

## 3. Trace enough to write each row

For each feature, find (don't fully read yet): the trigger (UI element, URL,
schedule, DB event), the main frontend file(s), the main backend file(s), the
DB tables touched, and what it depends on (e.g. "needs auth"). Size it:

- **S**: one layer, under ~50 lines on the path (health check, a config read).
- **M**: crosses frontend → API → DB with ordinary logic (CRUD, sign-in).
- **L**: many steps, new concepts, or tricky logic (checkout with transactions,
  agent tool-calling loop, streaming).

Tag 👻 if there is no UI to click; give the command that shows it working
(`curl ...`, a log line to watch, a SQL query).

## 4. Group

Group by category (domain), not by folder. Typical categories, adapt to the app:

- **Platform & Ops**: health, config, logging, error handling, startup, Docker, CI.
  Keep these small ones together; they are short lessons.
- **Auth & Users**
- One category per business domain (Catalog, Cart, Orders, Payments, Admin...).
  Keep a domain's CRUD together, listed frontend-first.
- **AI / Agent**
- **Background & Database-level**

## 5. Be honest about uncertainty

Put in **Unsure** anything that looks like dead code, a half-built feature, a
feature flag, or something you couldn't find the trigger for. One line each: what
you saw, where, and what would confirm it.

## 6. Self-check before writing

- [ ] Every row's file paths exist (check them).
- [ ] Every 👻 row has a way to see it working.
- [ ] Startup, middleware, error handling, and DB-level behaviour are listed, not
      just pages.
- [ ] Nothing is described as working that you haven't seen evidence for.
