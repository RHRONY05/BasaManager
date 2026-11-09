# Concepts

A concept page explains one idea that several features share, so a feature page can link to it instead of
re-explaining it. Each has the same sections: what problem it solves, how it works here, a diagram, gotchas,
where in code, and a self-check.

## Written now (task V1)

- [Testing strategy](/concepts/testing-strategy): the four test layers, what each one proves, how to run them.
- [Environments & config](/concepts/environments): dev and test as they exist today (ports, database roles, env files).
- [Logging (Pino)](/concepts/logging): structured logs, request ids, and exactly what is redacted.

## Written in task V4

- [Multi-tenancy & row-level security](/concepts/multi-tenancy-and-rls): **new to the owner.** One shared database, `org_id` on every row, enforced by the service and by Postgres policies; the four database roles; `db.$tx`.
- [Transactions & locking](/concepts/transactions-and-locking): first version. `db.$tx`, rollback, isolation level, why history cannot be deleted. Row locks around money arrive in V9.

## Coming

| Concept                                                                  | Written in |
| ------------------------------------------------------------------------ | ---------- |
| [Sentry from zero](/concepts/sentry-from-zero)                           | V3         |
| [CI/CD pipeline](/concepts/ci-cd)                                        | V3         |
| [Docker & the VPS](/concepts/docker-and-vps)                             | V3         |
| [Backups](/concepts/backups)                                             | V3         |
| [Authentication & sessions](/concepts/authentication-and-sessions)       | V5         |
| [Authorization](/concepts/authorization)                                 | V5         |
| [Validation with Zod](/concepts/validation-with-zod)                     | V5         |
| [Caching & rate limiting](/concepts/caching-and-rate-limiting)           | V5         |
| [Money & rounding](/concepts/money-and-rounding)                         | V8         |
| [Dates & time zones](/concepts/dates-and-timezones)                      | V8         |
| [Idempotency & unique constraints](/concepts/idempotency)                | V8         |
| [Background jobs & cron](/concepts/background-jobs)                      | V8         |
| [File uploads & signed URLs](/concepts/file-uploads-and-signed-urls)     | V9         |
| [PDF generation](/concepts/pdf-generation)                               | V9         |
| [Payment gateways & webhooks](/concepts/payment-gateways-and-webhooks)   | V10        |
| [Real-time with Socket.io](/concepts/realtime-socketio)                  | V11        |
| [Notification pipeline (outbox)](/concepts/notification-pipeline-outbox) | V11        |
| [Web Push from zero](/concepts/web-push-from-zero)                       | V11        |
| [Data lifecycle & deletion](/concepts/data-lifecycle-and-deletion)       | V15        |
| [Security checklist](/concepts/security-checklist)                       | V16        |

Concepts marked "from zero" (Sentry, Web Push, and later RLS and the outbox) assume you have never met the
idea before.
