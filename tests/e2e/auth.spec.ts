import { test, expect, type Page } from '@playwright/test';
import {
  BASE_URL,
  GOOD_PASSWORD,
  NEW_PASSWORD,
  apiContext,
  clearRateLimits,
  createVerifiedLandlord,
  insertInvite,
  tokenFromMail,
  uiLogin,
  uniqueEmail,
  waitForMail,
} from '../helpers/e2e-auth';

const WRONG_CREDS = 'Email or password is incorrect';

// Login is limited to 10/min per IP and all e2e browsers share one IP.
test.beforeEach(async () => {
  await clearRateLimits();
});

async function logoutViaMenu(page: Page): Promise<void> {
  await page.getByTestId('account-menu-button').filter({ visible: true }).first().click();
  await page.getByTestId('account-menu-signout').click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe('Auth flows', () => {
  test('signup -> mailed verification link -> verified -> login -> landlord home', async ({ page }) => {
    const email = uniqueEmail('signup');

    await page.goto('/signup');
    await page.getByLabel('Your full name').fill('Farhana Chowdhury');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(GOOD_PASSWORD);
    await page.getByLabel('Organisation name').fill('Chowdhury Properties');
    await page.getByRole('button', { name: 'Create landlord account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const token = tokenFromMail(await waitForMail(email, /verify/i), '/verify-email');
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

    // Signup already signed this browser in, so Continue goes to the landlord home.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/l$/);

    // A used token no longer works.
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('alert')).toBeVisible();

    await page.goto('/l');
    await logoutViaMenu(page);
    await uiLogin(page, email, GOOD_PASSWORD);
  });

  test('signup validation: a short password is refused before anything is sent', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Your full name').fill('Short Pass');
    await page.getByLabel('Email').fill(uniqueEmail('short'));
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByLabel('Organisation name').fill('Org');
    await page.getByRole('button', { name: 'Create landlord account' }).click();
    await expect(page.locator('#password-error')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toHaveCount(0);
  });

  test('wrong password shows the error; the right one lands on the role home', async ({ page }) => {
    const u = await createVerifiedLandlord();
    await page.goto('/login');
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill('Totally-Wrong-Password-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: WRONG_CREDS })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/l$/);
  });

  test('forgot password -> mailed link -> new password works, old one does not, link is single-use', async ({
    page,
  }) => {
    const u = await createVerifiedLandlord();

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(u.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'If an account exists, we sent a link' })).toBeVisible();

    const token = tokenFromMail(await waitForMail(u.email, /reset/i), '/reset-password');
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Set password and sign in' }).click();
    await expect(page).toHaveURL(/\/l$/);

    await logoutViaMenu(page);

    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: WRONG_CREDS })).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/l$/);

    await page.context().clearCookies();
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel('New password').fill('Yet-Another-Pass-77');
    await page.getByRole('button', { name: 'Set password and sign in' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'This link has expired or was used.' }),
    ).toBeVisible();
  });

  test('forgot password for an unknown email gives the same answer (no account enumeration)', async ({
    page,
  }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'If an account exists, we sent a link' })).toBeVisible();
  });

  test('invite accept: new caretaker sets name and password and lands on the caretaker home', async ({
    page,
  }) => {
    const landlord = await createVerifiedLandlord({ orgName: 'Invite Org Ltd' });
    const email = uniqueEmail('caretaker');
    const token = await insertInvite(landlord.email, email, 'caretaker');

    await page.goto(`/invite/${token}`);
    await expect(page.getByRole('heading', { name: 'Join Invite Org Ltd' })).toBeVisible();
    await page.getByLabel('Your full name').fill('Karim Mia');
    await page.getByLabel('Password', { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole('button', { name: 'Accept and join' }).click();
    await expect(page).toHaveURL(/\/c$/);

    // Single use.
    await logoutViaMenu(page);
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole('heading', { name: 'Join Invite Org Ltd' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('logout ends the session; protected pages then redirect to login', async ({ page }) => {
    const u = await createVerifiedLandlord();
    await uiLogin(page, u.email, u.password);
    await logoutViaMenu(page);

    await page.goto('/l');
    await expect(page).toHaveURL(/\/login\?next=%2Fl/);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
  });

  test('signed-out visit to a protected route redirects to login, and login returns to it', async ({
    page,
  }) => {
    const u = await createVerifiedLandlord();
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Password', { exact: true }).fill(u.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Signed-in devices' })).toBeVisible();
  });
});

test.describe('Account page', () => {
  test('change password: wrong current is refused, right current works, new password signs in', async ({
    page,
  }) => {
    const u = await createVerifiedLandlord();
    await uiLogin(page, u.email, u.password);
    await page.goto('/account');

    await page.getByLabel('Current password').fill('Not-My-Password-1');
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Current password is incorrect.')).toBeVisible();

    await page.getByLabel('Current password').fill(u.password);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password updated successfully.')).toBeVisible();

    await page.context().clearCookies();
    await uiLogin(page, u.email, NEW_PASSWORD);
  });

  test('sessions: this device plus a second one; revoking it signs that browser out', async ({
    page,
    browser,
  }) => {
    const u = await createVerifiedLandlord();
    await uiLogin(page, u.email, u.password);

    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await uiLogin(other, u.email, u.password);

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Signed-in devices' })).toBeVisible();
    const sessions = page.locator('#sessions');
    const revoke = sessions.getByRole('button', { name: 'Sign out', exact: true });
    // This browser, the browser that signed up through the API, and the second login.
    await expect(sessions.getByText('This device')).toHaveCount(1);
    await expect(revoke).toHaveCount(2);

    for (const left of [1, 0]) {
      await revoke.first().click();
      await page.getByRole('button', { name: 'Sign out device' }).click();
      await expect(page.getByText('Device signed out.').first()).toBeVisible();
      await expect(revoke).toHaveCount(left);
    }

    // The revoked browser is signed out on its next request; this one is not.
    await other.goto('/l');
    await expect(other).toHaveURL(/\/login/);
    await page.goto('/l');
    await expect(page).toHaveURL(/\/l$/);
    await otherCtx.close();
  });
});

test.describe('Refresh token reuse detection', () => {
  test('replaying an old refresh cookie after rotation kills the whole session family', async ({ page }) => {
    const u = await createVerifiedLandlord();
    await uiLogin(page, u.email, u.password);

    const csrfNow = async () => (await page.context().cookies()).find((c) => c.name === 'bm_csrf')!.value;
    const oldRt = (await page.context().cookies()).find((c) => c.name === 'bm_rt');
    expect(oldRt, 'refresh cookie is set').toBeTruthy();

    // Rotate once from the browser's own cookies, as the app does when the access token expires.
    const rotated = await page.request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: { Origin: BASE_URL, 'X-CSRF-Token': await csrfNow() },
    });
    expect(rotated.status()).toBe(200);
    const newRt = (await page.context().cookies()).find((c) => c.name === 'bm_rt');
    expect(newRt!.value).not.toBe(oldRt!.value);

    // An attacker replays the stolen, already-rotated token from another client.
    const attacker = await apiContext();
    const replay = await attacker.post('/api/auth/refresh', {
      headers: { Cookie: `bm_rt=${oldRt!.value}; bm_csrf=x`, 'X-CSRF-Token': 'x' },
    });
    expect(replay.status()).toBe(401);
    await attacker.dispose();

    // The legitimate holder of the newest token is signed out too (family revoked).
    const again = await page.request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: { Origin: BASE_URL, 'X-CSRF-Token': await csrfNow() },
    });
    expect(again.status()).toBe(401);

    await page.context().clearCookies({ name: 'bm_at' });
    await page.goto('/l');
    await expect(page).toHaveURL(/\/login/);
  });
});
