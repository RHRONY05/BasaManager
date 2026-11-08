import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { ApiError } from '../lib/ApiError';
import { requestId } from './requestId';
import { errorHandler } from './errorHandler';
import { ErrorCode } from '@bm/shared/errors';

describe('errorHandler middleware', () => {
  const createTestApp = () => {
    const app = express();
    app.use(requestId);

    app.get('/api-error', () => {
      throw ApiError.notFound('Item missing');
    });

    app.get('/zod-error', () => {
      const schema = z.object({
        name: z.string().min(3),
        age: z.number().int(),
      });
      schema.parse({ name: 'ab' });
    });

    app.get('/unknown-error', () => {
      throw new Error('Secret database crashed unexpectedly');
    });

    app.get('/items/:id', (_req, res) => {
      res.json({ ok: true });
    });

    app.get('/client-status', () => {
      throw Object.assign(new Error('verify says <script>'), { status: 403, type: 'entity.verify.failed' });
    });

    app.get('/client-status-code', () => {
      throw Object.assign(new Error('too many headers'), { statusCode: 431 });
    });

    app.get('/server-status', () => {
      throw Object.assign(new Error('upstream broke'), { status: 502 });
    });

    app.use(express.json({ limit: '100kb' }));
    app.post('/echo', (_req, res) => {
      res.json({ ok: true });
    });

    app.use(errorHandler);
    return app;
  };

  it('formats ApiError into shared error shape with status and requestId', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api-error');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: 'Item missing',
        requestId: expect.any(String),
      },
    });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('formats ZodError into VALIDATION_FAILED with details and status 400', async () => {
    const app = createTestApp();
    const res = await request(app).get('/zod-error');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.message).toBe('Validation failed');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.error.details).toBeInstanceOf(Array);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('formats unknown error into 500 INTERNAL with NO stack trace in response body', async () => {
    const app = createTestApp();
    const res = await request(app).get('/unknown-error');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: ErrorCode.INTERNAL,
        message: 'Something went wrong',
        requestId: expect.any(String),
      },
    });

    // Ensure stack trace and internal error message are never leaked
    expect(res.body.error.stack).toBeUndefined();
    expect(res.text).not.toContain('Secret database crashed unexpectedly');
    expect(res.text).not.toContain('at createTestApp');
  });
  it('maps malformed JSON bodies to 400 VALIDATION_FAILED', async () => {
    const res = await request(createTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.message).toBe('Request body is not valid JSON');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('maps bodies over the limit to 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(createTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(101 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe(ErrorCode.PAYLOAD_TOO_LARGE);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('maps a malformed percent-encoded path (URIError, 400) to 400 VALIDATION_FAILED', async () => {
    const res = await request(createTestApp()).get('/items/%E0%A4%A');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('maps an unsupported charset (415) to 400 VALIDATION_FAILED', async () => {
    const res = await request(createTestApp())
      .post('/echo')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it.each(['/client-status', '/client-status-code'])(
    'maps any error with a numeric 4xx status (%s) to 400 without echoing its message',
    async (path) => {
      const res = await request(createTestApp()).get(path);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.body.error.message).toBe('Request could not be processed');
      expect(res.text).not.toContain('script');
    },
  );

  it('keeps errors with a 5xx status as 500 INTERNAL', async () => {
    const res = await request(createTestApp()).get('/server-status');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe(ErrorCode.INTERNAL);
  });
});
