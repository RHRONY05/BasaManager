---
name: backend-standards
description: Enforces industry-standard production backend architecture and provides a one-shot 5-pillar foundation scaffolding workflow (typed env config, fail-fast DB & Redis startup, Pino structured logging, ApiError/ApiResponse classes, asyncHandler, and modular testing).
---

## BasaManager override (read first — wins over everything below)
- Validate env with **Zod** in `apps/api/src/config/env.ts` (not hand-written getEnvOrThrow).
- Tests run against migrations: a fresh database per run + `prisma migrate deploy` (`apps/api/test/global-setup.ts`, 09-TESTING). Never `prisma migrate reset`/`dev`. **Never `prisma db push`**: it skips the SQL migrations that create roles and RLS, so tests would pass on a database unlike prod.
- **Redact** cookies, auth headers, passwords, tokens, file URLs. Do **not** capture response bodies for `/api/auth/*`, `/api/files/*`, `/api/payments/sslcommerz/*`.
- Error responses use the shared format in `.agent/04-API.md`; **no stack traces** outside dev/test.
- Express 5 forwards rejected promises to the error handler, so skip `asyncHandler`.
- Add **graceful shutdown** (SIGTERM/SIGINT: stop accepting, drain requests, close sockets, Prisma, Redis; exit within 25 s).
- Drop `@types/pino-http` / `@types/ioredis` (types ship with the packages). pnpm, not npm.


# Production Backend Architecture Standards

When starting or reviewing any backend codebase, you MUST enforce and follow these industry-grade architectural standards.

---

## ⚡ The One-Shot 5-Pillar Foundation (The "!" of Backend)

When instructed to **"set up the backend"**, **"initialize backend architecture"**, or **"apply backend standards"**, do NOT split basic setup across multiple slow sessions. **Scaffold the complete 5-pillar foundation in one clean shot**:

```text
backend/
├── .env.example
├── src/
│   ├── config/
│   │   ├── env.ts          # Pillar 1: Validated, strongly-typed environment config
│   │   ├── db.ts           # Pillar 2: Database connection pool + checkDatabaseConnection()
│   │   └── redis.ts        # Pillar 2: Redis client + checkRedisConnection()
│   ├── utils/
│   │   ├── logger.ts       # Pillar 3: Pino structured logger (pino-pretty in dev, JSON in prod)
│   │   ├── ApiResponse.ts  # Pillar 4: Uniform JSON success envelope { statusCode, data, message, success }
│   │   ├── ApiError.ts     # Pillar 4: Uniform JSON error envelope { statusCode, message, errors, stack }
│   │   └── asyncHandler.ts # Pillar 4: Express async route wrapper (eliminates try/catch boilerplate)
│   ├── middlewares/
│   │   ├── loggerMiddleware.ts # Pillar 3: Intercepts request metadata & response body
│   │   └── errorHandler.ts    # Pillar 4: Global error middleware returning standardized ApiError JSON
│   ├── app.ts              # Pillar 5: Express middleware pipeline & route mounts
│   └── server.ts           # Pillar 5: Fail-Fast lifecycle startup (DB -> Redis -> app.listen)
```

### Required Dependencies to Scaffold in One Shot:
```bash
npm install express pino pino-pretty pino-http pg ioredis dotenv
npm install -D typescript tsx @types/node @types/express @types/pg @types/ioredis @types/pino-http
```

---

## 1. Fail-Fast Infrastructure Startup (Database Before Server)

**Rule:** NEVER start the Express HTTP server if infrastructure dependencies are unreachable.

Always test and verify database and cache connections *before* calling `app.listen()`. If any connection fails, log a fatal error and terminate the process with `process.exit(1)` immediately.

```typescript
// src/server.ts
import app from './app.js';
import { config } from './config/env.js';
import { checkDatabaseConnection } from './config/db.js';
import { checkRedisConnection } from './config/redis.js';
import logger from './utils/logger.js';

const startServer = async (): Promise<void> => {
  try {
    logger.info('[STARTUP] Verifying infrastructure connections before starting HTTP server...');

    // 1. Verify Database Connection First (Fail-Fast)
    await checkDatabaseConnection();

    // 2. Verify Cache / Redis Connection (Fail-Fast)
    await checkRedisConnection();

    // 3. Start HTTP Server only after all infrastructure is verified healthy
    app.listen(config.port, () => {
      logger.info(`[SERVER] Running in ${config.nodeEnv} mode on port ${config.port}`);
      logger.info(`[HEALTHCHECK] http://localhost:${config.port}/api/health`);
    });
  } catch (error) {
    logger.fatal({ err: error }, '[FATAL] Failed to connect to infrastructure. Server shutting down.');
    process.exit(1);
  }
};

