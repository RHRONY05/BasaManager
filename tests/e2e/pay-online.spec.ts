import { test, expect } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  withOwnerDb,
  GOOD_PASSWORD,
} from '../helpers/e2e-auth.js';

test.beforeEach(async () => {
  await clearRateLimits();
});

const HASHED_PW =
  '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

test.describe('SSLCommerz Online Payments (V10)', () => {
  test('tenant initiates online payment -> mock gateway completes IPN -> result page confirms receipt', async ({
    page,
  }) => {
    // 1. Create a verified landlord
    const landlord = await createVerifiedLandlord();

    const tenantEmail = uniqueEmail('tenant-online');

    let orgId = '';
    let landlordUserId = '';
    let buildingId = '';
    let unitId = '';
    let leaseId = '';
    let billId = '';

    // 2. Set up DB fixtures
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
         values ($1, $2, 'Shakib Tenant', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      // Building: Surma Heights
      const {
        rows: [buildingRow],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days)
         values ($1, 'Surma Heights', 'Road 5, Dhanmondi', 'Dhanmondi', 'Dhaka', 900, 1, 10, 5) returning id`,
        [orgId],
      );
      buildingId = String(buildingRow['id']);

      // Unit 4A
      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4A', 4, 'family_flat', 1500000, 'none') returning id`,
        [orgId, buildingId],
      );
      unitId = String(unitRow['id']);

      // Active Lease
      const {
        rows: [leaseRow],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-01-01', 1500000, 0, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      leaseId = String(leaseRow['id']);

      await db.query(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1, $2, $3, true)`,
        [orgId, leaseId, tenantMembership['id']],
      );

      // Issued Bill for 2026-03-01: ৳15,000 (1500000 poisha)
      const {
        rows: [billRow],
      } = await db.query(
        `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha, issued_at, issued_by)
         values ($1, $2, '2026-03-01', '2026-03-10', 'issued', 1500000, 0, now(), $3) returning id`,
        [orgId, leaseId, landlordUserId],
      );
      billId = String(billRow['id']);

      await db.query(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha)
         values ($1, $2, 'rent', 'Monthly Rent', 1500000)`,
        [orgId, billId],
      );
    });

    // ── Phase 1: Tenant logs in and opens the bill ─────────────────────────────
    await uiLogin(page, tenantEmail, GOOD_PASSWORD, /\/t$/);
    await page.waitForURL('**/t');

    await page.goto(`/t/bills/${billId}`);
    await expect(page.getByText('Monthly Rent').first()).toBeVisible();

    // ── Phase 2: Open Pay Online dialog ────────────────────────────────────────
    const payOnlineBtn = page.getByRole('button', { name: /Pay Online/i });
    await expect(payOnlineBtn).toBeVisible();
    await payOnlineBtn.click();

    // Dialog appears with default/full amount
    await expect(page.getByRole('heading', { name: /Pay Online/i })).toBeVisible();
    const amountInput = page.locator('#amountTaka');
    await expect(amountInput).toBeVisible();
    await amountInput.fill('15000');

    // Click Proceed
    const proceedBtn = page.getByRole('button', { name: /Proceed to Payment/i });
    await expect(proceedBtn).toBeEnabled();
    await proceedBtn.click();

    // ── Phase 3: Land on mock gateway and simulate payment ─────────────────────
    // Should navigate to /api/payments/sslcommerz/mock-gateway
    await expect(page).toHaveURL(/.*\/sslcommerz\/mock-gateway.*/);
    await expect(page.getByText('SSLCommerz Sandbox (Mock)')).toBeVisible();
    await expect(page.getByText('15000.00 BDT')).toBeVisible();

    // Click Simulate Successful Payment
    const successBtn = page.locator('#mock-pay-success');
    await expect(successBtn).toBeVisible();
    await successBtn.click();

    // ── Phase 4: Land on /pay/result and verify confirmation ───────────────────
    await expect(page).toHaveURL(/.*\/pay\/result\?tran=BM-.*/);
    await expect(page.getByRole('heading', { name: /Payment Successful/i })).toBeVisible();
    await expect(page.getByText(/BM-\d{4}-\d{6}/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /View Receipt/i })).toBeVisible();

    // ── Phase 5: Return to bill and verify no dues ─────────────────────────────
    await page.goto(`/t/bills/${billId}`);
    await expect(page.getByText(/You have no outstanding dues for this lease/i)).toBeVisible();
  });

  test('tenant cancels on mock gateway -> result page displays cancelled state with retry button', async ({
    page,
  }) => {
    // 1. Create a verified landlord
    const landlord = await createVerifiedLandlord();
    const tenantEmail = uniqueEmail('tenant-cancel');

    let orgId = '';
    let landlordUserId = '';
    let buildingId = '';
    let unitId = '';
    let leaseId = '';
    let billId = '';

    // 2. Set up DB fixtures
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

      const {
        rows: [tenantUser],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Shakib Tenant', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      const {
        rows: [buildingRow],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days)
         values ($1, 'Surma Heights', 'Road 5, Dhanmondi', 'Dhanmondi', 'Dhaka', 900, 1, 10, 5) returning id`,
        [orgId],
      );
      buildingId = String(buildingRow['id']);

      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4B', 4, 'family_flat', 1500000, 'none') returning id`,
        [orgId, buildingId],
      );
      unitId = String(unitRow['id']);

      const {
        rows: [leaseRow],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-01-01', 1500000, 0, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      leaseId = String(leaseRow['id']);

      await db.query(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1, $2, $3, true)`,
        [orgId, leaseId, tenantMembership['id']],
      );

      const {
        rows: [billRow],
      } = await db.query(
        `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha, issued_at, issued_by)
         values ($1, $2, '2026-03-01', '2026-03-10', 'issued', 1500000, 0, now(), $3) returning id`,
        [orgId, leaseId, landlordUserId],
      );
      billId = String(billRow['id']);

      await db.query(
        `insert into bill_lines (org_id, bill_id, kind, label, amount_poisha)
         values ($1, $2, 'rent', 'Monthly Rent', 1500000)`,
        [orgId, billId],
      );
    });

    // ── Phase 1: Tenant logs in and opens the bill ─────────────────────────────
    await uiLogin(page, tenantEmail, GOOD_PASSWORD, /\/t$/);
    await page.waitForURL('**/t');

    await page.goto(`/t/bills/${billId}`);
    await expect(page.getByText('Monthly Rent').first()).toBeVisible();

    // ── Phase 2: Open Pay Online dialog ────────────────────────────────────────
    const payOnlineBtn = page.getByRole('button', { name: /Pay Online/i });
    await expect(payOnlineBtn).toBeVisible();
    await payOnlineBtn.click();

    const proceedBtn = page.getByRole('button', { name: /Proceed to Payment/i });
    await expect(proceedBtn).toBeEnabled();
    await proceedBtn.click();

    // ── Phase 3: Land on mock gateway and click Cancel ────────────────────────
    await expect(page).toHaveURL(/.*\/sslcommerz\/mock-gateway.*/);
    await expect(page.getByText('SSLCommerz Sandbox (Mock)')).toBeVisible();

    const cancelBtn = page.locator('#mock-pay-cancel');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // ── Phase 4: Land on /pay/result and verify Cancelled state ────────────────
    await expect(page).toHaveURL(/.*\/pay\/result\?tran=BM-.*&result=cancel/);
    await expect(page.getByRole('heading', { name: /Payment Cancelled/i })).toBeVisible();
    await expect(page.getByText(/You cancelled the payment. Nothing was charged./i)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to Bills & Retry/i })).toBeVisible();

    // ── Phase 5: Bill remains unpaid ──────────────────────────────────────────
    await page.goto(`/t/bills/${billId}`);
    await expect(page.getByRole('button', { name: /Pay Online/i })).toBeVisible();
  });
});
