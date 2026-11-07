import type { z } from 'zod';
import { errorBodySchema, type ErrorCode, type ErrorDetail } from '@bm/shared';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'INTERNAL';
  readonly requestId: string;
  readonly details?: ErrorDetail[];

  constructor(
    status: number,
    code: ErrorCode | 'INTERNAL',
    message: string,
    requestId: string,
    details?: ErrorDetail[]
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export interface ApiFetchOptions<T> {
  schema?: z.ZodType<T>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions<T> = {}
): Promise<T> {
  const { schema, method = 'GET', body, signal, headers = {} } = options;

  const init: RequestInit = {
    method,
    signal,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(path, init);

  if (!response.ok) {
    let code: ErrorCode | 'INTERNAL' = 'INTERNAL';
    let message = response.statusText || 'An error occurred';
    let requestId = 'unknown';
    let details: ErrorDetail[] | undefined;

    try {
      const json = await response.json();
      const parsed = errorBodySchema.safeParse(json);
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
        requestId = parsed.data.error.requestId;
        details = parsed.data.error.details;
      }
    } catch {
      // Non-JSON error body fallback
    }

    throw new ApiRequestError(response.status, code, message, requestId, details);
  }

  const json = await response.json();
  const rawData =
    json && typeof json === 'object' && 'data' in json ? json.data : json;

  if (schema) {
    return schema.parse(rawData);
  }

  return rawData as T;
}
