# 07 — Billing engine

All billing logic lives in pure functions in `packages/domain/src/billing/` (no DB, no clock, no I/O;
`today` and timezone are passed in). The API calls them inside DB transactions. Every rule below has
a worked example, and every example is a required unit test (`billing.test.ts`).

## Money and time
- Money is stored as **integer poisha** (`৳1 = 100`), type `int` / `bigint`. Never floats.
- Whenever a rule produces a fraction (proration, % late fee), round to the **nearest whole taka**
  (half up): `roundTaka(x) = Math.round(x / 100) * 100`.
- All dates are calendar dates in **Asia/Dhaka**. A "day" ends at 23:59:59 Dhaka time.
- Rent is billed **in advance** for the bill's month. Electricity on month M's bill is the usage
  measured between the reading taken for M−1 and the reading taken for M (i.e. usage of the previous month).

## Bill lines
| Kind | Amount | Prorated? |
|---|---|---|
| `rent` | lease monthly rent | yes |
| `fixed_charge` (one line per charge: service, gas, water, garbage…) | from unit settings | yes |
| `electricity` | `(curr − prev) × rate` (submeter units only) | no |
| `adjustment` | + charge or − discount, with reason | no |
| `late_fee` | see rule 4 | no |

`bill.total = Σ lines`. `bill.paid = Σ allocations` from confirmed, non-void payments.
`bill.balance = total − paid`.

## Statuses
`draft → issued → partially_paid → paid`, plus `void`. **Overdue** is derived, never stored:
`status ∈ {issued, partially_paid} AND today > due_date`.

## Rule 1 — Generation (idempotent)
On the building's `bill_day`, for every active lease, create a `draft` bill for that month unless one
already exists. Uniqueness is enforced by the DB (`unique (lease_id, period_month)`) so running the
job twice, or on two servers, creates exactly one bill. Submeter units stay `draft` with
`needs_reading = true` until the reading is entered. `due_date = period_month + (due_day − 1)`.

## Rule 2 — Proration
For a month with `D` days:
- Move-in on day `d`: `factor = (D − d + 1) / D`
- Move-out on day `e` (inclusive last day): `factor = e / D`
- `rent_line = roundTaka(rent × factor)`. Same for each fixed charge.

A lease starting after that month's bill day gets its first bill created immediately at lease start.

**Example 2a (move-in).** Rent ৳12,000, service ৳1,000, move-in 18 Nov 2026 (D = 30).
factor = 13/30 → rent = roundTaka(5,200.00) = ৳5,200; service = roundTaka(433.33) = ৳433. Total ৳5,633.

**Example 2b (move-out).** Rent ৳15,000, move-out 10 Feb 2027 (D = 28). factor = 10/28 →
15,000 × 0.357142… = 5,357.14 → ৳5,357.

## Rule 3 — Electricity
`units = curr − prev`, `charge = units × rate_per_unit` (rate in poisha, per building).
- `curr < prev` is rejected unless the reading is flagged `meter_replaced`, in which case
  `units = curr − new_meter_start`.
- The first bill of a lease uses the move-in reading as `prev`.

**Example 3.** prev 1,240, curr 1,395, rate ৳9.00 → 155 × 900 = 139,500 poisha = ৳1,395.

## Rule 4 — Late fee
Checked by the daily job. If `balance > 0` after the end of `due_date + grace_days` and the bill has
no `late_fee` line yet, add one:
- `flat`: the building's flat amount.
- `percent`: `roundTaka(balance × pct / 100)` using the balance **at that moment**.
Applied **once per bill**, never compounding. A landlord can waive it (the line becomes 0, with a reason).

**Example 4.** Due 10 Dec, grace 2, 5% late fee. Bill ৳14,000, ৳9,000 paid on 5 Dec.
On 13 Dec 00:00 the balance is ৳5,000 → fee ৳250. New balance ৳5,250. On 20 Dec nothing more is added.

## Rule 5 — Payment allocation
A confirmed payment for a lease is allocated **oldest unpaid bill first** (by `period_month`), filling
each bill's balance before moving on. Anything left over becomes **lease credit**. When a bill is issued,
available credit is allocated to it automatically. Allocation and the bill status update happen in
**one transaction** with the payment confirmation; if any step fails, nothing is saved.

**Example 5.** Unpaid: Oct balance ৳3,000, Nov balance ৳14,000. Tenant pays ৳20,000 →
Oct ৳3,000 (paid), Nov ৳14,000 (paid), credit ৳3,000. December bill ৳14,000 is issued →
credit ৳3,000 is allocated, balance ৳11,000, status `partially_paid`.

## Rule 6 — Voiding a payment
Delete the payment's allocations, mark the payment `void` (with reason and who did it), recompute the
affected bills' status, and set the receipt to VOID. Credit created by that payment is removed; if the
credit was already used, the later bill becomes unpaid again by that amount. One transaction.

## Rule 7 — Move-out settlement
`settlement = deposit − (sum of unpaid balances incl. the prorated final bill) + credit`.
Positive → refund to tenant. Negative → tenant still owes; the lease stays `ended_with_dues` until paid.

**Example 7.** Deposit ৳24,000, unpaid Jan ৳2,000, final Feb bill ৳5,357, credit ৳0 →
24,000 − 7,357 = **refund ৳16,643**.

## Rule 8 — Online payment (SSLCommerz)
1. Tenant chooses an amount → API creates a `payment_intent` (status `initiated`, unique `tran_id`) and
   gets a gateway URL from SSLCommerz.
2. Browser goes to SSLCommerz, then returns to our success/fail/cancel page. **The return page never
   changes money**; it only shows "checking…".
3. SSLCommerz calls our **IPN** endpoint. We call the SSLCommerz **validation API** with `val_id`,
   check `status`, `tran_id`, `amount` and `currency` match the intent, then confirm the payment through
   the normal Rule 5 transaction.
4. Idempotent: an IPN for an intent that is already confirmed does nothing. An amount mismatch marks
   the intent `flagged` for the admin's health screen.
5. A job re-checks intents stuck in `initiated` for more than 30 minutes using the transaction-query API.

## Required unit tests
Every example above (2a, 2b, 3, 4, 5, 7) as a test, plus: leap-year February proration; move-in on
day 1 (factor 1); move-in on the last day; reading lower than previous (rejected); meter replaced;
late fee on a fully paid bill (none); late fee not added twice; waived late fee; payment exactly equal
to dues (no credit); allocation across 3 bills; void a payment whose credit was already used; settlement
with dues larger than the deposit; the percent late fee rounding at ৳x.50.
