import {
  SOCKET_EVENTS,
  GAME_PHASES,
  GAME_CONSTANTS,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES,
  SelectWordSchema,
  CreateRoomSchema,
  JoinRoomSchema
} from '@doodlr/shared';
import {
  generateGuestId,
  signReconnectToken,
  verifyReconnectToken,
  validateGuestProfile
} from '../../services/auth.service.js';
import { roomManager } from '../../services/room.manager.js';
import { gameEngine } from '../../services/game.engine.js';
import { chatService } from '../../services/chat.service.js';
import { drawingService } from '../../services/drawing.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Helper to resolve or verify guest identity
 */
function resolveGuestAuth(payload) {
  let guestId = null;
  let tokenToReturn = null;

  if (payload?.reconnectToken) {
    const verified = verifyReconnectToken(payload.reconnectToken);
    if (verified) {
      guestId = verified.guestId;
      tokenToReturn = payload.reconnectToken;
    }
  }

  if (!guestId) {
    guestId = generateGuestId();
    tokenToReturn = signReconnectToken(guestId);
  }

  return { guestId, tokenToReturn };
}

/**
 * Handle private room creation
 */
function executeCreateRoom(socket, payload, ack) {
  const parsed = CreateRoomSchema.safeParse(payload || {});
  if (!parsed.success) {
    return ack({
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid room creation payload.'
    });
  }

  const { guestId, tokenToReturn } = resolveGuestAuth(payload);

  const validation = validateGuestProfile({
    username: parsed.data.username,
    avatar: parsed.data.avatar
  });

  if (!validation.valid) {
    return ack({ success: false, error: validation.error });
  }

  const { username, avatar } = validation;

  const room = roomManager.createPrivateRoom({
    hostGuestId: guestId,
    username,
    avatar,
    socketId: socket.id,
    settings: parsed.data.settings || {}
  });

  socket.join(room.code);

  const safeRoom = roomManager.getSafePublicRoom(room.code);
  const privatePlayer = roomManager.getPrivatePlayerState(room.code, guestId);

  return ack({
    success: true,
    data: {
      room: safeRoom,
      player: privatePlayer,
      reconnectToken: tokenToReturn
    }
  });
}

