# Data map

Where every piece of BasaManager's data lives, who can read and write it, and how long it stays. The database
part is complete as of task V4. The other stores (Redis, files, cookies, browser storage) **grow with each
task**: the tables below list what exists today and which task fills in the rest.

The **ER diagram and a page per table** (columns, keys, indexes, constraints) are generated from the real
database by tbls: [Database schema](../database/README.md). Never edit those pages by hand; run `pnpm db:docs`
after a migration. The rules behind them are in `.agent/03-DATABASE.md`. How the isolation works is in
[Multi-tenancy & row-level security](/concepts/multi-tenancy-and-rls).

## How to read the Postgres tables

- **Org** in "Read" means row-level security by `org_id`: a query only sees rows of the organisation in the
  transaction's `app.org_id` (set by `db.$tx`). The service then narrows further by role (for example a
  tenant sees only their own lease). The worker (`bm_worker`) bypasses RLS but always filters by org itself.
- **Write** names the code that changes the rows. All writes go through `db.$tx`, and most through the
  service named; "(task)" is when that service is built.
- Money is always integer **poisha** (`৳1 = 100`), stored as `bigint`.
- **History** tables have no `delete` grant for the API or the worker (`bm_app`, `bm_worker`): nothing, not
  even a bug, can remove their rows.

## Postgres tables

### Identity and access

| Table                 | What it holds                                         | Read                                                          | Write                                   | Retention                                     |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| `users`               | A person: email, password hash, name, phone           | Not org data (no RLS); auth/users services only               | auth and users services (V5)            | Until account deletion, then anonymised (V15) |
| `oauth_accounts`      | Google sign-in link of a user                         | no RLS; auth service only                                     | auth service (V5)                       | Deleted with the account                      |
| `sessions`            | Refresh-token families (hashed token, device)         | no RLS; auth service only                                     | auth service (V5)                       | Deleted 60 days after expiry (retention job)  |
| `auth_tokens`         | Email-verify and password-reset tokens (hash)         | no RLS; auth service only                                     | auth service (V5)                       | Single use; expired rows cleaned by retention |
| `organizations`       | A landlord's business                                 | Own org (`org_self`); admin via the `admin_org_overview` view | organisations service (V6)              | Forever (suspended, never deleted)            |
| `memberships`         | A user's role in an org (landlord, caretaker, tenant) | Org                                                           | organisations/invites services (V5, V6) | Marked `removed`, never deleted               |
| `caretaker_buildings` | Which buildings a caretaker may act on                | Org                                                           | staff service (V6)                      | Deleted when the caretaker is removed         |
| `invitations`         | Caretaker/tenant invites (hashed token)               | Org                                                           | invites service (V5, V6, V7)            | Single use; expired rows cleaned by retention |

### Property and leases

| Table             | What it holds                                     | Read | Write                  | Retention                                    |
| ----------------- | ------------------------------------------------- | ---- | ---------------------- | -------------------------------------------- |
| `buildings`       | A building, its billing calendar, late-fee rule   | Org  | buildings service (V6) | Archived, never deleted while a lease exists |
| `units`           | A flat, room or shop                              | Org  | buildings service (V6) | Archived, never deleted while a lease exists |
| `unit_charges`    | Fixed monthly charges of a unit                   | Org  | buildings service (V6) | With the unit                                |
| `leases`          | One tenancy of one unit (one live lease per unit) | Org  | leases service (V7)    | Forever (history)                            |
| `lease_tenants`   | Tenants on a lease                                | Org  | leases service (V7)    | Forever                                      |
| `lease_charges`   | Charges copied from the unit at lease start       | Org  | leases service (V7)    | Forever                                      |
| `deposit_entries` | Deposit ledger (received, refunded, applied)      | Org  | leases service (V7)    | Forever                                      |

### Billing and payments

