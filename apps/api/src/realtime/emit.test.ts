import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'socket.io';
import {
  emitSessionRevoked,
  updateCaretakerBuildingRooms,
  getRealtimeServer,
  setRealtimeServer,
} from './emit';

afterEach(() => setRealtimeServer(null));

describe('realtime emit', () => {
  it('is a no-op without a server', async () => {
    expect(getRealtimeServer()).toBeNull();
    await expect(emitSessionRevoked('u1')).resolves.toBeUndefined();
    await expect(updateCaretakerBuildingRooms('u1', ['b1'], ['b1', 'b2'])).resolves.toBeUndefined();
  });

  it('emits session:revoked and disconnects the user room', async () => {
    const emit = vi.fn();
    const disconnectSockets = vi.fn().mockResolvedValue(undefined);
    const io = { in: vi.fn().mockReturnValue({ emit, disconnectSockets }) } as unknown as Server;
    setRealtimeServer(io);
    expect(getRealtimeServer()).toBe(io);
    await emitSessionRevoked('u1');
    expect(io.in).toHaveBeenCalledWith('user:u1');
    expect(emit).toHaveBeenCalledWith('session:revoked', {});
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it('joins and leaves building rooms for caretaker user sockets', async () => {
    const socketsLeave = vi.fn().mockResolvedValue(undefined);
    const socketsJoin = vi.fn().mockResolvedValue(undefined);
    const io = { in: vi.fn().mockReturnValue({ socketsLeave, socketsJoin }) } as unknown as Server;
    setRealtimeServer(io);

    await updateCaretakerBuildingRooms('u1', ['b2'], ['b1', 'b2', 'b3']);
    expect(io.in).toHaveBeenCalledWith('user:u1');
    expect(socketsLeave).toHaveBeenCalledWith(['building:b1', 'building:b3']);
    expect(socketsJoin).toHaveBeenCalledWith(['building:b2']);
  });
});
