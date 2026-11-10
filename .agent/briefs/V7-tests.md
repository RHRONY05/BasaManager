# Brief V7-tests (for: test-designer subagent) — tests first

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/01-PRODUCT.md` (T1, T2, T4, T5), `.agent/02-ARCHITECTURE.md`, `.agent/03-DATABASE.md` (leases, lease_tenants, lease_charges, deposit_entries, invitations), `.agent/04-API.md` (Leases, Tenants), `.agent/09-TESTING.md` (Integration -> Roles, RLS), `.agent/08-TASKS.md` V7.

Work in the git worktree `D:/Projects/bm-wt/V7` (branch `feat/V7`). Commit tests with conventional commit (`test: ...`).

## Goal
Failing integration tests (Supertest against `createApp` with real Postgres + Redis + Mailpit) covering the critical lease lifecycle, concurrency, scoping, deposit ledger, and tenant invite acceptance for Task V7 before backend implementation.

## Interface & Contracts (per 04-API.md)

### Endpoints to test:
1. **`POST /api/leases`** (Landlord only):
   - Body: `{ unitId: string, tenantEmail: string, tenantName: string, startDate: string (YYYY-MM-DD), monthlyRentPoisha: number, depositPoisha: number, householdSize: number, charges?: Array<{ name: string, amountPoisha: number }>, moveInReading?: number }`.
   - Result: 201 Created with lease object (`status: 'pending'`), creates `lease_charges`, and queues outbox `invite.sent` email for tenant.
   - Constraint / Concurrency: A unit cannot have more than one live lease (`pending`, `active`, or `notice`).
   - If a live lease exists, returns 409 `CONFLICT` (`DUPLICATE_RESOURCE` or `CONFLICT`).
   - Concurrent `Promise.all` creating two leases on the same unit: exactly one succeeds (201), the other fails with 409 `CONFLICT`.
   - Caretaker / Tenant -> 403 `FORBIDDEN`.

2. **`GET /api/leases`** (Landlord, Caretaker):
   - Query: `?status=&buildingId=`.
   - Landlord: gets all leases across the organization matching filters.
   - Caretaker: gets only leases whose units belong to their assigned buildings.
   - Tenant -> 403 `FORBIDDEN`.

3. **`GET /api/leases/:id`** (Landlord, Caretaker, Tenant):
   - Returns lease details, unit summary, charges, tenants (`LeaseTenant`), deposit held poisha, and status.
   - Landlord: can access any lease in their org.
   - Caretaker: can access if unit is in an assigned building; unassigned building -> 404 `NOT_FOUND` (no data leak).
   - Tenant: can access ONLY if they are an associated tenant on this lease (`lease_tenants`); another tenant -> 404 `NOT_FOUND`.
   - Cross-org access -> 404 `NOT_FOUND`.

4. **`POST /api/leases/:id/deposit`** (Landlord only):
   - Body: `{ kind: 'received' | 'refunded' | 'applied_to_dues', amountPoisha: number, note?: string }`.
   - Records a `DepositEntry` row. `amountPoisha` must be > 0 integer.
   - Deposit held = sum(received) - sum(refunded) - sum(applied_to_dues).
   - Caretaker / Tenant -> 403 `FORBIDDEN`.

5. **`POST /api/leases/:id/resend-invite`** (Landlord only):
   - For a lease in `pending` status whose tenant has not yet accepted: invalidates prior invite and creates a new invite token + outbox message.
   - Caretaker / Tenant -> 403 `FORBIDDEN`.

6. **Tenant Invite Acceptance (`POST /api/invites/:token/accept`)**:
   - Accepts invite for tenant role.
   - Creates `memberships` row with role `tenant`.
   - Creates `lease_tenants` linking the new membership to the lease (`isPrimary: true`).
   - If `startDate <= today`, transitions lease `status` to `'active'`.
   - Multiple tenants on one lease: subsequent invites can associate additional tenants (`isPrimary: false`).

7. **`GET /api/tenants/:membershipId/history`** (Landlord only) (Story T5):
   - Returns tenant user details, leases (current and past), bills summary, payment records.
   - Caretaker / Tenant -> 403 `FORBIDDEN`.

## Target Test File
Write the integration tests in:
`apps/api/test/leases/leases.int.test.ts`

Run the tests to confirm they fail for the right reasons (endpoints not yet implemented).
Commit the failing tests to `feat/V7`.
Report summary in under 15 lines.
