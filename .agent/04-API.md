# 04 — API contract

Base path `/api`. JSON in and out. Every request and response body has a Zod schema in
`packages/shared/src/api/<module>.ts`; the route validates input with it and the web client is typed by
it. The architect also generates `docs/reference/openapi.json` from those schemas (`zod-to-openapi`)
in CI, so docs and code can't drift.

## Conventions
- **Success:** `{ "data": … }` (lists: `{ "data": [...], "page": { "nextCursor": string|null } }`, cursor
  pagination, `limit` 1–100, default 25).
- **Error:** HTTP status + `{ "error": { "code": "SNAKE_CASE", "message": "human sentence", "details"?: [{ "path": "field", "message": "…" }], "requestId": "…" } }`.
  Codes live in `packages/shared/src/errors.ts`. The UI shows `message`; the code drives special handling.
- Standard codes: `VALIDATION_FAILED` 400 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 (also
  used for "exists but not yours", never leak existence) · `CONFLICT` 409 · `RATE_LIMITED` 429 ·
  `ORG_SUSPENDED` 423 · `INTERNAL` 500.
- **Auth columns** below: `public`, `user` (any signed-in user), or roles `L` landlord, `C` caretaker
  (only assigned buildings), `T` tenant (only own leases), `A` platform admin. Org-scoped routes need
  header `X-Org-Id`.
- Mutations are idempotent where the table says so; clients may send `Idempotency-Key` on payment and
  bill-issue routes (stored 24 h in Redis; a repeat returns the first response).
- Every unsafe method needs the CSRF header (see 02).

## Auth & account — `/api/auth`, `/api/me`
| Method & path | Auth | Input | Behaviour | Errors |
|---|---|---|---|---|
| `POST /auth/signup` | public | `{email, password, fullName, orgName}` | Creates user + org + landlord membership in one tx; sends verify email; signs in | `CONFLICT` email taken (same message as success page wording: "check your email"), weak password |
| `POST /auth/verify-email` | public | `{token}` | Marks verified | `TOKEN_INVALID` (expired/used/unknown, one code for all) |
| `POST /auth/resend-verification` | user | — | Max 3 per hour | `RATE_LIMITED` |
| `POST /auth/login` | public | `{email, password}` | argon2 verify; on success new session family + cookies; resets fail count | `INVALID_CREDENTIALS` (same for unknown email), `ACCOUNT_LOCKED` after 5 fails (15 min), `RATE_LIMITED` (10/min/IP) |
| `POST /auth/refresh` | refresh cookie | — | Rotate refresh, new access | `SESSION_REVOKED` (reuse detected → whole family revoked) |
| `POST /auth/logout` | user | — | Revoke current session, clear cookies | — |
| `POST /auth/logout-all` | user | — | Revoke all sessions, disconnect sockets | — |
| `POST /auth/forgot-password` | public | `{email}` | Always 200; email only if the user exists | `RATE_LIMITED` |
| `POST /auth/reset-password` | public | `{token, password}` | Sets password, revokes **all** sessions, signs in on this device | `TOKEN_INVALID` |
| `GET /auth/google/start` | public | `?invite=<token>` optional | Redirect to Google with state + PKCE | — |
| `GET /auth/google/callback` | public | code, state | Link / create / accept invite; redirect to app | redirect to `/login?error=google_failed` |
| `GET /invites/:token` | public | — | Invite preview: org name, role, inviter, email (masked) | `TOKEN_INVALID` |
| `POST /invites/:token/accept` | public or user | `{password?, fullName?}` | New user: create + verify (email proven by the link) + membership. Signed-in user: email must match | `INVITE_EMAIL_MISMATCH`, `TOKEN_INVALID` |
| `GET /me` | user | — | `{user, memberships:[{orgId, orgName, role, status}]}` | — |
| `PATCH /me` | user | `{fullName?, phone?}` | | |
| `POST /me/change-password` | user | `{currentPassword, newPassword}` | Revokes other sessions | `INVALID_CREDENTIALS` |
| `DELETE /me` | user | `{password or googleReauth}` | A8 deletion flow (03) | `LANDLORD_MUST_TRANSFER` |
| `GET /me/sessions` · `DELETE /me/sessions/:id` | user | | List devices / revoke one | |
| `GET /public-config` | public | | `{appEnv, sentryDsn, vapidPublicKey}` | |

