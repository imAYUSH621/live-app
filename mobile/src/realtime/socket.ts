import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/client';
import { getSecureToken } from '../utils/secureStorage';

let socketInstance: Socket | null = null;
let currentToken: string | null = null;

export async function getSocket(): Promise<Socket> {
  const token = await getSecureToken();

  if (socketInstance && currentToken === token && socketInstance.connected) {
    return socketInstance;
  }

  if (socketInstance && currentToken !== token) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  if (!socketInstance) {
    currentToken = token;
    socketInstance = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      autoConnect: true,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected successfully:', socketInstance?.id);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    currentToken = null;
  }
}

