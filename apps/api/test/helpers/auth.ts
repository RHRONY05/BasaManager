import { createHash, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import request from 'supertest';
import type { Express } from 'express';
import argon2 from 'argon2';
import { loadEnv, type Env } from '../../src/config/env';
import { createPrisma, type Db } from '../../src/config/db';
import { createRedis, type Redis } from '../../src/config/redis';
import { createLogger } from '../../src/lib/logger';
import { clock } from '../../src/lib/clock';
import { createApp } from '../../src/app';
import { q, resetData, closeOwner } from './pg';
import './env'; // loads .env.test defensively

/** Supertest agent (keeps cookies). */
export type TestAgent = ReturnType<typeof request.agent>;

export const MAILPIT_URL = (): string => process.env['MAILPIT_URL'] ?? 'http://localhost:8026';

// ── App under test ───────────────────────────────────────────────────────────────────────────────

export interface TestCtx {
  app: Express;
  env: Env;
  prisma: Db;
  redis: Redis;
  /** Every log line the app wrote (raw JSON strings), for the "nothing sensitive is logged" test. */
  logs: string[];
  close: () => Promise<void>;
}

/**
 * The real app on real Postgres + Redis. `createApp(deps)` keeps the V1 signature
 * `{ env, prisma, redis, logger }`; mail goes through SMTP_URL to Mailpit.
 * Call `resetAll(ctx)` in `beforeEach`.
 */
export function buildTestApp(): TestCtx {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  const logs: string[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _enc, cb) {
      logs.push(chunk.toString('utf8'));
      cb();
    },
  });
  const logger = createLogger({ level: 'debug', destination: sink });
  const app = createApp({ env, prisma, redis, logger });
  return {
    app,
    env,
    prisma,
    redis,
    logs,
    close: async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit(), closeOwner()]);
    },
  };
}

/** Wipe DB rows, Redis (rate limits, lockouts), Mailpit, the clock and the captured logs. */
export async function resetAll(ctx: TestCtx): Promise<void> {
  clock.reset();
  await resetData();
  await ctx.redis.flushdb();
  await clearMailbox();
  ctx.logs.length = 0;
}

/** A cookie-keeping agent whose default `Origin` is APP_URL (what the browser sends). */
export function newAgent(ctx: TestCtx): TestAgent {
  return request.agent(ctx.app).set('Origin', ctx.env.APP_URL);
}

// ── Cookies and CSRF ─────────────────────────────────────────────────────────────────────────────

type Jar = {
  getCookies: (a: { domain: string; path: string; secure: boolean; script: boolean }) => {
    name: string;
    value: string;
  }[];
};

/** Value of a cookie in the agent's jar (HttpOnly ones included; this reads the jar, not `document.cookie`). */
export function cookie(agent: TestAgent, name: string): string | undefined {
  const jar = (agent as unknown as { jar: Jar }).jar;
  // bm_rt is scoped to /api/auth, so ask for a path inside it; the others match any path.
  const found = jar
    .getCookies({ domain: '127.0.0.1', path: '/api/auth/x', secure: true, script: false })
    .find((c) => c.name === name);
  return found?.value;
}

/** The double-submit token the browser would copy from the `bm_csrf` cookie into `X-CSRF-Token`. */
export function csrfFrom(agent: TestAgent): string {
  const v = cookie(agent, 'bm_csrf');
  if (!v) throw new Error('agent has no bm_csrf cookie (not signed in?)');
  return v;
}

/** Set `X-CSRF-Token` as an agent default from its current `bm_csrf` cookie. Call after login/refresh. */
export function syncCsrf(agent: TestAgent): TestAgent {
  return agent.set('X-CSRF-Token', csrfFrom(agent));
}

/** Raw `Set-Cookie` header strings of a response. */
export function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const v = res.headers['set-cookie'];
  return Array.isArray(v) ? (v as string[]) : [];
}

/** The `Set-Cookie` line for one cookie name, or undefined. */
export function setCookieLine(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  return setCookies(res).find((c) => c.startsWith(`${name}=`));
}

