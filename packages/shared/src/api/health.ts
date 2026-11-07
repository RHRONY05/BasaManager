import { z } from 'zod';
import { appEnvSchema, dataEnvelope } from './common';

/**
 * `GET /api/health` — liveness. Probe endpoint: bare body, no `{data}` envelope.
 * `release` is the git SHA the image was built from (`SENTRY_RELEASE`), `"dev"` locally.
 */
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    release: z.string(),
  })
  .meta({ id: 'HealthResponse' });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /api/ready` — readiness. Probe endpoint: bare body, no `{data}` envelope.
 * 200 with `status: 'ready'` when DB and Redis both answer within 1 s; otherwise 503 with the same
 * shape, `status: 'not_ready'` and the failing check(s) `false` (not an error body).
 */
export const readyResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z.object({
      db: z.boolean(),
      redis: z.boolean(),
    }),
  })
  .meta({ id: 'ReadyResponse' });
export type ReadyResponse = z.infer<typeof readyResponseSchema>;

/**
 * `GET /api/public-config` — what the web app needs at startup (no build-time secrets).
 * Values are public by design; `null` when the env var is empty.
 */
export const publicConfigSchema = z
  .object({
    appEnv: appEnvSchema,
    sentryDsn: z.string().nullable(),
    vapidPublicKey: z.string().nullable(),
  })
  .meta({ id: 'PublicConfig' });
export type PublicConfig = z.infer<typeof publicConfigSchema>;

/** Full body of `GET /api/public-config`: `{ data: PublicConfig }` (an app route, so enveloped). */
export const publicConfigResponseSchema = dataEnvelope(publicConfigSchema);
export type PublicConfigResponse = z.infer<typeof publicConfigResponseSchema>;
