import {
  GAME_CONSTANTS,
  GAME_PHASES,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES,
  SOCKET_EVENTS,
  StrokeSchema
} from '@doodlr/shared';
import { roomManager } from './room.manager.js';
import { logger } from '../utils/logger.js';

export class DrawingService {
  constructor() {
    /** @type {Map<string, { count: number, resetAt: number }>} socketId -> rate limit info */
    this.rateLimits = new Map();
  }

  /**
   * Validate event frequency rate limit (at most 60 drawing events per second)
   * @param {string} socketId
   * @returns {boolean}
   */
  checkRateLimit(socketId) {
    const now = Date.now();
    const rate = this.rateLimits.get(socketId) || { count: 0, resetAt: now + 1000 };

    if (now > rate.resetAt) {
      rate.count = 1;
      rate.resetAt = now + 1000;
      this.rateLimits.set(socketId, rate);
      return true;
    }

    rate.count++;
    this.rateLimits.set(socketId, rate);
    return rate.count <= 60;
  }

  /**
   * H-04: Remove rate-limit entry for a socket that has disconnected.
   * Prevents the map from accumulating stale entries over long server uptime.
   * @param {string} socketId
   */
  pruneRateLimit(socketId) {
    this.rateLimits.delete(socketId);
  }

  /**
   * Resolve the current drawer and enforce the same live-turn boundary for every
   * canvas mutation, including undo and clear.
   */
  getAuthorizedDrawer(socketId) {
    const mapping = roomManager.socketToPlayer.get(socketId);
    if (!mapping) return { error: 'Not in a room.' };

    const room = roomManager.rooms.get(mapping.roomCode);
    if (!room || room.phase !== GAME_PHASES.DRAWING) {
      return { error: 'Canvas changes are only allowed during an active drawing turn.' };
    }
    if (room.drawerPauseTimer || room.isRecovery) {
      return { error: 'Canvas changes are paused while players reconnect.' };
    }
    if (room.deadlineAt && Date.now() >= room.deadlineAt) {
      return { error: 'Turn deadline has expired.' };
    }
    if (room.currentDrawerId !== mapping.guestId) {
      return { error: 'Only the active drawer can change the canvas.' };
    }

    const player = room.players.get(mapping.guestId);
    if (!player || player.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
      return { error: 'Drawer is disconnected.' };
    }
    return { room, guestId: mapping.guestId };
  }

  /**
   * Submit or update a drawing stroke
   * @param {string} socketId
   * @param {Object} rawStroke
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, sequence?: number, error?: string }}
   */
  submitStroke(socketId, rawStroke, io) {
    // 1. Zod schema validation
    const parsed = StrokeSchema.safeParse(rawStroke);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues?.[0]?.message || 'Invalid stroke payload';
      return { success: false, error: errorMsg };
    }

    const strokeData = parsed.data;

    // 2. Validate socket mapping, room, and game phase
    const mapping = roomManager.socketToPlayer.get(socketId);
    if (!mapping) {
      return { success: false, error: 'Not in a room.' };
    }

