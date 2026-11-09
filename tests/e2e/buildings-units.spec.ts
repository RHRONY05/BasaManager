import { test, expect } from '@playwright/test';
import { clearRateLimits, createVerifiedLandlord, uiLogin, uniqueEmail } from '../helpers/e2e-auth';

test.beforeEach(async () => {
  await clearRateLimits();
});

test.describe('Buildings, Units and Team management (V6)', () => {
  test('landlord onboarding -> add building -> add unit -> team invite', async ({ page }) => {
    // 1. Create a fresh verified landlord
    const landlord = await createVerifiedLandlord();
    await uiLogin(page, landlord.email, landlord.password);

    // 2. First-run onboarding checklist should appear on /l because 0 buildings exist
    await expect(page).toHaveURL(/\/l$/);
    await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible();
    await expect(page.getByText(/Add your first building/i)).toBeVisible();

    // 3. Navigate to Buildings page via nav link
    await page.locator('a[href="/l/buildings"]').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/l\/buildings/);

    // Empty state should be visible
    await expect(page.getByText(/No buildings added yet/i)).toBeVisible();

    // 4. Open Add Building dialog
    await page
      .getByRole('button', { name: /Add building/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Add building/i })).toBeVisible();

    // Fill form
    await page.getByLabel(/Building name/i).fill('Green Villa');
    await page.getByLabel(/^Address/i).fill('Road 12, Banani, Dhaka');
    await page.getByLabel(/Bill creation day/i).fill('5');
    await page.getByLabel(/Payment due day/i).fill('10');
    await page.getByLabel(/Grace period/i).fill('3');
    await page.getByLabel(/Late fee type/i).selectOption('flat');
    await page.getByLabel(/Late fee value/i).fill('500');

    // Submit dialog
    await page.locator('.dialog button[type="submit"]').click();

    // Card should now be visible on /l/buildings
    await expect(page.getByRole('heading', { name: 'Green Villa' })).toBeVisible();
    await expect(page.getByText(/Road 12, Banani, Dhaka/i)).toBeVisible();

    // 5. Navigate into Building Detail
    await page
      .getByRole('link', { name: /Green Villa/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/l\/buildings\/[a-f0-9-]+$/);

    // Check header and tabs
    await expect(page.getByRole('heading', { name: 'Green Villa' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Units/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Billing settings/i })).toBeVisible();

    // 6. Add a Unit
    await page
      .getByRole('button', { name: /Add unit/i })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Add unit/i })).toBeVisible();

    await page.getByLabel(/Unit label/i).fill('2A');
    await page.getByLabel(/Floor/i).fill('2');
    await page.getByLabel(/Default monthly rent/i).fill('25000');

    // Submit unit (water/gas/service charges are populated by default)
    await page.locator('.dialog button[type="submit"]').click();

    // Unit row should be visible in table
    await expect(page.getByRole('cell', { name: '2A' })).toBeVisible();
    await expect(page.getByText(/25,000/i)).toBeVisible();

    // 7. Click unit to open Unit Drawer
    await page.getByRole('cell', { name: '2A' }).click();
    await expect(page.getByRole('heading', { name: /Unit 2A/i })).toBeVisible();
    await expect(page.locator('input[value="Water"]')).toBeVisible();

    // Close drawer
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: /Unit 2A/i })).not.toBeVisible();

    // 8. Check Billing Settings tab
    await page.getByRole('tab', { name: /Billing settings/i }).click();
    await expect(page.getByLabel(/Bill creation day/i)).toHaveValue('5');
    await expect(page.getByLabel(/Payment due day/i)).toHaveValue('10');

    // Update grace period
    await page.getByLabel(/Grace period/i).fill('5');
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByText(/Billing settings updated successfully/i)).toBeVisible();

    // 9. Navigate to Team page
    await page.goto('/l/team');
    await expect(page).toHaveURL(/\/l\/team/);
    await expect(page.getByRole('heading', { name: /Caretakers/i })).toBeVisible();

    // 10. Invite Caretaker
    await page.getByRole('button', { name: /Invite caretaker/i }).click();
    await expect(page.getByRole('heading', { name: /Invite a caretaker/i })).toBeVisible();

    const caretakerEmail = uniqueEmail('caretaker');
    await page.getByLabel(/Caretaker email/i).fill(caretakerEmail);

    // Select Green Villa building checkbox
    await page.getByRole('checkbox', { name: /Green Villa/i }).check();

    // Send invitation
    await page.locator('.dialog button[type="submit"]').click();

    // Pending invitation should now be visible
    await expect(page.getByText(caretakerEmail)).toBeVisible();
  });
});
