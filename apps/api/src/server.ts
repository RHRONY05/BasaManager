import { loadEnv } from './config/env';
import { createPrisma, pingDb } from './config/db';
import { createRedis, pingRedis } from './config/redis';
import { createLogger } from './lib/logger';
import { createApp } from './app';
import { initSentry } from './config/sentry';

async function bootstrap() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const logger = createLogger({ level: env.LOG_LEVEL });

  initSentry({ dsn: env.SENTRY_DSN_API, release: env.SENTRY_RELEASE, environment: env.APP_ENV });
  logger.info({ appEnv: env.APP_ENV }, 'Starting BasaManager API...');

  // Create infrastructure clients
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);

  // Fail fast: verify database and cache connection before binding port
  logger.info('Verifying database and redis connections before startup...');
  const [dbOk, redisOk] = await Promise.all([pingDb(prisma, 2000), pingRedis(redis, 2000)]);

  if (!dbOk || !redisOk) {
    if (!dbOk) {
      logger.fatal('Database is unreachable. Startup aborted.');
    }
    if (!redisOk) {
      logger.fatal('Redis is unreachable. Startup aborted.');
    }
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(1);
  }

  logger.info('Infrastructure connections verified healthy.');

  const app = createApp({ env, prisma, redis, logger });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, appEnv: env.APP_ENV }, `API server listening on port ${env.PORT}`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, `Received ${signal}, initiating graceful shutdown...`);

    // Stop accepting new HTTP requests
    server.close(async (closeErr) => {
      if (closeErr) {
        logger.error({ err: closeErr }, 'Error closing HTTP server');
      }

      try {
        await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
        logger.info('Disconnected infrastructure. Server shutdown complete.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during infrastructure disconnect');
        process.exit(1);
      }
    });

    // Close idle connections to allow fast shutdown
    server.closeIdleConnections?.();

    // 10-second timeout guard
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing exit.');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal bootstrap error: ${message}\n`);
  process.exit(1);
});
