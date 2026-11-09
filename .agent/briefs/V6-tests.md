# Brief V6-tests (for: test-designer subagent) — tests first

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/01-PRODUCT.md` (O1–O5), `.agent/02-ARCHITECTURE.md`, `.agent/03-DATABASE.md` (organizations, memberships, caretaker_buildings, invitations, buildings, units, unit_charges), `.agent/04-API.md` (Organisation & staff, Buildings & units), `.agent/09-TESTING.md` (Integration → Roles, RLS), `.agent/08-TASKS.md` V6, PROGRESS Decisions.

Work in the git worktree `D:/Projects/bm-wt/V6` (branch `feat/V6`). Commit tests with conventional commit (`test: ...`).

## Goal
Failing integration tests (Supertest against `createApp` with real Postgres + Redis + Mailpit) covering the critical permission, scoping, and lifecycle logic of Task V6 before the backend implementer writes the code.

## Interface & Contracts (per 04-API.md)

### Endpoints to test:
1. **Organisation & Staff (`/api/org`)**:
   - `GET /api/org` — Landlord, Caretaker, Tenant get org details `{ id, name, slug, status }`.
   - `PATCH /api/org` — Landlord only: body `{ name: string }`. Caretaker/Tenant → 403 `FORBIDDEN`.
   - `GET /api/org/members` — Landlord only. Returns list of members with `{ id, userId, role, status, user: { fullName, email }, buildingIds?: string[] }`.
   - `POST /api/org/invites` — Landlord only. Body: `{ email: string, role: 'caretaker', buildingIds: string[] }`. Creates invitation and outbox `invite.sent`. Returns 409 `CONFLICT` if an open invite already exists for that email and role.
   - `GET /api/org/invites` — Landlord only. Lists pending invitations.
   - `DELETE /api/org/invites/:id` — Landlord only. Revokes invite (`revokedAt = now()`).
   - `PUT /api/org/members/:membershipId/buildings` — Landlord only. Body: `{ buildingIds: string[] }`. Replaces assigned buildings for the caretaker.
   - `DELETE /api/org/members/:membershipId` — Landlord only. Soft-deletes caretaker membership (`status = 'removed'`, `removedAt = now()`).
   - `POST /api/invites/:token/accept` — When a removed member (`status = 'removed'`) accepts a new caretaker invite, their membership is reactivated (`status = 'active'`, `removedAt = null`) with the new `buildingIds`.

2. **Buildings & Units (`/api/buildings`, `/api/units`)**:
   - `GET /api/buildings` —
     - Landlord: lists all buildings in their org with unit & occupancy counts.
     - Caretaker: lists ONLY their assigned buildings.
     - Tenant: lists their own building.
   - `POST /api/buildings` — Landlord only. Body: `{ name, address, area, city, lat?, lng?, billDay, dueDay, graceDays, lateFeeType, lateFeeValue, electricityRatePoisha }`. Validation: `billDay` 1–28, `dueDay` 1–28, `graceDays` >= 0, `lateFeeValue` >= 0, `electricityRatePoisha` >= 0. Caretaker → 403 `FORBIDDEN`.
   - `GET /api/buildings/:id` —
     - Landlord: gets building details.
     - Caretaker: gets building details if assigned; if not assigned → 404 `NOT_FOUND` (no existence leak).
     - Other org's landlord → 404 `NOT_FOUND`.
   - `PATCH /api/buildings/:id` — Landlord only. Updates building/billing settings. Caretaker → 403 `FORBIDDEN`.
   - `POST /api/buildings/:id/archive` — Landlord only. Sets `archivedAt = now()`. Returns 409 `CONFLICT` if active leases exist.
   - `GET /api/buildings/:id/units` —
     - Landlord / assigned Caretaker: lists units for the building with charges and current lease summary.
     - Caretaker not assigned to this building → 404 `NOT_FOUND`.
   - `POST /api/buildings/:id/units` — Landlord only. Body: `{ label, floor, type, defaultRentPoisha, electricityMode, charges?: [{ name, amountPoisha }] }`. Duplicate label in same building → 409 `CONFLICT`. Caretaker → 403 `FORBIDDEN`.
   - `PATCH /api/units/:id` — Landlord only. Updates unit fields / charges.
   - `POST /api/units/:id/archive` — Landlord only. Sets `archivedAt = now()`. Returns 409 `CONFLICT` if active lease exists.

## Target Test Files (`apps/api/test/`)
Write the integration tests in:
- `apps/api/test/org/members-caretakers.int.test.ts`
- `apps/api/test/buildings/buildings-units.int.test.ts`
- `apps/api/test/buildings/caretaker-scope.int.test.ts`

Tests should be red for the right reason (routes 404 / methods not implemented yet).
Commit the failing tests to `feat/V6`.
Report in under 15 lines.
