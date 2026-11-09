import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply, type SendCommandFn } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { ErrorCode } from '@bm/shared/errors';
import { ApiError } from '../lib/ApiError';

export interface RateLimiters {
  loginLimiter: RequestHandler;
  forgotPasswordLimiter: RequestHandler;
  resendVerificationLimiter: RequestHandler;
}

/**
 * Creates Redis-backed rate limiters for auth endpoints.
 */
export function createRateLimiters(redis: Redis): RateLimiters {
  const sendCommand = (async (...args: string[]) => {
    // ioredis accepts command name as first arg, followed by parameters
    const [command, ...rest] = args;
    return (await redis.call(command as string, ...rest)) as RedisReply;
  }) satisfies SendCommandFn;

  const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // 10 attempts per minute per IP
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand,
      prefix: 'rl:login:',
    }),
    handler: (_req, _res, next) => {
      next(new ApiError(ErrorCode.RATE_LIMITED, 'Too many login attempts. Please try again later.'));
    },
  });

  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // 10 attempts per minute per IP
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand,
      prefix: 'rl:forgot:',
    }),
    handler: (_req, _res, next) => {
      next(new ApiError(ErrorCode.RATE_LIMITED, 'Too many requests. Please try again later.'));
    },
  });

  const resendVerificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 3, // 3 attempts per hour
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req: Request) => {
      const user = (req as Request & { user?: { id: string } }).user;
      return user ? user.id : req.ip || '127.0.0.1';
    },
    store: new RedisStore({
      sendCommand,
      prefix: 'rl:resend_verify:',
    }),
    handler: (_req, _res, next) => {
      next(
        new ApiError(
          ErrorCode.RATE_LIMITED,
          'Too many verification email requests. Please wait an hour before trying again.',
        ),
      );
    },
  });

  return {
    loginLimiter,
    forgotPasswordLimiter,
    resendVerificationLimiter,
  };
}
