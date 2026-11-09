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