## Organisation & staff — `/api/org`
| Method & path | Auth | Notes |
|---|---|---|
| `GET /org` · `PATCH /org` | L (C,T read name) | name |
| `GET /org/members` | L | members with role, status, buildings |
| `POST /org/invites` | L | `{email, role:'caretaker', buildingIds}` (tenant invites go through leases) → email. `CONFLICT` if an open invite exists |
| `GET /org/invites` · `DELETE /org/invites/:id` | L | list / revoke |
| `PUT /org/members/:membershipId/buildings` | L | `{buildingIds}` caretaker assignment; sockets of that user re-joined |
| `DELETE /org/members/:membershipId` | L | remove caretaker (tenants are removed by ending leases) |

## Buildings & units
| Method & path | Auth | Notes |
|---|---|---|
| `GET /buildings` | L, C (assigned), T (own) | with occupancy counts for L/C |
| `POST /buildings` · `PATCH /buildings/:id` | L | billing settings validated (03 checks) |
| `POST /buildings/:id/archive` | L | `CONFLICT` if live leases |
| `GET /buildings/:id/units` | L, C | unit + current lease summary + occupancy |
| `POST /buildings/:id/units` · `PATCH /units/:id` · `POST /units/:id/archive` | L | charges included as `charges:[{name, amountPoisha}]` |

## Leases & tenants
| Method & path | Auth | Notes |
|---|---|---|
| `POST /leases` | L | `{unitId, tenantEmail, tenantName, startDate, monthlyRentPoisha, depositPoisha, householdSize, charges, moveInReading?}` → lease `pending` + tenant invite email. If the start is after this month's bill day, the first prorated bill is created when the lease becomes `active` (invite accepted or `startDate` reached, whichever is later) |
| `GET /leases?status=&buildingId=` | L, C | |
| `GET /leases/:id` | L, C, T(own) | lease, tenants, deposit held, credit, dues |
| `POST /leases/:id/deposit` | L | deposit entry |
| `POST /leases/:id/notice` | L, T(own) | `{moveOutDate}` → status `notice` |
| `GET /leases/:id/settlement-preview` | L | Rule 7 numbers for a given `moveOutDate` |
| `POST /leases/:id/end` | L | `{moveOutDate, moveOutReading?}` final prorated bill + settlement in one tx; PDF queued |
| `POST /leases/:id/resend-invite` | L | |
| `GET /tenants/:membershipId/history` | L | T5 |

## Billing
| Method & path | Auth | Notes |
|---|---|---|
| `GET /bills?status=&buildingId=&month=&leaseId=` | L, C, T(own) | `overdue` derived flag in each item |
| `GET /bills/:id` | L, C, T(own) | lines with explanation meta, allocations, receipts |
| `POST /bills/:id/issue` | L | from `draft`; `CONFLICT` `READING_REQUIRED` if `needs_reading`; applies credit (Rule 5); outbox `bill.issued` |
| `POST /bills/issue-ready` | L | `{buildingId, month}` issues all drafts without missing readings; returns counts |
| `POST /bills/:id/adjustments` | L | `{amountPoisha (signed), reason}`; `CONFLICT` if paid/void |
| `POST /bills/:id/late-fee/waive` | L | `{reason}` |
| `POST /bills/:id/void` | L | only if no allocations |
| `GET /readings?buildingId=&month=` | L, C | units with submeter + last reading + current |
| `PUT /readings` | L, C | `{unitId, month, reading, meterReplaced?, newMeterStart?}` upsert until the bill is issued; Rule 3 validation `READING_LOWER_THAN_PREVIOUS` |
| `POST /billing/run` | L | manually trigger draft generation for `{buildingId, month}` (same idempotent code as the job) |
| `GET /dues` | T | B8: unpaid bills oldest first + credit + total |

