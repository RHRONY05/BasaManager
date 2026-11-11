import { test, expect, type Page } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  withOwnerDb,
  GOOD_PASSWORD,
} from '../helpers/e2e-auth';
import path from 'node:path';
import fs from 'node:fs';

test.describe('V10 Visual Evidence Capture @capture', () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('captures screenshots for V10 SSLCommerz online payments in desktop and mobile (light & dark)', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const HASHED_PW =
      '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

    const landlord = await createVerifiedLandlord();
    const tenantEmail = uniqueEmail('tenant-v10-shot');

    let orgId = '';
    let landlordUserId = '';
    let buildingId = '';
    let unitId = '';
    let leaseId = '';
    let billId = '';

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
         values ($1, $2, '4A', 4, 'family_flat', 1500000, 'none') returning id`,
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

    const outDir = path.resolve(process.cwd(), 'docs/public/screenshots/v10');
    fs.mkdirSync(outDir, { recursive: true });

    const snapModes = async (targetPage: Page, baseName: string) => {
      await targetPage.emulateMedia({ colorScheme: 'light' });
      await targetPage.screenshot({
        path: path.join(outDir, `${baseName}-light.png`),
        fullPage: true,
      });

      await targetPage.emulateMedia({ colorScheme: 'dark' });
      await targetPage.screenshot({
        path: path.join(outDir, `${baseName}-dark.png`),
        fullPage: true,
      });
    };

    // 1. Tenant Login and view Bill
    await uiLogin(page, tenantEmail, GOOD_PASSWORD, /\/t$/);
    await page.goto(`/t/bills/${billId}`);
    await expect(page.locator('h1')).toBeVisible();

    // 2. Open Pay Online Dialog
    const payOnlineBtn = page.getByRole('button', { name: /Pay Online/i });
    await expect(payOnlineBtn).toBeVisible();
    await payOnlineBtn.click();
    await expect(page.getByRole('heading', { name: /Pay Online/i })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-pay-online-dialog');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-pay-online-dialog');

    await page.setViewportSize({ width: 360, height: 780 });
    await snapModes(page, 'mobile-360-pay-online-dialog');

    // 3. Proceed to Payment Mock Gateway
    const proceedBtn = page.getByRole('button', { name: /Proceed to Payment/i });
    await expect(proceedBtn).toBeEnabled();
    await proceedBtn.click();

    await expect(page).toHaveURL(/.*\/sslcommerz\/mock-gateway.*/);
    await expect(page.getByText('SSLCommerz Sandbox (Mock)')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-mock-gateway');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-mock-gateway');

    await page.setViewportSize({ width: 360, height: 780 });
    await snapModes(page, 'mobile-360-mock-gateway');

    // 4. Simulate Success and land on Pay Result Page
    const successBtn = page.locator('#mock-pay-success');
    await expect(successBtn).toBeVisible();
    await successBtn.click();

    await expect(page).toHaveURL(/.*\/pay\/result\?tran=BM-.*/);
    await expect(page.getByRole('heading', { name: /Payment Successful/i })).toBeVisible();
    await expect(page.getByText('Transaction ID')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-pay-result-confirmed');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-pay-result-confirmed');

    await page.setViewportSize({ width: 360, height: 780 });
    await snapModes(page, 'mobile-360-pay-result-confirmed');

    // 5. Pay Result Page - Cancelled State
    await page.goto('/pay/result?tran=BM-CANCEL-TEST');
    await page.route('**/api/payments/sslcommerz/intents/BM-CANCEL-TEST', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: '22222222-2222-2222-2222-222222222222',
            tranId: 'BM-CANCEL-TEST',
            status: 'cancelled',
            amountPoisha: 1500000,
          },
        }),
      });
    });
    await page.goto('/pay/result?tran=BM-CANCEL-TEST');
    await expect(page.getByRole('heading', { name: /Payment Cancelled/i })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-pay-result-cancelled');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-pay-result-cancelled');

    await page.setViewportSize({ width: 360, height: 780 });
    await snapModes(page, 'mobile-360-pay-result-cancelled');
  });
});
