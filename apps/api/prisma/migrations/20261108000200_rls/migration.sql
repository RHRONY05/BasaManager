-- 0002 row-level security (03-DATABASE.md "RLS"). Hand-written.
--
-- The API connects as bm_app (NOBYPASSRLS) and `db.$tx(ctx, fn)` sets, as the first statement of every
-- transaction:  set_config('app.org_id' | 'app.user_id' | 'app.role' | 'app.is_admin', …, true).
-- Policies read them with nullif(current_setting(name, true), ''): once a setting has existed on a pooled
-- connection, a later transaction without context reads '' (not NULL), and ''::uuid would raise 22P02.
-- NULL compares as unknown, so "no context" means "no rows".
-- FORCE makes the table owner subject to the policies too (bm_owner is a superuser in our containers and
-- bypasses RLS anyway; FORCE protects any non-superuser owner).

-- Every org-owned table: org_isolation. (notifications and outbox have their own policies below.)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'caretaker_buildings', 'invitations',
    'buildings', 'units', 'unit_charges',
    'leases', 'lease_tenants', 'lease_charges', 'deposit_entries',
    'meter_readings', 'bills', 'bill_lines', 'payments', 'payment_allocations', 'credit_entries',
    'payment_intents', 'receipt_counters', 'receipts',
    'maintenance_requests', 'maintenance_events', 'notices', 'files', 'documents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I
         USING (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)
         WITH CHECK (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;

-- documents: caretakers never see (or write) them. RESTRICTIVE = AND-ed with org_isolation.
-- A missing role setting is not "caretaker".
CREATE POLICY no_caretaker ON documents AS RESTRICTIVE
  USING (coalesce(nullif(current_setting('app.role', true), ''), '') <> 'caretaker');

-- files: the stored object behind a document (kind = 'document': NID scans, agreements) is hidden from
-- caretakers too, so a download service that only checks the files row can't hand one out. Other kinds
-- (maintenance photos, payment proofs, PDFs) stay visible. Also blocks a caretaker inserting a 'document' file.
CREATE POLICY no_caretaker_documents ON files AS RESTRICTIVE
  USING (kind <> 'document' OR coalesce(nullif(current_setting('app.role', true), ''), '') <> 'caretaker');

-- organizations: keyed by id. Members see their own org; the platform-admin context may read all
-- (admin screens read only through the admin_* views, see migration 20261108000300).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_self ON organizations
  USING (id = nullif(current_setting('app.org_id', true), '')::uuid
         OR current_setting('app.is_admin', true) = 'true');

-- notifications: per user, not per org (org_id may be null for platform messages). No org_isolation,
-- because permissive policies are OR-ed and it would show every member's notifications to the org.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
-- Writes must also not tag a notification with another org than the transaction's (null = platform message).
CREATE POLICY own_rows ON notifications
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid
              AND (org_id IS NULL OR org_id = nullif(current_setting('app.org_id', true), '')::uuid));

-- outbox: a delivery queue, not tenant data. bm_app only INSERTs rows (in the same transaction as the
-- domain change) for its own org or with no org; it has no SELECT/UPDATE/DELETE grant on the table
-- (revoked in 20261108000300), so it must insert without RETURNING (Prisma `createMany`).
-- bm_worker (BYPASSRLS) reads and updates it.
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY app_insert ON outbox FOR INSERT TO bm_app
  WITH CHECK (org_id IS NULL OR org_id = nullif(current_setting('app.org_id', true), '')::uuid);
