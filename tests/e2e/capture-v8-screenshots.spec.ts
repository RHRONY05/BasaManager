import { test, expect } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  withOwnerDb,
  GOOD_PASSWORD,
} from '../helpers/e2e-auth';
import path from 'node:path';

test.describe('V8 Visual Evidence Capture', () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('captures screenshots for V8 billing screens in desktop and mobile (light & dark)', async ({
    page,
    browser,
  }) => {
    const HASHED_PW =
      '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

    const landlord = await createVerifiedLandlord();
    const caretakerEmail = uniqueEmail('caretaker-shot');
    const tenantEmail = uniqueEmail('tenant-shot');

    let orgId = '';
    let landlordUserId = '';
    let buildingId = '';
    let unitId = '';
    let leaseId = '';
    let _issuedBillId = '';

    await withOwnerDb(async (db) => {
      const {
        rows: [orgRow],
      } = await db.query(
        `select m.org_id, m.user_id from users u join memberships m on m.user_id = u.id where u.email = $1`,
        [landlord.email],
      );
      orgId = String(orgRow['org_id']);
      landlordUserId = String(orgRow['user_id']);

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

      const {
        rows: [tenantUser],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Karim Ahmed', now()) returning id`,
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
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days, late_fee_type, late_fee_value)
         values ($1, 'Shapla Tower', 'Road 5, Dhanmondi', 'Dhanmondi', 'Dhaka', 900, 1, 10, 5, 'flat', 50000) returning id`,
        [orgId],
      );
      buildingId = String(buildingRow['id']);

      await db.query(
        `insert into caretaker_buildings (org_id, membership_id, building_id) values ($1, $2, $3)`,
        [orgId, caretakerMembership['id'], buildingId],
      );

      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4A', 4, 'family_flat', 2000000, 'submeter') returning id`,
        [orgId, buildingId],
      );
      unitId = String(unitRow['id']);

      const {
        rows: [leaseRow],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-10-01', 2000000, 0, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      leaseId = String(leaseRow['id']);

      await db.query(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1, $2, $3, true)`,
        [orgId, leaseId, tenantMembership['id']],
      );

      await db.query(
        `insert into meter_readings (org_id, unit_id, period_month, reading, meter_replaced, entered_by)
         values ($1, $2, '2026-10-01', 1240, false, $3)`,
        [orgId, unitId, landlordUserId],
      );
    });

    const outDir = path.resolve('.agent/screenshots/v8');

    // Landlord logs in
    await uiLogin(page, landlord.email, landlord.password);
    await page.goto('/l/billing');
    await expect(page.getByRole('heading', { name: /Billing/i })).toBeVisible();

    // Generate bills
    await page
      .getByRole('button', { name: /Generate bills/i })
      .first()
      .click();
    await expect(page.getByText(/Needs reading/i)).toBeVisible();

    // Helper to snap in both light and dark modes
    const snapModes = async (targetPage: typeof page, baseName: string) => {
      // Light
      await targetPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await targetPage.emulateMedia({ colorScheme: 'light' });
      await targetPage.screenshot({ path: path.join(outDir, `${baseName}-light.png`), fullPage: true });

      // Dark
      await targetPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await targetPage.emulateMedia({ colorScheme: 'dark' });
      await targetPage.screenshot({ path: path.join(outDir, `${baseName}-dark.png`), fullPage: true });

      // Restore
      await targetPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await targetPage.emulateMedia({ colorScheme: 'light' });
    };

    // 1. Landlord: Billing - Drafts tab
    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-billing-drafts');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-billing-drafts');

    // Caretaker enters meter reading
    const caretakerCtx = await browser.newContext();
    const caretakerPage = await caretakerCtx.newPage();
    try {
      await uiLogin(caretakerPage, caretakerEmail, GOOD_PASSWORD, /\/c$/);
      await caretakerPage.goto('/c/billing');
      await caretakerPage.getByRole('tab', { name: /Readings/i }).click();
      await expect(caretakerPage.getByRole('cell', { name: '4A' })).toBeVisible();

      // Snap readings tab
      await caretakerPage.setViewportSize({ width: 1440, height: 900 });
      await snapModes(caretakerPage, 'desktop-billing-readings');

      await caretakerPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(caretakerPage, 'mobile-billing-readings');

      const input = caretakerPage.getByPlaceholder(/Enter reading/i).first();
      await input.fill('1395');
      await caretakerPage.getByRole('button', { name: /Save/i }).first().click();
      await expect(caretakerPage.getByText('Saved')).toBeVisible();
    } finally {
      await caretakerCtx.close();
    }

    // Landlord refreshes and views bill detail
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    await expect(page.getByText(/Needs reading/i)).not.toBeVisible();

    await page.locator('.card .cursor-pointer').first().click();
    await expect(page).toHaveURL(/\/l\/bills\/[a-f0-9-]+$/);
    const billUrl = page.url();
    _issuedBillId = billUrl.split('/').pop() || '';

    // Verify submeter explanation visible
    await expect(page.getByText('1,240 → 1,395 = 155 units × ৳9.00')).toBeVisible();

    // Snap Landlord Bill Detail
    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-bill-detail-landlord');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-bill-detail-landlord');

    // Issue bill
    await page.getByRole('button', { name: /Issue bill/i }).click();
    await expect(page.getByText('Issued', { exact: true })).toBeVisible();

    // Landlord views Issued tab in Billing
    await page.goto('/l/billing');
    await page.getByRole('tab', { name: /Issued/i }).click();
    await expect(page.getByText('৳21,395').first()).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-billing-issued');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-billing-issued');

    // 3. Tenant views bills and bill detail
    const tenantCtx = await browser.newContext();
    const tenantPage = await tenantCtx.newPage();
    try {
      await uiLogin(tenantPage, tenantEmail, GOOD_PASSWORD, /\/t$/);
      await tenantPage.goto('/t/bills');
      await expect(tenantPage.getByText('৳21,395')).toBeVisible();

      await tenantPage.setViewportSize({ width: 1440, height: 900 });
      await snapModes(tenantPage, 'desktop-tenant-bills');

      await tenantPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(tenantPage, 'mobile-tenant-bills');

      // Click to open bill detail
      await tenantPage.getByText('৳21,395').click();
      await expect(tenantPage).toHaveURL(/\/t\/bills\/[a-f0-9-]+$/);

      // Verify submeter line is explained
      await expect(tenantPage.getByText('1,240 → 1,395 = 155 units × ৳9.00')).toBeVisible();

      await tenantPage.setViewportSize({ width: 1440, height: 900 });
      await snapModes(tenantPage, 'desktop-tenant-bill-detail');

      await tenantPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(tenantPage, 'mobile-tenant-bill-detail');

      // Extra 360px viewport check
      await tenantPage.setViewportSize({ width: 360, height: 780 });
      await tenantPage.screenshot({
        path: path.join(outDir, 'mobile-360-tenant-bill-detail.png'),
        fullPage: true,
      });
    } finally {
      await tenantCtx.close();
    }
  });
});
