import { describe, it, expect } from 'vitest';
import { createQueryCounter, isPlumbing } from './queryCounter';

describe('queryCounter', () => {
  it('counts statements and resets', () => {
    const c = createQueryCounter();
    c.onQuery({ query: 'SELECT 1' });
    c.onQuery({ query: 'SELECT "public"."buildings"."id" FROM "public"."buildings"' });
    expect(c.count).toBe(2);
    expect(c.statements[1]).toContain('buildings');
    c.reset();
    expect(c.count).toBe(0);
  });

  it('skips transaction plumbing unless countAll', () => {
    const plumbing = [
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'SAVEPOINT s1',
      "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)",
    ];
    for (const q of plumbing) expect(isPlumbing(q), q).toBe(true);
    expect(isPlumbing('SELECT * FROM bills')).toBe(false);

    const c = createQueryCounter();
    const all = createQueryCounter({ countAll: true });
    for (const q of [...plumbing, 'SELECT 1']) {
      c.onQuery({ query: q });
      all.onQuery({ query: q });
    }
    expect(c.count).toBe(1);
    expect(all.count).toBe(plumbing.length + 1);
  });

  it('measure returns the result and only the statements caused by fn', async () => {
    const c = createQueryCounter();
    c.onQuery({ query: 'SELECT before' });
    const out = await c.measure(async () => {
      c.onQuery({ query: 'SELECT a' });
      c.onQuery({ query: 'SELECT b' });
      return 'done';
    });
    expect(out).toEqual({ result: 'done', count: 2, statements: ['SELECT a', 'SELECT b'] });
    expect(c.count).toBe(0);
  });
});
