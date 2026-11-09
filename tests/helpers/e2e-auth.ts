import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { request as pwRequest, type APIRequestContext, type Page, expect } from '@playwright/test';

/** Shared helpers for the auth e2e specs. Everything uses a unique email, so specs stay independent. */

export const BASE_URL = 'http://localhost:4173';
export const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8026';
export const GOOD_PASSWORD = 'Correct-Horse-9-battery';
export const NEW_PASSWORD = 'Another-Strong-Pass-42';

export const uniqueEmail = (prefix = 'e2e'): string => `${prefix}-${randomUUID().slice(0, 10)}@e2e.test`;

// ── Mailpit ──────────────────────────────────────────────────────────────────────────────────────

interface MailpitSummary {
  ID: string;
  Subject: string;
}

export async function waitForMail(email: string, subject: RegExp, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=50`;
    const res = await fetch(url);
    const list = ((await res.json()) as { messages?: MailpitSummary[] }).messages ?? [];
    const hit = list.find((m) => subject.test(m.Subject));
    if (hit) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      return `${full.Text ?? ''}\n${full.HTML ?? ''}`;
    }
    if (Date.now() > deadline) throw new Error(`no mail to ${email} matching ${String(subject)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** The token in the first link of the mail whose path contains `path`. */
export function tokenFromMail(body: string, path: string): string {
  const urls = body.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  const hit = urls.map((u) => u.replace(/&amp;/g, '&')).find((u) => u.includes(path));
  if (!hit) throw new Error(`no link containing ${path} in mail`);
  const u = new URL(hit);
  return u.searchParams.get('token') ?? u.pathname.split('/').filter(Boolean).pop()!;
}

// ── API-level setup (fast fixtures; the flows under test still go through the UI) ──────────────

export async function apiContext(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
}

export async function csrfOf(ctx: APIRequestContext): Promise<string> {
  const state = await ctx.storageState();
  const c = state.cookies.find((x) => x.name === 'bm_csrf');
  if (!c) throw new Error('no bm_csrf cookie');
  return c.value;
}

/** Signs up a landlord through the API and verifies the email through the mailed link. */
export async function createVerifiedLandlord(
  o: { email?: string; password?: string; fullName?: string; orgName?: string } = {},
): Promise<{ email: string; password: string; fullName: string; orgName: string }> {
  const email = o.email ?? uniqueEmail('landlord');
  const password = o.password ?? GOOD_PASSWORD;
  const fullName = o.fullName ?? 'Rahim Uddin';
  const orgName = o.orgName ?? 'Rahim Properties';
  await clearRateLimits();
  const ctx = await apiContext();
  try {
    const s = await ctx.post('/api/auth/signup', { data: { email, password, fullName, orgName } });
    expect(s.status(), 'signup').toBeLessThan(300);
    const token = tokenFromMail(await waitForMail(email, /verify/i), '/verify-email');
    const csrf = await csrfOf(ctx).catch(() => '');
    const v = await ctx.post('/api/auth/verify-email', {
      data: { token },
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    expect(v.status(), 'verify').toBe(200);
  } finally {
    await ctx.dispose();
  }
  return { email, password, fullName, orgName };
}

/** Signs `email` in through the UI login form and waits for the role home. */
export async function uiLogin(page: Page, email: string, password: string, home = /\/l$/): Promise<void> {
  await clearRateLimits();
  // After an in-app sign-out the browser is already on /login while the app's own redirect may still be
  // settling; a second goto would be "interrupted by another navigation". Reuse the page in that case.
  if (new URL(page.url(), BASE_URL).pathname === '/login') {
    await page.getByLabel('Email').waitFor();
  } else {
    await page.goto('/login');
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(home);
}

// ── Database (owner connection, fixtures only: an invitation row has no creation route yet) ─────

const requireFromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));

interface PgPoolLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  end: () => Promise<void>;
}

export async function withOwnerDb<T>(fn: (db: PgPoolLike) => Promise<T>): Promise<T> {
  const pg = requireFromApi('pg') as { Pool: new (o: { connectionString: string }) => PgPoolLike };
  const url = process.env['DATABASE_OWNER_URL'];
  if (!url) throw new Error('DATABASE_OWNER_URL is not set (.env.test)');
  const pool = new pg.Pool({ connectionString: url });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/** Inserts an invitation for `email` into the landlord's org and returns the plaintext token. */
export async function insertInvite(
  landlordEmail: string,
  email: string,
  role: 'caretaker' | 'tenant' = 'caretaker',
): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  await withOwnerDb(async (db) => {
    const u = await db.query(
      `select u.id as uid, m.org_id as oid from users u join memberships m on m.user_id = u.id
        where u.email = $1 and m.role = 'landlord'`,
      [landlordEmail],
    );
    const row = u.rows[0];
    if (!row) throw new Error(`no landlord ${landlordEmail}`);
    await db.query(
      `insert into invitations (org_id, email, role, token_hash, expires_at, invited_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        row['oid'],
        email,
        role,
        createHash('sha256').update(token).digest(),
        new Date(Date.now() + 7 * 86_400_000),
        row['uid'],
      ],
    );
  });
  return token;
}

// ── Redis (rate-limit counters are per IP, and every e2e browser shares one IP) ─────────────────

/** Deletes the `rl:*` counters so specs that sign in many times do not trip the 10/min login limit. */
export async function clearRateLimits(): Promise<void> {
  const Redis = requireFromApi('ioredis') as new (url: string) => {
    keys: (p: string) => Promise<string[]>;
    del: (...k: string[]) => Promise<number>;
    quit: () => Promise<unknown>;
  };
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('REDIS_URL is not set (.env.test)');
  const redis = new Redis(url);
  try {
    const keys = await redis.keys('rl:*');
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    await redis.quit();
  }
}
