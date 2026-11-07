# 10 — Learning documentation (owner's knowledge base)

The owner (Rony) did not write this code but must be able to **explain, defend and debug** every part
of it like the senior engineer who owns it: how a feature works step by step, where every piece of
data lives, what happens on delete, which edge cases exist and how they're handled. This
documentation is a **deliverable with the same weight as the code**. A task is not done until its
learning docs are written, diagrams are rendered and checked, and they match the code in the same commit.

## Audience and tone
Write for a developer who knows JavaScript, React and basic Express, and learned with AI help. Explain
the *mechanism* and the *why*, not syntax. Plain English, short sentences, analogies where they help.
Every claim points to a real file/function. Never describe code that doesn't exist.

## Where it lives
- Source: `docs/` in the repo (Markdown). Site: `apps/docs` (VitePress) builds `docs/` into a
  searchable website, deployed at `docs.<domain>` by the same CI/CD as the app.
- Diagrams: `docs/diagrams/<feature>/<name>.svg`, linked from the page.
- Docs never contain secrets, real personal data, or production IDs.

## Site structure
```
docs/
  index.md                 Start here: what BasaManager is, how to read these docs
  overview/
    system-context.md      L0 of the whole system: users, app, external services
    architecture.md        L1: web, api, worker, Postgres, Redis, Cloudinary, Azure Blob (backups), SSLCommerz, Web Push, SMTP (Resend), Sentry
    request-lifecycle.md   one request end to end: browser → Caddy → Express middleware chain → service → Prisma → Postgres → response
    repo-map.md            every folder and what lives there
    data-map.md            every table + Redis key + Cloudinary folder + cookie + localStorage key: what, who can read, retention
    glossary.md            domain words (lease, bill, allocation, IPN…) and tech words
  concepts/                one page per cross-cutting concept (list below)
  features/                one page per feature (template below)
  operations/              environments, deploy, rollback, backup & restore drill, rotate a secret, incident playbook, reading logs & Sentry
  decisions/               ADRs: one page per key decision (context, options, decision, consequences)
  learning-path.md         the order to study the docs in, with checkboxes
```

### Concept pages (each: what problem it solves, how it works here, diagram, gotchas, where in code, self-check)
Authentication & sessions (JWT access + rotating refresh, cookies, CSRF, OAuth with Google) ·
Authorization (RBAC + resource checks) · Multi-tenancy & Postgres row-level security · Validation at
boundaries (Zod) · Database transactions, locking & isolation · Idempotency & unique constraints ·
Money as integers & rounding · Dates & time zones · Real-time with Socket.io (rooms, auth, Redis
adapter) · Background jobs & cron (locks, retries) · Notification pipeline (in-app, email, web push) ·
**Web Push from zero** (service worker, VAPID, subscriptions, why iOS needs the installed PWA) ·
File uploads, Cloudinary & expiring signed URLs (why files are never public) · Payment gateways & webhooks
(SSLCommerz IPN + validation) · PDF generation · Caching & rate limiting with Redis · Logging (Pino) ·
**Error monitoring with Sentry from zero** · Environments (dev/test/staging/prod) & config ·
CI/CD pipeline · Docker & the VPS setup (Caddy, TLS, Cloudflare) · Backups · Security checklist (OWASP
Top 10 as it applies here) · Testing strategy (unit / integration / e2e / load).

## Feature page template (every feature page has exactly these sections)
Features: auth & accounts, organisations & staff, buildings & units, tenants & leases, billing,
payments (manual + SSLCommerz), receipts & statements (PDF), maintenance, notifications, notices,
documents, dashboards & reports, admin.

1. **What it does** — 2–3 lines + the story IDs from `01-PRODUCT.md`.
2. **Explain it in 2 minutes** — a script the owner could say out loud to a client or interviewer.
3. **Level 0 diagram** — the feature as one process: external actors, data stores, data in/out.
4. **Level 1 diagram** — the feature's main sub-processes and the data flowing between them.
5. **Level 2 diagram** — drill-down of the most complex sub-process (e.g. billing → allocation).
6. **Sequence diagram(s)** — the main path and the most important failure path, using real
   middleware/controller/service/function names.
7. **Code walk** — the files and functions in execution order (`Request in → middleware → validation →
   controller → service → DB/transaction → side effects → response out`), each with a clickable path
   and one line on what it does.
8. **Where the data lives** — table of each piece of data: store (Postgres table/column, Redis key,
   object storage, cookie, browser storage, third party), who can read/write it, how it's protected.
9. **Data lifecycle** — create, update, delete, account deletion, lease end, retention. Exactly what
   happens on delete: cascade, soft delete, anonymise, storage cleanup, what is kept and why.
10. **Edge cases & failure modes** — table: case → what happens → where it's handled → the test that
    proves it. Must include concurrency (two requests at once), retries/duplicates, third-party down,
    permission violations, invalid input, time-zone/month boundaries where relevant.
11. **Security** — threats specific to this feature and how each is stopped.
12. **Concepts used** — links to concept pages; mark concepts that are new to the owner.
13. **Tests** — which unit/integration/e2e tests cover it, and how to run them.
14. **Try it yourself** — steps to see it working locally, plus one "break it" exercise
    (change X, watch test Y fail, understand why).
15. **Self-check** — 6–10 questions with answers in collapsible `<details>` blocks, including at least
    two "what happens if…" questions.

## Diagram rules
- **SVG first**, in the style of the owner's `visual-diagram` skill (copied into the repo at
  `.claude/skills/visual-diagram/`): pastel colour roles (pink = people/external, blue = our
  system/process, purple circles = data stores, yellow = decision/warning, green = output), solid arrow
  = call/read, dashed arrow = write/async/return, title + subtitle + legend, ≤ 12 shapes. Use it
  for all L0/L1/L2 data-flow diagrams and the architecture diagrams.
- **Mermaid** (styled with the same palette) for sequence diagrams and state machines, and as a
  fallback when an SVG can't be laid out cleanly. The ER diagram is generated from the live database by
  the `db-docs` skill (tbls), never hand-drawn.
- **Every diagram is rendered and looked at** (headless browser screenshot) before commit: no
  overlapping text, no arrow crossing a shape or label, arrowheads visible. Screenshots go in a scratch
  folder, never the repo.
- Diagrams show what the code **actually** does. If code changes the flow, the diagram changes in the
  same commit.

## When it's written
- Each feature task writes/updates that feature's page and any concept pages it introduces (part of
  the definition of done). The reviewer agent rejects a PR whose code and docs disagree.
- The overview pages are written in the scaffold task and updated as the system grows.
- Final task: full docs pass (links, diagrams, learning path), a generated **active-recall Q&A guide**
  (`generate-qa-review` skill), and a `codebase-tutor` course setup so the owner can be taught
  feature by feature.

## Acceptance checks for docs (run in CI)
- VitePress build passes with no dead links.
- Every feature in the list above has a page with all 15 headings.
- Every `.svg` referenced exists; every code path referenced in a code walk exists in the repo.
