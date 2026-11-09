import { randomBytes } from 'node:crypto';

/**
 * Generates a clean URL slug from a string with a random unique suffix.
 */
export function generateSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org';
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}
