import crypto from 'crypto';
import {
  GAME_CONSTANTS,
  GAME_PHASES,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES,
  SOCKET_EVENTS,
  derivePlayerPermissions,
  getEligiblePlayers,
  RoomSettingsSchema
} from '@doodlr/shared';
import { logger } from '../utils/logger.js';

// Unpredictable 6-character room code alphabet (excluding ambiguous chars)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode() {
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export class RoomManager {
  constructor() {
    /** @type {Map<string, Object>} roomCode -> Room */
    this.rooms = new Map();
    /** @type {Map<string, { guestId: string, roomCode: string }>} socketId -> mapping */
    this.socketToPlayer = new Map();
  }

  /**
   * Generate a unique, unpredictable room code
   * @returns {string}
   */
  generateUniqueRoomCode() {
    let code = generateRoomCode();
    while (this.rooms.has(code)) {
      code = generateRoomCode();
    }
    return code;
  }

  /**
   * Create a new private room
   * @param {Object} params
   * @param {string} params.hostGuestId
   * @param {string} params.username
   * @param {string} params.avatar
   * @param {string} params.socketId
   * @param {Object} [params.settings]
   * @returns {Object} Created Room
   */
  createPrivateRoom({ hostGuestId, username, avatar, socketId, settings = {} }) {
    if (this.rooms.size >= GAME_CONSTANTS.MAX_ACTIVE_ROOMS) {
      throw new Error(`Maximum server room capacity reached (${GAME_CONSTANTS.MAX_ACTIVE_ROOMS} rooms). Please try again later.`);
    }

    const roomCode = this.generateUniqueRoomCode();

    const parsedSettings = RoomSettingsSchema.partial().safeParse(settings);
    if (!parsedSettings.success) {
      throw new Error(parsedSettings.error.issues[0]?.message || 'Invalid room settings.');
    }
    const roomSettings = {
      capacity: GAME_CONSTANTS.MAX_PLAYERS,
      rounds: GAME_CONSTANTS.DEFAULT_ROUNDS,
      drawDuration: GAME_CONSTANTS.DEFAULT_TURN_DURATION,
      hintsEnabled: true,
      categories: [...GAME_CONSTANTS.BUILTIN_CATEGORIES],
      ...parsedSettings.data
    };

    const hostPlayer = {
      id: hostGuestId,
      username,
      avatar,
      socketId,
      score: 0,
      role: PLAYER_ROLES.ACTIVE_GUESSER,
      connectionStatus: PLAYER_CONNECTION_STATUS.CONNECTED,
      isHost: true,
      joinedAt: Date.now(),
      isSolved: false,
      disconnectGraceTimer: null,
      disconnectGen: 0
    };

    const room = {
      code: roomCode,
      phase: GAME_PHASES.LOBBY,
      hostGuestId,
      createdAt: Date.now(),
      generationId: 1,
      gameGenerationId: 0,
      emptyRoomGen: 0,
      hostTransferGen: 0,
      settings: roomSettings,
      players: new Map([[hostGuestId, hostPlayer]]),
      hostTransferTimer: null,
      emptyRoomTimer: null,
      currentRound: 1,
      totalRounds: roomSettings.rounds,
      currentTurnIndex: 0,
      totalTurnsInRound: 0,
      currentDrawerId: null,
      wordMask: '',
      wordLength: 0,
      remainingTime: roomSettings.drawDuration,
      turnDuration: roomSettings.drawDuration,
      strokes: [],
      isRecovery: false,
      recoveryRemainingTime: 0
    };

    this.rooms.set(roomCode, room);
    this.socketToPlayer.set(socketId, { guestId: hostGuestId, roomCode });

    logger.info({ roomCode, hostGuestId, username }, 'Created new private room');
    return room;
  }


  /**
   * Join an existing room
   * @param {Object} params
   * @param {string} params.roomCode
   * @param {string} params.guestId
   * @param {string} params.username
   * @param {string} params.avatar
   * @param {string} params.socketId
   * @returns {{ success: boolean, room?: Object, player?: Object, error?: string }}
   */
  joinRoom({ roomCode, guestId, username, avatar, socketId }) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      return { success: false, error: 'Room not found. Please check the room code.' };
    }

    if (room.phase === GAME_PHASES.CLOSED) {
      return { success: false, error: 'This room has already closed.' };
    }

    // Cancel empty room cleanup timer if someone is joining
    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
      room.emptyRoomTimer = null;
      logger.info({ roomCode: code }, 'Cancelled empty room cleanup timer on join');
    }
    room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;

    // Case 1: Reconnecting player with existing guestId
    if (room.players.has(guestId)) {
      const existingPlayer = room.players.get(guestId);

      // C-06: Deliberately departed players cannot reclaim their old seat via the reconnect path.
      // They must join as a new member, which goes through capacity/username checks below.
      if (existingPlayer.connectionStatus === PLAYER_CONNECTION_STATUS.LEFT) {
        logger.info({ roomCode: code, guestId }, 'LEFT player attempted reconnect — treating as new join');
        room.players.delete(guestId);
        // Fall through to new-player path below
      } else {
        if (existingPlayer.disconnectGraceTimer) {
          clearTimeout(existingPlayer.disconnectGraceTimer);
          existingPlayer.disconnectGraceTimer = null;
        }
        existingPlayer.disconnectGen = (existingPlayer.disconnectGen || 0) + 1;

        if (existingPlayer.socketId && existingPlayer.socketId !== socketId) {
          this.socketToPlayer.delete(existingPlayer.socketId);
        }
        existingPlayer.socketId = socketId;
        existingPlayer.connectionStatus = PLAYER_CONNECTION_STATUS.CONNECTED;
        this.socketToPlayer.set(socketId, { guestId, roomCode: code });

        if (room.hostGuestId === guestId && room.hostTransferTimer) {
          clearTimeout(room.hostTransferTimer);
          room.hostTransferTimer = null;
          logger.info({ roomCode: code, guestId }, 'Cancelled host transfer timer: host reconnected within grace');
        }
        room.hostTransferGen = (room.hostTransferGen || 0) + 1;

        if (room.emptyRoomTimer) {
          clearTimeout(room.emptyRoomTimer);
          room.emptyRoomTimer = null;
          room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;
          logger.info({ roomCode: code }, 'Cancelled empty room cleanup: player reconnected');
        }

        logger.info({ roomCode: code, guestId, username: existingPlayer.username }, 'Player reconnected successfully');
        return { success: true, room, player: existingPlayer, isReconnect: true };
      }
    }

    // Case 2: New player joining
    // Check capacity
    const activeConnectedCount = Array.from(room.players.values()).filter(
      (p) => p.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT
    ).length;

    if (activeConnectedCount >= room.settings.capacity) {
      return { success: false, error: 'Room has reached maximum capacity.' };
    }

    // Check unique username within room (case-insensitive)
    const usernameTaken = Array.from(room.players.values()).some(
      (p) =>
        p.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT &&
        p.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (usernameTaken) {
      return {
        success: false,
        error: `Username "${username}" is already taken in this room. Please choose another.`
      };
    }

    // Determine initial role:
    // If room is in LOBBY: ACTIVE_GUESSER
    // If game is actively running: SPECTATOR (becomes eligible at next round boundary)
    const isGameActive = room.phase !== GAME_PHASES.LOBBY;
    const initialRole = isGameActive
      ? PLAYER_ROLES.SPECTATOR
      : PLAYER_ROLES.ACTIVE_GUESSER;

    const newPlayer = {
      id: guestId,
      username: username.trim(),
      avatar,
      socketId,
      score: 0,
      role: initialRole,
      connectionStatus: PLAYER_CONNECTION_STATUS.CONNECTED,
      isHost: room.players.size === 0,
      joinedAt: Date.now(),
      isSolved: false,
      disconnectGraceTimer: null,
      disconnectGen: 0
    };

    room.players.set(guestId, newPlayer);
    this.socketToPlayer.set(socketId, { guestId, roomCode: code });

    // H-09: Cancel empty room cleanup if active
    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
      room.emptyRoomTimer = null;
      room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;
      logger.info({ roomCode: code }, 'Cancelled empty room cleanup: new player joined');
    }

    logger.info(
      { roomCode: code, guestId, username: newPlayer.username, role: initialRole },
      'New player joined room'
    );

    return { success: true, room, player: newPlayer, isReconnect: false };
  }

  /**
   * Handle an explicit player leave action
   * @param {string} socketId
   * @returns {{ roomCode?: string, player?: Object, room?: Object, hostTransferred?: boolean, newHostId?: string }}
   */
  leaveRoom(socketId) {
    const mapping = this.socketToPlayer.get(socketId);
    if (!mapping) return {};

    const { guestId, roomCode } = mapping;
    const room = this.rooms.get(roomCode);
    if (!room) return {};

    const player = room.players.get(guestId);
    if (!player) return {};

    // Mark player as explicitly left
    player.connectionStatus = PLAYER_CONNECTION_STATUS.LEFT;
    this.socketToPlayer.delete(socketId);

    logger.info({ roomCode, guestId, username: player.username }, 'Player explicitly left room');

    let hostTransferred = false;
    let newHostId = null;

    // If leaving player was host, transfer immediately
    if (player.isHost) {
      const remainingEligible = Array.from(room.players.values())
        .filter(
          (p) =>
            p.id !== guestId &&
            p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
        )
        .sort((a, b) => a.joinedAt - b.joinedAt);

      if (remainingEligible.length > 0) {
        player.isHost = false;
        const newHost = remainingEligible[0];
        newHost.isHost = true;
        room.hostGuestId = newHost.id;
        hostTransferred = true;
        newHostId = newHost.id;
        logger.info({ roomCode, oldHost: guestId, newHost: newHost.id }, 'Host transferred after explicit leave');
      }
    }

    // Check if room has zero connected players
    const connectedCount = Array.from(room.players.values()).filter(
      (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
    ).length;

    if (connectedCount === 0) {
      this.scheduleEmptyRoomCleanup(roomCode);
    }

    return { roomCode, player, room, hostTransferred, newHostId };
  }

  /**
   * Handle socket network disconnect (temporary with 10s grace period)
   * @param {string} socketId
   * @param {Object} io - Socket.IO server instance to broadcast updates
   */
  handleDisconnect(socketId, io) {
    const mapping = this.socketToPlayer.get(socketId);
    if (!mapping) return;

    const { guestId, roomCode } = mapping;
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.socketToPlayer.delete(socketId);
      return;
    }

    const player = room.players.get(guestId);
    if (!player) {
      this.socketToPlayer.delete(socketId);
      return;
    }

    player.connectionStatus = PLAYER_CONNECTION_STATUS.DISCONNECTED_GRACE;
    player.disconnectGen = (player.disconnectGen || 0) + 1;
    const currentDisconnectGen = player.disconnectGen;
    const currentRoomGen = room.generationId;

    logger.info(
      { roomCode, guestId, username: player.username, gen: currentDisconnectGen },
      `Player disconnected. Starting ${GAME_CONSTANTS.GUESSER_DISCONNECT_GRACE}s reconnect grace period.`
    );

    // Broadcast player status change
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, this.getSafePublicRoom(roomCode));

    // Player 10-second grace timer (M-05: current drawer in DRAWING phase is managed by GameEngine pause timer)
    const isCurrentDrawerInGracePhase =
      room.currentDrawerId === guestId &&
      (room.phase === GAME_PHASES.DRAWING || room.phase === GAME_PHASES.WORD_SELECTION);

    if (!isCurrentDrawerInGracePhase) {
      player.disconnectGraceTimer = setTimeout(() => {
        if (room.generationId !== currentRoomGen) return;
        if (player.disconnectGen !== currentDisconnectGen) return;

        if (player.connectionStatus === PLAYER_CONNECTION_STATUS.DISCONNECTED_GRACE) {
          player.connectionStatus = PLAYER_CONNECTION_STATUS.INACTIVE;
          logger.info(
            { roomCode, guestId, username: player.username },
            'Player disconnect grace period expired. Marked as INACTIVE.'
          );
          io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, this.getSafePublicRoom(roomCode));
        }
      }, GAME_CONSTANTS.GUESSER_DISCONNECT_GRACE * 1000);
    }

    // Host 10-second disconnect grace handling
    if (player.isHost) {
      room.hostTransferGen = (room.hostTransferGen || 0) + 1;
      const currentHostGen = room.hostTransferGen;

      logger.info(
        { roomCode, guestId, hostGen: currentHostGen },
        `Host disconnected. Starting ${GAME_CONSTANTS.HOST_DISCONNECT_GRACE}s host reconnect window before transfer.`
      );

      room.hostTransferTimer = setTimeout(() => {
        if (room.generationId !== currentRoomGen) return;
        if (room.hostTransferGen !== currentHostGen) return;

        // If original host is still not connected, transfer host permanently
        if (player.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
          const eligibleCandidates = Array.from(room.players.values())
            .filter(
              (p) =>
                p.id !== guestId &&
                p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
            )
            .sort((a, b) => a.joinedAt - b.joinedAt);

          if (eligibleCandidates.length > 0) {
            player.isHost = false;
            const newHost = eligibleCandidates[0];
            newHost.isHost = true;
            room.hostGuestId = newHost.id;

            logger.info(
              { roomCode, oldHost: guestId, newHostId: newHost.id, newHostName: newHost.username },
              'Host grace expired. Host transferred to oldest continuously connected player.'
            );

            io.to(roomCode).emit(SOCKET_EVENTS.HOST_TRANSFERRED, {
              newHostId: newHost.id,
              username: newHost.username
            });
            io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, this.getSafePublicRoom(roomCode));
          }
        }
      }, GAME_CONSTANTS.HOST_DISCONNECT_GRACE * 1000);
    }

    // Check if room has zero connected players
    const connectedCount = Array.from(room.players.values()).filter(
      (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
    ).length;

    if (connectedCount === 0) {
      this.scheduleEmptyRoomCleanup(roomCode);
    }
  }

  /**
   * Schedule 60-second cleanup timer for empty private room
   * Uses generation IDs to prevent stale destruction of reoccupied rooms.
   * @param {string} roomCode
   */
  scheduleEmptyRoomCleanup(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
    }

    room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;
    const currentEmptyGen = room.emptyRoomGen;
    const currentRoomGen = room.generationId;

    logger.info(
      { roomCode, gen: currentEmptyGen },
      `Room is empty. Scheduled destruction in ${GAME_CONSTANTS.PRIVATE_ROOM_REJOIN_WINDOW}s if no player returns.`
    );

    room.emptyRoomTimer = setTimeout(() => {
      if (room.generationId !== currentRoomGen) return;
      if (room.emptyRoomGen !== currentEmptyGen) return;

      const current = this.rooms.get(roomCode);
      if (current && current.generationId === currentRoomGen) {
        const stillConnected = Array.from(current.players.values()).some(
          (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
        );
        if (!stillConnected) {
          logger.info({ roomCode }, 'Empty private room window expired. Destroying room.');
          this.destroyRoom(roomCode);
        }
      }
    }, GAME_CONSTANTS.PRIVATE_ROOM_REJOIN_WINDOW * 1000);
  }

  /**
   * Update room settings (Private rooms only, before game start)
   * @param {string} roomCode
   * @param {string} guestId
   * @param {Object} newSettings
   * @returns {{ success: boolean, room?: Object, error?: string }}
   */
  updateSettings(roomCode, guestId, newSettings) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.hostGuestId !== guestId) {
      return { success: false, error: 'Only the room host can update settings.' };
    }

    if (room.phase !== GAME_PHASES.LOBBY) {
      return { success: false, error: 'Settings cannot be modified while a game is running.' };
    }

    const parsedSettings = RoomSettingsSchema.partial().safeParse(newSettings);
    if (!parsedSettings.success) {
      return { success: false, error: parsedSettings.error.issues[0]?.message || 'Invalid room settings.' };
    }

    const nextSettings = { ...room.settings, ...parsedSettings.data };
    const memberCount = Array.from(room.players.values()).filter(
      (player) => player.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT
    ).length;
    if (nextSettings.capacity < memberCount) {
      return { success: false, error: `Capacity cannot be lower than the ${memberCount} current room members.` };
    }

    room.settings = nextSettings;
    room.totalRounds = nextSettings.rounds;
    room.turnDuration = nextSettings.drawDuration;

    logger.info({ roomCode, settings: room.settings }, 'Room settings updated by host');
    return { success: true, room };
  }

  /**
   * Check if private room can start
   * @param {string} roomCode
   * @param {string} guestId
   * @returns {{ canStart: boolean, error?: string }}
   */
  canStartGame(roomCode, guestId) {
    const room = this.rooms.get(roomCode);
    if (!room) return { canStart: false, error: 'Room not found' };

    if (room.hostGuestId !== guestId) {
      return { canStart: false, error: 'Only the host can start the game.' };
    }

    if (room.phase !== GAME_PHASES.LOBBY) {
      return { canStart: false, error: 'Game has already started.' };
    }

    const eligible = getEligiblePlayers(Array.from(room.players.values()));
    if (eligible.length < GAME_CONSTANTS.MIN_PLAYERS) {
      return {
        canStart: false,
        error: `At least ${GAME_CONSTANTS.MIN_PLAYERS} connected players are required to start the game.`
      };
    }

    return { canStart: true };
  }

  /**
   * Get safe public room state without leaking secrets
   * @param {string} roomCode
   * @returns {Object|null}
   */
  getSafePublicRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const publicPlayers = Array.from(room.players.values())
      .filter((p) => p.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT)
      .map((p) => ({
        id: p.id,
        username: p.username,
        avatar: p.avatar,
        score: p.score,
        role: p.role,
        connectionStatus: p.connectionStatus,
        isHost: Boolean(p.isHost),
        isSolved: Boolean(p.isSolved)
      }));

    return {
      gameId: room.gameId || null,
      roomCode: room.code,
      phase: room.phase,
      currentRound: room.currentRound,
      totalRounds: room.totalRounds,
      currentTurnIndex: room.currentTurnIndex,
      totalTurnsInRound: room.totalTurnsInRound,
      currentDrawerId: room.currentDrawerId,
      wordMask: room.wordMask,
      wordLength: room.wordLength,
      remainingTime: room.remainingTime,
      turnDuration: room.turnDuration,
      phaseDeadlineAt: room.phaseDeadlineAt || null,
      hintsEnabled: room.settings.hintsEnabled,
      players: publicPlayers,
      settings: { ...room.settings },
      isRecovery: room.isRecovery,
      recoveryRemainingTime: room.recoveryRemainingTime
    };
  }

  /**
   * Get targeted private player state
   * @param {string} roomCode
   * @param {string} guestId
   * @returns {Object|null}
   */
  getPrivatePlayerState(roomCode, guestId) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;

    const player = room.players.get(guestId);
    if (!player) return null;

    const permissions = derivePlayerPermissions(player, room.phase);
    const isDrawer = player.id === room.currentDrawerId;

    return {
      guestId: player.id,
      username: player.username,
      avatar: player.avatar,
      isHost: player.isHost,
      role: player.role,
      permissions,
      secretWord:
        isDrawer &&
        (room.phase === GAME_PHASES.DRAWING || room.phase === GAME_PHASES.WORD_SELECTION)
          ? room.secretWord || null
          : undefined,
      wordChoices:
        isDrawer && room.phase === GAME_PHASES.WORD_SELECTION
          ? room.currentWordChoices || []
          : undefined
    };
  }

  /**
   * Clean up and destroy a room completely, bumping generation IDs to invalidate stale callbacks
   * @param {string} roomCode
   */
  destroyRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.generationId = (room.generationId || 1) + 1;
    room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;
    room.hostTransferGen = (room.hostTransferGen || 0) + 1;

    if (room.emptyRoomTimer) clearTimeout(room.emptyRoomTimer);
    if (room.hostTransferTimer) clearTimeout(room.hostTransferTimer);
    if (room.soloWaitTimer) clearTimeout(room.soloWaitTimer);
    if (room.turnTimer) clearInterval(room.turnTimer);
    if (room.wordSelectionTimer) clearTimeout(room.wordSelectionTimer);
    if (room.drawerPauseTimer) clearTimeout(room.drawerPauseTimer);
    if (room.turnResultsTimer) clearTimeout(room.turnResultsTimer);
    if (room.recoveryTimer) clearTimeout(room.recoveryTimer);
    if (room.recoveryCountdownTimer) clearInterval(room.recoveryCountdownTimer);

    for (const player of room.players.values()) {
      player.disconnectGen = (player.disconnectGen || 0) + 1;
      if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
      if (player.socketId) this.socketToPlayer.delete(player.socketId);
    }

    this.rooms.delete(roomCode);
    logger.info({ roomCode }, 'Room destroyed and ephemeral resources cleared');
  }

  /**
   * Clear all rooms, active timers, and socket bindings cleanly on server shutdown
   */
  clearAllTimers() {
    logger.info('Clearing all active room timers and socket bindings...');
    for (const [code, room] of this.rooms.entries()) {
      room.generationId = (room.generationId || 1) + 1;
      room.emptyRoomGen = (room.emptyRoomGen || 0) + 1;
      room.hostTransferGen = (room.hostTransferGen || 0) + 1;
      room.turnGen = (room.turnGen || 0) + 1;
      room.drawerPauseGen = (room.drawerPauseGen || 0) + 1;
      room.recoveryGen = (room.recoveryGen || 0) + 1;

      if (room.emptyRoomTimer) clearTimeout(room.emptyRoomTimer);
      if (room.hostTransferTimer) clearTimeout(room.hostTransferTimer);
      if (room.soloWaitTimer) clearTimeout(room.soloWaitTimer);
      // Game-engine timers
      if (room.turnTimer) clearInterval(room.turnTimer);
      if (room.wordSelectionTimer) clearTimeout(room.wordSelectionTimer);
      if (room.drawerPauseTimer) clearTimeout(room.drawerPauseTimer);
      if (room.turnResultsTimer) clearTimeout(room.turnResultsTimer);
      if (room.recoveryTimer) clearTimeout(room.recoveryTimer);
      if (room.recoveryCountdownTimer) clearInterval(room.recoveryCountdownTimer);

      for (const player of room.players.values()) {
        player.disconnectGen = (player.disconnectGen || 0) + 1;
        if (player.disconnectGraceTimer) clearTimeout(player.disconnectGraceTimer);
      }
    }
    this.rooms.clear();
    this.socketToPlayer.clear();
    logger.info('All in-memory room resources cleared cleanly');
  }
}

export const roomManager = new RoomManager();
