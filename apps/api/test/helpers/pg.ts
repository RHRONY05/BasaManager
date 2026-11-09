import pg from 'pg';
import { ownerUrl, appUrl } from './env';

export type TenantCtx = {
  orgId: string | null;
  userId: string;
  role: 'landlord' | 'caretaker' | 'tenant' | null;
  isAdmin?: boolean;
};

/** Fixture connection: bm_owner (superuser in the test container), so fixtures bypass RLS and grants. */
let ownerPool: pg.Pool | undefined;
export function owner(): pg.Pool {
  ownerPool ??= new pg.Pool({ connectionString: ownerUrl(), max: 4 });
  return ownerPool;
}

export async function closeOwner(): Promise<void> {
  await ownerPool?.end();
  ownerPool = undefined;
}

/**
 * Wipe every fixture row in EVERY public table (except Prisma's migration ledger). Truncating only
 * users/organizations misses tables with no foreign key to them (e.g. job_runs), which leaked rows
 * from one test file into the next depending on file order.
 */
export async function resetData(): Promise<void> {
  const { rows } = await owner().query<{ t: string }>(
    `select format('%I.%I', schemaname, tablename) as t from pg_tables
      where schemaname = 'public' and tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  await owner().query(`truncate table ${rows.map((r) => r.t).join(', ')} restart identity cascade`);
}

export async function q<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await owner().query<T>(text, params);
  return res.rows;
}

/** A fresh single connection as the given role URL. Caller must `end()` it. */
export async function connectAs(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

/**
 * Run `fn` on a bm_app connection inside a transaction that sets the tenant context exactly like
 * `db.$tx` should, then ROLLBACK (so tests leave nothing behind). `ctx = null` sets nothing at all.
 */
export async function asApp<T>(
  ctx: TenantCtx | null,
  fn: (c: pg.Client) => Promise<T>,
  url: string = appUrl(),
): Promise<T> {
  const c = await connectAs(url);
  try {
    await c.query('begin');
    if (ctx) {
      await c.query(
        `select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true),
                set_config('app.role', $3, true), set_config('app.is_admin', $4, true)`,
        [ctx.orgId ?? '', ctx.userId, ctx.role ?? '', ctx.isAdmin ? 'true' : 'false'],
      );
    }
    return await fn(c);
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
}

/** Postgres error code of a rejected query (e.g. 42501, 23505, 23514), or undefined if it resolved. */
export async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no-code:' + String(e);
  }
}
