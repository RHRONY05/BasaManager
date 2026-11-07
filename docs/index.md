# BasaManager learning docs

BasaManager (বাসা ম্যানেজার) is a multi-tenant apartment management web app (a PWA) for Bangladeshi
landlords, their caretakers and their tenants. A landlord runs buildings, units and leases. Every month the
app builds each tenant's bill (rent, fixed charges, metered electricity, prorated, with late fees), collects
payment online through SSLCommerz (sandbox) or by confirmed cash/bKash claims, issues PDF receipts, tracks
maintenance requests live, posts notices, stores tenant documents privately, and reports what was billed,
collected and still due.

You did not write this code. These pages exist so you can still **explain it, defend it and debug it** like
the engineer who owns it. Every page describes the code as it is, points at real files, and says why it was
built that way. If a page and the code ever disagree, the code is right and the page is a bug.

## Where the project is today

Task V1 (monorepo, tooling, CI, docs skeleton) is the only thing built. The app has no features yet: an API
that answers `/api/health`, `/api/ready` and `/api/public-config`, a worker that boots and logs, a web shell
with role layouts and placeholder pages, and the test and CI machinery every later task uses. So:

- **Written now:** this page, [Repo map](/overview/repo-map), [Request lifecycle](/overview/request-lifecycle),
  [Testing strategy](/concepts/testing-strategy), [Environments](/concepts/environments),
  [Logging](/concepts/logging), [ADR-001 Monorepo](/decisions/ADR-001-monorepo), the
  [Learning path](/learning-path), and the [Reference](/reference/) pages.
- **Stubs:** every other page already exists with its final headings and says which task writes it
  ("Written in task V5"). A stub is a promise, not content.

## How the docs are organised

| Section                        | What is in it                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [Overview](/overview/repo-map) | The whole system: context, architecture, one request end to end, the repo map, the data map, glossary. |
| [Concepts](/concepts/)         | One page per idea that several features share (auth, RLS, money, jobs, logging...).                    |
| [Features](/features/)         | One page per feature, always the same 15 sections (see below).                                         |
| [Operations](/operations/)     | Runbooks: deploy, roll back, restore a backup, rotate a secret, handle an incident.                    |
| [Decisions](/decisions/)       | ADRs: the context, options, decision and consequences of each key choice.                              |
| [Reference](/reference/)       | Lookup tables generated from the code: environment variables, error codes.                             |

## How a feature page reads

Every feature page has the same 15 sections, so you always know where to look: what it does, a 2-minute
script you could say out loud, level 0, 1 and 2 diagrams, sequence diagrams, a code walk, where the data
lives, the data lifecycle, edge cases and failure modes, security, concepts used, tests, a "try it yourself"
exercise, and a self-check quiz.

Diagram colours are the same everywhere: **pink** people and outside services, **blue** our own code,
**purple** circles data stores, **yellow** decisions or warnings, **green** outputs. A solid arrow is a call
or a read; a dashed arrow is a write, a return or something that happens later.

The Self-check questions have their answers hidden in collapsible blocks. Answer out loud first, then open
the block. That is the point of the exercise.

## Start here

Follow the [Learning path](/learning-path). Its first steps are the pages that exist today.

## Rules for these docs

- They never contain secrets, real personal data or production IDs.
- Code paths are written relative to the repo root, like `apps/api/src/app.ts`. `pnpm docs:check` fails if a
  path that a page mentions does not exist.
- A new feature is not finished until its page is written and its diagrams have been rendered and looked at.
