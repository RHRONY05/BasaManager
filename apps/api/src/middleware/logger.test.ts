import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createLogger } from '../lib/logger';
import { createHttpLogger } from './logger';

function buildApp() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const app = express();
  app.use(createHttpLogger(createLogger({ level: 'info', destination })));
  app.get('/api/{*rest}', (_req, res) => {
    res.json({ ok: true });
  });
  return { app, lines };
}

describe('createHttpLogger', () => {
  it('never logs sensitive query values or the raw query object', async () => {
    const { app, lines } = buildApp();
    await request(app).get('/api/things?token=TOK123&sig=SIG456&exp=999&code=COD789&state=STA000&page=2');
    const out = lines.join('');
    expect(out).toContain('/api/things');
    expect(out).not.toMatch(/TOK123|SIG456|COD789|STA000|"exp":|=999/);
    expect(out).toContain('page=2');
    expect(out).not.toContain('"query"');
  });

  it.each(['/api/health', '/api/ready'])('skips request logging for %s', async (path) => {
    const { app, lines } = buildApp();
    await request(app).get(path);
    expect(lines).toHaveLength(0);
  });

  it('logs ordinary requests', async () => {
    const { app, lines } = buildApp();
    await request(app).get('/api/things');
    expect(lines).toHaveLength(1);
  });
});
