import { test, expect } from '@playwright/test';

test.describe('Home & 404 specs', () => {
  test('/ loads with h1, public config returns 200, and no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      // A signed-out visit legitimately probes /auth/me and /auth/refresh and gets 401; the browser logs those.
      // Anything else (JS errors, 5xx, other 4xx) still fails the test.
      if (msg.type() === 'error' && !/status of 401 \(Unauthorized\)/.test(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    const publicConfigPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/public-config') && resp.status() === 200,
    );

    await page.goto('/');
    await publicConfigPromise;

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    await expect(h1).not.toBeEmpty();

    expect(consoleErrors).toEqual([]);
  });

  test('/does-not-exist shows 404 page with a working link home', async ({ page }) => {
    await page.goto('/does-not-exist');

    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();

    const homeLink = page.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();

    await homeLink.click();
    await expect(page).toHaveURL('/');
  });
});
