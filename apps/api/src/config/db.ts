import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, type InvitationRole, type MembershipRole } from '../generated/prisma/client';

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

export type TxOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * Thrown when an org-owned model is queried outside `db.$tx` (a bug: there is no tenant context), either
 * directly or through a nested `include` / `select` / `where` / `data` of a non-tenant model
 * (`relation` names the path, e.g. `memberships` in `db.user.findMany({ include: { memberships: true } })`).
 */
export class TenantContextMissing extends Error {
  readonly model: string;
  readonly operation: string;
  readonly relation: string | undefined;
  constructor(model: string, operation: string, relation?: string) {
    super(
      relation
        ? `${model}.${operation} reaches the tenant relation ${relation}: run it inside db.$tx(ctx, fn)`
        : `${model}.${operation} needs a tenant context: run it inside db.$tx(ctx, fn)`,
    );
    this.name = 'TenantContextMissing';
    this.model = model;
    this.operation = operation;
    this.relation = relation;
  }
}

/**
 * Models protected by RLS, derived from the generated client so the list can't drift from the schema:
 * every model with an `orgId` field, plus `Organization` (RLS by `id`, policies org_self_*).
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

/** Per model: relation field name → target model, and the set of scalar/enum field names. */
type ModelShape = { relations: ReadonlyMap<string, string>; scalars: ReadonlySet<string> };
type DataModel = {
  models: Record<string, { fields: readonly { name: string; kind: string; type: string }[] }>;
};

/**
 * The relation map, read from the generated client's runtime data model. Prisma 7's `prisma-client`
 * generator exports no `Prisma.dmmf`; the same data lives on the client as `_runtimeDataModel` (declared in
 * `@prisma/client/runtime`, not on the `PrismaClient` interface, hence the cast). Fails fast if Prisma ever
 * drops it, rather than silently guarding nothing.
 */
function modelShapes(base: PrismaClient): ReadonlyMap<string, ModelShape> {
  const dm = (base as unknown as { _runtimeDataModel?: DataModel })._runtimeDataModel;
  if (!dm?.models || Object.keys(dm.models).length === 0)
    throw new Error('Prisma runtime data model not found: the nested tenant guard cannot be built');
  const shapes = new Map<string, ModelShape>();
  for (const [name, m] of Object.entries(dm.models)) {
    const relations = new Map<string, string>();
    const scalars = new Set<string>();
    for (const f of m.fields) {
      if (f.kind === 'object') relations.set(f.name, f.type);
      else scalars.add(f.name);
    }
    shapes.set(name, { relations, scalars });
  }
  return shapes;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * The first tenant relation that `args` of `model` reaches (as a dotted path), or undefined. Walks every
 * nested `include` / `select` / `_count` / `where` (relation filters) / `orderBy` / `data` (nested writes):
 * a key that is a relation field switches to its target model (tenant target → found); a scalar field's
 * value is skipped (so JSON values can't be mistaken for relations); any other key is an operator
 * (`select`, `some`, `AND`, `create`, …) and is walked with the same model.
 */
function tenantRelationIn(
  shapes: ReadonlyMap<string, ModelShape>,
  model: string,
  args: unknown,
  path = '',
): string | undefined {
  if (Array.isArray(args)) {
    for (const item of args) {
      const hit = tenantRelationIn(shapes, model, item, path);
      if (hit) return hit;
    }
    return undefined;
  }
  if (!isPlainObject(args)) return undefined;
  const shape = shapes.get(model);
  if (!shape) return undefined;
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === false) continue;
    const target = shape.relations.get(key);
    if (target) {
      const here = path ? `${path}.${key}` : key;
      if (TENANT_MODELS.has(target)) return here;
      const hit = tenantRelationIn(shapes, target, value, here);
      if (hit) return hit;
    } else if (!shape.scalars.has(key)) {
      const hit = tenantRelationIn(shapes, model, value, path);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Adds `db.$tx(ctx, fn)` and makes tenant models unusable outside it.
 *
 * `$tx` opens an interactive transaction on the *base* client whose first statement sets the four
 * `app.*` settings with `is_local = true` (they end with the transaction, so nothing leaks to the next
 * user of the pooled connection), then runs `fn(tx)`. The guarded client (`db.building…`, also
 * `db.$transaction`) throws `TenantContextMissing` for every tenant model, and for a non-tenant model
 * whose arguments reach a tenant relation (`db.user.findMany({ include: { memberships: true } })` would
 * otherwise silently return `memberships: []` under RLS). Non-tenant models (users, sessions, …) and raw
 * queries work outside `$tx` (raw SQL on org tables then simply sees no rows).
 */
function withTenantExtension(base: PrismaClient) {
  const shapes = modelShapes(base);
  return base.$extends({
    name: 'tenant',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (TENANT_MODELS.has(model)) throw new TenantContextMissing(model, operation);
          const relation = tenantRelationIn(shapes, model, args);
          if (relation) throw new TenantContextMissing(model, operation, relation);
          return query(args);
        },
      },
    },
    client: {
      async $tx<T>(ctx: TenantCtx, fn: (tx: Tx) => Promise<T>, options?: TxOptions): Promise<T> {
        assertCtx(ctx);
        return await base.$transaction(async (tx) => {
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
  if (ctx.orgId !== null && !UUID.test(ctx.orgId))
    throw new TypeError('TenantCtx.orgId must be a uuid or null');
  if (!UUID.test(ctx.userId)) throw new TypeError('TenantCtx.userId must be a uuid');
}

// ── Lookups that run without an org context (03-DATABASE.md "RLS": user-scoped access) ──────────────

/** What `app_find_invitation` returns: one invitation, never its token hash. */
export type InvitationLookup = {
  id: string;
  orgId: string;
  email: string;
  role: InvitationRole;
  buildingIds: string[];
  leaseId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: string;
};

/**
 * The invitation whose `token_hash` equals `tokenHash` (sha-256 of the token from the link), or null.
 * Works without an org context through the SECURITY DEFINER function `app_find_invitation`; the caller
 * checks expiry / acceptance / revocation and then accepts inside `db.$tx({ orgId: result.orgId, … })`.
 * Accepts the base client or a `$tx` client.
 */
export async function findInvitationByTokenHash(
  db: Pick<Db, '$queryRaw'> | Tx,
  tokenHash: Uint8Array,
): Promise<InvitationLookup | null> {
  type Row = {
    id: string;
    org_id: string;
    email: string;
    role: InvitationRole;
    building_ids: string[];
    lease_id: string | null;
    expires_at: Date;
    accepted_at: Date | null;
    revoked_at: Date | null;
    invited_by: string;
  };
  const rows = await db.$queryRaw<Row[]>`select * from app_find_invitation(${tokenHash})`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    orgId: r.org_id,
    email: r.email,
    role: r.role,
    buildingIds: r.building_ids,
    leaseId: r.lease_id,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    revokedAt: r.revoked_at,
    invitedBy: r.invited_by,
  };
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
