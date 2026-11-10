# Brief V8-tests (for: test-designer subagent) — tests first

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/07-BILLING.md`, `.agent/09-TESTING.md` (Billing unit + integration), `.agent/04-API.md` (Billing routes, Scheduled jobs), `.agent/08-TASKS.md` (Task V8).

Work in the git worktree `D:/Projects/bm-wt/V8` (branch `feat/V8`). Commit tests with conventional commit (`test: ...`).

## Goal
Write failing unit tests in `packages/domain` covering all billing formulas, rules, and worked examples from `07-BILLING.md`, plus failing integration tests for billing endpoints in `apps/api/test/billing/billing.int.test.ts`.
Tests must fail now for the right reason (missing implementation in `@bm/domain` and `@bm/api`).

---

## 1. Unit Tests in `packages/domain` (`packages/domain/src/billing/billing.test.ts`)

Pure functions with no database, no network, and no system clock (dates and timezone passed in). Money is integer poisha (`৳1 = 100 poisha`).

### Required Unit Test Cases (from 07-BILLING.md):
1. **Money rounding (`roundTaka`):**
   - Rounds to nearest whole taka (half up): `Math.round(x / 100) * 100`.
   - Positive, negative, zero, and half-taka ties (e.g. 50 poisha -> 100 poisha).

2. **Rule 2 — Proration:**
   - **Example 2a (move-in):** Rent ৳12,000 (1,200,000 poisha), service ৳1,000 (100,000 poisha), move-in 18 Nov 2026 (D = 30).
     Factor = 13/30 -> rent = roundTaka(5,200.00) = ৳5,200 (520,000 poisha); service = roundTaka(433.33) = ৳433 (43,300 poisha). Total ৳5,633 (563,300 poisha).
   - **Example 2b (move-out):** Rent ৳15,000 (1,500,000 poisha), move-out 10 Feb 2027 (D = 28).
     Factor = 10/28 -> rent = roundTaka(5,357.14) = ৳5,357 (535,700 poisha).
   - **Leap-year February proration:** move-in or move-out in Feb 2028 (D = 29).
   - **Move-in on day 1:** factor = 1 (full month, no discount).
   - **Move-in on the last day of the month:** factor = 1/D.

3. **Rule 3 — Electricity:**
   - **Example 3:** prev = 1,240, curr = 1,395, rate = ৳9.00 (900 poisha) -> 155 units × 900 = 139,500 poisha = ৳1,395.
   - **Lower reading rejection:** curr < prev without `meter_replaced` throws or returns validation error (`READING_LOWER_THAN_PREVIOUS`).
   - **Meter replaced:** curr = 45, prev = 1,500, `meter_replaced = true`, `new_meter_start = 0` -> units = 45 - 0 = 45 units.

4. **Rule 4 — Late Fee:**
   - **Example 4:** Due 10 Dec, grace 2, 5% late fee. Bill ৳14,000, ৳9,000 paid on 5 Dec. Balance on 13 Dec 00:00 is ৳5,000 -> 5% fee = ৳250 (25,000 poisha). New balance ৳5,250.
   - **Idempotency:** Late fee is applied only once per bill. If already applied, subsequent checks return 0 or do not add another fee.
   - **Fully paid bill:** Late fee on a bill with balance = 0 is 0.
   - **Within grace period:** Date within due_date + grace_days produces no late fee.
   - **Percent late fee rounding:** Balance and percentage producing fractional taka rounds to nearest whole taka at ৳x.50.
   - **Flat late fee:** Flat fee type applies the building's flat amount.
   - **Waived late fee:** Waiving reduces fee to 0 with a reason.

5. **Rule 5 — Payment Allocation:**
   - **Example 5:** Unpaid bills: Oct balance ৳3,000, Nov balance ৳14,000. Tenant pays ৳20,000.
     Allocation: Oct receives ৳3,000 (status: paid), Nov receives ৳14,000 (status: paid), remaining ৳3,000 becomes lease credit.
   - **Equal payment:** Payment exactly equal to dues leaves 0 credit.
   - **Multi-bill allocation:** Payment allocating across 3 bills in chronological order (oldest period_month first).
   - **Credit application to newly issued bill:** Newly issued Dec bill of ৳14,000 with ৳3,000 credit -> ৳3,000 credit allocated, balance ৳11,000, status `partially_paid`.

6. **Rule 6 — Voiding Payment:**
   - Reverses payment allocations, sets status to `void`, restores unpaid balance.
   - If credit created by the payment was already applied to another bill, that later bill's balance increases back accordingly.

7. **Rule 7 — Move-out Settlement:**
   - `settlement = deposit - (unpaid balances incl. final bill) + credit`.
   - **Example 7:** Deposit ৳24,000, unpaid Jan ৳2,000, final Feb bill ৳5,357, credit ৳0 -> refund ৳16,643.
   - **Dues larger than deposit:** Deposit ৳10,000, unpaid dues ৳15,000 -> negative settlement (tenant owes ৳5,000).

---

## 2. Integration Tests in `apps/api` (`apps/api/test/billing/billing.int.test.ts`)

Supertest integration tests using `createApp` against the test database with real Postgres RLS, checking:
1. **`POST /api/billing/run` (or generation job):**
   - Given building with billDay = current day: creates draft bills for all active leases in the building.
   - Idempotency: Calling `POST /api/billing/run` twice for the same `{ buildingId, month }` creates exactly 1 bill per lease (unique constraint / idempotent logic).
   - Submeter unit drafts are created with `needsReading = true` and `totalPoisha` including fixed charges + rent, awaiting readings.
2. **`PUT /api/readings`:**
   - Landlord / Caretaker enters meter reading: updates reading, computes electricity bill line, and clears `needsReading = false` on draft bill.
   - `reading < prevReading` without `meterReplaced = true` returns 400 `READING_LOWER_THAN_PREVIOUS`.
3. **`POST /api/bills/:id/issue`:**
   - Landlord issues a draft bill.
   - If `needsReading = true`, returns 409 `READING_REQUIRED`.
   - If lease has existing credit, credit is automatically applied upon issue, reducing balance and setting status to `paid` or `partially_paid`.
   - Emits outbox event `bill.issued`.
4. **`POST /api/bills/issue-ready`:**
   - Issues all drafts in `{ buildingId, month }` where `needsReading = false`.
5. **`POST /api/bills/:id/adjustments`:**
   - Adds signed adjustment line (`amountPoisha`, `reason`) to draft or issued bill. Returns 409 if bill is already paid or void.
6. **`POST /api/bills/:id/late-fee/waive`:**
   - Landlord waives late fee with reason.
7. **`POST /api/bills/:id/void`:**
   - Voids bill if no payments/allocations have been made.
8. **`GET /api/dues` (Tenant):**
   - Returns unpaid bills (oldest first) + credit + total dues.
9. **Role scoping & Isolation:**
   - Caretaker cannot issue, void, or waive bills (returns 403 `FORBIDDEN`).
   - Tenant cannot see other tenants' bills (returns 404 `NOT_FOUND`).
   - Cross-org access returns 404 `NOT_FOUND`.

---

## Expected Output
- Commit failing tests to `feat/V8`.
- Push to origin (or commit in worktree).
- Report under 15 lines.
