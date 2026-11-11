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
import fs from 'node:fs';

test.describe('V9 Visual Evidence Capture @capture', () => {
  test.beforeEach(async () => {
    await clearRateLimits();
  });

  test('captures screenshots for V9 payment screens in desktop and mobile (light & dark)', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const HASHED_PW =
      '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

    const landlord = await createVerifiedLandlord();
    const caretakerEmail = uniqueEmail('caretaker-v9-shot');
    const tenantEmail = uniqueEmail('tenant-v9-shot');

    let orgId = '';
    let landlordUserId = '';
    let buildingId = '';
    let unitId = '';
    let leaseId = '';
    let billId = '';
    let claimRef = '';

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
         values ($1, $2, 'Rahim Tenant', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      const {
        rows: [bld],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, due_day)
         values ($1, 'Green View Tower', 'Plot 42, Road 7, Dhanmondi', 'Dhanmondi', 'Dhaka', 10) returning id`,
        [orgId],
      );
      buildingId = String(bld['id']);

      await db.query(
        `insert into caretaker_buildings (org_id, membership_id, building_id) values ($1, $2, $3)`,
        [orgId, caretakerMembership['id'], buildingId],
      );

      const {
        rows: [u],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4B', 4, 'family_flat', 2500000, 'submeter') returning id`,
        [orgId, buildingId],
      );
      unitId = String(u['id']);

      const {
        rows: [l],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-01-01', 2500000, 5000000, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      leaseId = String(l['id']);

      await db.query(`insert into lease_tenants (org_id, lease_id, membership_id) values ($1, $2, $3)`, [
        orgId,
        leaseId,
        tenantMembership['id'],
      ]);

      const {
        rows: [b],
      } = await db.query(
        `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha)
         values ($1, $2, '2026-03-01', '2026-03-10', 'issued', 2500000, 0) returning id`,
        [orgId, leaseId],
      );
      billId = String(b['id']);

      // A pending claim
      claimRef = `BKASH-CLAIM-${Date.now()}`;
      await db.query(
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, reference, submitted_by)
         values ($1, $2, 1000000, 'bkash', 'pending_claim', '2026-03-05', $3, $4)`,
        [orgId, leaseId, claimRef, tenantUser['id']],
      );

      // A confirmed payment with receipt
      const cashRef = `Cash ref ${Date.now()}`;
      const {
        rows: [pay],
      } = await db.query(
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, reference, submitted_by, confirmed_by, confirmed_at)
         values ($1, $2, 1500000, 'cash', 'confirmed', '2026-03-02', $3, $4, $4, now()) returning id`,
        [orgId, leaseId, cashRef, landlordUserId],
      );
      await db.query(
        `insert into receipts (org_id, payment_id, number, status)
         values ($1, $2, 'BM-2026-000001', 'valid')`,
        [orgId, pay['id']],
      );
    });

    const outDir = path.resolve('.agent/screenshots/v9');
    fs.mkdirSync(outDir, { recursive: true });

    // Helper to snap in both light and dark modes
    const snapModes = async (targetPage: typeof page, baseName: string) => {
      await targetPage.addStyleTag({
        content: `
          *, *::before, *::after {
            transition: none !important;
            animation: none !important;
          }
        `,
      });

      // Light
      await targetPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await targetPage.emulateMedia({ colorScheme: 'light' });
      await targetPage.waitForTimeout(100);
      await targetPage.screenshot({ path: path.join(outDir, `${baseName}-light.png`), fullPage: true });

      // Dark
      await targetPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await targetPage.emulateMedia({ colorScheme: 'dark' });
      await targetPage.waitForTimeout(150);
      await targetPage.screenshot({ path: path.join(outDir, `${baseName}-dark.png`), fullPage: true });

      // Restore
      await targetPage.evaluate(() => document.documentElement.removeAttribute('data-theme'));
      await targetPage.emulateMedia({ colorScheme: 'light' });
    };

    // 1. Landlord: Payments - Pending Claims tab
    await uiLogin(page, landlord.email, landlord.password);
    await page.goto('/l/payments');
    await expect(page.getByRole('heading', { name: /Payments/i })).toBeVisible();
    await expect(page.getByText(claimRef)).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-payments-pending');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-payments-pending');

    // 2. Landlord: Payments - History tab
    await page.getByRole('tab', { name: /History/i }).click();
    await expect(page.getByText('BM-2026-000001')).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-payments-history');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-payments-history');

    // 3. Landlord: Record Payment Dialog
    await page.getByRole('button', { name: /Record Payment/i }).click();
    await expect(page.getByRole('heading', { name: /Record Payment/i })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await snapModes(page, 'desktop-record-payment-dialog');

    await page.setViewportSize({ width: 390, height: 844 });
    await snapModes(page, 'mobile-record-payment-dialog');

    await page.keyboard.press('Escape');

    // 4. Caretaker: Payments list
    const caretakerCtx = await browser.newContext();
    const caretakerPage = await caretakerCtx.newPage();
    try {
      await uiLogin(caretakerPage, caretakerEmail, GOOD_PASSWORD, /\/c$/);
      await caretakerPage.goto('/c/payments');
      await expect(caretakerPage.getByRole('heading', { name: /Payments/i })).toBeVisible();
      await expect(caretakerPage.getByText(claimRef)).toBeVisible();

      await caretakerPage.setViewportSize({ width: 1440, height: 900 });
      await snapModes(caretakerPage, 'desktop-caretaker-payments');

      await caretakerPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(caretakerPage, 'mobile-caretaker-payments');
    } finally {
      await caretakerCtx.close();
    }

    // 5. Tenant: Bill detail with payments section
    const tenantCtx = await browser.newContext();
    const tenantPage = await tenantCtx.newPage();
    try {
      await uiLogin(tenantPage, tenantEmail, GOOD_PASSWORD, /\/t$/);
      await tenantPage.goto(`/t/bills/${billId}`);
      await expect(tenantPage.locator('h1')).toBeVisible();
      await expect(tenantPage.getByText(/Payments & Claims/i)).toBeVisible();

      await tenantPage.setViewportSize({ width: 1440, height: 900 });
      await snapModes(tenantPage, 'desktop-tenant-bill-payments');

      await tenantPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(tenantPage, 'mobile-tenant-bill-payments');

      // Extra 360px viewport check
      await tenantPage.setViewportSize({ width: 360, height: 780 });
      await tenantPage.screenshot({
        path: path.join(outDir, 'mobile-360-tenant-bill-payments.png'),
        fullPage: true,
      });

      // 6. Tenant: Submit Payment Claim Dialog
      await tenantPage.setViewportSize({ width: 1440, height: 900 });
      await tenantPage.getByRole('button', { name: /Submit Payment Claim/i }).click();
      await expect(tenantPage.getByRole('heading', { name: /Submit Payment Claim/i })).toBeVisible();

      await snapModes(tenantPage, 'desktop-tenant-claim-dialog');

      await tenantPage.setViewportSize({ width: 390, height: 844 });
      await snapModes(tenantPage, 'mobile-tenant-claim-dialog');
    } finally {
      await tenantCtx.close();
    }
  });
});
