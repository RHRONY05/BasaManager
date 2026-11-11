# Brief V10-tests (for: test-designer) — SSLCommerz online payments, tests first

Read: `07-BILLING.md` Rule 8 (and Rule 5), `09-TESTING.md` (SSLCommerz), `04-API.md` (payments/sslcommerz), `03-DATABASE.md` (`payment_intents`).
Test file: `apps/api/test/payments/sslcommerz.int.test.ts` (run with `pnpm test:int`).

## Interface (defined here; implementer follows it)

- Gateway is mocked by stubbing `globalThis.fetch` in the test (msw is NOT installed). Sandbox URLs:
  - init `POST https://sandbox.sslcommerz.com/gwprocess/v4/api.php` (form body: store_id, store_passwd, total_amount "5000.00", currency BDT, tran_id, success_url, fail_url, cancel_url, ipn_url) -> JSON `{status:'SUCCESS', GatewayPageURL, sessionkey}`
  - validation `GET https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php?val_id=&store_id=&store_passwd=&format=json` -> `{status:'VALID'|'INVALID_TRANSACTION', tran_id, val_id, amount:'5000.00', currency:'BDT'}`
  - transaction query `GET https://sandbox.sslcommerz.com/validator/api/merchantTransIDvalidationAPI.php?tran_id=&store_id=&store_passwd=&format=json` -> `{APIConnect:'DONE', no_of_trans_found:1, element:[{status:'VALID', tran_id, val_id, amount, currency_type:'BDT'}]}`
- Credentials come from env `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` (the test sets them before building the app; `PAYMENTS_MOCK=false`).
- `POST /api/payments/sslcommerz/init` (tenant of the lease) `{leaseId, amountPoisha}` -> 201 `{data:{gatewayUrl, tranId}}`; inserts `payment_intents` (`initiated`, unique `tran_id`, `session_key`, `amount_poisha`). Min 10000 poisha, max = open dues + one month's rent, else 400 VALIDATION_FAILED. Non-tenant 403, other tenant's lease 404, anonymous 401.
- `POST /api/payments/sslcommerz/ipn` public, `application/x-www-form-urlencoded` (`tran_id,val_id,status,amount,currency`), no cookie/CSRF. Always 200 once handled. The server calls the validation API; on VALID + tran_id/amount/currency match it creates one `payments` row (`method='sslcommerz'`, `status='confirmed'`, `reference=val_id`) through the Rule 5 transaction (allocation, receipt), sets the intent `confirmed` with `payment_id`/`val_id`, writes outbox `payment.confirmed`. Mismatch -> intent `flagged`, no payment. INVALID -> intent `failed`. Unknown tran_id -> 200, nothing happens. Replay or concurrent duplicates -> nothing changes. Gateway unreachable -> no payment, intent stays `initiated`.
- `POST /api/payments/sslcommerz/return/:result` (`success|fail|cancel`) public, no CSRF -> 303 to `/pay/result?tran=<tranId>`; changes no money (fail/cancel only set an `initiated` intent to `failed`/`cancelled`, never a `confirmed` one). The CSRF middleware must exempt this path too (only the IPN path is exempt today).
- `GET /api/payments/sslcommerz/intents/:tranId` (owning tenant) -> 200 `{data:{status, amountPoisha, paymentId, receiptId}}`; other tenant or other org 404; anonymous 401.
- Worker job `recheckPaymentIntentsJob` in `apps/worker/src/jobs/recheckPaymentIntents.ts` (`name 'recheckPaymentIntents'`, registered in `jobs`): for intents `initiated` for more than 30 min, calls the transaction-query API and confirms like the IPN (mismatch -> `flagged`). `ctx.env` carries `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`.
