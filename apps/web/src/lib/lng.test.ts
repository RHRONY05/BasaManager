import { describe, it, expect } from 'vitest';
import { resolveInitialLng } from './lng';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('resolveInitialLng', () => {
  it('honours en-XA and remembers it in dev/test builds', () => {
    const storage = memoryStorage();
    expect(resolveInitialLng('?lng=en-XA', 'development', storage)).toBe('en-XA');
    expect(resolveInitialLng('?lng=en-XA', 'test', storage)).toBe('en-XA');
    expect(storage.data.get('bm.lng')).toBe('en-XA');
  });

  it('ignores en-XA in production and does not store it', () => {
    const storage = memoryStorage();
    expect(resolveInitialLng('?lng=en-XA', 'production', storage)).toBe('en');
    expect(storage.data.has('bm.lng')).toBe(false);
  });

  it('ignores unknown locales in every mode', () => {
    const storage = memoryStorage();
    expect(resolveInitialLng('?lng=xx', 'development', storage)).toBe('en');
    expect(resolveInitialLng('?lng=%3Cscript%3E', 'production', storage)).toBe('en');
    expect(storage.data.has('bm.lng')).toBe(false);
  });

  it('falls back to a known saved locale, ignoring a stale pseudo-locale in production', () => {
    expect(resolveInitialLng('', 'development', memoryStorage({ 'bm.lng': 'en-XA' }))).toBe('en-XA');
    expect(resolveInitialLng('', 'production', memoryStorage({ 'bm.lng': 'en-XA' }))).toBe('en');
  });

  it('works without storage', () => {
    expect(resolveInitialLng('?lng=en', 'production', null)).toBe('en');
  });
});
