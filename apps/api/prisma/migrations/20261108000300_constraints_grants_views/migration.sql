-- 0003 check constraints, history grants and the admin views (03-DATABASE.md). Hand-written.
-- Partial unique indexes live in schema.prisma (`where: raw(...)`), so they are in 20261108000100.

-- ── Check constraints ──────────────────────────────────────────────────────────────────────────
ALTER TABLE buildings
  ADD CONSTRAINT buildings_bill_day_check CHECK (bill_day BETWEEN 1 AND 28),
  ADD CONSTRAINT buildings_due_day_check CHECK (due_day BETWEEN 1 AND 28),
  ADD CONSTRAINT buildings_grace_days_check CHECK (grace_days BETWEEN 0 AND 15),
  ADD CONSTRAINT buildings_late_fee_value_check CHECK (late_fee_value >= 0),
  ADD CONSTRAINT buildings_electricity_rate_check CHECK (electricity_rate_poisha >= 0);

ALTER TABLE units
  ADD CONSTRAINT units_default_rent_check CHECK (default_rent_poisha >= 0);

ALTER TABLE unit_charges
  ADD CONSTRAINT unit_charges_amount_check CHECK (amount_poisha >= 0);

ALTER TABLE leases
  ADD CONSTRAINT leases_monthly_rent_check CHECK (monthly_rent_poisha >= 0),
  ADD CONSTRAINT leases_deposit_check CHECK (deposit_poisha >= 0);

ALTER TABLE lease_charges
  ADD CONSTRAINT lease_charges_amount_check CHECK (amount_poisha >= 0);

ALTER TABLE deposit_entries
  ADD CONSTRAINT deposit_entries_amount_check CHECK (amount_poisha >= 0);

ALTER TABLE meter_readings
  ADD CONSTRAINT meter_readings_period_month_check
    CHECK (period_month = date_trunc('month', period_month)::date),
  ADD CONSTRAINT meter_readings_reading_check CHECK (reading >= 0);

ALTER TABLE bills
  ADD CONSTRAINT bills_period_month_check CHECK (period_month = date_trunc('month', period_month)::date),
  ADD CONSTRAINT bills_total_check CHECK (total_poisha >= 0),
  ADD CONSTRAINT bills_paid_check CHECK (paid_poisha >= 0),
  ADD CONSTRAINT bills_paid_lte_total_check CHECK (paid_poisha <= total_poisha);

-- bill_lines.amount_poisha and credit_entries.amount_poisha are signed (no check).

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_check CHECK (amount_poisha > 0);

ALTER TABLE payment_allocations
  ADD CONSTRAINT payment_allocations_amount_check CHECK (amount_poisha > 0);

ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_amount_check CHECK (amount_poisha > 0);

ALTER TABLE receipt_counters
  ADD CONSTRAINT receipt_counters_last_seq_check CHECK (last_seq >= 0);

ALTER TABLE files
  ADD CONSTRAINT files_size_bytes_check CHECK (size_bytes >= 0);

-- ── Grants beyond the default privileges of 20261108000000 ─────────────────────────────────────
-- History is never deleted (payments are voided, lines adjusted, events appended).
REVOKE DELETE ON payments, bill_lines, payment_allocations, receipts, maintenance_events, credit_entries
  FROM bm_app, bm_worker;

-- The API only writes the outbox (see policy app_insert); the worker reads and updates it.
REVOKE SELECT, UPDATE, DELETE ON outbox FROM bm_app;

-- Prisma's migration ledger: `prisma migrate deploy` creates it as bm_owner before the first migration, so
-- where the default privileges already existed (dev/test init script) bm_app/bm_worker got write grants on it.
-- Only bm_owner touches it; bm_readonly may read it (db-docs, backup verification).
REVOKE ALL ON _prisma_migrations FROM bm_app, bm_worker;
GRANT SELECT ON _prisma_migrations TO bm_readonly;

-- ── Admin views ────────────────────────────────────────────────────────────────────────────────
-- Read by the admin endpoints in a `$tx({ orgId: null, isAdmin: true, … })` context. They run with the
-- view owner's rights (bm_owner, the database superuser, so RLS does not hide other orgs' rows) and
-- return nothing unless app.is_admin = 'true'. security_barrier stops a caller's WHERE functions from
-- being evaluated before the view's own filter. No personal or financial row data: names, statuses,
-- counts and timestamps only.

CREATE VIEW admin_org_overview WITH (security_barrier = true) AS
SELECT
  o.id,
  o.name,
  o.slug,
  o.status,
  o.is_demo,
  o.created_at,
  (SELECT count(*) FROM buildings b WHERE b.org_id = o.id AND b.archived_at IS NULL)::int AS building_count,
  (SELECT count(*) FROM units u WHERE u.org_id = o.id AND u.archived_at IS NULL)::int AS unit_count,
  (SELECT count(*) FROM leases l
     WHERE l.org_id = o.id AND l.status IN ('active', 'notice'))::int AS active_lease_count,
  (SELECT count(*) FROM memberships m
     WHERE m.org_id = o.id AND m.status = 'active')::int AS member_count
FROM organizations o
WHERE current_setting('app.is_admin', true) = 'true';

-- One row per item: every job run, every failed outbox message, every flagged payment intent and every
-- intent still `initiated` 30+ minutes after it was created (stuck). The API orders/limits it.
CREATE VIEW admin_health WITH (security_barrier = true) AS
SELECT h.*
FROM (
  SELECT 'job_run'::text AS kind, j.id, NULL::uuid AS org_id, j.job AS name, j.status::text AS status,
         NULL::int AS attempts, j.started_at AS at, j.finished_at
    FROM job_runs j
  UNION ALL
  SELECT 'outbox_failed', x.id, x.org_id, x.type, x.status::text, x.attempts, x.updated_at, NULL
    FROM outbox x
   WHERE x.status = 'failed'
  UNION ALL
  SELECT 'intent_flagged', p.id, p.org_id, 'payment_intent', p.status::text, NULL, p.updated_at, NULL
    FROM payment_intents p
   WHERE p.status = 'flagged'
  UNION ALL
  SELECT 'intent_stuck', p.id, p.org_id, 'payment_intent', p.status::text, NULL, p.created_at, NULL
    FROM payment_intents p
   WHERE p.status = 'initiated' AND p.created_at < now() - interval '30 minutes'
) h
WHERE current_setting('app.is_admin', true) = 'true';

-- Views got the table default privileges; they are read-only.
REVOKE INSERT, UPDATE, DELETE ON admin_org_overview, admin_health FROM bm_app, bm_worker;
