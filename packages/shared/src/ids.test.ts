import { describe, it, expect } from 'vitest';
import { isUuid, newId, uuidListSchema } from './ids';

describe('ids', () => {
  it('newId returns a v4 uuid that isUuid accepts', () => {
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuid(id)).toBe(true);
    expect(newId()).not.toBe(id);
  });

  it('isUuid rejects non-uuids', () => {
    for (const v of ['', 'abc', 42, null, undefined, '123e4567-e89b-12d3-a456']) expect(isUuid(v)).toBe(false);
  });

  it('uuidListSchema enforces max length and uniqueness', () => {
    const a = newId();
    const b = newId();
    const s = uuidListSchema(2);
    expect(s.parse([a, b])).toEqual([a, b]);
    expect(s.safeParse([a, a]).success).toBe(false);
    expect(s.safeParse([a, b, newId()]).success).toBe(false);
    expect(s.safeParse(['nope']).success).toBe(false);
  });
});
