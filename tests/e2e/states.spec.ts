import { test, expect, type Page } from '@playwright/test';

async function startClsObserver(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __clsScore: number }).__clsScore = 0;
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!(entry as unknown as { hadRecentInput: boolean }).hadRecentInput) {
          (window as unknown as { __clsScore: number }).__clsScore += (
            entry as unknown as { value: number }
          ).value;
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    (window as unknown as { __clsObserver: PerformanceObserver }).__clsObserver = observer;
  });
}

async function getClsScore(page: Page): Promise<number> {
  return page.evaluate(() => {
    const score = (window as unknown as { __clsScore?: number }).__clsScore ?? 0;
    const observer = (window as unknown as { __clsObserver?: PerformanceObserver }).__clsObserver;
    if (observer) {
      observer.disconnect();
    }
    return score;
  });
}

test.describe('UI States Specs', () => {
  test('check 1: slow API - landlord navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }) => {
    await page.goto('/l');
    await page.locator('h1').waitFor({ state: 'visible' });

    // Delay API responses by 2s
    await page.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    const landlordLinks = [
      { href: '/l/buildings', name: 'Buildings' },
      { href: '/l/billing', name: 'Billing' },
      { href: '/l/payments', name: 'Payments' },
      { href: '/l/maintenance', name: 'Maintenance' },
    ];

    for (const item of landlordLinks) {
      await startClsObserver(page);
      const link = page.locator(`a[href="${item.href}"]`).filter({ visible: true }).first();
      await expect(link).toBeVisible();

      const startTime = Date.now();
      await link.click();

      // Within 300ms URL and active nav changed and main has [data-skeleton] or content
      await expect(page).toHaveURL(new RegExp(item.href), { timeout: 300 });
      expect(Date.now() - startTime).toBeLessThanOrEqual(400);

      const mainContent = page.locator('main [data-skeleton], main .rounded-lg');
      await expect(mainContent.first()).toBeVisible({ timeout: 300 });

      // Wait for content to render and check layout shift
      await expect(page.locator('h1')).toHaveText(new RegExp(item.name, 'i'), { timeout: 3000 });
      const cls = await getClsScore(page);
      expect(cls).toBeLessThan(0.05);
    }
  });

  test('check 1b: slow API - tenant navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }) => {
    await page.goto('/t');
    await page.locator('h1').waitFor({ state: 'visible' });

    // Delay API responses by 2s
    await page.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    const tenantLinks = [
      { href: '/t/bills', name: 'Bills' },
      { href: '/t/requests', name: 'Requests' },
      { href: '/t/notices', name: 'Notices' },
      { href: '/t/account', name: 'Account' },
    ];

    for (const item of tenantLinks) {
      await startClsObserver(page);
      const link = page.locator(`a[href="${item.href}"]`).filter({ visible: true }).first();
      await expect(link).toBeVisible();

      const startTime = Date.now();
      await link.click();

      await expect(page).toHaveURL(new RegExp(item.href), { timeout: 300 });
      expect(Date.now() - startTime).toBeLessThanOrEqual(400);

      const mainContent = page.locator('main [data-skeleton], main .rounded-lg');
      await expect(mainContent.first()).toBeVisible({ timeout: 300 });

      await expect(page.locator('h1')).toBeVisible({ timeout: 3000 });
      const cls = await getClsScore(page);
      expect(cls).toBeLessThan(0.05);
    }
  });

  test('check 2: slow chunks - shell stays, skeleton and progress bar visible', async ({
    page,
  }) => {
    // Delay JS chunk downloads BEFORE initial navigation so idle-preloads are in flight
    await page.route('**/assets/*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.goto('/l');

    // Wait for the shell to render (nav link to /l/buildings visible)
    const buildingsLink = page.locator('a[href="/l/buildings"]').filter({ visible: true }).first();
    await expect(buildingsLink).toBeVisible();

    // Click immediately while chunks are delayed
    await buildingsLink.click();

    // Assert: shell (nav) still visible
    await expect(buildingsLink).toBeVisible();

    // Top progress bar appears when navigation takes > 150ms
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeVisible({ timeout: 1000 });

    // Skeleton is visible inside layout
    const skeleton = page.locator('main [data-skeleton]');
    await expect(skeleton.first()).toBeVisible();

    // Eventually completes and renders new page within 6000 ms
    await expect(page.locator('h1')).toHaveText(/Buildings/i, { timeout: 6000 });
  });

  test('check 3: cached back navigation is instant with the API delayed', async ({ page }) => {
    await page.goto('/l');
    await page.locator('h1').waitFor({ state: 'visible' });

    // Wait for initial public-config to arrive
    await expect(page.locator('text=Environment:')).toBeVisible();

    // Navigate to Buildings client-side by clicking the in-app nav link
    const buildingsLink = page.locator('a[href="/l/buildings"]').filter({ visible: true }).first();
    await buildingsLink.click();
    await expect(page.locator('h1')).toHaveText(/Buildings/i);

    // Now delay all API requests by 2s
    await page.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    // Navigate back to /l using browser back button
    await page.goBack();

    // Cached content is displayed immediately within 300 ms without waiting for API
    await expect(page.locator('text=Environment:')).toBeVisible({ timeout: 300 });
  });

  test('check 4: main query 500 shows error card with Retry; Retry after unblocking shows content', async ({
    page,
  }) => {
    let shouldFail = true;
    let requestCount = 0;

    await page.route('**/api/public-config', async (route) => {
      requestCount++;
      if (shouldFail) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'INTERNAL',
              message: 'Database connection failed',
              requestId: 'req-err-500',
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              appEnv: 'dev',
              sentryDsn: null,
              vapidPublicKey: null,
            },
          }),
        });
      }
    });

    await page.goto('/l');

    // Error card and Retry button should appear after 2 retries (wait up to 10000 ms)
    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible({ timeout: 10000 });

    // Assert that /api/public-config was requested 3 times (1 initial + 2 retries) before error card showed
    expect(requestCount).toBeGreaterThanOrEqual(3);

    // Unblock API
    shouldFail = false;

    // Click Retry
    await retryBtn.click();

    // Content appears on success within 3000 ms
    await expect(page.locator('text=Environment:')).toBeVisible({ timeout: 3000 });
  });

  // enabled in V5 (first mutation)
  test.skip('check 5: mutation pending - button is disabled and shows progress', async () => {});

  // enabled in V6 (first filter)
  test.skip('check 6: filters - old results stay visible dimmed with aria-busy', async () => {});
});
