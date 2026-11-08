import { z } from 'zod';
import { uuidSchema } from './api/common';

/**
 * Id helpers. Every primary key is a Postgres `uuid` (v4 from `gen_random_uuid()`, 03-DATABASE.md
 * "Conventions"); `uuidSchema` / `idParam` live in `api/common.ts`.
 */

/** True for a string `uuidSchema` accepts. */
export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}

/** A list of distinct ids, at most `max` (e.g. `photoFileIds` ≤ 3, caretaker `buildingIds`). */
export function uuidListSchema(max: number) {
  return z
    .array(uuidSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Ids must be unique' });
}

/**
 * A new v4 id, for the rare case the id is needed before the insert (e.g. a new organisation: its id must be
 * the transaction's `app.org_id` for the `org_self` policy to accept the row). Uses Web Crypto (browser + Node).
 */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