    const { guestId, roomCode } = mapping;
    const room = roomManager.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room does not exist.' };
    }

    if (room.phase !== GAME_PHASES.DRAWING) {
      return { success: false, error: 'Drawing is only permitted during an active drawing turn.' };
    }

    if (room.drawerPauseTimer || room.isRecovery) {
      return { success: false, error: 'Drawing is paused while players reconnect.' };
    }

    if (room.remainingTime <= 0 || (room.deadlineAt && Date.now() >= room.deadlineAt)) {
      return { success: false, error: 'Turn deadline has expired.' };
    }

    // 3. Verify drawer identity and connection status
    if (room.currentDrawerId !== guestId) {
      return { success: false, error: 'Only the active drawer can draw.' };
    }

    const player = room.players.get(guestId);
    if (!player || player.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
      return { success: false, error: 'Drawer is disconnected.' };
    }

    // 4. Rate-limit check
    if (!this.checkRateLimit(socketId)) {
      return { success: false, error: 'Drawing events sent too quickly.' };
    }

    // Initialize in-memory strokes array & sequence if needed
    if (!room.strokes) room.strokes = [];
    if (typeof room.strokeSeq !== 'number') room.strokeSeq = 0;

    // 5. Enforce budget limits
    const existingIndex = room.strokes.findIndex((s) => s.id === strokeData.id);

    // Stroke budget: at most 300 strokes per turn
    if (existingIndex === -1 && room.strokes.length >= GAME_CONSTANTS.MAX_STROKES_PER_TURN) {
      return {
        success: false,
        error: `Stroke budget exceeded (maximum ${GAME_CONSTANTS.MAX_STROKES_PER_TURN} strokes per turn).`
      };
    }

    // Total points budget: at most 12,000 points per turn
    let currentTotalPoints = 0;
    for (let i = 0; i < room.strokes.length; i++) {
      if (i !== existingIndex) {
        currentTotalPoints += room.strokes[i].points?.length || 0;
      }
    }
    const newTotalPoints = currentTotalPoints + strokeData.points.length;
    if (newTotalPoints > GAME_CONSTANTS.MAX_POINTS_PER_TURN) {
      return {
        success: false,
        error: `Point budget exceeded (maximum ${GAME_CONSTANTS.MAX_POINTS_PER_TURN} points per turn).`
      };
    }

    // 6. Canonical state mutation
    let canonicalStroke;
    if (existingIndex !== -1) {
      const existing = room.strokes[existingIndex];
      if (existing.isComplete) {
        return { success: false, error: 'Completed strokes cannot be modified.' };
      }
      const lastOpen = [...room.strokes].reverse().find((stroke) => !stroke.isComplete);
      if (!lastOpen || lastOpen.id !== strokeData.id) {
        return { success: false, error: 'Only the in-progress stroke can be updated.' };
      }
      canonicalStroke = {
        ...existing,
        tool: strokeData.tool,
        color: strokeData.color,
        size: strokeData.size,
        points: strokeData.points,
        isComplete: Boolean(strokeData.isComplete)
      };
      room.strokes[existingIndex] = canonicalStroke;
    } else {
      // New stroke
      room.strokeSeq++;
      canonicalStroke = {
        id: strokeData.id,
        sequence: room.strokeSeq,
        tool: strokeData.tool,
        color: strokeData.color,
        size: strokeData.size,
        points: strokeData.points,
        isComplete: Boolean(strokeData.isComplete)
      };
      room.strokes.push(canonicalStroke);
    }

    // 7. Real-time broadcast to room (excluding the drawer)
    io.to(roomCode).except(socketId).emit(SOCKET_EVENTS.STROKE_DRAWN, canonicalStroke);

    return { success: true, sequence: canonicalStroke.sequence };
  }

  /**
   * Undo the most recent completed stroke
   * @param {string} socketId
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, error?: string }}
   */
  undoStroke(socketId, io) {
    const authorization = this.getAuthorizedDrawer(socketId);
    if (authorization.error) return { success: false, error: authorization.error };
    const { room } = authorization;
    const roomCode = room.code;

    if (!room.strokes || room.strokes.length === 0) {
      return { success: false, error: 'No strokes to undo.' };
    }

    let undoIndex = room.strokes.length - 1;
    while (undoIndex >= 0 && !room.strokes[undoIndex].isComplete) {
      undoIndex -= 1;
    }
    if (undoIndex < 0) {
      return { success: false, error: 'No completed strokes to undo.' };
    }

    const undoneStroke = room.strokes.splice(undoIndex, 1)[0];
    room.strokeSeq = (room.strokeSeq || 0) + 1;

    logger.info({ roomCode, strokeId: undoneStroke.id }, 'Drawer undid stroke');

    io.to(roomCode).emit(SOCKET_EVENTS.STROKE_UNDONE, {
      strokeId: undoneStroke.id,
      sequence: room.strokeSeq
    });

    return { success: true };
  }

  /**
   * Clear all strokes from the canvas
   * @param {string} socketId
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, error?: string }}
   */
  clearCanvas(socketId, io) {
    const authorization = this.getAuthorizedDrawer(socketId);
    if (authorization.error) return { success: false, error: authorization.error };
    const { room } = authorization;
    const roomCode = room.code;

    room.strokes = [];
    room.strokeSeq = (room.strokeSeq || 0) + 1;
    logger.info({ roomCode }, 'Drawer cleared canvas');

    io.to(roomCode).emit(SOCKET_EVENTS.CANVAS_CLEARED, {
      sequence: room.strokeSeq
    });

    return { success: true };
  }

  /**
   * Get drawing snapshot for a room
   * @param {string} roomCode
   * @returns {{ strokes: Array<Object>, sequence: number }}
   */
  getSnapshot(roomCode) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return { strokes: [], sequence: 0 };
    return {
      strokes: room.strokes || [],
      sequence: room.strokeSeq || 0
    };
  }
}

export const drawingService = new DrawingService();
