import { describe, it, expect, vi, beforeEach } from 'vitest';
import type http from 'node:http';

type Next = (e?: Error) => void;
const state = vi.hoisted(() => ({
  middleware: null as null | ((s: unknown, n: Next) => Promise<void>),
  onConn: null as null | ((s: unknown) => void),
  close: vi.fn((cb: () => void) => cb()),
  adapter: vi.fn(),
  verify: vi.fn(),
  setServer: vi.fn(),
}));

vi.mock('socket.io', () => ({
  Server: vi.fn().mockImplementation(function () {
    return {
      adapter: state.adapter,
      use: (fn: (s: unknown, n: Next) => Promise<void>) => {
        state.middleware = fn;
      },
      on: (_e: string, fn: (s: unknown) => void) => {
        state.onConn = fn;
      },
      close: state.close,
    };
  }),
}));
vi.mock('@socket.io/redis-adapter', () => ({ createAdapter: vi.fn().mockReturnValue('adapter') }));
vi.mock('../lib/tokens', () => ({ verifyAccessToken: state.verify }));
vi.mock('./emit', () => ({ setRealtimeServer: state.setServer }));

import { attachRealtime } from './io';

const quit = vi.fn().mockResolvedValue('OK');
const mockSessionFindUnique = vi.fn().mockResolvedValue({ id: 's1', revokedAt: null });
const deps = {
  env: { APP_URL: 'http://x', JWT_SECRET: 's' },
  redis: { duplicate: vi.fn().mockReturnValue({ quit }) },
  prisma: {
    session: {
      findUnique: mockSessionFindUnique,
    },
  },
} as never;

const sock = (cookie?: string) => ({ handshake: { headers: { cookie } }, data: {}, join: vi.fn() });

describe('attachRealtime', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when cookie is missing', async () => {
    await attachRealtime({} as http.Server, deps);
    const next = vi.fn();
    await state.middleware!(sock(), next);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('rejects an invalid token', async () => {
    await attachRealtime({} as http.Server, deps);
    state.verify.mockResolvedValue(null);
    const next = vi.fn();
    await state.middleware!(sock('bm_at=abc'), next);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('rejects a revoked session', async () => {
    await attachRealtime({} as http.Server, deps);
    state.verify.mockResolvedValue({ sub: 'u1', sid: 's1' });
    mockSessionFindUnique.mockResolvedValueOnce({ id: 's1', revokedAt: new Date() });
    const next = vi.fn();
    await state.middleware!(sock('bm_at=abc'), next);
    expect(next.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0]![0].message).toBe('Session revoked');
  });

  it('accepts a valid token, stores identity and joins the user room', async () => {
    await attachRealtime({} as http.Server, deps);
    state.verify.mockResolvedValue({ sub: 'u1', sid: 's1' });
    const s = sock('a=1; bm_at=tok%20en');
    const next = vi.fn();
    await state.middleware!(s, next);
    expect(next).toHaveBeenCalledWith();
    expect(s.data).toEqual({ userId: 'u1', sessionId: 's1' });
    state.onConn!(s);
    expect(s.join).toHaveBeenCalledWith('user:u1');
    const anon = { data: {}, join: vi.fn() };
    state.onConn!(anon);
    expect(anon.join).not.toHaveBeenCalled();
  });

  it('wraps thrown Error and non-Error failures', async () => {
    await attachRealtime({} as http.Server, deps);
    const next = vi.fn();
    state.verify.mockRejectedValueOnce(new Error('e'));
    await state.middleware!(sock('bm_at=t'), next);
    state.verify.mockRejectedValueOnce('str');
    await state.middleware!(sock('bm_at=t'), next);
    expect(next.mock.calls[0]![0].message).toBe('e');
    expect(next.mock.calls[1]![0].message).toBe('str');
  });

  it('close tears down server and redis clients', async () => {
    const { close } = await attachRealtime({} as http.Server, deps);
    await close();
    expect(state.setServer).toHaveBeenLastCalledWith(null);
    expect(state.close).toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(2);
  });
});
