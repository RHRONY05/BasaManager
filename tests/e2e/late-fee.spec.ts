import { test, expect } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  withOwnerDb,
} from '../helpers/e2e-auth';

test.beforeEach(async () => {
  await clearRateLimits();
});

const HASHED_PW =
  '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

test.describe('Late Fee & Waiver Lifecycle (V8)', () => {
  test('clock past due+grace -> late fee line -> landlord waives', async ({ page }) => {
    // 1. Create a verified landlord
    const landlord = await createVerifiedLandlord();

    const tenantEmail = uniqueEmail('tenant');
    let orgId = '';
    let landlordUserId = '';
    let billId = '';

    // 2. Set up DB fixtures: Building with late fee config, Unit, Active Lease, Overdue Bill with Late Fee line
    await withOwnerDb(async (db) => {
      const {
        rows: [orgRow],
      } = await db.query(
        `select m.org_id, m.user_id from users u join memberships m on m.user_id = u.id where u.email = $1`,
        [landlord.email],
      );
      if (!orgRow) throw new Error('Landlord org not found');
      orgId = String(orgRow['org_id']);
      landlordUserId = String(orgRow['user_id']);

      // Tenant user + membership
      const {
        rows: [tenantUser],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Jashim Tenant', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      // Building with late fee configuration: flat ৳500 (50,000 poisha), grace 5 days, due day 10
      const {
        rows: [buildingRow],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days, late_fee_type, late_fee_value)
         values ($1, 'Meghna Villa', 'House 14, Uttara', 'Uttara', 'Dhaka', 0, 1, 10, 5, 'flat', 50000) returning id`,
        [orgId],
      );
      const buildingId = String(buildingRow['id']);

      // Unit 2B
      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '2B', 2, 'family_flat', 2000000, 'none') returning id`,
        [orgId, buildingId],
      );
      const unitId = String(unitRow['id']);

      // Active Lease
      const {
        rows: [leaseRow],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-09-01', 2000000, 0, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      const leaseId = String(leaseRow['id']);

      await db.query(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1, $2, $3, true)`,
        [orgId, leaseId, tenantMembership['id']],
      );

      // Issued Bill from 2026-10 with due date 2026-10-10 (past due + grace)
      // Base rent ৳20,000 + Late fee ৳500 = Total ৳20,500
      const {
        rows: [billRow],
      } = await db.query(
        `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha, needs_reading, late_fee_applied_at)
         values ($1, $2, '2026-10-01', '2026-10-10', 'issued', 2050000, 0, false, '2026-10-16 00:20:00+06') returning id`,
        [orgId, leaseId],
      );
      billId = String(billRow['id']);

      // Bill line: Rent
      await db.query(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha, meta)
         values ($1, $2, 'rent', 'Monthly Rent', 2000000, '{}')`,
        [orgId, billId],
      );

      // Bill line: Late fee (applied after due_date + grace_days)
      await db.query(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha, meta)
         values ($1, $2, 'late_fee', 'Late fee', 50000, '{"type":"flat","value":50000,"graceDays":5}')`,
        [orgId, billId],
      );
    });

    // 3. Landlord logs in and navigates to the bill detail page
    await uiLogin(page, landlord.email, landlord.password);
    await page.goto(`/l/bills/${billId}`);
    await expect(page.getByRole('heading', { name: /Bill for/i })).toBeVisible();

    // Verify late fee line is present: ৳500, and total is ৳20,500
    await expect(page.getByText('Late fee', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('৳500')).toBeVisible();
    await expect(page.getByText('৳20,500').first()).toBeVisible();

    // 4. Landlord waives late fee
    await page.getByRole('button', { name: /Waive late fee/i }).click();

    // Fill waiver reason
    await page.getByPlaceholder(/Explain the reason/i).fill('First time courtesy waiver for good tenant');
    await page.locator('form button[type="submit"]').click();

    // 5. Verify late fee is waived
    // Amount is now ৳0 and waiver reason is shown
    await expect(page.getByText('"First time courtesy waiver for good tenant"')).toBeVisible();
    await expect(page.getByText('৳0').first()).toBeVisible();

    // Total and balance are reduced back to ৳20,000
    await expect(page.getByText('৳20,000').first()).toBeVisible();
    await expect(page.getByText('৳20,500')).toHaveCount(0);
  });
});