| Table                 | What it holds                                     | Read | Write                          | Retention                                   |
| --------------------- | ------------------------------------------------- | ---- | ------------------------------ | ------------------------------------------- |
| `meter_readings`      | Monthly submeter readings                         | Org  | billing service (V8)           | Forever                                     |
| `bills`               | One bill per lease and month                      | Org  | billing service, worker (V8)   | Forever                                     |
| `bill_lines`          | Rent, charges, electricity, adjustments, late fee | Org  | billing service (V8)           | Forever; **history** (no delete)            |
| `payments`            | A payment, any method                             | Org  | payments service (V9, V10)     | Forever; voided, never deleted; **history** |
| `payment_allocations` | Which bill a payment paid, how much               | Org  | payments service (V9)          | Forever; **history**                        |
| `credit_entries`      | Lease credit ledger (overpayments)                | Org  | payments service (V9)          | Forever; **history**                        |
| `payment_intents`     | An SSLCommerz attempt (status, gateway response)  | Org  | payments service, worker (V10) | Forever                                     |
| `receipt_counters`    | Last receipt number per org and year              | Org  | payments service (V9)          | Forever                                     |
| `receipts`            | Receipt number and PDF reference                  | Org  | payments service (V9)          | Forever; **history**                        |

### Operations, files and messages

| Table                      | What it holds                             | Read                                                                                                   | Write                                      | Retention                                                    |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| `maintenance_requests`     | A repair request                          | Org                                                                                                    | maintenance service (V12)                  | Forever                                                      |
| `maintenance_events`       | Append-only timeline of a request         | Org                                                                                                    | maintenance service (V12)                  | Forever; **history**                                         |
| `notices`                  | Building notices                          | Org                                                                                                    | notices service (V13)                      | Soft delete (`deleted_at`), hidden everywhere                |
| `files`                    | One uploaded object (Cloudinary or local) | Org                                                                                                    | files service (V9, V12, V13)               | Soft delete, then the object is deleted                      |
| `documents`                | Tenant documents (ID, agreement)          | Org, **and never a caretaker** (`no_caretaker`); tenants only their own lease, enforced by the service | documents service (V13)                    | 365 days after the lease ends, then deleted with their files |
| `notifications`            | In-app notifications                      | Only the user they belong to (`own_rows`)                                                              | notification pipeline (V11)                | Until the user deletes their account                         |
| `notification_preferences` | Per-type, per-channel opt in/out          | no RLS; the user's own services                                                                        | notifications service (V11)                | Deleted with the account                                     |
| `push_subscriptions`       | Web Push endpoints of a user's devices    | no RLS; the user's own services                                                                        | notifications service (V11)                | Deleted with the account; dead endpoints deleted on 404/410  |
| `outbox`                   | Queue of emails/push to deliver           | **Only the worker** (`bm_app` has insert, nothing else)                                                | API inserts (`createMany`), worker updates | Done/failed rows cleaned by the retention job                |
| `job_runs`                 | One row per scheduled job run             | no RLS; worker and the `admin_health` view                                                             | worker (V11)                               | Retention job                                                |

### Views

| View                 | What it shows                                                      | Who                                              |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| `admin_org_overview` | Per organisation: counts of buildings, units, leases, members      | Only when `app.is_admin = 'true'` (admin routes) |
| `admin_health`       | Job runs, failed outbox messages, flagged or stuck payment intents | Same. No amounts, payloads or emails             |

## Other stores

"Grows with each task": the rows below are what exists in the code today, plus the task that fills the rest.

| Store                                                  | Known so far                                                                                                                        | Filled in by                          |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Redis keys                                             | `lock:job:<name>`: the lock a scheduled job holds while it runs (`apps/worker/src/lib/jobLock.ts`; set with `NX` and an expiry)     | V5 (rate limits), V11 (jobs, sockets) |
| Cloudinary folders (`basamanager/<env>/org/<orgId>/…`) | None yet. Dev and test use the local disk driver                                                                                    | V9, V12, V13 (files)                  |
| Cookies (access, refresh, CSRF)                        | None yet                                                                                                                            | V5 (auth)                             |
| Browser `localStorage`                                 | `bm.lng`: the chosen interface language, written only when a `?lng=` choice is made in a dev/test build (`apps/web/src/lib/lng.ts`) | Web tasks from V5 on                  |
| Browser cache (TanStack Query)                         | In memory only for now                                                                                                              | Web tasks from V5 on                  |
