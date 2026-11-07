import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger, redactUrl } from './logger';

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, destination };
}

describe('createLogger redaction', () => {
  const keys = ['password', 'newPassword', 'currentPassword', 'token', 'refreshToken'];

  it.each(keys)('redacts %s at top level, one level and two levels deep', (key) => {
    const { lines, destination } = capture();
    const logger = createLogger({ level: 'info', destination });
    logger.info({ [key]: 'SECRET-TOP', a: { [key]: 'SECRET-ONE' }, b: { c: { [key]: 'SECRET-TWO' } } }, 'x');

    const out = lines.join('');
    expect(out).not.toContain('SECRET');
    expect(out).toContain('[REDACTED]');
  });

  it('redacts cookie and authorization headers', () => {
    const { lines, destination } = capture();
    const logger = createLogger({ level: 'info', destination });
    logger.info({ req: { headers: { cookie: 'sid=SECRET', authorization: 'Bearer SECRET' } } }, 'x');
    expect(lines.join('')).not.toContain('SECRET');
  });
});

describe('redactUrl', () => {
  it('replaces values of sensitive query keys only', () => {
    const out = redactUrl('/api/files/1?token=abc&sig=def&exp=123&signature=g&code=h&state=i&page=2');
    expect(out).not.toMatch(/abc|def|=g|=h|=i/);
    expect(out).toContain('page=2');
    expect(out).toContain('token=%5BREDACTED%5D');
    expect(out.startsWith('/api/files/1?')).toBe(true);
  });

  it('redacts exp as well as sig (signed-URL parameters)', () => {
    expect(redactUrl('/d?exp=1700000000&sig=zzz')).not.toMatch(/1700000000|zzz/);
  });

  it('leaves urls without a query untouched', () => {
    expect(redactUrl('/api/health')).toBe('/api/health');
    expect(redactUrl(undefined)).toBe('');
  });
});
