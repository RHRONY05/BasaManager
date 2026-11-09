import { randomBytes } from 'node:crypto';

/** Removes leading and trailing hyphens in linear time (no backtracking regex). */
function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start++;
  while (end > start && value[end - 1] === '-') end--;
  return value.slice(start, end);
}

/**
 * Generates a clean URL slug from a string with a random unique suffix.
 */
export function generateSlug(name: string): string {
  // Cap the input first so no later step can be slowed down by a huge string.
  const dashed = name
    .slice(0, 200)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const base = trimHyphens(dashed).slice(0, 40) || 'org';
  const suffix = randomBytes(3).toString('hex');
  return `${base}-${suffix}`;
}
