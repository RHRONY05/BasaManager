import type http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Db } from '../config/db';
import type { Env } from '../config/env';
import type { Redis } from '../config/redis';
import type { Logger } from 'pino';
import { verifyAccessToken } from '../lib/tokens';
import { COOKIE_ACCESS_NAME } from '../lib/cookies';
import { setRealtimeServer } from './emit';

export interface RealtimeDeps {
  env: Env;
  prisma: Db;
  redis: Redis;
  logger: Logger;
}

function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

/**
 * Attaches Socket.io to an HTTP server with Redis adapter and handshake auth.
 */
export async function attachRealtime(server: http.Server, deps: RealtimeDeps) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: deps.env.APP_URL,
      credentials: true,
    },
  });

  const pubClient = deps.redis.duplicate();
  const subClient = deps.redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Handshake authentication reading bm_at cookie
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const token = parseCookie(cookieHeader, COOKIE_ACCESS_NAME);

      if (!token) {
        return next(new Error('Authentication cookie missing'));
      }

      const payload = await verifyAccessToken(token, deps.env.JWT_SECRET);
      if (!payload) {
        return next(new Error('Invalid or expired authentication token'));
      }

      if (deps.prisma?.session) {
        const session = await deps.prisma.session.findUnique({
          where: { id: payload.sid },
        });

        if (!session || session.revokedAt !== null) {
          return next(new Error('Session revoked'));
        }
      }

      socket.data.userId = payload.sub;
      socket.data.sessionId = payload.sid;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error(String(err)));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  setRealtimeServer(io);

  return {
    io,
    close: async () => {
      setRealtimeServer(null);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    },
  };
}
