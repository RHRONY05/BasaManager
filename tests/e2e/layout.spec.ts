import { test, expect, type Page } from '@playwright/test';
import { auditLayout } from '../helpers/layout-audit';
import { ROUTE_PATHS } from '../../apps/web/src/lib/router/preload';
import { STRESS_BUILDING, STRESS_IDS, STRESS_NAMES } from '../fixtures/stress';
import {
  GOOD_PASSWORD,
  apiContext,
  clearRateLimits,
  createVerifiedLandlord,
  csrfOf,
  insertInvite,
  uiLogin,
  uniqueEmail,
  waitForMail,
  tokenFromMail,
  withOwnerDb,
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

test.describe('V7 Lease & tenant pages layout (stress states)', () => {
  let llUser: { email: string; password: string };
  let tenantUser: { email: string; password: string };
  let leaseId = '';
  let membershipId = '';
  let bldId = '';

  test.beforeAll(async () => {
    llUser = await createVerifiedLandlord({
      fullName: STRESS_NAMES[0],
      email: uniqueEmail('stress-landlord'),
      orgName: STRESS_BUILDING,
    });

    const ctx = await apiContext();
    try {
      const loginRes = await ctx.post('/api/auth/login', {
        data: { email: llUser.email, password: llUser.password },
      });
      expect(loginRes.status()).toBe(200);

      const csrf = await csrfOf(ctx);
      const meRes = await ctx.get('/api/me');
      const meData = await meRes.json();
      const orgId = meData.data?.memberships?.[0]?.orgId;
      expect(orgId).toBeTruthy();

      const bldRes = await ctx.post('/api/buildings', {
        data: {
          name: STRESS_BUILDING,
          address: 'Road 11, Block D, Banani, Dhaka',
          area: 'Banani',
          city: 'Dhaka',
        },
        headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId },
      });
      expect(bldRes.status()).toBe(201);
      bldId = (await bldRes.json()).data.id;

      const unitRes = await ctx.post(`/api/buildings/${bldId}/units`, {
        data: {
          label: '5A',
          floor: 5,
          type: 'family_flat',
          defaultRentPoisha: 2500000,
          electricityMode: 'submeter',
        },
        headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId },
      });
      expect(unitRes.status()).toBe(201);
      const unitId = (await unitRes.json()).data.id;

      const tenantEmail = uniqueEmail('stress-tenant');
      const leaseRes = await ctx.post('/api/leases', {
        data: {
          unitId,
          tenantEmail,
          tenantName: STRESS_NAMES[1],
          startDate: '2026-01-01',
          monthlyRentPoisha: 2500000,
          depositPoisha: 5000000,
          householdSize: 4,
          charges: [
            { name: 'Generator & Security', amountPoisha: 120000 },
            { name: 'Common Water & Cleaning', amountPoisha: 80000 },
          ],
        },
        headers: { 'X-CSRF-Token': csrf, 'X-Org-Id': orgId },
      });
      expect(leaseRes.status()).toBe(201);
      leaseId = (await leaseRes.json()).data.id;

      const mailBody = await waitForMail(tenantEmail, /invit/i);
      const inviteToken = tokenFromMail(mailBody, '/invite');
      const tenantCtx = await apiContext();
      try {
        const acceptRes = await tenantCtx.post(`/api/invites/${inviteToken}/accept`, {
          data: { fullName: STRESS_NAMES[1], password: GOOD_PASSWORD },
        });
        expect(acceptRes.status()).toBe(200);
      } finally {
        await tenantCtx.dispose();
      }
      tenantUser = { email: tenantEmail, password: GOOD_PASSWORD };

      const memRows = await withOwnerDb(async (db) => {
        const r = await db.query(
          `select m.id from memberships m join users u on u.id=m.user_id where u.email=$1 and m.org_id=$2`,
          [tenantEmail, orgId],
        );
        return r.rows as { id: string }[];
      });
      membershipId = memRows[0]!.id;
    } finally {
      await ctx.dispose();
    }
  });

  const LEASE_SCENARIOS = [
    {
      name: 'lease detail page with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, llUser.email, llUser.password);
        await page.goto(`/l/leases/${leaseId}${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'tenant history page with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, llUser.email, llUser.password);
        await page.goto(`/l/tenants/${membershipId}${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'tenant portal active lease with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, tenantUser.email, tenantUser.password, /\/t$/);
        await page.goto(`/t/lease${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'tenants directory list with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, llUser.email, llUser.password);
        await page.goto(`/l/tenants${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'create lease stepper dialog with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, llUser.email, llUser.password);
        await page.goto(`/l/leases/new${q}`);
        await page.locator('h2').waitFor();
      },
    },
  ];

  for (const scenario of LEASE_SCENARIOS) {
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

test.describe('V9 Payment pages layout (stress states)', () => {
  let llUser: { email: string; password: string };
  let ctUser: { email: string; password: string };
  let tUser: { email: string; password: string };
  let billId = '';

  test.beforeAll(async () => {
    llUser = await createVerifiedLandlord({
      fullName: STRESS_NAMES[0],
      email: uniqueEmail('stress-ll-pay'),
      orgName: STRESS_BUILDING,
    });

    const HASHED_PW =
      '$argon2id$v=19$m=65536,t=3,p=4$5NMHEWU/m9aFURYAdOKkag$dBbNwB8LsAt7SUHN8js2R92kmJlYU9/Zr+ffCXnXypY';

    const ctEmail = uniqueEmail('stress-ct-pay');
    const tEmail = uniqueEmail('stress-t-pay');

    let orgId = '';
    let bldId = '';
    let leaseId = '';

    await withOwnerDb(async (db) => {
      const {
        rows: [orgRow],
      } = await db.query(
        `select m.org_id, m.user_id from users u join memberships m on m.user_id = u.id where u.email = $1`,
        [llUser.email],
      );
      orgId = String(orgRow['org_id']);
      const landlordUserId = String(orgRow['user_id']);

      const {
        rows: [bld],
      } = await db.query(
        `insert into buildings (org_id, name, address, area, city)
         values ($1, $2, 'Road 11, Block D, Banani, Dhaka', 'Banani', 'Dhaka') returning id`,
        [orgId, STRESS_BUILDING],
      );
      bldId = bld.id;

      const {
        rows: [u],
      } = await db.query(
        `insert into units (org_id, building_id, label, floor, type, default_rent_poisha, electricity_mode)
         values ($1, $2, '4A', 4, 'family_flat', 2500000, 'submeter') returning id`,
        [orgId, bldId],
      );
      const unitId = u.id;

      const {
        rows: [ct],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, 'Kashem Caretaker', now()) returning id`,
        [ctEmail, HASHED_PW],
      );
      const {
        rows: [ctMem],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status)
         values ($1, $2, 'caretaker', 'active') returning id`,
        [orgId, ct.id],
      );
      await db.query(
        `insert into caretaker_buildings (org_id, membership_id, building_id)
         values ($1, $2, $3)`,
        [orgId, ctMem.id, bldId],
      );

      const {
        rows: [tenant],
      } = await db.query(
        `insert into users (email, password_hash, full_name, email_verified_at)
         values ($1, $2, $3, now()) returning id`,
        [tEmail, HASHED_PW, STRESS_NAMES[1]],
      );
      const {
        rows: [tMem],
      } = await db.query(
        `insert into memberships (org_id, user_id, role, status)
         values ($1, $2, 'tenant', 'active') returning id`,
        [orgId, tenant.id],
      );

      const {
        rows: [l],
      } = await db.query(
        `insert into leases (org_id, unit_id, start_date, monthly_rent_poisha, deposit_poisha, status, created_by)
         values ($1, $2, '2026-01-01', 2500000, 5000000, 'active', $3) returning id`,
        [orgId, unitId, landlordUserId],
      );
      leaseId = l.id;

      await db.query(`insert into lease_tenants (org_id, lease_id, membership_id) values ($1, $2, $3)`, [
        orgId,
        leaseId,
        tMem.id,
      ]);

      const {
        rows: [b],
      } = await db.query(
        `insert into bills (org_id, lease_id, period_month, due_date, status, total_poisha, paid_poisha)
         values ($1, $2, '2026-03-01', '2026-03-10', 'issued', 2500000, 0) returning id`,
        [orgId, leaseId],
      );
      billId = b.id;

      // Sample claim and confirmed payment
      const claimRef = `BKASH-CLAIM-${Date.now()}`;
      await db.query(
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, reference, submitted_by)
         values ($1, $2, 1000000, 'bkash', 'pending_claim', '2026-03-05', $3, $4)`,
        [orgId, leaseId, claimRef, tenant.id],
      );
      const cashRef = `Cash ref ${Date.now()}`;
      const {
        rows: [pay],
      } = await db.query(
        `insert into payments (org_id, lease_id, amount_poisha, method, status, paid_on, reference, submitted_by, confirmed_by, confirmed_at)
         values ($1, $2, 1500000, 'cash', 'confirmed', '2026-03-02', $3, $4, $4, now()) returning id`,
        [orgId, leaseId, cashRef, landlordUserId],
      );
      await db.query(
        `insert into receipts (org_id, payment_id, number, status)
         values ($1, $2, 'BM-2026-000001', 'valid')`,
        [orgId, pay.id],
      );
    });

    ctUser = { email: ctEmail, password: GOOD_PASSWORD };
    tUser = { email: tEmail, password: GOOD_PASSWORD };
  });

  const PAYMENT_SCENARIOS = [
    {
      name: 'landlord payments page with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, llUser.email, llUser.password);
        await page.goto(`/l/payments${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'caretaker payments page with stress content',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, ctUser.email, ctUser.password, /\/c$/);
        await page.goto(`/c/payments${q}`);
        await page.locator('h1').waitFor();
      },
    },
    {
      name: 'tenant bill detail page with payments section',
      setup: async (page: Page, q: string) => {
        await uiLogin(page, tUser.email, tUser.password, /\/t$/);
        await page.goto(`/t/bills/${billId}${q}`);
        await page.locator('h1').waitFor();
      },
    },
  ];

  for (const scenario of PAYMENT_SCENARIOS) {
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
