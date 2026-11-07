import { loadEnv } from '@bm/api/config/env';
import { createRedis } from '@bm/api/config/redis';
import { createLogger } from '@bm/api/lib/logger';
import { initSentry, captureError, flushSentry } from '@bm/api/config/sentry';
import { startWorker } from './boot';

async function bootstrap() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  }

  initSentry({ dsn: env.SENTRY_DSN_WORKER, release: env.SENTRY_RELEASE, environment: env.APP_ENV });
  const logger = createLogger({ level: env.LOG_LEVEL });

  // TEMPORARY (V3): one test error to prove Sentry works; removed right after verification.
  if (process.env['SENTRY_TEST_ERROR'] === '1') {
    captureError(new Error('BasaManager worker Sentry test error (V3)'));
    await flushSentry();
  }
  const redis = createRedis(env.REDIS_URL);

  const worker = await startWorker({ env, logger, redis, exit: (code) => process.exit(code) });
  if (!worker) return;

  // Graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, `Worker received ${signal}, shutting down gracefully...`);
    try {
      await worker.shutdown();
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
