# Data map

Where every piece of BasaManager's data lives, who can read it and how long it stays. The database part is
complete (task V4); the other stores are filled in by the tasks that create them.

The **ER diagram and a page per table** (columns, keys, indexes, constraints) are generated from the real
database by tbls: [Database schema](../database/README.md). Never edit those pages by hand; run
`pnpm db:docs` after a migration. The rules behind them are in `.agent/03-DATABASE.md`.

## Postgres tables

"Org" = row-level security by `org_id`: a query only sees rows of the organisation in the transaction's
`app.org_id` (set by `db.$tx`). The worker (`bm_worker`) bypasses RLS but always filters by org itself.

| Area               | Tables                                                                                                 | Who can read                                                              | How long it lives                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Identity           | `users`, `oauth_accounts`, `sessions`, `auth_tokens`                                                   | Not org data (no RLS); only the auth/users services touch them            | Users until they delete their account (then anonymised); sessions deleted 60 days after expiry |
| Organisation       | `organizations`                                                                                        | Its own members; the platform admin through the `admin_org_overview` view | Forever (suspended, never deleted)                                                             |
| Staff & access     | `memberships`, `caretaker_buildings`, `invitations`                                                    | Org                                                                       | Memberships become `removed`, never deleted; caretaker assignments deleted on removal          |
| Property           | `buildings`, `units`, `unit_charges`                                                                   | Org                                                                       | Archived, never deleted while a lease exists                                                   |
| Leases             | `leases`, `lease_tenants`, `lease_charges`, `deposit_entries`                                          | Org                                                                       | Forever (history)                                                                              |
| Billing            | `meter_readings`, `bills`, `bill_lines`                                                                | Org                                                                       | Forever; `bill_lines` can't be deleted at all                                                  |
| Payments           | `payments`, `payment_allocations`, `credit_entries`, `payment_intents`, `receipt_counters`, `receipts` | Org                                                                       | Forever; payments are voided, never deleted (no DELETE grant)                                  |
| Maintenance        | `maintenance_requests`, `maintenance_events`                                                           | Org                                                                       | Forever; events are append-only                                                                |
| Notices            | `notices`                                                                                              | Org                                                                       | Soft delete (`deleted_at`)                                                                     |
| Files              | `files`, `documents`                                                                                   | Org; **documents are invisible to caretakers** (extra policy)             | Documents 365 days after the lease ends, then deleted with their files                         |
| Notifications      | `notifications`                                                                                        | Only the user they belong to (`app.user_id`)                              | Until the user deletes their account                                                           |
| Preferences & push | `notification_preferences`, `push_subscriptions`                                                       | The user's own services                                                   | Deleted with the account; dead push endpoints deleted on 404/410                               |
| Delivery queue     | `outbox`                                                                                               | Written by the API, read only by the worker                               | Done/failed rows are cleaned by retention                                                      |
| Jobs               | `job_runs`                                                                                             | Worker and the admin health view                                          | Retention job                                                                                  |
| Admin views        | `admin_org_overview`, `admin_health`                                                                   | Platform admin context only; no personal or financial data                | Views (no data of their own)                                                                   |

Money is always integer **poisha** (`৳1 = 100`), stored as `bigint`.

## Other stores

| Store                                                  | Filled in by                          |
| ------------------------------------------------------ | ------------------------------------- |
| Redis keys (rate limits, locks, socket adapter)        | V5 (rate limits), V11 (jobs, sockets) |
| Cloudinary folders (`basamanager/<env>/org/<orgId>/…`) | V12/V13 (files)                       |
| Cookies (access, refresh, CSRF)                        | V5 (auth)                             |
| Browser storage (TanStack Query cache, preferences)    | Web tasks from V5 on                  |
