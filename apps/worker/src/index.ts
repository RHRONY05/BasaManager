import pino from 'pino';
import { Redis } from 'ioredis';
// Reused from apps/api because @bm/api does not export subpaths in package.json
import { loadEnv } from '../../api/src/config/env';

async function bootstrap() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }

  const logger = pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
  redis.on('error', () => {});

  logger.info({ appEnv: env.APP_ENV }, 'worker started');

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, `Worker received ${signal}, shutting down gracefully...`);
    try {
      await redis.quit();
      logger.info('Worker shutdown complete.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal worker bootstrap error: ${msg}\n`);
  process.exit(1);
});
