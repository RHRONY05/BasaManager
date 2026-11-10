import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Logger } from 'pino';
import type { Redis } from 'ioredis';
import type { Db } from './config/db';
import type { Env } from './config/env';
import { requestId } from './middleware/requestId';
import { createHttpLogger } from './middleware/logger';
import { createCsrfMiddleware } from './middleware/csrf';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { createHealthRoutes } from './modules/health/health.routes';
import { createAuthRoutes } from './modules/auth/auth.routes';
import { createUsersRoutes } from './modules/users/users.routes';
import { createInvitesRoutes } from './modules/invites/invites.routes';
import { createOrgsRoutes } from './modules/orgs/orgs.routes';
import { createBuildingsRoutes, createUnitsRoutes } from './modules/buildings/buildings.routes';
import { createLeasesRoutes, createTenantsRoutes } from './modules/leases/leases.routes';
import {
  createBillsRoutes,
  createBillingRunRoutes,
  createReadingsRoutes,
  createDuesRoutes,
} from './modules/billing/billing.routes';

export interface AppDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
  logger: Logger;
}

/**
 * Creates the configured Express application following 02-ARCHITECTURE.md request lifecycle.
 */
export function createApp(deps: AppDeps): Express {
  const app = express();

  // Basic security and proxy configuration
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // 1. Request ID (sets X-Request-Id header and req.id)
  app.use(requestId);

  // 2. HTTP logger (pino-http with redactions, skips /api/health)
  app.use(createHttpLogger(deps.logger));

  // 3. Security headers (helmet)
  app.use(helmet());

  // 4. JSON body parsing (100kb limit)
  app.use(express.json({ limit: '100kb' }));

  // 5. Cookie parsing
  app.use(cookieParser());

  // 6. CSRF protection on unsafe methods
  app.use(createCsrfMiddleware(deps.env));

  // 7. Routes mounted under /api
  app.use(
    '/api',
    createHealthRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/auth',
    createAuthRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/me',
    createUsersRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/invites',
    createInvitesRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/org',
    createOrgsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/buildings',
    createBuildingsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/units',
    createUnitsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/leases',
    createLeasesRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/tenants',
    createTenantsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/bills',
    createBillsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/billing',
    createBillingRunRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/readings',
    createReadingsRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );
  app.use(
    '/api/dues',
    createDuesRoutes({
      env: deps.env,
      prisma: deps.prisma,
      redis: deps.redis,
    }),
  );

  // 8. Not Found handler for unmatched routes
  app.use(notFound);

  // 9. Error handler (ApiError, ZodError, 500)
  app.use(errorHandler);

  return app;
}
