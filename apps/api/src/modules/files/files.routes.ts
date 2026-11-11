import { Router } from 'express';
import type { Db } from '../../config/db.js';
import type { Env } from '../../config/env.js';
import type { Redis } from '../../config/redis.js';
import { createRateLimiters } from '../../middleware/rateLimit.js';
import { createRequireUser } from '../../middleware/auth.js';
import { createRequireMembership } from '../../middleware/org.js';
import { FilesService } from './files.service.js';
import { FilesController, handleFileUploadMiddleware } from './files.controller.js';

export interface FilesRouteDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
}

export function createFilesRoutes(deps: FilesRouteDeps): Router {
  const router = Router();
  const service = new FilesService(deps.prisma);
  const controller = new FilesController(service);
  const rateLimiters = createRateLimiters(deps.redis);
  const requireUser = createRequireUser(deps.prisma, deps.env);
  const requireMembership = createRequireMembership(deps.prisma);

  // Local file serving (public with HMAC signature & expiration verification)
  router.get('/local/:id', controller.serveLocal);

  // Authenticated file routes
  router.post(
    '/',
    rateLimiters.generalLimiter,
    requireUser,
    requireMembership,
    handleFileUploadMiddleware,
    controller.upload,
  );
  router.get('/:id/url', rateLimiters.generalLimiter, requireUser, requireMembership, controller.getUrl);

  return router;
}
