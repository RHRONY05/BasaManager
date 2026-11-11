import { test, expect, type Page } from '@playwright/test';
import { ROUTE_PATHS } from '../../apps/web/src/lib/router/preload';
import {
  GOOD_PASSWORD,
  clearRateLimits,
  createVerifiedLandlord,
  insertInvite,
  uiLogin,
  uniqueEmail,
} from '../helpers/e2e-auth';

/** Signs a fresh user of `role` in (the role pages are behind real auth since V5). A new org per call. */
async function signInAs(page: Page, role: 'landlord' | 'caretaker' | 'tenant'): Promise<void> {
  await clearRateLimits();
  const landlord = await createVerifiedLandlord();
  if (role === 'landlord') {
    await uiLogin(page, landlord.email, landlord.password, /\/l$/);
    return;
  }
  const token = await insertInvite(landlord.email, uniqueEmail(role), role);
  await page.goto(`/invite/${token}`);
  await page.getByLabel('Your full name').fill('Karim Mia');
  await page.getByLabel('Password', { exact: true }).fill(GOOD_PASSWORD);
  await page.getByRole('button', { name: 'Accept and join' }).click();
  await expect(page).toHaveURL(role === 'caretaker' ? /\/c$/ : /\/t$/);
}

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
  /**
   * Slow API: from the shell at `start`, every nav link changes the URL and shows skeleton or content within
   * 300 ms, then the page renders with CLS < 0.05.
   */
  async function expectInstantNavigation(page: Page, start: string, links: { href: string; name: string }[]) {
    await page.goto(start);
    await page.locator('h1').waitFor({ state: 'visible' });

    // Delay API responses by 2s
    await page.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    for (const item of links) {
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
  }

  const LANDLORD_LINKS = [
    { href: '/l/buildings', name: 'Buildings' },
    { href: '/l/billing', name: 'Billing' },
    { href: '/l/payments', name: 'Payments' },
    { href: '/l/maintenance', name: 'Maintenance' },
  ];
  const LANDLORD_EXTRA_LINKS = [
    { href: '/l/team', name: 'Team' },
    { href: '/l/settings', name: 'Organisation Settings' },
  ];
  const LANDLORD_PAGE_LINKS = [
    { href: '/l/tenants', name: 'Tenants & Leases' },
    { href: '/l/leases/new', name: 'Create Lease' },
  ];
  const CARETAKER_LINKS = [
    { href: '/c/billing', name: 'Billing' },
    { href: '/c/payments', name: 'Payments' },
    { href: '/c/maintenance', name: 'Maintenance' },
    { href: '/c/notices', name: 'Notices' },
  ];
  const TENANT_LINKS = [
    { href: '/t/bills', name: 'Bills' },
    { href: '/t/requests', name: 'Requests' },
    { href: '/t/notices', name: 'Notices' },
    { href: '/t/account', name: 'Account' },
  ];
  const TENANT_EXTRA_LINKS = [{ href: '/t/lease', name: 'Lease' }];

  test('every routed role page is reached by a nav link checked below', () => {
    const covered = new Set([
      '/l',
      '/c',
      '/t',
      ...[
        ...LANDLORD_LINKS,
        ...LANDLORD_EXTRA_LINKS,
        ...LANDLORD_PAGE_LINKS,
        ...CARETAKER_LINKS,
        ...TENANT_LINKS,
        ...TENANT_EXTRA_LINKS,
      ].map((l) => l.href),
    ]);
    const roleRoutes = ROUTE_PATHS.filter((p) => /^\/(l|c|t)(\/|$)/.test(p) && !p.includes(':'));
    expect(roleRoutes.filter((p) => !covered.has(p))).toEqual([]);
  });

  test('check 1: slow API - landlord navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }, testInfo) => {
    await signInAs(page, 'landlord');
    const links =
      testInfo.project.name === 'mobile' ? LANDLORD_LINKS : [...LANDLORD_LINKS, ...LANDLORD_EXTRA_LINKS];
    await expectInstantNavigation(page, '/l', links);
  });

  test('check 1b: slow API - tenant navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }) => {
    await signInAs(page, 'tenant');
    await expectInstantNavigation(page, '/t', TENANT_LINKS);
  });

  test('check 1c: slow API - caretaker navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }) => {
    await signInAs(page, 'caretaker');
    await expectInstantNavigation(page, '/c', CARETAKER_LINKS);
  });

  test('check 2: slow chunks - shell stays, skeleton and progress bar visible', async ({ page }) => {
    await signInAs(page, 'landlord');
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
    await signInAs(page, 'landlord');
    await page.goto('/l');
    await page.locator('h1').waitFor({ state: 'visible' });

    // Wait for initial buildings query to arrive
    await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible();

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
    await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible({ timeout: 300 });
  });

  test('check 4: main query 500 shows error card with Retry; Retry after unblocking shows content', async ({
    page,
  }) => {
    await signInAs(page, 'landlord');
    let shouldFail = true;
    let requestCount = 0;

    await page.route('**/api/buildings', async (route) => {
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
            data: [],
          }),
        });
      }
    });

    await page.goto('/l');

    // Error card and Retry button should appear after 2 retries (wait up to 10000 ms)
    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible({ timeout: 10000 });

    // Assert that /api/buildings was requested 3 times (1 initial + 2 retries) before error card showed
    expect(requestCount).toBeGreaterThanOrEqual(3);

    // Unblock API
    shouldFail = false;

    // Click Retry
    await retryBtn.click();

    // Content appears on success within 3000 ms
    await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible({ timeout: 3000 });
  });

  test('check 1d: slow API - lease detail navigation updates URL and renders within 300ms, CLS < 0.05', async ({
    page,
  }) => {
    await signInAs(page, 'landlord');
    const meRes = await page.request.get('/api/me');
    const meData = await meRes.json();
    const orgId = meData.data?.memberships?.[0]?.orgId;
    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) => c.name === 'bm_csrf')?.value ?? '';
    const origin = new URL(page.url()).origin;

    const bldRes = await page.request.post('/api/buildings', {
      data: { name: 'State Tower', address: 'Banani, Dhaka', area: 'Banani', city: 'Dhaka' },
      headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId, Origin: origin },
    });
    const bldId = (await bldRes.json()).data.id;

    const unitRes = await page.request.post(`/api/buildings/${bldId}/units`, {
      data: {
        label: '1A',
        floor: 1,
        type: 'family_flat',
        defaultRentPoisha: 1500000,
        electricityMode: 'submeter',
      },
      headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId, Origin: origin },
    });
    const unitId = (await unitRes.json()).data.id;

    const leaseRes = await page.request.post('/api/leases', {
      data: {
        unitId,
        tenantEmail: uniqueEmail('state-tenant'),
        tenantName: 'State Tenant',
        startDate: '2026-01-01',
        monthlyRentPoisha: 1500000,
        depositPoisha: 3000000,
        householdSize: 2,
      },
      headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId, Origin: origin },
    });
    const leaseId = (await leaseRes.json()).data.id;

    // Navigate to /l/tenants where the lease link exists
    await page.goto('/l/tenants');
    await page.locator('h1').waitFor({ state: 'visible' });

    // Delay API responses by 2s
    await page.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await startClsObserver(page);
    const link = page.locator(`a[href="/l/leases/${leaseId}"]`).first();
    await expect(link).toBeVisible();

    const startNav = Date.now();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/l/leases/${leaseId}`), { timeout: 300 });
    expect(Date.now() - startNav).toBeLessThanOrEqual(400);

    const skeleton = page.locator('main [data-skeleton]');
    await expect(skeleton.first()).toBeVisible({ timeout: 300 });
    await expect(page.locator('h1')).toBeVisible({ timeout: 4000 });
    const cls = await getClsScore(page);
    expect(cls).toBeLessThan(0.05);
  });

  // enabled in V5 (first mutation)
  test.skip('check 5: mutation pending - button is disabled and shows progress', async () => {});

  // enabled in V6 (first filter)
  test.skip('check 6: filters - old results stay visible dimmed with aria-busy', async () => {});

  test('check 7: pay result page renders without layout shift', async ({ page }) => {
    await signInAs(page, 'tenant');
    await startClsObserver(page);
    await page.goto('/pay/result?tran=BM-TEST-123456');
    await expect(page.getByText('Transaction ID')).toBeVisible();
    const cls = await getClsScore(page);
    expect(cls).toBeLessThan(0.05);
  });
});
