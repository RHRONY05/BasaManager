# Brief V9-tests (for: test-designer subagent) — tests first

Read first: `AGENTS.md`, `.agent/rules/basamanager.md`, `.agent/07-BILLING.md` (Rules 5, 6, 7), `.agent/09-TESTING.md` (Payments, Files, Receipts), `.agent/04-API.md` (Payments & receipts routes, Files routes), `.agent/08-TASKS.md` (Task V9).

Work in the git worktree `D:/Projects/bm-wt/V9` (branch `feat/V9`). Commit tests with conventional commit (`test: ...`).

## Goal
Write failing integration tests for payments, claims, receipts, voiding, and files in `apps/api/test/payments/payments.int.test.ts`.
Tests must fail now for the right reason (missing implementation of payment/file endpoints in `apps/api`).

---

## Contracts to use:
- Shared schemas: `packages/shared/src/api/payments.ts` and `packages/shared/src/api/files.ts` (already exported from `packages/shared`)
- Domain functions: `packages/domain/src/billing/index.ts` (`allocatePayment`, `applyCreditToBill`, `voidPayment`)
- Endpoints from `04-API.md`:
  - `POST /payments/claims`: Tenant submits a claim: `{ leaseId, amountPoisha, method, reference?, paidOn, proofFileId? }` -> `201 { payment: PaymentResponse }`. Emits outbox `payment.claim_submitted`. `CONFLICT` `DUPLICATE_REFERENCE` on duplicate reference.
  - `POST /payments`: Landlord/Caretaker records a payment directly: `{ leaseId, amountPoisha, method, reference?, paidOn, proofFileId? }` -> `201 { payment: PaymentResponse }`. Rule 5 allocation + sequential receipt in ONE tx.
  - `POST /payments/:id/confirm`: Landlord/Caretaker confirms a pending claim -> `200 { payment: PaymentResponse }`. Rule 5 allocation + sequential receipt in ONE tx. Emits outbox `payment.confirmed`.
  - `POST /payments/:id/reject`: Landlord/Caretaker rejects a pending claim -> `{ reason }` -> `200 { payment: PaymentResponse }`. Emits outbox `payment.rejected`.
  - `POST /payments/:id/void`: Landlord only voids a confirmed payment -> `{ reason }` -> `200 { payment: PaymentResponse }`. Rule 6 (deletes payment allocations, marks payment `void`, marks receipt `void`, reverses credit entries, recomputes affected bill statuses in one transaction). Emits outbox `payment.voided`.
  - `GET /payments?leaseId=&status=`: Landlord, Caretaker, Tenant (own leases only) -> `200 { items: PaymentResponse[], nextCursor?: string }`.
  - `GET /receipts/:id/download`: Landlord, Caretaker, Tenant (own) -> `200 { downloadUrl }` or `202 { status: 'rendering' }`.
  - `POST /files`: multipart `file`, `kind` (`payment_proof` | `maintenance_photo` | `document`); returns `201 { fileId, publicId, kind, sizeBytes, mime }`. Max 5 MB, sniffed.
  - `GET /files/:id/url?variant=thumb`: returns `200 { url, expiresAt }`.
  - `GET /files/local/:id`: HMAC-signed query (`exp`, `sig`).

---

## Required Integration Test Cases (from 09-TESTING.md and 08-TASKS.md):

1. **Claims submission (`POST /payments/claims`):**
   - Tenant submits claim for own lease with amount, method, reference, paidOn -> 201, status `pending_claim`, outbox event `payment.claim_submitted`.
   - Tenant cannot submit claim for another tenant's lease (404/403).
   - Duplicate reference for same method returns 409 `DUPLICATE_REFERENCE`.
   - Caretaker / Landlord cannot submit a claim (claims are tenant-initiated) or non-tenant gets 403.

2. **Direct payment recording (`POST /payments`):**
   - Landlord or Caretaker records payment directly -> 201, status `confirmed`, confirmedBy set, confirmedAt set.
   - Allocates to oldest unpaid bill first (Rule 5).
   - Overpayment creates lease credit (`CreditEntry` with `kind: 'overpayment'`).
   - Creates a valid receipt with number format `BM-<year>-<seq 6 digits>`.

3. **Claim Confirmation & Rejection (`POST /payments/:id/confirm` & `POST /payments/:id/reject`):**
   - Caretaker confirms pending claim -> 200, status `confirmed`, allocated to bills, receipt generated, outbox `payment.confirmed`.
   - Rejecting requires reason -> 200, status `rejected`, rejectedReason set, outbox `payment.rejected`.
   - Cannot confirm/reject already confirmed, rejected, or void payment (409).

4. **Concurrency & Locking:**
   - Concurrent confirm of two claims on one lease allocates correctly without lost updates (total allocated + credit equals sum of payments).
   - Receipt numbers gapless under 20 concurrent payments across one org (`BM-<year>-000001` ... `BM-<year>-000020`).
   - Rollback when receipt insert fails (entire transaction rolled back, no payment or allocations saved).

5. **Voiding Payment (`POST /payments/:id/void`):**
   - Landlord voids confirmed payment with reason -> 200, status `void`, voidReason set, voidedBy set, receipt marked `void`.
   - Allocations deleted / removed, affected bills' `paid_poisha` and `status` reverted back to `issued` or `partially_paid`.
   - Void after credit was used: if overpayment credit was already applied to a subsequent bill, voiding reverses that credit application and re-opens the subsequent bill (Rule 6).
   - Caretaker cannot void payment (403).

6. **Files (`POST /files`, `GET /files/:id/url`, `GET /files/local/:id`):**
   - Upload file within 5 MB limit -> 201 with fileId.
   - Upload file > 5 MB -> 413 Payload Too Large.
   - Executable / mime spoofing (`.exe` renamed to `.jpg`) -> 415 Unsupported Media Type.
   - Signed URL generation: expiring signed URL for permitted user; rejected after expiry or with tampered signature.