/**
 * A request that carries explicit cookies, CSRF header and Origin, bypassing any agent
 * (for reuse-of-old-token and CSRF negative cases). `origin: null` sends no Origin header.
 */
export function rawRequest(
  ctx: TestCtx,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  o: { cookies?: Record<string, string>; csrf?: string | null; origin?: string | null } = {},
): request.Test {
  let r = request(ctx.app)[method](path);
  if (o.cookies && Object.keys(o.cookies).length > 0) {
    r = r.set(
      'Cookie',
      Object.entries(o.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  }
  if (o.csrf) r = r.set('X-CSRF-Token', o.csrf);
  if (o.origin !== null) r = r.set('Origin', o.origin ?? ctx.env.APP_URL);
  return r;
}

/** Snapshot of the cookies an agent currently holds, for `rawRequest`. */
export function cookiesOf(agent: TestAgent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of ['bm_at', 'bm_rt', 'bm_csrf']) {
    const v = cookie(agent, n);
    if (v) out[n] = v;
  }
  return out;
}

// ── Users and sign-in ────────────────────────────────────────────────────────────────────────────

export const PASSWORD = 'Correct-Horse-9-battery';
export const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();
export const uniqEmail = (p = 'u'): string => `${p}-${randomUUID().slice(0, 8)}@test.local`;

/** argon2id with the production parameters (m=19456 KiB, t=2, p=1). */
export const hashPassword = (pw: string): Promise<string> =>
  argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

/** Insert a user straight into the DB (fast fixture; no org). Verified by default. */
export async function insertUser(
  o: { email?: string; password?: string; fullName?: string; verified?: boolean } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = o.email ?? uniqEmail();
  const password = o.password ?? PASSWORD;
  const rows = await q<{ id: string }>(
    `insert into users (email, full_name, password_hash, email_verified_at)
     values ($1, $2, $3, $4) returning id`,
    [
      email,
      o.fullName ?? 'Test User',
      await hashPassword(password),
      o.verified === false ? null : new Date(),
    ],
  );
  return { id: rows[0]!.id, email, password };
}

export interface SignupInput {
  email?: string;
  password?: string;
  fullName?: string;
  orgName?: string;
}

/**
 * Real signup through the API, then verify through the emailed link. The agent ends up signed in
 * (signup signs in) with the CSRF default header set.
 */
export async function signupAndVerify(
  agent: TestAgent,
  input: SignupInput = {},
): Promise<{ email: string; password: string; userId: string; orgId: string }> {
  const email = input.email ?? uniqEmail('owner');
  const password = input.password ?? PASSWORD;
  const res = await agent.post('/api/auth/signup').send({
    email,
    password,
    fullName: input.fullName ?? 'Rahim Uddin',
    orgName: input.orgName ?? 'Rahim Properties',
  });
  if (res.status >= 300) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  const mail = await latestMailTo(email, { subject: /verify/i });
  const token = tokenFromLink(extractLink(mail, '/verify-email'));
  syncCsrf(agent);
  const v = await agent.post('/api/auth/verify-email').send({ token });
  if (v.status !== 200) throw new Error(`verify failed: ${v.status} ${JSON.stringify(v.body)}`);
  const u = await q<{ id: string }>(`select id from users where email = $1`, [email]);
  const m = await q<{ org_id: string }>(
    `select org_id from memberships where user_id = $1 and role = 'landlord'`,
    [u[0]!.id],
  );
  return { email, password, userId: u[0]!.id, orgId: m[0]!.org_id };
}

/** Sign `agent` in with email + password; sets the `X-CSRF-Token` default from the new `bm_csrf`. */
export async function loginAs(agent: TestAgent, email: string, password: string): Promise<TestAgent> {
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return syncCsrf(agent);
}

// ── Mailpit ──────────────────────────────────────────────────────────────────────────────────────

export interface Mail {
  id: string;
  subject: string;
  to: string[];
  text: string;
  html: string;
  createdAt: string;
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL()}/api/v1/messages`, { method: 'DELETE' });
}

interface MailpitSummary {
  ID: string;
  Subject: string;
  Created: string;
  To: { Address: string }[];
}

async function search(email: string): Promise<MailpitSummary[]> {
  const url = `${MAILPIT_URL()}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
  return ((await res.json()) as { messages?: MailpitSummary[] }).messages ?? [];
}

