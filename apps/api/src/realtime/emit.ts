import type { Server as SocketIOServer } from 'socket.io';

let ioInstance: SocketIOServer | null = null;

export function setRealtimeServer(io: SocketIOServer | null): void {
  ioInstance = io;
}

export function getRealtimeServer(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Emits session:revoked to all connected sockets of the specified user and disconnects them.
 */
export async function emitSessionRevoked(userId: string): Promise<void> {
  if (!ioInstance) return;
  const userRoom = `user:${userId}`;
  ioInstance.in(userRoom).emit('session:revoked', {});
  await ioInstance.in(userRoom).disconnectSockets(true);
}
