/**
 * Counts the SQL statements Prisma sends (09-TESTING.md "Speed checks"), to prove list endpoints have no
 * N+1: assert the same count for 5 and 50 items.
 *
 *   const counter = createQueryCounter();
 *   const db = createPrisma(appUrl(), { onQuery: counter.onQuery });
 *   const { count } = await counter.measure(() => request(app).get('/api/l/units'));
 *
 * By default transaction plumbing is not counted: BEGIN / COMMIT / ROLLBACK / SAVEPOINT and the
 * `set_config('app.org_id', …)` statement that `db.$tx` runs first. Pass `{ countAll: true }` to count it.
 * Works with any event that has a `query` string (Prisma's `QueryEvent`), so it has no Prisma import.
 */
export type QueryLike = { query: string; duration?: number };

export type QueryCounter = {
  /** Pass to `createPrisma(url, { onQuery })`. */
  onQuery: (event: QueryLike) => void;
  /** Statements counted since the last reset. */
  readonly count: number;
  /** The counted statements' SQL, in order (for failure messages). */
  readonly statements: readonly string[];
  reset: () => void;
  /** Resets, runs `fn`, and returns its result with the number of statements it caused. */
  measure: <T>(fn: () => Promise<T>) => Promise<{ result: T; count: number; statements: string[] }>;
};

const PLUMBING =
  /^\s*(begin|commit|rollback|savepoint|release savepoint|set transaction)\b|set_config\('app\.org_id'/i;

export function isPlumbing(sql: string): boolean {
  return PLUMBING.test(sql);
}

export function createQueryCounter(options: { countAll?: boolean } = {}): QueryCounter {
  let statements: string[] = [];
  return {
    onQuery(event) {
      if (!options.countAll && isPlumbing(event.query)) return;
      statements.push(event.query);
    },
    get count() {
      return statements.length;
    },
    get statements() {
      return statements;
    },
    reset() {
      statements = [];
    },
    async measure(fn) {
      statements = [];
      const result = await fn();
      const taken = statements;
      statements = [];
      return { result, count: taken.length, statements: taken };
    },
  };
}
