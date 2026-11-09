import { describe, it, expect } from 'vitest';
import { generateSlug } from './slug';

describe('slug lib', () => {
  it('generates a clean URL slug from organization name', () => {
    const slug1 = generateSlug('Rahim Properties');
    expect(slug1).toMatch(/^rahim-properties-[a-z0-9]{6}$/);

    const slug2 = generateSlug('Special #@! Characters & More');
    expect(slug2).toMatch(/^special-characters-more-[a-z0-9]{6}$/);
  });
});

describe('slug lib: edge cases', () => {
  it('falls back to "org" when nothing usable remains', () => {
    expect(generateSlug('!!!---???')).toMatch(/^org-[a-z0-9]{6}$/);
    expect(generateSlug('')).toMatch(/^org-[a-z0-9]{6}$/);
  });

  it('trims leading and trailing separators', () => {
    expect(generateSlug('  --Hello World--  ')).toMatch(/^hello-world-[a-z0-9]{6}$/);
  });

  it('caps the base at 40 characters', () => {
    const slug = generateSlug('a'.repeat(500));
    expect(slug).toMatch(/^a{40}-[a-z0-9]{6}$/);
  });

  it('handles a long hyphen-heavy input quickly (no regex backtracking)', () => {
    const evil = '-'.repeat(100_000) + 'x' + '- '.repeat(100_000) + '!';
    const start = Date.now();
    const slug = generateSlug(evil);
    expect(Date.now() - start).toBeLessThan(200);
    expect(slug).toMatch(/^org-[a-z0-9]{6}$/);
    expect(generateSlug('x' + '-'.repeat(100_000) + 'y')).toMatch(/^x-[a-z0-9]{6}$/);
  });
});
