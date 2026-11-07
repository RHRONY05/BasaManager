import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Database client factory. Owner: architect (03-DATABASE.md).
 *
 * The running app connects as `bm_app` (`DATABASE_URL`, NOBYPASSRLS); the worker as `bm_worker`
 * (`DATABASE_WORKER_URL`). Callers pass the URL from `config/env.ts`: this file never reads `process.env`.
 * Prisma 7 talks to Postgres through the `pg` driver adapter.
 */
export function createPrisma(url: string) {
  const adapter = new PrismaPg({ connectionString: url });
  const base = new PrismaClient({ adapter });
  return withTenantExtension(base);
}

/** The app's database client. Type against this, not `PrismaClient`, so V4's extension flows through. */
export type Db = ReturnType<typeof createPrisma>;

// ── Tenant extension (task V4) ────────────────────────────────────────────────────────────────────
// V4 replaces the body below with `prisma.$extends(...)`, which adds `db.$tx(ctx, fn)`: one interactive
// transaction whose first statement is `select set_config('app.org_id', …, true), set_config('app.user_id',
// …, true), set_config('app.role', …, true)`, and which throws when an org table is queried without a
// tenant context (03-DATABASE.md "RLS", 02-ARCHITECTURE.md "Multi-tenancy and RLS").
// V1 has no tables yet, so it returns the client unchanged.
function withTenantExtension(prisma: PrismaClient) {
  return prisma;
}

/**
 * `true` when the database answers `select 1` within `timeoutMs`; `false` on error or timeout.
 * Never throws (used by `GET /api/ready`). A timed-out query is not cancelled; it finishes or fails
 * on its own and its result is ignored.
 */
export async function pingDb(prisma: Db, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = prisma.$queryRaw`select 1`.then(
    () => true,
    () => false,
  );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
