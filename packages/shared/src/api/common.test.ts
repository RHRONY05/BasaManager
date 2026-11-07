import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  appEnvSchema,
  cursorQuerySchema,
  dataEnvelope,
  idParam,
  listEnvelope,
  PAGE_LIMIT_DEFAULT,
} from './common';

describe('cursorQuerySchema', () => {
  it('defaults limit to 25 and leaves cursor out', () => {
    expect(cursorQuerySchema.parse({})).toEqual({ limit: PAGE_LIMIT_DEFAULT });
    expect(PAGE_LIMIT_DEFAULT).toBe(25);
  });

  it('coerces limit from the query string', () => {
    expect(cursorQuerySchema.parse({ limit: '50', cursor: 'abc' })).toEqual({
      limit: 50,
      cursor: 'abc',
    });
  });

  it('accepts the bounds 1 and 100', () => {
    expect(cursorQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(cursorQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it.each(['0', '101', '-1', '2.5', 'ten', ''])('rejects limit %j', (limit) => {
    expect(cursorQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('rejects an empty cursor', () => {
    expect(cursorQuerySchema.safeParse({ cursor: '' }).success).toBe(false);
  });
});

describe('idParam', () => {
  it('accepts a v4 uuid', () => {
    const id = '3f0e6a2c-1b4d-4c8e-9a7f-2d5b6c8e1f00';
    expect(idParam.parse({ id })).toEqual({ id });
  });

  it.each(['1', 'not-a-uuid', '3f0e6a2c1b4d4c8e9a7f2d5b6c8e1f00'])('rejects %j', (id) => {
    expect(idParam.safeParse({ id }).success).toBe(false);
  });
});

describe('appEnvSchema', () => {
  it.each(['dev', 'test', 'staging', 'prod'])('accepts %s', (env) => {
    expect(appEnvSchema.parse(env)).toBe(env);
  });

  it.each(['development', 'production', 'PROD', ''])('rejects %j', (env) => {
    expect(appEnvSchema.safeParse(env).success).toBe(false);
  });
});

describe('envelopes', () => {
  const item = z.object({ n: z.number() });

  it('dataEnvelope wraps one item', () => {
    expect(dataEnvelope(item).parse({ data: { n: 1 } })).toEqual({ data: { n: 1 } });
    expect(dataEnvelope(item).safeParse({ n: 1 }).success).toBe(false);
  });

  it('listEnvelope wraps items and a page', () => {
    const body = { data: [{ n: 1 }, { n: 2 }], page: { nextCursor: null } };
    expect(listEnvelope(item).parse(body)).toEqual(body);
    expect(listEnvelope(item).safeParse({ data: [{ n: 1 }], page: { nextCursor: 'c2' } }).success).toBe(true);
    expect(listEnvelope(item).safeParse({ data: [] }).success).toBe(false);
  });
});
