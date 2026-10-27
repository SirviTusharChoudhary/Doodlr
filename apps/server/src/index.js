import http from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { connectDB, disconnectDB, getDBStatus } from './config/db.js';
import { initSocketServer, getIO } from './socket/index.js';
import { roomManager } from './services/room.manager.js';
import { logger } from './utils/logger.js';
import { APP_NAME, APP_TAGLINE } from '@doodlr/shared';

const app = express();
const server = http.createServer(app);

const isDev = process.env.NODE_ENV !== 'production';

// H-03: CORS allowlist — localhost only in development
const allowedOrigins = [env.CLIENT_ORIGIN];
if (isDev) {
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}

// Security & Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(express.json());

// Health Check Endpoints
// H-11: Return truthful degraded status (503) when DB persistence is unavailable
const healthHandler = (req, res) => {
  const dbStatus = getDBStatus();
  const dbConnected = dbStatus?.isConnected === true;

  // Liveness stays 200 so the game can run without MongoDB. Persistence
  // availability is reported honestly in the body.
  res.status(200).json({
    status: dbConnected ? 'ok' : 'degraded',
    app: APP_NAME,
    tagline: APP_TAGLINE,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
    persistence: dbConnected ? 'available' : 'unavailable — game summaries will not be saved',
    socket: {
      status: 'active'
    }
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Central Error Handler
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled server error');
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize Socket.IO
initSocketServer(server);

// Start Server
const PORT = parseInt(env.PORT, 10) || 4000;

async function start() {
  await connectDB();

  // Surface bind failures as a structured startup error instead of an
  // unhandled EventEmitter exception (for example, when a dev server already
  // owns the configured port).
  server.once('error', async (err) => {
    logger.error({ code: err.code, error: err.message }, 'HTTP server failed to start');
    await disconnectDB();
    process.exit(1);
  });

  server.listen(PORT, () => {
    logger.info(`🚀 ${APP_NAME} server running on port ${PORT} [${env.NODE_ENV}]`);
    logger.info(`Health check available at http://localhost:${PORT}/health`);
  });
}

// Graceful Shutdown
// H-11: Store forced-exit timer reference so it can be cleared on successful shutdown
let forcedExitTimer = null;

async function shutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // 1. Close Socket.IO server to stop accepting new connections and disconnect sockets
  try {
    const io = getIO();
    if (io) {
      io.close();
      logger.info('Socket.IO server closed');
    }
  } catch {
    // ignore if socket server was not initialized
  }

  // 2. Clear all in-memory room timers and socket bindings
  roomManager.clearAllTimers();

  // 3. Close HTTP server and disconnect MongoDB
  server.close(async () => {
    logger.info('HTTP server closed');
    await disconnectDB();
    // H-11: Clear forced-exit timer on successful clean shutdown
    if (forcedExitTimer) {
      clearTimeout(forcedExitTimer);
      forcedExitTimer = null;
    }
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });

  // H-11: Keep a reference so it can be cancelled on clean exit
  forcedExitTimer = setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
