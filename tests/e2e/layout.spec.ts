import { test, expect, type Page } from '@playwright/test';
import { auditLayout } from '../helpers/layout-audit';
import { ROUTE_PATHS } from '../../apps/web/src/lib/router/preload';
import { STRESS_BUILDING, STRESS_IDS, STRESS_NAMES } from '../fixtures/stress';
import {
  GOOD_PASSWORD,
  clearRateLimits,
  createVerifiedLandlord,
  insertInvite,
  uiLogin,
  uniqueEmail,
} from '../helpers/e2e-auth';

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

/**
 * Auth pages in their stress states (V5): long names, an unbroken 40-character email local part, the
 * Bangla name, visible validation errors, the server error banner and the success cards. The empty
 * pages are already audited above through ROUTE_PATHS; these are the states that overflow in practice.
 */
const AUTH_WIDTHS = [320, 360, 390, 414, 768];
const LONG_EMAIL = `${STRESS_IDS.unbroken40Char.toLowerCase()}@e2e.test`;

interface AuthScenario {
  name: string;
  /** Puts the page into the state to audit. `lng` is already in the URL where the page reads it. */
  setup: (page: Page, lngQuery: string) => Promise<void>;
}

const submit = (page: Page) => page.locator('main button[type="submit"]').first();

let stressInviteToken = '';
let stressLandlord: { email: string; password: string } | null = null;

const AUTH_SCENARIOS: AuthScenario[] = [
  {
    name: 'login with server error banner',
    setup: async (page, q) => {
      await page.goto(`/login${q}`);
      await page.locator('#email').fill(LONG_EMAIL);
      await page.locator('#password').fill('Wrong-Password-123');
      await submit(page).click();
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    name: 'login with validation errors',
    setup: async (page, q) => {
      await page.goto(`/login${q}`);
      await submit(page).click();
      await page.locator('#email-error').waitFor();
    },
  },
  {
    name: 'signup with stress values and validation errors',
    setup: async (page, q) => {
      await page.goto(`/signup${q}`);
      await page.locator('#fullName').fill(STRESS_NAMES[1]);
      await page.locator('#email').fill(LONG_EMAIL);
      await page.locator('#password').fill('short');
      await page.locator('#orgName').fill(STRESS_BUILDING);
      await submit(page).click();
      await page.locator('#password-error').waitFor();
    },
  },
  {
    name: 'signup check-your-email card with long address',
    setup: async (page, q) => {
      await page.goto(`/signup${q}`);
      await page.locator('#fullName').fill(STRESS_NAMES[0]);
      await page.locator('#email').fill(uniqueEmail(STRESS_IDS.unbroken40Char.toLowerCase()));
      await page.locator('#password').fill(GOOD_PASSWORD);
      await page.locator('#orgName').fill(STRESS_BUILDING);
      await submit(page).click();
      await page.getByRole('heading').first().waitFor();
      await page.locator('main button[type="button"]').first().waitFor();
    },
  },
  {
    name: 'forgot password sent card',
    setup: async (page, q) => {
      await page.goto(`/forgot-password${q}`);
      await page.locator('#email').fill(LONG_EMAIL);
      await submit(page).click();
      await page.locator('main a[href="/login"]').waitFor();
    },
  },
  {
    name: 'forgot password validation error',
    setup: async (page, q) => {
      await page.goto(`/forgot-password${q}`);
      await submit(page).click();
      await page.locator('#email-error').waitFor();
    },
  },
  {
    name: 'reset password with expired link banner',
    setup: async (page, q) => {
      const sep = q ? '&' : '?';
      await page.goto(`/reset-password${q}${sep}token=not-a-real-token`);
      await page.locator('#password').fill(`${STRESS_IDS.unbroken40Char}-Aa1`);
      await submit(page).click();
      await page.getByRole('alert').first().waitFor();
    },
  },
  {
    name: 'reset password validation error',
    setup: async (page, q) => {
      const sep = q ? '&' : '?';
      await page.goto(`/reset-password${q}${sep}token=not-a-real-token`);
      await page.locator('#password').fill('short');
      await submit(page).click();
      await page.locator('#password-error').waitFor();
    },
  },
  {
    name: 'invite with stress organisation name',
    setup: async (page, q) => {
      await page.goto(`/invite/${stressInviteToken}${q}`);
      await page.locator('#fullName').fill(STRESS_NAMES[2]);
      await page.locator('#password').fill('short');
      await submit(page).click();
      await page.locator('#password-error').waitFor();
    },
  },
  {
    name: 'invite with unknown token',
    setup: async (page, q) => {
      await page.goto(`/invite/unknown-token${q}`);
      await page.getByRole('alert').waitFor();
    },
  },
  {
    name: 'account page with stress profile',
    setup: async (page, q) => {
      await uiLogin(page, stressLandlord!.email, stressLandlord!.password);
      await page.goto(`/account${q}`);
      await page.locator('#sessions').waitFor();
      await page.locator('#currentPassword').fill('x');
      await page.locator('#newPassword').fill('short');
      await page.locator('#password button[type="submit"]').click();
      await page.locator('#new-password-error').waitFor();
    },
  },
];

test.describe('Auth pages layout (stress states)', () => {
  test.beforeAll(async () => {
    const landlord = await createVerifiedLandlord({
      fullName: STRESS_NAMES[0],
      email: uniqueEmail(STRESS_IDS.unbroken40Char.toLowerCase()),
      orgName: STRESS_BUILDING,
    });
    stressLandlord = landlord;
    stressInviteToken = await insertInvite(landlord.email, uniqueEmail('invitee'), 'caretaker');
  });

  test.beforeEach(async () => {
    await clearRateLimits();
  });

  for (const scenario of AUTH_SCENARIOS) {
    for (const colorScheme of COLOR_SCHEMES) {
      for (const lng of LOCALES) {
        test(`${scenario.name} ${colorScheme} lng=${lng}`, async ({ page }) => {
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width: AUTH_WIDTHS[0]!, height: 844 });
          await scenario.setup(page, lng === 'en-XA' ? '?lng=en-XA' : '');

          for (const width of AUTH_WIDTHS) {
            await page.setViewportSize({ width, height: 844 });
            const violations = await auditLayout(page);
            if (violations.length > 0) {
              console.error(
                `Layout violations in "${scenario.name}" (${width}px, ${colorScheme}, ${lng}):`,
                JSON.stringify(violations, null, 2),
              );
            }
            expect(violations, `${scenario.name} at ${width}px`).toEqual([]);
          }
        });
      }
    }
  }
});
