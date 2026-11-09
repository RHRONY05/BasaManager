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

/**
 * Re-joins or leaves building rooms for all open sockets of a caretaker user.
 */
export async function updateCaretakerBuildingRooms(
  userId: string,
  newBuildingIds: string[],
  allOrgBuildingIds: string[],
): Promise<void> {
  if (!ioInstance) return;
  const userRoom = `user:${userId}`;
  const leaveRooms = allOrgBuildingIds
    .filter((id) => !newBuildingIds.includes(id))
    .map((id) => `building:${id}`);
  const joinRooms = newBuildingIds.map((id) => `building:${id}`);

  if (leaveRooms.length > 0) {
    await ioInstance.in(userRoom).socketsLeave(leaveRooms);
  }
  if (joinRooms.length > 0) {
    await ioInstance.in(userRoom).socketsJoin(joinRooms);
  }
}
