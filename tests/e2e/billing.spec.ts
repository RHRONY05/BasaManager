import { test, expect } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  withOwnerDb,
  GOOD_PASSWORD,
} from '../helpers/e2e-auth';

test.beforeEach(async () => {
  await clearRateLimits();
});

const HASHED_PW =
  '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

test.describe('Billing Engine Lifecycle (V8)', () => {
  test('clock to bill day -> drafts -> caretaker enters readings -> landlord issues -> tenant sees explained bill', async ({
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

    // 2. Set up DB fixtures: Building, Unit (with electric submeter), Caretaker, Tenant, Active Lease, Prev Reading
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
         values ($1, $2, 'Karim Ahmed', now()) returning id`,
        [tenantEmail, HASHED_PW],
      );
      const {
        rows: [tenantMembership],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status) values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenantUser['id']],
      );

      // Building: Shapla Tower, rate ৳9.00/unit (900 poisha)
      const {
        rows: [buildingRow],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city, electricity_rate_poisha, bill_day, due_day, grace_days, late_fee_type, late_fee_value)
         values ($1, 'Shapla Tower', 'Road 5, Dhanmondi', 'Dhanmondi', 'Dhaka', 900, 1, 10, 5, 'flat', 50000) returning id`,
        [orgId],
      );
      buildingId = String(buildingRow['id']);

      // Assign caretaker to building
      await db.query(
        `insert into caretaker_buildings (org_id, membership_id, building_id) values ($1, $2, $3)`,
        [orgId, caretakerMembership['id'], buildingId],
      );

      // Unit 4A with electric submeter
      const {
        rows: [unitRow],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4A', 4, 'family_flat', 2000000, 'submeter') returning id`,
        [orgId, buildingId],
      );
      unitId = String(unitRow['id']);

      // Active Lease starting 2026-10-01 (rent ৳20,000)
      const {
        rows: [leaseRow],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-10-01', 2000000, 0, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );

      await db.query(
        `insert into lease_tenants (org_id, lease_id, membership_id, is_primary) values ($1, $2, $3, true)`,
        [orgId, leaseRow['id'], tenantMembership['id']],
      );

      // Previous month meter reading: 1240
      await db.query(
        `insert into meter_readings (org_id, unit_id, period_month, reading, meter_replaced, entered_by)
         values ($1, $2, '2026-10-01', 1240, false, $3)`,
        [orgId, unitId, landlordUserId],
      );
    });

    // 3. Landlord logs in and generates draft bills
    await uiLogin(page, landlord.email, landlord.password);
    await page.goto('/l/billing');
    await expect(page.getByRole('heading', { name: /Billing/i })).toBeVisible();

    // Click "Generate bills"
    await page
      .getByRole('button', { name: /Generate bills/i })
      .first()
      .click();

    // Draft for Unit 4A appears in Drafts tab with "Needs reading" badge
    await expect(page.getByText(/Needs reading/i)).toBeVisible();

    // 4. Caretaker logs in to enter meter reading
    const caretakerContext = await browser.newContext();
    const caretakerPage = await caretakerContext.newPage();
    try {
      await uiLogin(caretakerPage, caretakerEmail, GOOD_PASSWORD, /\/c$/);
      await caretakerPage.goto('/c/billing');

      // Click "Readings" tab
      await caretakerPage.getByRole('tab', { name: /Readings/i }).click();
      await expect(caretakerPage.getByRole('cell', { name: '4A' })).toBeVisible();
      await expect(caretakerPage.getByText('1,240')).toBeVisible();

      // Enter current reading 1395 (1240 -> 1395 = 155 units)
      const input = caretakerPage.getByPlaceholder(/Enter reading/i).first();
      await input.fill('1395');

      // Click Save reading button
      await caretakerPage.getByRole('button', { name: /Save/i }).first().click();
      await expect(caretakerPage.getByText('Saved')).toBeVisible();
    } finally {
      await caretakerContext.close();
    }

    // 5. Landlord refreshes and issues the draft bill
    await page.reload();
    await expect(page.getByText(/Needs reading/i)).not.toBeVisible();

    // Navigate to Bill Detail by clicking the draft card
    await page.locator('.card .cursor-pointer').first().click();
    await expect(page).toHaveURL(/\/l\/bills\/[a-f0-9-]+$/);

    // Verify draft includes electricity charge: 155 units * ৳9 = ৳1,395 + rent ৳20,000 = ৳21,395
    await expect(page.getByText('1,240 → 1,395 = 155 units × ৳9.00')).toBeVisible();
    await expect(page.getByText('৳21,395').first()).toBeVisible();

    // Issue bill
    await page.getByRole('button', { name: /Issue bill/i }).click();
    await expect(page.getByText('Issued', { exact: true })).toBeVisible();

    // 6. Tenant logs in and views explained bill
    const tenantContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();
    try {
      await uiLogin(tenantPage, tenantEmail, GOOD_PASSWORD, /\/t$/);
      await tenantPage.goto('/t/bills');
      await expect(tenantPage.getByRole('heading', { name: /My Bills/i })).toBeVisible();

      // Click on the bill
      await tenantPage
        .getByText(/৳21,395/)
        .first()
        .click();
      await expect(tenantPage).toHaveURL(/\/t\/bills\/[a-f0-9-]+$/);

      // Verify tenant sees the exact breakdown: "1,240 → 1,395 = 155 units × ৳9.00"
      await expect(tenantPage.getByText('1,240 → 1,395 = 155 units × ৳9.00')).toBeVisible();
      await expect(tenantPage.getByText('Rent').first()).toBeVisible();
      await expect(tenantPage.getByText('৳20,000').first()).toBeVisible();
      await expect(tenantPage.getByText('Electricity').first()).toBeVisible();
      await expect(tenantPage.getByText('৳1,395').first()).toBeVisible();
      await expect(tenantPage.getByText('Total').first()).toBeVisible();
      await expect(tenantPage.getByText('Balance due').first()).toBeVisible();
    } finally {
      await tenantContext.close();
    }
  });
});
