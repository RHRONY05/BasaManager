import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestId } from './requestId';

describe('requestId middleware', () => {
  const createApp = () => {
    const app = express();
    app.use(requestId);
    app.get('/test', (req, res) => {
      // Cast req to access custom id property set by middleware
      res.json({ id: (req as express.Request & { id: string }).id });
    });
    return app;
  };

  it('reuses valid incoming X-Request-Id header', async () => {
    const app = createApp();
    const validId = 'custom-request-id-1234';

    const res = await request(app).get('/test').set('X-Request-Id', validId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(validId);
    expect(res.body.id).toBe(validId);
  });

  it('replaces invalid incoming X-Request-Id with a new UUID', async () => {
    const app = createApp();
    const invalidId = 'bad characters! @#$%';

    const res = await request(app).get('/test').set('X-Request-Id', invalidId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).not.toBe(invalidId);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  it('replaces oversized (>64 chars) X-Request-Id with a new UUID', async () => {
    const app = createApp();
    const longId = 'a'.repeat(65);

    const res = await request(app).get('/test').set('X-Request-Id', longId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).not.toBe(longId);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('generates a new UUID when X-Request-Id is missing', async () => {
    const app = createApp();

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });
});
