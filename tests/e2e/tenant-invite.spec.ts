import { test, expect } from '@playwright/test';
import {
  clearRateLimits,
  createVerifiedLandlord,
  uiLogin,
  uniqueEmail,
  waitForMail,
  tokenFromMail,
  GOOD_PASSWORD,
} from '../helpers/e2e-auth';

test.beforeEach(async () => {
  await clearRateLimits();
});

test.describe('Tenant Invite & Lease Lifecycle (V7)', () => {
  test('landlord creates lease -> tenant accepts invite -> view lease -> record deposit', async ({
    page,
    browser,
  }) => {
    // 1. Create and login verified landlord
    const landlord = await createVerifiedLandlord();
    await uiLogin(page, landlord.email, landlord.password);

    // 2. Add building and unit via UI
    await page.goto('/l/buildings');
    await page
      .getByRole('button', { name: /Add building/i })
      .first()
      .click();
    await page.getByLabel(/Building name/i).fill('Padma Tower');
    await page.getByLabel(/^Address/i).fill('Gulshan 2, Dhaka');
    await page.locator('.dialog button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: 'Padma Tower' })).toBeVisible();

    // Navigate to building detail
    await page
      .getByRole('link', { name: /Padma Tower/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/l\/buildings\/[a-f0-9-]+$/);

    // Add unit 3B
    await page
      .getByRole('button', { name: /Add unit/i })
      .first()
      .click();
    await page.getByLabel(/Unit label/i).fill('3B');
    await page.getByLabel(/Floor/i).fill('3');
    await page.getByLabel(/Default monthly rent/i).fill('20000');
    await page.locator('.dialog button[type="submit"]').click();
    await expect(page.getByRole('cell', { name: '3B' })).toBeVisible();

    // 3. Open Unit Drawer for 3B and start Lease Stepper
    await page.getByRole('cell', { name: '3B' }).click();
    await expect(page.getByRole('heading', { name: /Unit 3B/i })).toBeVisible();

    // Click "Create lease" inside the Unit Drawer
    await page
      .locator('.drawer')
      .getByRole('button', { name: /Create lease/i })
      .click();
    await expect(page.getByRole('heading', { name: /Create Lease & Invite Tenant/i })).toBeVisible();

    // Step 1: Tenant & Unit
    const tenantEmail = uniqueEmail('tenant');
    await page.getByLabel(/Tenant full name/i).fill('Karim Ahmed');
    await page.getByLabel(/Tenant email/i).fill(tenantEmail);
    await page.getByLabel(/Household size/i).fill('3');
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 2: Rent & Deposit
    await expect(page.getByLabel(/Lease start date/i)).toBeVisible();
    await page.getByLabel(/Monthly rent/i).fill('20000');
    await page.getByLabel(/Security deposit/i).fill('40000');
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 3: Fixed Charges
    await expect(page.getByText(/Monthly recurring charges/i)).toBeVisible();
    await page.getByRole('button', { name: /Next/i }).click();

    // Step 4: Review & Submit
    await expect(page.getByText(/Lease summary/i)).toBeVisible();
    await expect(page.getByText(/Karim Ahmed/i)).toBeVisible();
    await expect(page.getByText(/৳40,000/i).first()).toBeVisible();

    await page.locator('.dialog button[type="submit"]').click({ noWaitAfter: true });

    // Drawer should close
    await expect(page.locator('.dialog')).not.toBeVisible();

    // 4. Extract invite token from Mailpit
    const mailBody = await waitForMail(tenantEmail, /invit/i);
    const inviteToken = tokenFromMail(mailBody, '/invite');
    expect(inviteToken).toBeTruthy();

    // 5. Verify refusal of second lease on same unit via API (Conflict 409)
    const meRes = await page.request.get('/api/me');
    expect(meRes.status()).toBe(200);
    const meData = await meRes.json();
    const orgId = meData.data?.memberships?.[0]?.orgId ?? '';
    expect(orgId).toBeTruthy();

    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === 'bm_csrf');
    const csrf = csrfCookie?.value ?? '';

    // Get units to find 3B's ID
    const bldUrl = page.url();
    const bldId = bldUrl.split('/').pop()!;
    const unitsRes = await page.request.get(`/api/buildings/${bldId}/units`, {
      headers: { 'X-Org-Id': orgId },
    });
    expect(unitsRes.status()).toBe(200);
    const unitsData = (await unitsRes.json()).data;
    const unit3B = unitsData.find((u: { label: string }) => u.label === '3B');
    expect(unit3B).toBeTruthy();

    // Attempt second lease creation on 3B
    const origin = new URL(page.url()).origin;
    const secondLeaseRes = await page.request.post('/api/leases', {
      data: {
        unitId: unit3B.id,
        tenantEmail: uniqueEmail('second'),
        tenantName: 'Second Tenant',
        startDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date()),
        monthlyRentPoisha: 2000000,
        depositPoisha: 4000000,
        householdSize: 1,
      },
      headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId, Origin: origin },
    });
    expect(secondLeaseRes.status()).toBe(409);

    // 6. Tenant accepts invitation in a fresh incognito browser context
    const tenantContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();

    try {
      await tenantPage.goto(`/invite/${inviteToken}`);
      await expect(tenantPage.getByRole('heading', { name: /Join/i })).toBeVisible();

      // Fill in name and password
      await tenantPage.getByLabel('Your full name').fill('Karim Ahmed');
      await tenantPage.getByLabel('Password', { exact: true }).fill(GOOD_PASSWORD);
      await tenantPage.getByRole('button', { name: 'Accept and join' }).click();

      // Tenant should be redirected to tenant home (/t)
      await expect(tenantPage).toHaveURL(/\/t$/);
      await expect(tenantPage.getByText(/Unit 3B/i)).toBeVisible();

      // Visit /t/lease
      await tenantPage.goto('/t/lease');
      await expect(tenantPage.getByRole('heading', { name: /Unit 3B/i })).toBeVisible();
      await expect(tenantPage.getByText(/৳20,000/i).first()).toBeVisible();
      await expect(tenantPage.getByText(/3 residents/i)).toBeVisible();
    } finally {
      await tenantContext.close();
    }

    // 7. Landlord checks lease detail and records deposit
    // Open Unit Drawer for 3B
    await page.getByRole('cell', { name: '3B' }).click();
    await expect(page.getByRole('heading', { name: /Unit 3B/i })).toBeVisible();

    // Click "View lease details"
    await page
      .locator('.drawer')
      .getByRole('link', { name: /View lease details/i })
      .click();
    await expect(page).toHaveURL(/\/l\/leases\/[a-f0-9-]+$/);

    // Lease Detail page
    await expect(page.getByRole('heading', { name: /Unit 3B/i })).toBeVisible();
    await expect(page.getByText(/Karim Ahmed/i).first()).toBeVisible();

    // Record Deposit
    await page.getByRole('button', { name: /Record deposit/i }).click();
    await expect(page.getByRole('heading', { name: /Record deposit payment/i })).toBeVisible();

    await page.getByLabel(/Amount received/i).fill('40000');
    await page.getByLabel(/Note/i).fill('Received cash advance at signing');
    await page.locator('.dialog button[type="submit"]').click({ noWaitAfter: true });

    // Deposit held card should update
    await expect(page.getByText(/৳40,000/i).first()).toBeVisible();
  });
});
