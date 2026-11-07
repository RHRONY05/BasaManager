import { z } from 'zod';

/** `APP_ENV` values (02-ARCHITECTURE.md "Environments"). Drives behaviour; NODE_ENV only drives tooling. */
export const appEnvSchema = z.enum(['dev', 'test', 'staging', 'prod']).meta({ id: 'AppEnv' });
export type AppEnv = z.infer<typeof appEnvSchema>;

/** Every primary key is a Postgres `uuid` from `gen_random_uuid()` (v4). */
export const uuidSchema = z.uuid();

/** `/:id` route params. */
export const idParam = z.object({ id: uuidSchema });
export type IdParam = z.infer<typeof idParam>;

export const PAGE_LIMIT_DEFAULT = 25;
export const PAGE_LIMIT_MAX = 100;

/**
 * Cursor pagination query (`?cursor=&limit=`). `limit` arrives as a string and is coerced.
 * `cursor` is opaque to the client: send back the `page.nextCursor` you were given.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** `nextCursor` is `null` on the last page. */
export const pageSchema = z.object({ nextCursor: z.string().nullable() }).meta({ id: 'Page' });
export type Page = z.infer<typeof pageSchema>;

/** Success body of a single-item route: `{ data: T }`. */
export function dataEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: schema });
}

/** Success body of a list route: `{ data: T[], page: { nextCursor } }`. */
export function listEnvelope<T extends z.ZodType>(schema: T) {
  return z.object({ data: z.array(schema), page: pageSchema });
}

export type DataEnvelope<T> = { data: T };
export type ListEnvelope<T> = { data: T[]; page: Page };
