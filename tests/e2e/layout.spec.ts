import { test, expect } from '@playwright/test';
import { auditLayout } from '../helpers/layout-audit';
import { ROUTE_PATHS } from '../../apps/web/src/lib/router/preload';

/**
 * Every routed page, taken from the one list the router is tested against (ROUTE_PATHS), so a new page
 * cannot be forgotten. Plus the 404 page, which is not a listed route.
 */
const ROUTES = [...ROUTE_PATHS, '/does-not-exist'].map((path) => ({ path, name: path }));

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
                  JSON.stringify(violations, null, 2),
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
