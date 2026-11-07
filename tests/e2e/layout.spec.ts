import { test, expect } from '@playwright/test';
import { auditLayout } from '../helpers/layout-audit';

/**
 * Table of routes to audit. Later tasks append their new routes and roles here.
 */
const ROUTES = [
  { path: '/', name: 'Landing' },
  { path: '/login', name: 'Login' },
  { path: '/signup', name: 'Signup' },
  { path: '/l', name: 'Landlord Dashboard' },
  { path: '/t', name: 'Tenant Home' },
  { path: '/a', name: 'Admin' },
  { path: '/account', name: 'Account' },
  { path: '/does-not-exist', name: 'Not Found' },
];

const WIDTHS = [320, 360, 390, 414, 768, 1440];
const COLOR_SCHEMES = ['light', 'dark'] as const;
const LOCALES = ['en', 'en-XA'] as const;

test.describe('Layout Audit Specs', () => {
  for (const route of ROUTES) {
    test.describe(route.name, () => {
      for (const width of WIDTHS) {
        for (const colorScheme of COLOR_SCHEMES) {
          for (const lng of LOCALES) {
            test(`audit ${width}px ${colorScheme} lng=${lng}`, async ({ page }) => {
              await page.emulateMedia({ colorScheme });
              await page.setViewportSize({ width, height: 844 });

              const targetUrl = lng === 'en-XA' ? `${route.path}?lng=en-XA` : route.path;
              await page.goto(targetUrl);
              await page.locator('h1').waitFor({ state: 'visible' });

              const violations = await auditLayout(page);
              if (violations.length > 0) {
                console.error(
                  `Layout violations on ${route.path} (${width}px, ${colorScheme}, ${lng}):`,
                  JSON.stringify(violations, null, 2)
                );
              }
              expect(violations).toEqual([]);
            });
          }
        }
      }
    });
  }
});
