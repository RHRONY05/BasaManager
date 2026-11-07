import type { RequestHandler, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { REDACT_PATHS } from '../lib/logger';
import { newRequestId } from '../lib/ids';

/**
 * Creates pino-http middleware configured for redaction, custom log levels,
 * and skipping probe health check noise. Never logs request or response bodies.
 */
export function createHttpLogger(logger: Logger): RequestHandler {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => {
      // Safe assertion to read request id set by requestId middleware
      const customReq = req as Request & { id?: string };
      const headerId = req.headers['x-request-id'];
      if (typeof customReq.id === 'string') {
        return customReq.id;
      }
      if (typeof headerId === 'string' && headerId.length > 0) {
        return headerId;
      }
      return newRequestId();
    },
    autoLogging: {
      ignore: (req) => {
        const path = req.url ? req.url.split('?')[0] : '';
        return path === '/api/health' || path === '/health';
      },
    },
    customLogLevel: (_req, res, err) => {
      if (res.statusCode >= 500 || err) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  });

  return (req: Request, res: Response, next: NextFunction) => {
    httpLogger(req, res, next);
  };
}
