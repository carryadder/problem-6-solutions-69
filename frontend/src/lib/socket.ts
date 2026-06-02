'use client';

import { io, Socket } from 'socket.io-client';
import { getAuthBootstrap } from './api';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket && socket.connected) return socket;
  const { token, backendUrl } = await getAuthBootstrap();
  if (!token) throw new Error('not_authenticated');
  if (!backendUrl) throw new Error('backend_url_not_configured');
  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }
  socket = io(backendUrl, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