/** Number of mails to `email` right now (no waiting). */
export async function mailCount(email: string, subject?: RegExp): Promise<number> {
  const all = await search(email);
  return subject ? all.filter((m) => subject.test(m.Subject)).length : all.length;
}

/**
 * Newest mail to `email` (optionally with a subject match). Polls up to `timeoutMs` for at least
 * `minCount` matching mails, because the app may send asynchronously. Throws if none arrives.
 */
export async function latestMailTo(
  email: string,
  o: { subject?: RegExp; minCount?: number; timeoutMs?: number } = {},
): Promise<Mail> {
  const deadline = Date.now() + (o.timeoutMs ?? 5000);
  for (;;) {
    const matches = (await search(email)).filter((m) => !o.subject || o.subject.test(m.Subject));
    if (matches.length >= (o.minCount ?? 1)) {
      const msg = matches[0]!;
      const full = (await (await fetch(`${MAILPIT_URL()}/api/v1/message/${msg.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      return {
        id: msg.ID,
        subject: msg.Subject,
        to: msg.To.map((t) => t.Address),
        text: full.Text ?? '',
        html: full.HTML ?? '',
        createdAt: msg.Created,
      };
    }
    if (Date.now() > deadline)
      throw new Error(`no mail to ${email} (subject ${String(o.subject)}) within timeout`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** First absolute URL in the mail (text, then html) whose path contains `path`, e.g. '/reset-password'. */
export function extractLink(mail: Mail, path: string): string {
  const urls = `${mail.text}\n${mail.html}`.match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  const hit = urls.map((u) => u.replace(/&amp;/g, '&')).find((u) => u.includes(path));
  if (!hit) throw new Error(`no link containing ${path} in mail "${mail.subject}"`);
  return hit;
}

/** The token of a mailed link: `?token=` if present, else the last path segment (`/invite/<token>`). */
export function tokenFromLink(link: string): string {
  const u = new URL(link);
  return u.searchParams.get('token') ?? u.pathname.split('/').filter(Boolean).pop()!;
}

// ── Invitation and session fixtures ──────────────────────────────────────────────────────────────

/** Insert an invitation row directly and return the plaintext token (only its sha-256 is stored). */
export async function insertInvitation(o: {
  orgId: string;
  invitedBy: string;
  email: string;
  role?: 'caretaker' | 'tenant';
  buildingIds?: string[];
  expiresAt?: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}): Promise<{ token: string; id: string }> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const rows = await q<{ id: string }>(
    `insert into invitations (org_id, email, role, building_ids, token_hash, expires_at, accepted_at, revoked_at, invited_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      o.orgId,
      o.email,
      o.role ?? 'tenant',
      o.buildingIds ?? [],
      sha256(token),
      o.expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
      o.acceptedAt ?? null,
      o.revokedAt ?? null,
      o.invitedBy,
    ],
  );
  return { token, id: rows[0]!.id };
}

export interface SessionRow {
  id: string;
  family_id: string;
  rotated_at: Date | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

/** Session row for a refresh-token plaintext (`bm_rt`), looked up by its sha-256. */
export async function sessionByRefreshToken(rt: string): Promise<SessionRow | undefined> {
  return (
    await q<SessionRow>(
      `select id, family_id, rotated_at, revoked_at, revoke_reason from sessions where token_hash = $1`,
      [sha256(rt)],
    )
  )[0];
}

export async function sessionsOfUser(userId: string): Promise<SessionRow[]> {
  return q<SessionRow>(
    `select id, family_id, rotated_at, revoked_at, revoke_reason from sessions where user_id = $1 order by created_at`,
    [userId],
  );
}

/** Sessions of a user that could still be used to refresh (not revoked, not rotated). */
export const liveSessions = async (userId: string): Promise<SessionRow[]> =>
  (await sessionsOfUser(userId)).filter((s) => !s.revoked_at && !s.rotated_at);
