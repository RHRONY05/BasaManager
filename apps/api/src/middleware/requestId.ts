import type { Request, Response, NextFunction } from 'express';
import { newRequestId } from '../lib/ids';

const REQUEST_ID_REGEX = /^[A-Za-z0-9-]+$/;
const MAX_REQUEST_ID_LENGTH = 64;

/**
 * Middleware that reuses a valid incoming X-Request-Id header (≤ 64 chars, [A-Za-z0-9-]),
 * or generates a new UUID. Sets the response header and attaches the id to req.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incomingHeader = req.headers['x-request-id'];
  let id: string | undefined;

  if (typeof incomingHeader === 'string') {
    const trimmed = incomingHeader.trim();
    if (
      trimmed.length > 0 &&
      trimmed.length <= MAX_REQUEST_ID_LENGTH &&
      REQUEST_ID_REGEX.test(trimmed)
    ) {
      id = trimmed;
    }
  }

  if (!id) {
    id = newRequestId();
  }

  // Type assertion required because Express Request type definition does not declare id by default
  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-Id', id);

  next();
}
