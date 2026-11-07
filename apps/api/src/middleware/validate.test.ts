import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validate, getValidated } from './validate';
import { requestId } from './requestId';
import { errorHandler } from './errorHandler';

function build() {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.post(
    '/things/:id',
    validate({
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }),
      body: z.object({ name: z.string().min(3) }),
    }),
    (req, res) => {
      res.json({
        params: getValidated(res, 'params'),
        query: getValidated(res, 'query'),
        body: getValidated(res, 'body'),
        rawQuery: req.query,
      });
    },
  );
  app.use(errorHandler);
  return app;
}

describe('validate()', () => {
  it('parses params, coerces query and stores results in res.locals.validated', async () => {
    const res = await request(build()).post('/things/42?limit=10').send({ name: 'abc' });
    expect(res.status).toBe(200);
    expect(res.body.params).toEqual({ id: '42' });
    expect(res.body.query).toEqual({ limit: 10 });
    expect(res.body.body).toEqual({ name: 'abc' });
  });

  it('never reassigns req.query (stays the raw strings)', async () => {
    const res = await request(build()).post('/things/1?limit=7').send({ name: 'abc' });
    expect(res.body.rawQuery).toEqual({ limit: '7' });
  });

  it('applies query defaults', async () => {
    const res = await request(build()).post('/things/1').send({ name: 'abc' });
    expect(res.body.query).toEqual({ limit: 25 });
  });

  it('invalid body -> 400 VALIDATION_FAILED with details path', async () => {
    const res = await request(build()).post('/things/1').send({ name: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe('name');
  });

  it('invalid query -> 400 with the query key as path', async () => {
    const res = await request(build()).post('/things/1?limit=500').send({ name: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('limit');
  });

  it('invalid params -> 400 with the param key as path', async () => {
    const res = await request(build()).post('/things/abc').send({ name: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('id');
  });
});
