import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, type MembershipRole } from '../generated/prisma/client';

/**
 * Database client factory. Owner: architect (03-DATABASE.md).
 *
 * The running app connects as `bm_app` (`DATABASE_URL`, NOBYPASSRLS); the worker as `bm_worker`
 * (`DATABASE_WORKER_URL`). Callers pass the URL from `config/env.ts`: this file never reads `process.env`.
 * Prisma 7 talks to Postgres through the `pg` driver adapter.
 */
export function createPrisma(url: string, options: CreatePrismaOptions = {}) {
  const adapter = new PrismaPg({ connectionString: url });
  let base: PrismaClient;
  if (options.onQuery) {
    // Query events are only emitted when asked for (tests: tests/helpers/queryCounter.ts). The cast keeps
    // the client type identical with and without events, so `Db` stays one type.
    const withEvents = new PrismaClient({ adapter, log: [{ emit: 'event', level: 'query' }] });
    withEvents.$on('query', options.onQuery);
    base = withEvents as unknown as PrismaClient;
  } else {
    base = new PrismaClient({ adapter });
  }
  return withTenantExtension(base);
}

export type CreatePrismaOptions = {
  /** Called for every SQL statement Prisma sends (enables Prisma's `query` log event). Tests only. */
  onQuery?: (event: Prisma.QueryEvent) => void;
};

/** The app's database client. Type against this, not `PrismaClient`. */
export type Db = ReturnType<typeof createPrisma>;

/** The client a `db.$tx` callback receives: every model, `$queryRaw`, `$executeRaw`; no `$transaction`. */
export type Tx = Prisma.TransactionClient;

// ── Tenant extension (03-DATABASE.md "RLS", 02-ARCHITECTURE.md "Multi-tenancy and RLS") ──────────────

/**
 * Who is acting, set for one transaction. Build it from the authenticated session, never from input.
 * - `orgId`: the current organisation (null for user-only work such as notifications, or admin screens).
 * - `userId`: the signed-in user (`users.id`). Drives the notifications `own_rows` policy.
 * - `role`: the membership role in `orgId` (null when there is no org). `caretaker` hides documents.
 * - `isAdmin`: true only for a verified platform admin on `/api/admin` routes (reads the admin views).
 */
export type TenantCtx = {
  orgId: string | null;
  userId: string;
  role: MembershipRole | null;
  isAdmin?: boolean;
};

export type TxOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

/** Thrown when an org-owned model is queried outside `db.$tx` (a bug: there is no tenant context). */
export class TenantContextMissing extends Error {
  readonly model: string;
  readonly operation: string;
  constructor(model: string, operation: string) {
    super(`${model}.${operation} needs a tenant context: run it inside db.$tx(ctx, fn)`);
    this.name = 'TenantContextMissing';
    this.model = model;
    this.operation = operation;
  }
}

/**
 * Models protected by RLS, derived from the generated client so the list can't drift from the schema:
 * every model with an `orgId` field, plus `Organization` (RLS by `id`, policy org_self).
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => {
    if (model === Prisma.ModelName.Organization) return true;
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    return fields !== undefined && 'orgId' in fields;
  }),
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adds `db.$tx(ctx, fn)` and makes tenant models unusable outside it.
 *
 * `$tx` opens an interactive transaction on the *base* client whose first statement sets the four
 * `app.*` settings with `is_local = true` (they end with the transaction, so nothing leaks to the next
 * user of the pooled connection), then runs `fn(tx)`. The guarded client (`db.building…`, also
 * `db.$transaction`) throws `TenantContextMissing` for every tenant model; non-tenant models (users,
 * sessions, …) and raw queries work outside `$tx` (raw SQL on org tables then simply sees no rows).
 */
function withTenantExtension(base: PrismaClient) {
  return base.$extends({
    name: 'tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model)) throw new TenantContextMissing(model, operation);
          return query(args);
        },
      },
    },
    client: {
      $tx<T>(ctx: TenantCtx, fn: (tx: Tx) => Promise<T>, options?: TxOptions): Promise<T> {
        assertCtx(ctx);
        return base.$transaction(async (tx) => {
          await tx.$executeRaw`select set_config('app.org_id', ${ctx.orgId ?? ''}, true),
                                      set_config('app.user_id', ${ctx.userId}, true),
                                      set_config('app.role', ${ctx.role ?? ''}, true),
                                      set_config('app.is_admin', ${ctx.isAdmin ? 'true' : 'false'}, true)`;
          return fn(tx);
        }, options);
      },
    },
  });
}

function assertCtx(ctx: TenantCtx): void {
  if (ctx.orgId !== null && !UUID.test(ctx.orgId)) throw new TypeError('TenantCtx.orgId must be a uuid or null');
  if (!UUID.test(ctx.userId)) throw new TypeError('TenantCtx.userId must be a uuid');
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
