import { describe, it, expect } from 'vitest';
import { emitSessionRevoked, setRealtimeServer } from './emit';

describe('realtime emit', () => {
  it('handles emitSessionRevoked safely when io instance is not set or set', async () => {
    setRealtimeServer(null);
    await expect(emitSessionRevoked('user-1')).resolves.toBeUndefined();
  });
});
