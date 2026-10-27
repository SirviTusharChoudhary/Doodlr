import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { APP_NAME } from '@doodlr/shared';

import { registerRoomHandlers } from './handlers/room.handler.js';

let io = null;

export function initSocketServer(httpServer) {
  const isDev = process.env.NODE_ENV !== 'production';

  // H-03: Build CORS allowlist from configured origin only.
  // Localhost origins are added exclusively in development; production uses the configured origin only.
  const allowedOrigins = [env.CLIENT_ORIGIN];
  if (isDev) {
    allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    maxHttpBufferSize: 256 * 1024
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, `${APP_NAME} client connected`);

    socket.emit('server:ready', {
      app: APP_NAME,
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });

    // Register room & lobby handlers
    registerRoomHandlers(io, socket);
  });

  logger.info('Socket.IO server initialized successfully');
  return io;
}

export function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }
  return io;
}
