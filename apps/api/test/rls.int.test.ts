import { describe, it, expect, afterAll } from 'vitest';
import { q, closeOwner } from './helpers/pg';

/** Every table of 03-DATABASE.md. Guards against the "no tables, so nothing to check" false pass. */
const EXPECTED_TABLES = [
  'users', 'oauth_accounts', 'sessions', 'auth_tokens', 'organizations', 'memberships',
  'caretaker_buildings', 'invitations', 'buildings', 'units', 'unit_charges', 'leases',
  'lease_tenants', 'lease_charges', 'deposit_entries', 'meter_readings', 'bills', 'bill_lines',
  'payments', 'payment_allocations', 'credit_entries', 'payment_intents', 'receipt_counters',
  'receipts', 'maintenance_requests', 'maintenance_events', 'notices', 'files', 'documents',
  'notifications', 'notification_preferences', 'push_subscriptions', 'outbox', 'job_runs',
]; // prettier-ignore

afterAll(closeOwner);

describe('RLS coverage (rls.int.test.ts)', () => {
  it('every table of 03-DATABASE.md exists', async () => {
    const rows = await q<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const have = new Set(rows.map((r) => r.table_name));
    const missing = EXPECTED_TABLES.filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it('every table with an org_id column has RLS enabled, FORCED, and at least one policy', async () => {
    const tables = await q<{ table_name: string }>(
      `select c.table_name
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
        order by 1`,
    );
    // Not vacuous: 03 has far more than 10 org-owned tables.
    expect(tables.length).toBeGreaterThan(10);

    const flags = await q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    const policies = await q<{ tablename: string }>(
      `select tablename from pg_policies where schemaname = 'public'`,
    );
    const flagByTable = new Map(flags.map((f) => [f.relname, f]));
    const withPolicy = new Set(policies.map((p) => p.tablename));

    const offenders = tables
      .map((t) => t.table_name)
      .filter((name) => {
        const f = flagByTable.get(name);
        return !f || !f.relrowsecurity || !f.relforcerowsecurity || !withPolicy.has(name);
      });
    expect(offenders, `tables lacking RLS + FORCE + policy: ${offenders.join(', ')}`).toEqual([]);
  });

  it('organizations (keyed by id, no org_id column) also has RLS enabled and forced, with the org_self_* and member_orgs policies', async () => {
    const rows = await q<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class
        where oid = 'public.organizations'::regclass`,
    );
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const pol = await q<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'organizations'`,
    );
    // org_self was split per command in 20261108000400_user_scoped_access (no DELETE policy: never deleted).
    expect(pol.map((p) => p.policyname).sort()).toEqual([
      'member_orgs',
      'org_self_insert',
      'org_self_select',
      'org_self_update',
    ]);
  });

  it('documents has the RESTRICTIVE no_caretaker policy', async () => {
    const pol = await q<{ policyname: string; permissive: string }>(
      `select policyname, permissive from pg_policies
        where schemaname = 'public' and tablename = 'documents'`,
    );
    const noCaretaker = pol.find((p) => p.policyname === 'no_caretaker');
    expect(noCaretaker, 'policy no_caretaker on documents').toBeDefined();
    expect(noCaretaker!.permissive).toBe('RESTRICTIVE');
  });

  it('notifications has the own_rows policy', async () => {
    const pol = await q<{ policyname: string }>(
      `select policyname from pg_policies where schemaname = 'public' and tablename = 'notifications'`,
    );
    expect(pol.map((p) => p.policyname)).toContain('own_rows');
  });

  it('admin views exist and are security_barrier', async () => {
    const rows = await q<{ relname: string; reloptions: string[] | null }>(
      `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v' and c.relname in ('admin_org_overview', 'admin_health')
        order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual(['admin_health', 'admin_org_overview']);
    for (const r of rows) expect(r.reloptions ?? []).toContain('security_barrier=true');
  });
});
