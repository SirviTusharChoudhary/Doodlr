import crypto from 'crypto';
import {
  GAME_CONSTANTS,
  GAME_PHASES,
  MESSAGE_TYPES,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES,
  SOCKET_EVENTS,
  TURN_OUTCOMES,
  calculateGuesserScore,
  isExactMatch,
  normalizeGuess,
  GuessSubmissionSchema,
  ChatMessageSchema
} from '@doodlr/shared';
import { roomManager } from './room.manager.js';
import { gameEngine } from './game.engine.js';
import { logger } from '../utils/logger.js';

export class ChatService {
  constructor() {
    /** @type {Map<string, { count: number, resetAt: number }>} guestId -> rate limit info */
    this.rateLimits = new Map();
  }

  /**
   * Enforce rate limit: max 5 guesses per 3-second window
   * @param {string} guestId
   * @returns {{ allowed: boolean, remainingMs?: number }}
   */
  checkRateLimit(guestId) {
    const now = Date.now();
    const rateData = this.rateLimits.get(guestId) || {
      count: 0,
      resetAt: now + GAME_CONSTANTS.GUESS_RATE_WINDOW_MS
    };

    if (now > rateData.resetAt) {
      rateData.count = 1;
      rateData.resetAt = now + GAME_CONSTANTS.GUESS_RATE_WINDOW_MS;
      this.rateLimits.set(guestId, rateData);
      return { allowed: true };
    }

    rateData.count++;
    this.rateLimits.set(guestId, rateData);

    if (rateData.count > GAME_CONSTANTS.MAX_GUESSES_PER_WINDOW) {
      return {
        allowed: false,
        remainingMs: Math.max(0, rateData.resetAt - now)
      };
    }

    return { allowed: true };
  }

  /**
   * H-04: Remove rate-limit entry for a guest that has disconnected.
   * Prevents the map from accumulating stale entries over long server uptime.
   * @param {string} guestId
   */
  pruneRateLimit(guestId) {
    this.rateLimits.delete(guestId);
  }

  /**
   * Route and process a word guess
   * @param {string} socketId
   * @param {Object} rawPayload
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, isCorrect?: boolean, pointsEarned?: number, error?: string }}
   */
  processGuess(socketId, rawPayload, io) {
    // 1. Zod schema validation
    const parsed = GuessSubmissionSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues?.[0]?.message || 'Invalid guess payload';
      return { success: false, error: errorMsg };
    }

    const { text: rawText } = parsed.data;

    // 2. Validate socket mapping, room membership, and game state
    const mapping = roomManager.socketToPlayer.get(socketId);
    if (!mapping) {
      return { success: false, error: 'You are not in an active room.' };
    }