/**
 * Register room, lobby, and authoritative game engine socket handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerRoomHandlers(io, socket) {
  // Explicit Create Private Room
  socket.on(SOCKET_EVENTS.CREATE_ROOM, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    try {
      return executeCreateRoom(socket, payload, ack);
    } catch (err) {
      logger.error({ error: err.message, socketId: socket.id }, 'Error handling room:create');
      return ack({ success: false, error: err.message || 'Internal server error while creating room.' });
    }
  });

  // Join or Create Private Room (Backwards compatible if roomCode is absent)
  socket.on(SOCKET_EVENTS.JOIN_ROOM, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const targetRoomCode = payload?.roomCode?.trim().toUpperCase();

      if (!targetRoomCode) {
        return executeCreateRoom(socket, payload, ack);
      }

      const parsedJoin = JoinRoomSchema.safeParse(payload || {});
      if (!parsedJoin.success) {
        return ack({
          success: false,
          error: parsedJoin.error.issues[0]?.message || 'Invalid join payload.'
        });
      }

      const { guestId, tokenToReturn } = resolveGuestAuth(payload);

      const validation = validateGuestProfile({
        username: parsedJoin.data.username,
        avatar: parsedJoin.data.avatar
      });

      if (!validation.valid) {
        return ack({ success: false, error: validation.error });
      }

      const { username, avatar } = validation;

      // 3. Join existing room
      const result = roomManager.joinRoom({
        roomCode: targetRoomCode,
        guestId,
        username,
        avatar,
        socketId: socket.id
      });

      if (!result.success) {
        return ack({ success: false, error: result.error });
      }

      socket.join(targetRoomCode);

      const room = roomManager.rooms.get(targetRoomCode);

      // If drawer reconnected during paused turn, resume drawing/selection turn
      if (result.isReconnect) {
        if (
          room &&
          room.currentDrawerId === guestId &&
          (room.phase === GAME_PHASES.DRAWING || room.phase === GAME_PHASES.WORD_SELECTION)
        ) {
          gameEngine.resumeDrawerTurn(targetRoomCode, io);
        }
      }

      // If room was in recovery and now has enough connected players, resume immediately
      if (room && room.isRecovery) {
        const connectedCount = Array.from(room.players.values()).filter(
          (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
        ).length;
        if (connectedCount >= GAME_CONSTANTS.MIN_PLAYERS) {
          gameEngine.cancelRecoveryAndResume(targetRoomCode, io);
        }
      }

      const safeRoom = roomManager.getSafePublicRoom(targetRoomCode);
      const privatePlayer = roomManager.getPrivatePlayerState(targetRoomCode, guestId);

      // Broadcast updated room state to other players
      if (!result.isReconnect) {
        socket.to(targetRoomCode).emit(SOCKET_EVENTS.PLAYER_JOINED, {
          player: {
            id: result.player.id,
            username: result.player.username,
            avatar: result.player.avatar
          }
        });
      }
      socket.to(targetRoomCode).emit(SOCKET_EVENTS.ROOM_STATE, safeRoom);

      // Send active drawing snapshot if room is currently in drawing or turn results
      if (safeRoom.phase === GAME_PHASES.DRAWING || safeRoom.phase === GAME_PHASES.TURN_RESULTS) {
        socket.emit(SOCKET_EVENTS.DRAWING_SNAPSHOT, drawingService.getSnapshot(targetRoomCode));
      }

      return ack({
        success: true,
        data: {
          room: safeRoom,
          player: privatePlayer,
          reconnectToken: tokenToReturn
        }
      });
    } catch (err) {
      logger.error({ error: err.message, socketId: socket.id }, 'Error handling room:join');
      return ack({ success: false, error: err.message || 'Internal server error while joining room.' });
    }
  });

  // Update Room Settings (Host only, LOBBY phase only)
  socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, (newSettings, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) {
        return ack({ success: false, error: 'Not in a room' });
      }

      const { guestId, roomCode } = mapping;
      const result = roomManager.updateSettings(roomCode, guestId, newSettings);

      if (!result.success) {
        return ack({ success: false, error: result.error });
      }

      const safeRoom = roomManager.getSafePublicRoom(roomCode);
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, safeRoom);

      return ack({ success: true, data: { room: safeRoom, settings: safeRoom.settings } });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error updating room settings');
      return ack({ success: false, error: 'Failed to update settings.' });
    }
  });

  // Start Game (Private room host only)
  socket.on(SOCKET_EVENTS.START_GAME, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) {
        return ack({ success: false, error: 'Not in a room' });
      }

      const { guestId, roomCode } = mapping;
      const check = roomManager.canStartGame(roomCode, guestId);

      if (!check.canStart) {
        return ack({ success: false, error: check.error });
      }

      // Authoritative game engine starts game and schedules fair cyclic round
      gameEngine.startGame(roomCode, io);

      logger.info({ roomCode, hostGuestId: guestId }, 'Private game started by host');
      return ack({ success: true });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error starting game');
      return ack({ success: false, error: 'Failed to start game.' });
    }
  });

  // Drawer Selects Secret Word Choice
  socket.on(SOCKET_EVENTS.SELECT_WORD, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) return ack({ success: false, error: 'Not in a room' });

      // H-01: Validate payload schema
      const parsed = SelectWordSchema.safeParse(payload);
      if (!parsed.success) {
        return ack({ success: false, error: 'Invalid word selection payload.' });
      }

      const { guestId, roomCode } = mapping;
      const result = gameEngine.handleWordSelection(roomCode, guestId, parsed.data, io);

      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error selecting word');
      return ack({ success: false, error: 'Failed to select word.' });
    }
  });

  // Submit Word Guess (Authoritative rate-limited role-based routing)
  socket.on(SOCKET_EVENTS.SUBMIT_GUESS, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const result = chatService.processGuess(socket.id, payload, io);
      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error submitting guess');
      return ack({ success: false, error: 'Failed to process guess.' });
    }
  });

  // Send General Room Chat (Lobby, Waiting, Results phases)
  socket.on(SOCKET_EVENTS.SEND_CHAT, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const result = chatService.processChat(socket.id, payload, io);
      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error sending chat message');
      return ack({ success: false, error: 'Failed to send chat message.' });
    }
  });

  // Submit Stroke (Drawer only, rate-limited, budget-checked)
  socket.on(SOCKET_EVENTS.SUBMIT_STROKE, (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const result = drawingService.submitStroke(socket.id, payload, io);
      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error submitting stroke');
      return ack({ success: false, error: 'Failed to submit stroke.' });
    }
  });

  // Undo Last Stroke (Drawer only)
  socket.on(SOCKET_EVENTS.UNDO_STROKE, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const result = drawingService.undoStroke(socket.id, io);
      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error undoing stroke');
      return ack({ success: false, error: 'Failed to undo stroke.' });
    }
  });

  // Clear Canvas (Drawer only)
  socket.on(SOCKET_EVENTS.CLEAR_CANVAS, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const result = drawingService.clearCanvas(socket.id, io);
      return ack(result);
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error clearing canvas');
      return ack({ success: false, error: 'Failed to clear canvas.' });
    }
  });

  // Request Drawing Snapshot (New joiner, reconnecting client, spectator)
  socket.on(SOCKET_EVENTS.DRAWING_SNAPSHOT, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) return ack({ success: false, error: 'Not in a room' });

      const snapshot = drawingService.getSnapshot(mapping.roomCode);
      return ack({ success: true, data: snapshot });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error getting drawing snapshot');
      return ack({ success: false, error: 'Failed to get snapshot.' });
    }
  });

  // Play Again (Private host)
  socket.on(SOCKET_EVENTS.PLAY_AGAIN, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) return ack({ success: false, error: 'Not in a room' });

      const { guestId, roomCode } = mapping;
      const room = roomManager.rooms.get(roomCode);

      if (!room || room.hostGuestId !== guestId || room.phase !== GAME_PHASES.GAME_RESULTS) {
        return ack({ success: false, error: 'Cannot restart game.' });
      }

      gameEngine.startGame(roomCode, io);
      return ack({ success: true });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error restarting game');
      return ack({ success: false, error: 'Failed to restart game.' });
    }
  });

  // Return to Lobby (Private host)
  socket.on(SOCKET_EVENTS.RETURN_TO_LOBBY, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      if (!mapping) return ack({ success: false, error: 'Not in a room' });

      const { guestId, roomCode } = mapping;
      const room = roomManager.rooms.get(roomCode);

      if (!room || room.hostGuestId !== guestId || room.phase !== GAME_PHASES.GAME_RESULTS) {
        return ack({ success: false, error: 'Cannot return to lobby.' });
      }

      // U-04: Full game-state reset — clear all ephemeral turn/game fields so the
      // lobby doesn't display stale word masks, drawer assignments, or timer state.
      // Player scores are intentionally preserved (they were earned this session).
      gameEngine.clearTurnTimers(room);
      gameEngine.clearRecoveryTimers(room);

      room.phase = GAME_PHASES.LOBBY;
      room.currentDrawerId = null;
      room.secretWord = null;
      room.wordMask = null;
      room.wordLength = 0;
      room.currentWordChoices = null;
      room.strokes = [];
      room.strokeSeq = 0;
      room.turnSolvers = null;
      room.turnOutcomes = [];
      room.currentTurnIndex = 0;
      room.turnQueue = [];
      room.currentRound = 1;
      room.turnStartedAt = null;
      room.remainingTime = 0;
      room.turnDuration = 0;
      room.phaseDeadlineAt = null;
      room.isRecovery = false;
      room.recoveryRemainingTime = 0;
      room.drawerPauseUsed = false;
      room.gameId = null;
      room.gameStartedAt = null;
      room.usedWords = new Set();

      // Reset roles (preserve host, reset game roles)
      for (const player of room.players.values()) {
        player.isSolved = false;
        if (player.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT) {
          player.role = PLAYER_ROLES.ACTIVE_GUESSER;
        }
      }

      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

      return ack({ success: true });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error returning to lobby');
      return ack({ success: false, error: 'Failed to return to lobby.' });
    }
  });

  // Leave Room
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, (_, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};

    try {
      const mapping = roomManager.socketToPlayer.get(socket.id);
      const activeRoom = mapping ? roomManager.rooms.get(mapping.roomCode) : null;
      const isActiveDrawer = activeRoom && activeRoom.currentDrawerId === mapping.guestId &&
        (activeRoom.phase === GAME_PHASES.DRAWING || activeRoom.phase === GAME_PHASES.WORD_SELECTION);

      if (isActiveDrawer) {
        gameEngine.endTurn(mapping.roomCode, 'forfeited', io);
      }
      const { roomCode, player, hostTransferred, newHostId } = roomManager.leaveRoom(socket.id);

      if (roomCode) {
        socket.leave(roomCode);

        if (hostTransferred && newHostId) {
          const safeRoom = roomManager.getSafePublicRoom(roomCode);
          if (safeRoom) {
            const newHost = safeRoom.players.find((candidate) => candidate.id === newHostId);
            io.to(roomCode).emit(SOCKET_EVENTS.HOST_TRANSFERRED, { newHostId, username: newHost?.username });
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, safeRoom);
          }
        } else {
          const safeRoom = roomManager.getSafePublicRoom(roomCode);
          if (safeRoom) {
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, safeRoom);
          }
        }

        if (player) {
          io.to(roomCode).emit(SOCKET_EVENTS.PLAYER_LEFT, {
            playerId: player.id,
            username: player.username,
            reason: 'left'
          });
        }

        // Trigger room recovery checks
        gameEngine.checkOrEnterRecovery(roomCode, io);
      }

      return ack({ success: true });
    } catch (err) {
      logger.error({ err, socketId: socket.id }, 'Error leaving room');
      return ack({ success: false, error: 'Failed to leave room.' });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const mapping = roomManager.socketToPlayer.get(socket.id);
    const roomCode = mapping?.roomCode;
    const guestId = mapping?.guestId;

    // H-04: Prune rate-limit tracking maps for this socket/guest to prevent memory leaks
    drawingService.pruneRateLimit(socket.id);
    if (guestId) {
      chatService.pruneRateLimit(guestId);
    }

    if (roomCode && guestId) {
      const room = roomManager.rooms.get(roomCode);
      if (
        room &&
        room.currentDrawerId === guestId &&
        (room.phase === GAME_PHASES.DRAWING || room.phase === GAME_PHASES.WORD_SELECTION)
      ) {
        gameEngine.handleDrawerDisconnect(roomCode, io);
      }
    }

    roomManager.handleDisconnect(socket.id, io);

    if (roomCode) {
      gameEngine.checkOrEnterRecovery(roomCode, io);
    }
  });
}
