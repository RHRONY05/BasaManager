import { z } from 'zod';
import { appEnvSchema } from '@bm/shared/api/common';

/** Helper to convert empty string to undefined for optional environment variables */
const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val);

/**
 * Coerces environment variable string values ('true'/'false'/'1'/'0') or booleans to boolean.
 * Defaults to defaultValue if undefined or empty string.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((val) => {
    if (val === undefined || val === '') return defaultValue;
    if (val === true || val === 'true' || val === '1') return true;
    if (val === false || val === 'false' || val === '0') return false;
    return val;
  }, z.boolean());

/** Optional string schema that converts empty strings to undefined */
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

/**
 * Zod schema for every variable in 02-ARCHITECTURE.md (.env.example).
 * Core variables are required in V1; others are optional until subsequent tasks.
 */
export const envSchema = z
  .object({
    // ── Core (required in V1) ────────────────────────────────────────────────
    NODE_ENV: z
      .preprocess(emptyToUndefined, z.enum(['development', 'test', 'production']))
      .default('development'),
    APP_ENV: appEnvSchema,
    APP_URL: z.string().url('APP_URL must be a valid URL'),
    PORT: z.preprocess(
      (val) => (val === undefined || val === '' ? 4000 : val),
      z.coerce.number().int().min(1).max(65535)
    ),
    LOG_LEVEL: z
      .preprocess(
        emptyToUndefined,
        z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      )
      .default('info'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    // ── Database (optional in V1) ─────────────────────────────────────────────
    DATABASE_OWNER_URL: optionalString,
    DATABASE_WORKER_URL: optionalString,

    // ── Auth (optional in V1) ─────────────────────────────────────────────────
    JWT_SECRET: optionalString,
    JWT_ACCESS_TTL_SECONDS: z.preprocess(
      (val) => (val === undefined || val === '' ? 900 : val),
      z.coerce.number().int().positive().optional()
    ),
    REFRESH_TTL_DAYS: z.preprocess(
      (val) => (val === undefined || val === '' ? 30 : val),
      z.coerce.number().int().positive().optional()
    ),
    COOKIE_SECURE: booleanFromEnv(false),
    GOOGLE_OAUTH_CLIENT_ID: optionalString,
    GOOGLE_OAUTH_CLIENT_SECRET: optionalString,

    // ── File storage (optional in V1) ─────────────────────────────────────────
    STORAGE_DRIVER: z
      .preprocess(emptyToUndefined, z.enum(['local', 'cloudinary']))
      .default('local'),
    STORAGE_LOCAL_DIR: optionalString,
    STORAGE_URL_SECRET: optionalString,
    STORAGE_FOLDER: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,

    // ── Backups (VM + CI only) ───────────────────────────────────────────────
    AZURE_BACKUP_ACCOUNT: optionalString,
    AZURE_BACKUP_SAS: optionalString,

    // ── Email (optional in V1) ────────────────────────────────────────────────
    SMTP_URL: optionalString,
    MAIL_FROM: optionalString,

    // ── Web push (optional in V1) ─────────────────────────────────────────────
    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString,

    // ── Payments (optional in V1) ─────────────────────────────────────────────
    SSLCOMMERZ_STORE_ID: optionalString,
    SSLCOMMERZ_STORE_PASSWORD: optionalString,
    SSLCOMMERZ_SANDBOX: booleanFromEnv(true),
    PAYMENTS_MOCK: booleanFromEnv(false),

    // ── Observability (optional in V1) ────────────────────────────────────────
    SENTRY_DSN_API: optionalString,
    SENTRY_DSN_WORKER: optionalString,
    SENTRY_DSN_WEB: optionalString,
    SENTRY_AUTH_TOKEN: optionalString,
    SENTRY_RELEASE: optionalString,

    // ── Seed & test only ─────────────────────────────────────────────────────
    SEED_PASSWORD: optionalString,
    E2E_PASSWORD: optionalString,
    CLOCK_OVERRIDE: optionalString,
  })
  // Cross-field rules (refine)
  .refine((data) => data.SSLCOMMERZ_SANDBOX === true, {
    message: 'SSLCOMMERZ_SANDBOX must be true',
    path: ['SSLCOMMERZ_SANDBOX'],
  })
  .refine(
    (data) =>
      !(
        data.PAYMENTS_MOCK === true &&
        (data.APP_ENV === 'staging' || data.APP_ENV === 'prod')
      ),
    {
      message: 'PAYMENTS_MOCK=true is not allowed when APP_ENV is staging or prod',
      path: ['PAYMENTS_MOCK'],
    }
  )
  .refine(
    (data) =>
      !(
        data.CLOCK_OVERRIDE &&
        data.CLOCK_OVERRIDE.trim() !== '' &&
        data.APP_ENV !== 'dev' &&
        data.APP_ENV !== 'test'
      ),
    {
      message: 'CLOCK_OVERRIDE is not allowed unless APP_ENV is dev or test',
      path: ['CLOCK_OVERRIDE'],
    }
  )
  .refine(
    (data) =>
      !(
        (data.APP_ENV === 'staging' || data.APP_ENV === 'prod') &&
        data.COOKIE_SECURE !== true
      ),
    {
      message: 'COOKIE_SECURE must be true when APP_ENV is staging or prod',
      path: ['COOKIE_SECURE'],
    }
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Pure function that validates environment variables from the given source.
 * Throws a human-readable error listing every invalid or missing key.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const errorMessages = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return ` - ${path ? path : 'env'}: ${issue.message}`;
    });
    throw new Error(
      `[CONFIG ERROR] Invalid environment configuration:\n${errorMessages.join('\n')}`
    );
  }
  return result.data;
}

let cachedEnv: Env | undefined;

function getParsedEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv(process.env);
  }
  return cachedEnv;
}

/**
 * Lazy proxy parsed once on first property access by server.ts/worker.
 * Prevents throwing when env.ts is imported in test suites that provide mock configs.
 */
// Cast empty object to Env for proxy target definition
export const env: Env = new Proxy({} as Env, {
  get(_target, prop, receiver) {
    return Reflect.get(getParsedEnv(), prop, receiver);
  },
  ownKeys() {
    return Reflect.ownKeys(getParsedEnv());
  },
  getOwnPropertyDescriptor(_target, prop) {
    return Reflect.getOwnPropertyDescriptor(getParsedEnv(), prop);
  },
});