    const { guestId, roomCode } = mapping;
    const room = roomManager.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room does not exist.' };
    }

    if (room.phase !== GAME_PHASES.DRAWING) {
      return { success: false, error: 'Guesses are only accepted during an active drawing turn.' };
    }

    if (room.drawerPauseTimer || room.isRecovery) {
      return { success: false, error: 'Turn is paused while players reconnect.' };
    }

    const guessedAt = Date.now();
    const remainingTime = room.deadlineAt
      ? Math.max(0, Math.ceil((room.deadlineAt - guessedAt) / 1000))
      : room.remainingTime;
    if (remainingTime <= 0 || (room.deadlineAt && guessedAt >= room.deadlineAt)) {
      return { success: false, error: 'Turn time has expired.' };
    }

    const player = room.players.get(guestId);
    if (!player || player.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
      return { success: false, error: 'Player is not connected.' };
    }

    // 3. Role-based restrictions
    if (player.role === PLAYER_ROLES.DRAWER || room.currentDrawerId === guestId) {
      return { success: false, error: 'The drawer cannot guess.' };
    }

    if (player.role === PLAYER_ROLES.SOLVED || player.isSolved) {
      return { success: false, error: 'You have already solved this word!' };
    }

    if (player.role === PLAYER_ROLES.SPECTATOR) {
      return { success: false, error: 'Spectators cannot guess during an active round.' };
    }

    // 4. Rate-limiting check (max 5 per 3s window)
    const rateCheck = this.checkRateLimit(guestId);
    if (!rateCheck.allowed) {
      return {
        success: false,
        error: 'Guessing too fast! Maximum 5 guesses per 3 seconds.'
      };
    }

    // 5. Normalization: lowercase, trim, collapse repeated spaces, remove diacritics
    const normalizedInput = normalizeGuess(rawText);
    if (!normalizedInput) {
      return { success: false, error: 'Guess cannot be empty.' };
    }

    const cleanDisplay = rawText.trim().replace(/\s+/g, ' ');

    // 6. Authoritative Exact Match Check
    if (isExactMatch(normalizedInput, room.secretWord)) {
      const points = calculateGuesserScore(remainingTime, room.turnDuration);

      // Mark player SOLVED and award points once
      player.role = PLAYER_ROLES.SOLVED;
      player.isSolved = true;
      player.score += points;

      if (!room.turnSolvers) room.turnSolvers = new Map();
      room.turnSolvers.set(guestId, {
        points,
        username: player.username,
        timestamp: guessedAt
      });

      logger.info(
        { roomCode, guesser: player.username, points, remainingTime: room.remainingTime },
        'Guess authoritatively solved secret word'
      );

      // Safe notification: does NOT leak secret word
      io.to(roomCode).emit(SOCKET_EVENTS.PLAYER_SOLVED, {
        playerId: player.id,
        username: player.username,
        pointsEarned: points,
        order: room.turnSolvers.size
      });

      // System notice for everyone
      this.broadcastSystemNotice(
        roomCode,
        `${player.username} guessed the word! (+${points} pts)`,
        io,
        'success'
      );

      // Synchronize safe room state
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

      // Check if all active eligible guessers have solved
      const activeUnsolvedGuessers = Array.from(room.players.values()).filter(
        (p) =>
          (p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED ||
            p.connectionStatus === PLAYER_CONNECTION_STATUS.DISCONNECTED_GRACE) &&
          p.role === PLAYER_ROLES.ACTIVE_GUESSER &&
          !p.isSolved
      );

      if (activeUnsolvedGuessers.length === 0) {
        logger.info({ roomCode }, 'All active guessers solved. Ending turn early.');
        gameEngine.endTurn(roomCode, TURN_OUTCOMES.COMPLETED, io);
      }

      return { success: true, isCorrect: true, pointsEarned: points };
    }

    // 7. Explicit Recipient Delivery for Raw Guess Message
    // STRICTLY: Current Drawer and Active Unsolved Guessers ONLY
    const guessMessage = {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.GUESS,
      playerId: player.id,
      username: player.username,
      text: cleanDisplay,
      timestamp: new Date().toISOString()
    };

    const recipientSockets = new Set();

    // Add drawer
    const drawer = room.players.get(room.currentDrawerId);
    if (drawer && drawer.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED && drawer.socketId) {
      recipientSockets.add(drawer.socketId);
    }

    // Add all active unsolved guessers
    for (const p of room.players.values()) {
      if (
        p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED &&
        p.role === PLAYER_ROLES.ACTIVE_GUESSER &&
        !p.isSolved &&
        p.socketId
      ) {
        recipientSockets.add(p.socketId);
      }
    }

    // Deliver strictly to the explicit recipient set
    for (const targetSockId of recipientSockets) {
      io.to(targetSockId).emit(SOCKET_EVENTS.GUESS_MESSAGE, guessMessage);
    }

    return { success: true, isCorrect: false };
  }

  /**
   * Process general room chat (Lobby, Waiting, Results phases)
   * @param {string} socketId
   * @param {Object} rawPayload
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, error?: string }}
   */
  processChat(socketId, rawPayload, io) {
    const parsed = ChatMessageSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues?.[0]?.message || 'Invalid chat message';
      return { success: false, error: errorMsg };
    }

    const { text: rawText } = parsed.data;

    const mapping = roomManager.socketToPlayer.get(socketId);
    if (!mapping) {
      return { success: false, error: 'You are not in a room.' };
    }

    const { guestId, roomCode } = mapping;
    const room = roomManager.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room does not exist.' };
    }

    const player = room.players.get(guestId);
    if (!player || player.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
      return { success: false, error: 'Player is not connected.' };
    }

    // General chat is paused during DRAWING to prevent leaking the word
    if (room.phase === GAME_PHASES.DRAWING) {
      return {
        success: false,
        error: 'General chat is paused during drawing turns. Submit guesses instead.'
      };
    }

    if (player.role === PLAYER_ROLES.SPECTATOR && room.phase !== GAME_PHASES.LOBBY) {
      return { success: false, error: 'Spectators cannot send chat during an active game.' };
    }

    const chatRate = this.checkRateLimit(`chat:${guestId}`);
    if (!chatRate.allowed) {
      return { success: false, error: 'Sending messages too quickly. Please wait a moment.' };
    }

    const cleanText = rawText.trim().replace(/\s+/g, ' ');
    if (!cleanText) {
      return { success: false, error: 'Message cannot be empty.' };
    }

    const chatMessage = {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.CHAT,
      playerId: player.id,
      username: player.username,
      text: cleanText,
      timestamp: new Date().toISOString()
    };

    io.to(roomCode).emit(SOCKET_EVENTS.CHAT_MESSAGE, chatMessage);
    return { success: true };
  }

  /**
   * Broadcast an authoritative server system notice
   * @param {string} roomCode
   * @param {string} text
   * @param {import('socket.io').Server} io
   * @param {'info'|'warning'|'success'} [level='info']
   */
  broadcastSystemNotice(roomCode, text, io, level = 'info') {
    io.to(roomCode).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.SYSTEM,
      text,
      level,
      timestamp: new Date().toISOString()
    });
  }
}

export const chatService = new ChatService();