## Payments & receipts
| Method & path | Auth | Notes |
|---|---|---|
| `POST /payments/claims` | T(own) | `{leaseId, amountPoisha, method:'cash'|'bkash'|'nagad'|'bank', reference?, paidOn, proofFileId?}` → `pending_claim`; outbox to staff. `CONFLICT` `DUPLICATE_REFERENCE` |
| `POST /payments` | L, C | record a confirmed payment directly (same fields) → Rule 5 allocation + receipt in one tx |
| `POST /payments/:id/confirm` · `POST /payments/:id/reject` | L, C | reject needs `{reason}` |
| `POST /payments/:id/void` | L | `{reason}` Rule 6 |
| `GET /payments?leaseId=&status=` | L, C, T(own) | |
| `GET /receipts/:id/download` | L, C, T(own) | expiring signed URL (PDF rendered if missing → `202 {status:'rendering'}`) |
| `POST /payments/sslcommerz/init` | T(own) | `{leaseId, amountPoisha}` (min ৳100, max = dues + one month's rent) → `{gatewayUrl}` |
| `POST /payments/sslcommerz/ipn` | public (SSLCommerz) | form-encoded; validation API call; Rule 8. Always 200 to the gateway once handled; logs + Sentry on failures |
| `POST /payments/sslcommerz/return/:result` | public | `success|fail|cancel` browser return (form POST from gateway) → 303 redirect to `/pay/result?tran=…`; **changes nothing** |
| `GET /payments/sslcommerz/intents/:tranId` | T(own) | status for the result page (polls until not `initiated`, max 60 s; then shows "we'll notify you") |

## Maintenance
| Method & path | Auth | Notes |
|---|---|---|
| `POST /maintenance` | T(own lease) | `{leaseId, category, priority, title, description, photoFileIds (≤3)}` |
| `GET /maintenance?status=&buildingId=&priority=&assignedToMe=` | L, C, T(own) | |
| `GET /maintenance/:id` | L, C, T(own) | with events timeline |
| `POST /maintenance/:id/assign` | L, C | `{membershipId}` caretaker of that building |
| `POST /maintenance/:id/status` | L, C (forward), T (`closed` from `resolved`, `reopen` within 7 days) | invalid transition → `CONFLICT` `INVALID_TRANSITION` |
| `POST /maintenance/:id/comments` | L, C, T(own) | `{body, fileId?}` |

## Notices, documents, files
| Method & path | Auth | Notes |
|---|---|---|
| `GET /notices?buildingId=` | L, C, T(own building) | active (not expired/deleted), pinned first |
| `POST /notices` · `PATCH /notices/:id` · `DELETE /notices/:id` | L, C(assigned) | outbox `notice.posted` |
| `POST /files` | user + org | multipart `file`, `kind`; returns `{fileId}`; 5 MB, sniffed |
| `GET /files/:id/url?variant=thumb` | per file kind rules | expiring signed URL (5 min); `variant=thumb` for image thumbnails |
| `GET /files/local/:id` | signed query (`exp`, `sig`) | local driver only (dev/test): serves the file if the HMAC and expiry are valid |
| `GET /leases/:id/documents` · `POST /leases/:id/documents` | L, T(own) | `{kind, fileId}` |
| `DELETE /documents/:id` | L | D3 |

## Notifications & push
| Method & path | Auth | Notes |
|---|---|---|
| `GET /notifications?cursor=` · `GET /notifications/unread-count` | user | |
| `POST /notifications/:id/read` · `POST /notifications/read-all` | user | |
| `GET /notification-preferences` · `PUT /notification-preferences` | user | security types can't be disabled → `VALIDATION_FAILED` |
| `POST /push/subscriptions` · `DELETE /push/subscriptions` | user | `{endpoint, keys:{p256dh, auth}}` upsert by endpoint |

## Reports & dashboards
| Method & path | Auth | Notes |
|---|---|---|
| `GET /dashboard/landlord?month=` | L | billed, collected, outstanding, occupancy, open requests by priority, last 6 months collected vs billed |
| `GET /dashboard/caretaker` | C | readings missing, pending claims, my requests |
| `GET /dashboard/tenant` | T | dues, due date, latest notice, open requests |
| `POST /reports/statements` | L | `{buildingId, month}` or `{leaseId, from, to}` → `202 {fileId}` (render queued) |

## Admin — `/api/admin`
| Method & path | Auth | Notes |
|---|---|---|
| `GET /admin/orgs?cursor=&q=` | A | from `admin_org_overview` view |
| `POST /admin/orgs/:id/suspend` · `/reactivate` | A | `{reason}`; emails the landlord |
| `GET /admin/health` | A | job runs (last 50), failed outbox, flagged/stuck intents, counts |

## Health
`GET /health` → `{status:'ok', release}`. `GET /ready` → 200 when DB + Redis respond within 1 s, else 503.

## Test-only routes (mounted only when `APP_ENV=test`; env.ts refuses otherwise)
`POST /test/clock` `{now: ISO | null}` sets/clears the clock for api + worker (worker reads it from Redis
key `test:clock`). `POST /test/run-job` `{job}` runs a worker job synchronously. Used by e2e only.

## Socket.io events (server → client)
| Event | Room | Payload |
|---|---|---|
| `notification:new` | `user:<id>` | `{id, type, title, link}` |
| `bill:updated` | `user:<tenantId>`, `org:<id>` | `{billId, status}` |
| `payment:updated` | `user:<tenantId>`, `org:<id>` | `{paymentId, status}` |
| `maintenance:updated` | `request:<id>`, `building:<id>` | `{requestId, status, eventId}` |
| `notice:posted` | `building:<id>` | `{noticeId}` |
| `file:ready` | `user:<id>` | `{fileId, kind}` |
| `session:revoked` | `user:<id>` | `{}` → client signs out |
Client → server: `room:join` `{type:'request'|'building', id}` (authorised server-side), `room:leave`.

## Outbox event types
`user.verify_email`, `user.password_reset`, `user.security_alert`, `invite.sent`, `bill.issued`,
`bill.reminder` (`{billId, kind:'before'|'due'|'overdue1'|'overdue7'}`), `bill.late_fee`,
`payment.claim_submitted`, `payment.confirmed`, `payment.rejected`, `payment.voided`,
`maintenance.created`, `maintenance.updated`, `notice.posted`, `lease.ended`, `org.suspended`,
`statement.monthly`, `pdf.render`.

## Scheduled jobs (worker, Asia/Dhaka)
| Job | When | Does |
|---|---|---|
| `generateBills` | daily 00:10 | For buildings whose `bill_day` is today: Rule 1 for every active lease |
| `applyLateFees` | daily 00:20 | Rule 4 |
| `issueReminders` | daily 09:00 | 3 days before, on, +1, +7 days after due → outbox (deduplicated by `(billId, kind)` in Redis + a unique key in outbox payload) |
| `recheckPaymentIntents` | every 10 min | Rule 8.5; `expired` after 24 h |
| `autoCloseRequests` | daily 01:00 | `resolved` > 7 days → `closed` |
| `monthlyStatements` | 1st, 06:00 | building statements for last month → email landlords |
| `retention` | daily 03:30 | documents of leases ended > 365 days, expired tokens/sessions, done outbox > 30 days, retry failed object deletes |
| `deliverOutbox` | every 15 s | see 02 |
Each job: Redis lock `lock:job:<name>` (TTL = expected run × 2) + its own DB idempotency, writes `job_runs`.
