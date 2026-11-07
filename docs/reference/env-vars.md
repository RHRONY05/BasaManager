# Environment variables

Every variable the API understands, from the Zod schema in `apps/api/src/config/env.ts`. The worker reads the
same schema (`apps/worker/src/index.ts` imports `loadEnv`). Copy `.env.example` to `.env` for dev and
`.env.test.example` to `.env.test` for tests; neither real file is ever committed.

`loadEnv()` validates the whole environment at start-up. If anything is wrong it prints one readable list
(`[CONFIG ERROR] Invalid environment configuration:` followed by one line per bad key) and the process exits
with code 1 before opening a port. See [Environments & config](/concepts/environments).

## Required today

| Variable       | Meaning                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `APP_ENV`      | `dev`, `test`, `staging` or `prod`. Drives behaviour (the guard rules below).                    |
| `APP_URL`      | Public URL of the web app. Must be a valid URL.                                                  |
| `DATABASE_URL` | Postgres connection for the running app (role `bm_app`, which cannot bypass row-level security). |
| `REDIS_URL`    | Redis connection (rate limits, locks, sockets later).                                            |

## Core, with defaults

| Variable    | Default       | Meaning                                                                                   |
| ----------- | ------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`  | `development` | `development`, `test` or `production`. Only tooling reads it; `APP_ENV` drives behaviour. |
| `PORT`      | `4000`        | API port (1 to 65535). Tests use 4100.                                                    |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`.                           |

## Optional until a later task uses them

| Group         | Variables                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | `DATABASE_OWNER_URL` (migrations only), `DATABASE_WORKER_URL` (role `bm_worker`)                                                                                                        |
| Auth          | `JWT_SECRET`, `JWT_ACCESS_TTL_SECONDS` (default 900), `REFRESH_TTL_DAYS` (default 30), `COOKIE_SECURE` (default false), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`          |
| Files         | `STORAGE_DRIVER` (`local` default or `cloudinary`), `STORAGE_LOCAL_DIR`, `STORAGE_URL_SECRET`, `STORAGE_FOLDER`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Backups       | `AZURE_BACKUP_ACCOUNT`, `AZURE_BACKUP_SAS` (VM and CI only)                                                                                                                             |
| Email         | `SMTP_URL`, `MAIL_FROM`                                                                                                                                                                 |
| Web push      | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`                                                                                                                                |
| Payments      | `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `SSLCOMMERZ_SANDBOX` (default true), `PAYMENTS_MOCK` (default false)                                                                |
| Observability | `SENTRY_DSN_API`, `SENTRY_DSN_WORKER`, `SENTRY_DSN_WEB`, `SENTRY_AUTH_TOKEN`, `SENTRY_RELEASE`                                                                                          |
| Seed and test | `SEED_PASSWORD`, `E2E_PASSWORD`, `CLOCK_OVERRIDE`                                                                                                                                       |

An empty string counts as "not set" for every optional variable (`emptyToUndefined` in `env.ts`), so
`JWT_SECRET=` in a `.env` file behaves like leaving the line out. Booleans accept `true`/`false`/`1`/`0`.

`SENTRY_RELEASE` is the git SHA of the build. `GET /api/health` returns it as `release`, falling back to
`"dev"` when it is empty.

## Guard rules (the `.refine` checks)

These make unsafe combinations impossible to start, instead of something to remember:

| Rule                                                                  | Why                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| `SSLCOMMERZ_SANDBOX` must be `true` in every environment              | The project only ever talks to the sandbox gateway.       |
| `PAYMENTS_MOCK=true` is refused when `APP_ENV` is `staging` or `prod` | A fake gateway must never run where real people pay.      |
| `CLOCK_OVERRIDE` is refused unless `APP_ENV` is `dev` or `test`       | A frozen clock in production would corrupt billing dates. |
| `COOKIE_SECURE` must be `true` when `APP_ENV` is `staging` or `prod`  | Session cookies must only travel over HTTPS.              |

Each rule has a test in `apps/api/src/config/env.test.ts`.

## Public values

`GET /api/public-config` hands the web app the only configuration it needs at start-up: `appEnv`, the web
Sentry DSN and the VAPID public key. All three are public by design. Everything else stays on the server.
