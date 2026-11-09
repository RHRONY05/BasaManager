# Learning path

The order to study the docs in. Tick a box only when you could explain that page to someone else without
looking. Pages marked **(stub)** exist but are written in the task named next to them; come back to them
as the build progresses. The path follows the order the system was built in, so each step only needs
what you already learned.

## Step 1: Get the big picture (readable now)

- [ ] [Start here](/): what BasaManager is and how these docs are organised.
- [ ] [Repo map](/overview/repo-map): every folder and what lives in it.
- [ ] [ADR-001 Monorepo](/decisions/ADR-001-monorepo): why one repo with shared packages.

## Step 2: Follow one request (readable now)

- [ ] [Request lifecycle](/overview/request-lifecycle): browser to Express middleware to controller and back, plus
      the failure path.
- [ ] [Logging](/concepts/logging): how a request leaves a trail you can follow with its id.
- [ ] [Error codes](/reference/error-codes): the single error shape every failure uses.

## Step 3: Know where it runs and how it is checked (readable now)

- [ ] [Environments & config](/concepts/environments): dev and test stacks, ports, database users.
- [ ] [Environment variables](/reference/env-vars): what each setting does and which combinations are refused.
- [ ] [Testing strategy](/concepts/testing-strategy): the four layers and what each proves.

## Step 4: The system and the servers (task V3)

- [ ] [System context](/overview/system-context) (stub, V3)
- [ ] [Architecture](/overview/architecture) (stub, V3)
- [ ] [Docker & the VPS](/concepts/docker-and-vps) (stub, V3)
- [ ] [CI/CD pipeline](/concepts/ci-cd) (stub, V3)
- [ ] [Sentry from zero](/concepts/sentry-from-zero) (stub, V3)
- [ ] [Backups](/concepts/backups) (stub, V3)
- [ ] [Operations runbooks](/operations/) (stub, V3)

## Step 5: The data and who may see it (readable now, task V4)

Do the first item before anything else in this step, and before the auth pages in Step 6: row-level security
is new to you and almost every later page assumes it.

- [ ] [Multi-tenancy & row-level security](/concepts/multi-tenancy-and-rls): **new concept, read slowly.** One
      shared database, `org_id` everywhere, and why Postgres enforces it as well as the code.
- [ ] [Data map](/overview/data-map): every table, who reads and writes it, how long it lives. Open the generated
      [Database schema](/database/README) beside it for the ER diagram.
- [ ] [Transactions & locking](/concepts/transactions-and-locking): first version (the row-locks-around-money
      section is written in V9).
- [ ] [Testing strategy](/concepts/testing-strategy): read the new "fresh database for every run" and "query
      counter" parts.

## Step 6: Who is using it (task V5)

- [ ] [Auth & accounts](/features/auth) (V5): the flagship page
- [ ] [Authentication & sessions](/concepts/authentication-and-sessions) (V5)
- [ ] [Authorization](/concepts/authorization) (V5)
- [ ] [Validation with Zod](/concepts/validation-with-zod) (V5)
- [ ] [Caching & rate limiting](/concepts/caching-and-rate-limiting) (V5)

## Step 7: Landlords, buildings and leases (tasks V6 and V7)

- [ ] [Organisations & staff](/features/organisations-and-staff) (stub, V6)
- [ ] [Buildings & units](/features/buildings-and-units) (stub, V6)
- [ ] [Tenants & leases](/features/tenants-and-leases) (stub, V7)

## Step 8: The money (tasks V8 to V10)

- [ ] [Money & rounding](/concepts/money-and-rounding) (stub, V8)
- [ ] [Dates & time zones](/concepts/dates-and-timezones) (stub, V8)
- [ ] [Idempotency & unique constraints](/concepts/idempotency) (stub, V8)
- [ ] [Background jobs & cron](/concepts/background-jobs) (stub, V8)
- [ ] [Billing](/features/billing) (stub, V8)
- [ ] [Payments](/features/payments) (stub, V9 and V10)
- [ ] [File uploads & signed URLs](/concepts/file-uploads-and-signed-urls) (stub, V9)
- [ ] [PDF generation](/concepts/pdf-generation) (stub, V9)
- [ ] [Receipts & statements](/features/receipts-and-statements) (stub, V9)
- [ ] [Payment gateways & webhooks](/concepts/payment-gateways-and-webhooks) (stub, V10)

## Step 9: Keeping people informed (tasks V11 to V13)

- [ ] [Real-time with Socket.io](/concepts/realtime-socketio) (stub, V11)
- [ ] [Notification pipeline (outbox)](/concepts/notification-pipeline-outbox) (stub, V11)
- [ ] [Web Push from zero](/concepts/web-push-from-zero) (stub, V11)
- [ ] [Notifications](/features/notifications) (stub, V11)
- [ ] [Maintenance](/features/maintenance) (stub, V12)
- [ ] [Notices](/features/notices) (stub, V13)
- [ ] [Documents](/features/documents) (stub, V13)

## Step 10: Reports, leaving and hardening (tasks V14 to V17)

- [ ] [Dashboards & reports](/features/dashboards-and-reports) (stub, V14)
- [ ] [Admin](/features/admin) (stub, V14)
- [ ] [Data lifecycle & deletion](/concepts/data-lifecycle-and-deletion) (stub, V15)
- [ ] [Security checklist](/concepts/security-checklist) (stub, V16)
- [ ] [Glossary](/overview/glossary) (stub, V17)

When a stub is replaced by a real page, this list stays the same; only the "(stub)" label goes away.
