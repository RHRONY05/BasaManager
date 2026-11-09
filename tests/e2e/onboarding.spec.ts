import { test, expect } from '@playwright/test';
import { clearRateLimits, createVerifiedLandlord, uiLogin } from '../helpers/e2e-auth';

test.beforeEach(async () => {
  await clearRateLimits();
});

test.describe('Landlord onboarding (V6)', () => {
  test('first-run onboarding checklist -> add building with map pin -> units with charges -> billing settings', async ({
    page,
  }) => {
    // 1. Create a fresh verified landlord
    const landlord = await createVerifiedLandlord();
    await uiLogin(page, landlord.email, landlord.password);

    // 2. First-run onboarding checklist should appear on /l because 0 buildings exist
    await expect(page).toHaveURL(/\/l$/);
    await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible();
    await expect(page.getByText(/Add your first building/i)).toBeVisible();

    // 3. Click "Add building" directly from onboarding action
    await page
      .getByRole('button', { name: /Add building/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Add building/i })).toBeVisible();

    // Fill building form with map pin and billing settings
    await page.getByLabel(/Building name/i).fill('Shapla Tower');
    await page.getByLabel(/^Address/i).fill('Road 7, Dhanmondi, Dhaka');
    await page.getByLabel(/Bill creation day/i).fill('1');
    await page.getByLabel(/Payment due day/i).fill('10');
    await page.getByLabel(/Grace period/i).fill('5');
    await page.getByLabel(/Late fee type/i).selectOption('flat');
    await page.getByLabel(/Late fee value/i).fill('200');

    // Submit dialog
    await page.locator('.dialog button[type="submit"]').click();

    // Card should now be visible
    await expect(page.getByText('Shapla Tower')).toBeVisible();

    // 4. Navigate into Building Detail
    await page
      .getByRole('link', { name: /Shapla Tower/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/l\/buildings\/[a-f0-9-]+$/);

    // 5. Add Unit with recurring charges
    await page
      .getByRole('button', { name: /Add unit/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Add unit/i })).toBeVisible();

    await page.getByLabel(/Unit label/i).fill('3B');
    await page.getByLabel(/Floor/i).fill('3');
    await page.getByLabel(/Default monthly rent/i).fill('30000');
    await page.locator('.dialog button[type="submit"]').click();

    // Unit row should be visible in table
    await expect(page.getByRole('cell', { name: '3B' })).toBeVisible();
    await expect(page.getByText(/30,000/i)).toBeVisible();

    // 6. Check Map tab
    await page.getByRole('tab', { name: /^Map$/i }).click();
    await expect(page.getByRole('button', { name: /Edit location/i })).toBeVisible();
    await expect(page.getByText('OpenStreetMap')).toBeVisible();

    // 7. Check Dashboard returns out of zero-state
    await page.goto('/l');
    await expect(page.getByText('Shapla Tower')).toBeVisible();
    await expect(page.getByText('0 of 1 occupied')).toBeVisible();
  });
});