startServer();
```

---

## 2. Centralized, Type-Safe Environment Configuration

**Rule:** NEVER scatter `process.env` across routes, controllers, or models.

All environment variables must be loaded and validated once at application boot in `src/config/env.ts`.

```typescript
// src/config/env.ts
import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  redisUrl: string;
}

const getEnvOrThrow = (key: string, fallback?: string): string => {
  const value = process.env[key] || fallback;
  if (!value) {
    throw new Error(`[CONFIG ERROR] Required environment variable '${key}' is missing.`);
  }
  return value;
};

export const config: Config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: (process.env.NODE_ENV as Config['nodeEnv']) || 'development',
  databaseUrl: getEnvOrThrow('DATABASE_URL'),
  redisUrl: getEnvOrThrow('REDIS_URL'),
};
```

---

## 3. Industry-Standard Logging with Pino (12-Factor App)

**Rule:** NO `console.log()` in production code. Stream structured JSON to `stdout` via **Pino**.

### Principles:
1. **Console Transport:** `pino-pretty` for colorful developer-friendly output in development.
2. **Cloud-Native Streams:** In production, stream raw structured JSON directly to `stdout`. Do NOT use `pino-roll` to write to local disk (containers are ephemeral; cloud aggregators like Better Stack, Datadog, or CloudWatch ingest `stdout`).
3. **HTTP Request & Response Body Interception:** Use `pino-http` combined with `responseBodyCapture` to log method, URL, status code, latency, and response bodies.
4. **Silent Tests by Default:** In `test` environment (`NODE_ENV === 'test'`), keep the logger silent (`pino({ level: 'silent' })`).

```typescript
// src/utils/logger.ts
import pino from 'pino';
import { config } from '../config/env.js';

const isTest = config.nodeEnv === 'test';
const isProduction = config.nodeEnv === 'production';

let logger: pino.Logger;

if (isTest && !process.env.LOG_LEVEL) {
  logger = pino({ level: 'silent' });
} else if (!isProduction) {
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  });
} else {
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export default logger;
```

---

## 4. Standardized Response & Error Handling

**Rule:** All API responses and errors MUST have a predictable, consistent JSON shape.

### `src/utils/ApiResponse.ts`
```typescript
export class ApiResponse<T = unknown> {
  public statusCode: number;
  public data: T;
  public message: string;
  public success: boolean;

  constructor(statusCode: number, data: T, message: string = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}
```

### `src/utils/ApiError.ts`
```typescript
export class ApiError extends Error {
  public statusCode: number;
  public data: null;
  public success: boolean;
  public errors: unknown[];

  constructor(
    statusCode: number,
    message: string = 'Something went wrong',
    errors: unknown[] = [],
    stack: string = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.message = message;
    this.success = false;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
```

### `src/utils/asyncHandler.ts` (Eliminate repetitive `try/catch` in controllers)
```typescript
import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: AsyncFunction): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

---

## 5. Database Integrity & Concurrency

1. **Migrations:** Schema changes MUST use migration files (`prisma migrate` or `node-pg-migrate`). Never create tables manually in a GUI without a migration file.
2. **ACID Transactions:** Any multi-step mutation (e.g. stock deduction + order creation + payment confirmation) MUST be wrapped in a database transaction (`BEGIN ... COMMIT / ROLLBACK`).
3. **Pessimistic / Row Locks:** Resources subject to race conditions (inventory, booking seats) MUST use `SELECT ... FOR UPDATE` row locks.
4. **SQL Injection Prevention:** 100% of raw queries MUST use parameterized inputs (`$1, $2`).

---

## 6. Automated Testing per Module & Database Isolation

**Rule:** Every backend module MUST have dedicated test suites (Jest/Vitest + Supertest) with strict test database isolation.

### Principles:
1. **Never Test Against Development DB:** Integration tests must target an isolated test database (e.g., `<app>_test_db`) defined in `.env.test` to prevent state corruption or wiping development seed data.
2. **Automated Schema Sync via `pretest` Hook:** Never manually sync test databases. Use npm's automatic lifecycle hooks with `dotenv-cli` so `npm test` automatically synchronizes the schema before executing test suites:
   ```json
   "scripts": {
     "pretest": "dotenv -e .env.test -- prisma db push --skip-generate",
     "test": "dotenv -e .env.test -- vitest run"
   }
   ```
3. **Test Database Creation:** The test database can be created with a direct command without adding extra files or mounting scripts:
   ```bash
   docker exec -it <postgres_container> psql -U <user> -d <dev_db> -c "CREATE DATABASE <app>_test_db;"
   ```
4. **The AAA Pattern:** Arrange, Act, Assert.
5. **Mock External 3rd-Party APIs:** Always mock OAuth/Clerk, Stripe, email delivery, and cloud storage in test suites.
6. **Test the 4 Standard Categories:**
   - Happy Path (`200 / 201`)
   - Validation Errors (`400`)
   - Security & Authentication Checks (`401 / 403`)
   - State Conflicts & Concurrency (`409`)
