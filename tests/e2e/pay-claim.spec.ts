import { randomUUID } from 'node:crypto';
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

test.describe('Manual Payments, Claims and Receipts (V9)', () => {
  test('tenant submits claim -> caretaker confirms -> receipt generated -> landlord voids recorded payment', async ({
    page,
    browser,
  }) => {
    // 1. Create a verified landlord
    const landlord = await createVerifiedLandlord();

    const caretakerEmail = uniqueEmail('caretaker');
    const tenantEmail = uniqueEmail('tenant');

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

      // Caretaker user + membership
      const {
        rows: [caretakerUser],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Kashem Caretaker', now()) returning id`,
        [caretakerEmail, HASHED_PW],
      );
      const {
        rows: [caretakerMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'caretaker', 'active') returning id`,
        [orgId, caretakerUser['id']],
      );

      // Tenant user + membership
      const {
        rows: [tenantUser],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Karim Tenant', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      // Building: Padma View
      const {
        rows: [buildingRow],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days)
         values ($1, 'Padma View', 'Road 12, Banani', 'Banani', 'Dhaka', 900, 1, 10, 5) returning id`,
        [orgId],
      );
      buildingId = String(buildingRow['id']);

      // Assign caretaker
      await db.query(
        `insert into caretaker_buildings (org_id, membership_id, building_id) values ($1, $2, $3)`,
        [orgId, caretakerMembership['id'], buildingId],
      );

      // Unit 3B
      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '3B', 3, 'family_flat', 1500000, 'none') returning id`,
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

    // ── Phase 1: Tenant logs in and submits a claim ─────────────────────────────
    await uiLogin(page, tenantEmail, GOOD_PASSWORD, /\/t$/);
    await page.waitForURL('**/t');

    // Navigate to bills
    await page.goto(`/t/bills/${billId}`);
    await expect(page.getByText('Monthly Rent').first()).toBeVisible();

    const trxRef = `BKASH-${randomUUID().slice(0, 8)}`;
    const advanceRef = `ADV-${randomUUID().slice(0, 8)}`;

    // Click "Submit Payment Claim"
    await page.getByRole('button', { name: /Submit Payment Claim/i }).click();

    // Fill Claim Modal
    await expect(page.getByRole('heading', { name: /Submit Payment Claim/i })).toBeVisible();
    await page.fill('input[type="number"]', '15000');
    await page.selectOption('select', 'bkash');
    await page.fill('input[placeholder*="BL92A8ZK1"]', trxRef);

    // Submit
    await page.getByRole('button', { name: /Submit Claim/i }).click();

    // Modal closes and claim appears in list
    await expect(page.getByText(trxRef).first()).toBeVisible();
    await expect(page.getByText(/Pending Verification/i)).toBeVisible();

    // ── Phase 2: Caretaker confirms the claim ──────────────────────────────────
    const caretakerContext = await browser.newContext();
    const caretakerPage = await caretakerContext.newPage();

    await uiLogin(caretakerPage, caretakerEmail, GOOD_PASSWORD, /\/c$/);
    await caretakerPage.waitForURL('**/c');

    await caretakerPage.goto('/c/payments');
    await expect(caretakerPage.getByText(trxRef).first()).toBeVisible();

    // Click "Confirm"
    await caretakerPage
      .getByRole('button', { name: /Confirm/i })
      .first()
      .click();

    // Verify claim moved to history with receipt
    await caretakerPage.getByRole('button', { name: /Payment History/i }).click();
    await expect(caretakerPage.getByText(trxRef).first()).toBeVisible();
    await expect(caretakerPage.getByText(/BM-\d{4}-\d{6}/i).first()).toBeVisible();

    await caretakerContext.close();

    // ── Phase 3: Tenant verifies bill is paid ───────────────────────────────────
    await page.reload();
    await expect(page.getByText(/You have no outstanding dues for this lease/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Receipt/i })).toBeVisible();

    // ── Phase 4: Landlord records a payment and voids it ───────────────────────
    const landlordContext = await browser.newContext();
    const landlordPage = await landlordContext.newPage();

    await uiLogin(landlordPage, landlord.email, GOOD_PASSWORD, /\/l$/);
    await landlordPage.waitForURL('**/l');

    await landlordPage.goto('/l/payments');
    await landlordPage.getByRole('button', { name: /Record Payment/i }).click();

    await expect(landlordPage.getByRole('heading', { name: /Record Payment/i })).toBeVisible();
    await landlordPage.selectOption('select', { index: 1 });
    await landlordPage.fill('input[type="number"]', '5000');
    await landlordPage.selectOption('select:has(option[value="cash"])', 'cash');
    await landlordPage.fill('input[placeholder*="Cash collected"]', advanceRef);

    await landlordPage.getByRole('button', { name: /Save & Allocate/i }).click();

    // Verify in history
    await landlordPage.getByRole('button', { name: /Payment History/i }).click();
    await expect(landlordPage.getByText(advanceRef).first()).toBeVisible();
    await expect(landlordPage.getByText(/BM-\d{4}-\d{6}/i).first()).toBeVisible();

    // Void the payment
    await landlordPage.getByRole('button', { name: /Void/i }).first().click();
    await expect(landlordPage.getByRole('heading', { name: /Void Recorded Payment/i })).toBeVisible();

    await landlordPage.fill('textarea', 'Mistaken cash entry');
    await landlordPage.getByRole('button', { name: /Confirm Void/i }).click();

    // Verify status is void in table
    await expect(landlordPage.locator('table').getByText(/void/i).first()).toBeVisible();

    await landlordContext.close();
  });
});
