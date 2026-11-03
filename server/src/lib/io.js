// Holds the Socket.io server so routes/services can emit events.
let io = null;

export const setIO = (server) => { io = server; };
export const getIO = () => io;

export const toUser = (userId, event, data) => io?.to(`u:${userId}`).emit(event, data);
export const toRoom = (roomId, event, data) => io?.to(`r:${roomId}`).emit(event, data);
export const toAll = (event, data) => io?.emit(event, data);
export const toAdmins = (event, data) => io?.to('admins').emit(event, data);
export const toFamily = (familyId, event, data) => io?.to(`f:${familyId}`).emit(event, data);
