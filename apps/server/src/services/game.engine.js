import crypto from 'crypto';
import {
  GAME_CONSTANTS,
  GAME_PHASES,
  MESSAGE_TYPES,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES,
  SOCKET_EVENTS,
  TURN_OUTCOMES,
  buildFullRoundTurnOrder,
  calculateGuesserScore,
  calculateDrawerBonus,
  initializeWordMask,
  revealHintLetter,
  getEligiblePlayers,
  calculateFinalRankings,
  isExactMatch
} from '@doodlr/shared';
import { roomManager } from './room.manager.js';
import { getWordChoices } from '../data/words.js';
import { persistenceService } from './persistence.service.js';
import { logger } from '../utils/logger.js';

export class GameEngine {
  constructor() {
    // Authoritative game engine
  }

  /**
   * Start a game (Private room host start)
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  startGame(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    room.gameId = crypto.randomUUID();
    room.gameStartedAt = new Date();
    room.turnOutcomes = [];
    room.gameGenerationId = (room.gameGenerationId || 0) + 1;
    room.currentRound = 1;
    room.usedWords = new Set();
    room.phase = GAME_PHASES.ROUND_SETUP;

    for (const player of room.players.values()) {
      if (player.connectionStatus === PLAYER_CONNECTION_STATUS.LEFT) continue;
      player.score = 0;
      player.isSolved = false;
      player.role = PLAYER_ROLES.ACTIVE_GUESSER;
    }

    logger.info({ roomCode, gameId: room.gameId }, 'GameEngine started new game');

    io.to(roomCode).emit(SOCKET_EVENTS.GAME_STARTED, {
      gameId: room.gameId,
      totalRounds: room.totalRounds
    });
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

    this.startFullRound(roomCode, io);
  }

  /**
   * Initialize a full round: snapshot eligible players, build deterministic cyclic queue
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  startFullRound(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    // Promote connected spectators to active guessers at each round boundary (M-06)
    for (const player of room.players.values()) {
      if (
        player.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED &&
        player.role === PLAYER_ROLES.SPECTATOR
      ) {
        player.role = PLAYER_ROLES.ACTIVE_GUESSER;
        logger.info(
          { roomCode, guestId: player.id, username: player.username },
          'Promoted spectator to active guesser at round boundary'
        );
      }
    }

    // 1. Snapshot eligible players
    const allPlayers = Array.from(room.players.values());
    const eligible = getEligiblePlayers(allPlayers);

    // If fewer than 2 eligible players, trigger recovery
    if (eligible.length < GAME_CONSTANTS.MIN_PLAYERS) {
      this.checkOrEnterRecovery(roomCode, io);
      return;
    }

    // 2. Build deterministic cyclic turn order with round-based start advance
    const scheduled = buildFullRoundTurnOrder(eligible, room.currentRound);
    room.turnQueue = scheduled.map((p) => p.id);
    room.totalTurnsInRound = scheduled.length;
    room.currentTurnIndex = 0;

    logger.info(
      {
        roomCode,
        round: room.currentRound,
        totalTurns: room.totalTurnsInRound,
        turnOrder: scheduled.map((p) => p.username)
      },
      'Full round initialized with fair cyclic order'
    );

    this.startTurnWordSelection(roomCode, io);
  }

  /**
   * Start the word selection phase for the current scheduled drawer
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  startTurnWordSelection(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    // Clear any previous turn timers
    this.clearTurnTimers(room);

    // Skip disconnected/inactive scheduled drawers iteratively (M-03)
    while (room.currentTurnIndex < room.turnQueue.length) {
      const candidateId = room.turnQueue[room.currentTurnIndex];
      const candidate = room.players.get(candidateId);
      if (candidate && candidate.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED) {
        break;
      }
      logger.info(
        { roomCode, drawerId: candidateId, username: candidate?.username },
        'Drawer is disconnected or inactive. Skipping turn.'
      );
      room.currentTurnIndex++;
    }

    // Check if full round is complete
    if (room.currentTurnIndex >= room.turnQueue.length) {
      room.currentRound++;
      if (room.currentRound > room.totalRounds) {
        this.endGame(roomCode, io);
      } else {
        this.startFullRound(roomCode, io);
      }
      return;
    }

    const drawerId = room.turnQueue[room.currentTurnIndex];
    const drawer = room.players.get(drawerId);

    // Assign roles for this turn
    room.phase = GAME_PHASES.WORD_SELECTION;
    room.currentDrawerId = drawerId;
    room.strokes = [];
    room.phaseDeadlineAt = Date.now() + GAME_CONSTANTS.WORD_SELECTION_TIMEOUT * 1000;

    for (const player of room.players.values()) {
      player.isSolved = false;
      if (player.id === drawerId) {
        player.role = PLAYER_ROLES.DRAWER;
      } else if (player.role !== PLAYER_ROLES.SPECTATOR) {
        player.role = PLAYER_ROLES.ACTIVE_GUESSER;
      }
    }

    // Pick 3 distinct word choices
    const choices = getWordChoices(
      room.settings.categories,
      3,
      room.usedWords
    );
    room.currentWordChoices = choices;

    // Track generation to reject stale timers
    room.turnGen = (room.turnGen || 0) + 1;
    const currentGen = room.turnGen;

    logger.info(
      { roomCode, drawer: drawer.username, choicesCount: choices.length },
      'Sending word choices to drawer'
    );

    // Send choices exclusively to drawer
    io.to(drawer.socketId).emit(SOCKET_EVENTS.WORD_CHOICES, {
      choices,
      timeoutSeconds: GAME_CONSTANTS.WORD_SELECTION_TIMEOUT
    });

    // Broadcast safe room state
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

    // 10-second drawer selection deadline
    room.wordSelectionTimer = setTimeout(() => {
      if (room.turnGen !== currentGen || room.phase !== GAME_PHASES.WORD_SELECTION) return;

      const currentDrawer = room.players.get(room.currentDrawerId);
      if (currentDrawer?.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
        logger.info({ roomCode }, 'Drawer still disconnected at word-selection deadline. Forfeiting turn.');
        this.endTurn(roomCode, TURN_OUTCOMES.FORFEITED, io);
        return;
      }

      logger.info(
        { roomCode, drawer: currentDrawer?.username },
        'Drawer selection timed out. Selecting default word.'
      );
      const defaultWord = choices[0] || 'apple';
      this.startDrawingTurn(roomCode, defaultWord, io);
    }, GAME_CONSTANTS.WORD_SELECTION_TIMEOUT * 1000);
  }

  /**
   * Handle drawer selecting a word
   * @param {string} roomCode
   * @param {string} guestId
   * @param {{ word?: string, wordIndex?: number }} selection
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, error?: string }}
   */
  handleWordSelection(roomCode, guestId, selection, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room || room.phase !== GAME_PHASES.WORD_SELECTION) {
      return { success: false, error: 'Word selection is no longer active.' };
    }
    if (room.currentDrawerId !== guestId) {
      return { success: false, error: 'Only the active drawer can choose a word.' };
    }

    // A drawer can select by value or by its private choice index. Never accept a
    // word that was not offered for this exact turn.
    const validChoices = room.currentWordChoices || [];
    const chosen = selection?.word ?? validChoices[selection?.wordIndex];
    if (!chosen || !validChoices.includes(chosen)) {
      return { success: false, error: 'That word was not one of the offered choices.' };
    }

    if (room.wordSelectionTimer) {
      clearTimeout(room.wordSelectionTimer);
      room.wordSelectionTimer = null;
    }

    this.startDrawingTurn(roomCode, chosen, io);
    return { success: true };
  }

  /**
   * Start active drawing and guessing turn
   * @param {string} roomCode
   * @param {string} secretWord
   * @param {import('socket.io').Server} io
   */
  startDrawingTurn(roomCode, secretWord, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    this.clearTurnTimers(room);

    room.phase = GAME_PHASES.DRAWING;
    room.phaseDeadlineAt = null;
    room.secretWord = secretWord;
    room.turnId = crypto.randomUUID();
    room.usedWords.add(secretWord.toLowerCase());
    room.wordMask = initializeWordMask(secretWord);
    room.wordLength = secretWord.length;
    room.strokes = [];
    room.strokeSeq = 0;

    const duration = room.settings.drawDuration || GAME_CONSTANTS.DEFAULT_TURN_DURATION;
    room.remainingTime = duration;
    room.turnDuration = duration;
    room.turnSolvers = new Map(); // guestId -> { points, username, timestamp }
    room.drawerPauseUsed = false;
    room.turnStartedAt = Date.now();
    room.deadlineAt = room.turnStartedAt + duration * 1000;

    room.turnGen = (room.turnGen || 0) + 1;
    const currentGen = room.turnGen;

    const drawer = room.players.get(room.currentDrawerId);

    logger.info(
      { roomCode, drawer: drawer?.username, wordLength: secretWord.length, duration },
      'Active drawing turn started'
    );

    // Broadcast TURN_STARTED with masked word
    io.to(roomCode).emit(SOCKET_EVENTS.TURN_STARTED, {
      drawerId: drawer?.id,
      drawerUsername: drawer?.username,
      wordMask: room.wordMask,
      wordLength: room.wordLength,
      duration
    });

    io.to(roomCode).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.SYSTEM,
      text: `${drawer?.username || 'Drawer'} is drawing now! (${room.wordLength} letters)`,
      timestamp: new Date().toISOString()
    });

    // Send private secretWord strictly to drawer via dedicated event (B-06)
    if (drawer?.socketId) {
      io.to(drawer.socketId).emit(SOCKET_EVENTS.SECRET_WORD, { secretWord });
    }

    // Broadcast safe public state to everyone in the room (standard, consistent)
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

    // Start 1-second authoritative timer tick
    room.turnTimer = setInterval(() => {
      this.handleTurnTick(roomCode, currentGen, io);
    }, 1000);
  }

  /**
   * Handle authoritative timer tick and hint schedules
   * @param {string} roomCode
   * @param {number} gen
   * @param {import('socket.io').Server} io
   */
  handleTurnTick(roomCode, gen, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room || room.turnGen !== gen || room.phase !== GAME_PHASES.DRAWING) {
      return;
    }

    room.remainingTime = room.deadlineAt
      ? Math.max(0, Math.ceil((room.deadlineAt - Date.now()) / 1000))
      : Math.max(0, room.remainingTime - 1);
    io.to(roomCode).emit(SOCKET_EVENTS.TURN_TICK, {
      remainingTime: room.remainingTime,
      totalDuration: room.turnDuration
    });

    // Check hints schedule (20s and 45s from start)
    if (room.settings.hintsEnabled) {
      const elapsed = room.turnDuration - room.remainingTime;

      for (const hintTime of GAME_CONSTANTS.HINT_TIMES) {
        // Execute only if hint time is strictly before turn deadline and matches current second
        if (hintTime < room.turnDuration && elapsed === hintTime) {
          const { newMask, revealedLetter } = revealHintLetter(
            room.secretWord,
            room.wordMask
          );

          if (revealedLetter) {
            room.wordMask = newMask;
            logger.info(
              { roomCode, hintTime, revealedLetter },
              'Authoritative hint revealed letter'
            );

            io.to(roomCode).emit(SOCKET_EVENTS.TURN_HINT, {
              wordMask: newMask,
              revealedLetter
            });
            io.to(roomCode).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
              id: crypto.randomUUID(),
              type: MESSAGE_TYPES.SYSTEM,
              text: `Hint: Letter '${revealedLetter.toUpperCase()}' was revealed!`,
              timestamp: new Date().toISOString()
            });
            io.to(roomCode).emit(
              SOCKET_EVENTS.ROOM_STATE,
              roomManager.getSafePublicRoom(roomCode)
            );
          }
        }
      }
    }

    // Turn deadline expired
    if (room.remainingTime <= 0) {
      this.endTurn(roomCode, TURN_OUTCOMES.TIMEOUT, io);
    }
  }

  /**
   * Submit a guess with rate limiting, exact/near matching, and scoring
   * @param {string} socketId
   * @param {string} guessText
   * @param {import('socket.io').Server} io
   * @returns {{ success: boolean, isCorrect?: boolean, error?: string }}
  /**
   * Note: Authoritative guess processing is handled exclusively by chatService.processGuess() (B-01)
   */

  /**
   * Handle drawer disconnect during DRAWING turn
   * Pauses turn for 10s (max 1 pause per turn)
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  handleDrawerDisconnect(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    // C-03: Guard both DRAWING and WORD_SELECTION — drawer can disconnect during either phase
    if (!room || (room.phase !== GAME_PHASES.DRAWING && room.phase !== GAME_PHASES.WORD_SELECTION)) return;

    if (room.drawerPauseUsed) {
      // Second disconnect: forfeit immediately
      logger.info({ roomCode }, 'Drawer disconnected a second time. Forfeiting turn.');
      this.endTurn(roomCode, TURN_OUTCOMES.FORFEITED, io);
      return;
    }

    room.drawerPauseUsed = true;

    // Pause the active drawing timer (if in DRAWING phase)
    if (room.phase === GAME_PHASES.DRAWING) {
      clearInterval(room.turnTimer);
      room.turnTimer = null;
    }

    logger.info(
      { roomCode, phase: room.phase, remainingTime: room.remainingTime },
      'Drawer disconnected. Pausing for 10s reconnect grace.'
    );

    io.to(roomCode).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.SYSTEM,
      text: 'Drawer disconnected. Turn paused for 10 seconds...',
      timestamp: new Date().toISOString()
    });

    room.drawerPauseGen = (room.drawerPauseGen || 0) + 1;
    const currentPauseGen = room.drawerPauseGen;

    room.drawerPauseTimer = setTimeout(() => {
      if (room.drawerPauseGen !== currentPauseGen) return;
      const currentDrawer = room.players.get(room.currentDrawerId);
      if (currentDrawer?.connectionStatus !== PLAYER_CONNECTION_STATUS.CONNECTED) {
        logger.info({ roomCode }, 'Drawer failed to reconnect in time. Forfeiting turn.');
        this.endTurn(roomCode, TURN_OUTCOMES.FORFEITED, io);
      }
    }, GAME_CONSTANTS.DRAWER_DISCONNECT_GRACE * 1000);
  }

  /**
   * Resume paused turn when drawer reconnects within grace
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  resumeDrawerTurn(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;
    if (room.phase !== GAME_PHASES.DRAWING && room.phase !== GAME_PHASES.WORD_SELECTION) return;

    if (room.drawerPauseTimer) {
      clearTimeout(room.drawerPauseTimer);
      room.drawerPauseTimer = null;
    }
    room.drawerPauseGen = (room.drawerPauseGen || 0) + 1;

    const drawer = room.players.get(room.currentDrawerId);

    if (room.phase === GAME_PHASES.WORD_SELECTION) {
      const remainingSeconds = room.phaseDeadlineAt
        ? Math.max(1, Math.ceil((room.phaseDeadlineAt - Date.now()) / 1000))
        : GAME_CONSTANTS.WORD_SELECTION_TIMEOUT;
      if (drawer?.socketId && Array.isArray(room.currentWordChoices)) {
        io.to(drawer.socketId).emit(SOCKET_EVENTS.WORD_CHOICES, {
          choices: room.currentWordChoices,
          timeoutSeconds: remainingSeconds
        });
      }
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));
      return;
    }

    logger.info(
      { roomCode, remainingTime: room.remainingTime },
      'Drawer reconnected within grace. Resuming active turn timer.'
    );

    room.deadlineAt = Date.now() + Math.max(0, room.remainingTime) * 1000;
    room.turnGen = (room.turnGen || 0) + 1;
    const currentGen = room.turnGen;

    room.turnTimer = setInterval(() => {
      this.handleTurnTick(roomCode, currentGen, io);
    }, 1000);

    if (drawer?.socketId && room.secretWord) {
      io.to(drawer.socketId).emit(SOCKET_EVENTS.SECRET_WORD, { secretWord: room.secretWord });
    }

    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));
  }

  /**
   * Complete active turn, award drawer bonus, reveal secret word, and show turn results
   * @param {string} roomCode
   * @param {string} outcome
   * @param {import('socket.io').Server} io
   */
  endTurn(roomCode, outcome, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    // H-10: Idempotency guard — endTurn should only run once per turn.
    // Multiple completion triggers (final correct guess + timeout callback) can race;
    // if the phase is already TURN_RESULTS or later, the turn is already resolved.
    if (
      room.phase === GAME_PHASES.TURN_RESULTS ||
      room.phase === GAME_PHASES.GAME_RESULTS ||
      room.phase === GAME_PHASES.LOBBY ||
      room.phase === GAME_PHASES.CLOSED
    ) {
      logger.warn({ roomCode, phase: room.phase, outcome }, 'endTurn called on already-resolved turn — ignoring duplicate');
      return;
    }

    this.clearTurnTimers(room);

    room.phase = GAME_PHASES.TURN_RESULTS;

    const uniqueSolversCount = room.turnSolvers ? room.turnSolvers.size : 0;
    const isForfeited = outcome === TURN_OUTCOMES.FORFEITED;

    // Award drawer bonus (50 per unique solver, 0 if forfeited)
    const drawerBonus = calculateDrawerBonus(uniqueSolversCount, isForfeited);
    const drawer = room.players.get(room.currentDrawerId);
    if (drawer && drawerBonus > 0) {
      drawer.score += drawerBonus;
    }

    const turnDuration = room.turnStartedAt
      ? Math.max(0, Math.round((Date.now() - room.turnStartedAt) / 1000))
      : 0;

    if (!room.turnOutcomes) {
      room.turnOutcomes = [];
    }

    room.turnOutcomes.push({
      round: room.currentRound,
      turnIndex: room.currentTurnIndex,
      drawerId: room.currentDrawerId || 'unknown',
      drawerUsername: drawer?.username || 'Unknown',
      secretWord: room.secretWord || '(not selected)',
      outcome,
      correctGuesserCount: uniqueSolversCount,
      drawerBonus,
      durationSeconds: turnDuration
    });

    logger.info(
      {
        roomCode,
        wordLength: room.secretWord ? room.secretWord.length : 0,
        outcome,
        solversCount: uniqueSolversCount,
        drawerBonus,
        turnDuration
      },
      'Turn completed and summarized'
    );

    // Broadcast TURN_ENDED with revealed secret word
    const solversSummary = Array.from((room.turnSolvers || new Map()).entries()).map(
      ([id, data]) => ({
        playerId: id,
        username: data.username,
        points: data.points
      })
    );

    io.to(roomCode).emit(SOCKET_EVENTS.TURN_ENDED, {
      secretWord: room.secretWord,
      outcome,
      solvers: solversSummary,
      drawerBonus,
      drawerUsername: drawer?.username
    });

    io.to(roomCode).emit(SOCKET_EVENTS.SYSTEM_MESSAGE, {
      id: crypto.randomUUID(),
      type: MESSAGE_TYPES.SYSTEM,
      text: room.secretWord
        ? `Turn ended! The word was "${room.secretWord}".`
        : 'Turn ended before a word was chosen.',
      timestamp: new Date().toISOString()
    });

    // Show turn results for 5s, then advance to next turn (generation checked)
    room.turnGen = (room.turnGen || 0) + 1;
    const currentGen = room.turnGen;
    room.phaseDeadlineAt = Date.now() + GAME_CONSTANTS.TURN_RESULTS_DURATION * 1000;

    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

    room.turnResultsTimer = setTimeout(() => {
      if (room.turnGen === currentGen) {
        room.currentTurnIndex++;
        this.startTurnWordSelection(roomCode, io);
      }
    }, GAME_CONSTANTS.TURN_RESULTS_DURATION * 1000);
  }

  /**
   * Check or enter 15-second recovery state if active player count < 2
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  checkOrEnterRecovery(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    // Only active during running games
    if (
      room.phase === GAME_PHASES.LOBBY ||
      room.phase === GAME_PHASES.GAME_RESULTS ||
      room.phase === GAME_PHASES.CLOSED
    ) {
      return;
    }

    const connectedCount = Array.from(room.players.values()).filter(
      (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
    ).length;

    if (connectedCount < GAME_CONSTANTS.MIN_PLAYERS && !room.isRecovery) {
      room.isRecovery = true;
      room.recoveryResumePhase = room.phase;
      room.recoveryRemainingTime = GAME_CONSTANTS.ROOM_RECOVERY_TIMEOUT;

      // H-08: Only clear turn timers (not recovery timers) when entering recovery.
      // Recovery lifecycle is managed exclusively by its own generation counter.
      this.clearTurnTimers(room);
      this.clearRecoveryTimers(room);  // clear any prior orphaned recovery timers

      logger.info(
        { roomCode, connectedCount },
        'Room entered 15-second recovery window (fewer than 2 active players)'
      );

      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

      room.recoveryGen = (room.recoveryGen || 0) + 1;
      const currentRecGen = room.recoveryGen;

      // 1-second recovery countdown ticker (B-05)
      room.recoveryCountdownTimer = setInterval(() => {
        if (room.recoveryGen !== currentRecGen) {
          clearInterval(room.recoveryCountdownTimer);
          room.recoveryCountdownTimer = null;
          return;
        }
        room.recoveryRemainingTime = Math.max(0, (room.recoveryRemainingTime || 0) - 1);
        io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));
        if (room.recoveryRemainingTime <= 0) {
          clearInterval(room.recoveryCountdownTimer);
          room.recoveryCountdownTimer = null;
        }
      }, 1000);

      room.recoveryTimer = setTimeout(() => {
        if (room.recoveryCountdownTimer) {
          clearInterval(room.recoveryCountdownTimer);
          room.recoveryCountdownTimer = null;
        }
        if (room.recoveryGen !== currentRecGen) return;
        const stillConnected = Array.from(room.players.values()).filter(
          (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
        ).length;

        if (stillConnected < GAME_CONSTANTS.MIN_PLAYERS) {
          logger.info({ roomCode }, 'Recovery window expired. Ending game early.');
          this.endGame(roomCode, io, { earlyEnd: true, reason: 'recovery_timeout' });
        } else {
          room.isRecovery = false;
          room.recoveryRemainingTime = 0;
          logger.info({ roomCode }, 'Recovery successful: 2+ players present. Resuming.');
          this.resumeAfterRecovery(roomCode, io);
        }
      }, GAME_CONSTANTS.ROOM_RECOVERY_TIMEOUT * 1000);
    }
  }

  /**
   * Cancel recovery immediately and resume game when 2+ players are present (B-05)
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   */
  cancelRecoveryAndResume(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room || !room.isRecovery) return;

    // H-08: Use dedicated recovery cleanup, not clearTurnTimers
    this.clearRecoveryTimers(room);
    room.isRecovery = false;
    room.recoveryRemainingTime = 0;
    logger.info({ roomCode }, 'Recovery cancelled: 2+ players present. Resuming interrupted queue.');
    this.resumeAfterRecovery(roomCode, io);
  }

  /**
   * Resume the interrupted turn queue after recovery instead of rebuilding the round.
   */
  resumeAfterRecovery(roomCode, io) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    const resumePhase = room.recoveryResumePhase;
    room.recoveryResumePhase = null;

    const drawer = room.players.get(room.currentDrawerId);
    const drawerConnected = drawer?.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED;

    if (resumePhase === GAME_PHASES.DRAWING && drawerConnected && (room.remainingTime || 0) > 0) {
      this.resumeDrawerTurn(roomCode, io);
      return;
    }

    if (resumePhase === GAME_PHASES.WORD_SELECTION && drawerConnected) {
      this.resumeDrawerTurn(roomCode, io);
      return;
    }

    if (resumePhase === GAME_PHASES.TURN_RESULTS) {
      room.currentTurnIndex++;
    }

    this.startTurnWordSelection(roomCode, io);
  }

  /**
   * End game, compute final scoreboard and rankings, and persist summary idempotently
   * @param {string} roomCode
   * @param {import('socket.io').Server} io
   * @param {Object} [options={}]
   */
  endGame(roomCode, io, options = {}) {
    const room = roomManager.rooms.get(roomCode);
    if (!room) return;

    // H-08: Clear both turn and recovery timers cleanly
    this.clearTurnTimers(room);
    this.clearRecoveryTimers(room);

    room.phase = GAME_PHASES.GAME_RESULTS;
    room.phaseDeadlineAt = null;
    room.isRecovery = false;

    // Calculate authoritative final rankings with deterministic tie-breaks
    const rankingPlayers = Array.from(room.players.values()).filter(
      (player) => player.connectionStatus !== PLAYER_CONNECTION_STATUS.LEFT || player.score > 0
    );
    const rankings = calculateFinalRankings(rankingPlayers);

    logger.info(
      { roomCode, rankings, earlyEnd: Boolean(options.earlyEnd) },
      'Game ended. Final podium calculated.'
    );

    // Live score calculations and rankings broadcast immediately - never blocked on database
    io.to(roomCode).emit(SOCKET_EVENTS.GAME_ENDED, {
      gameId: room.gameId,
      rankings,
      earlyEnd: Boolean(options.earlyEnd)
    });

    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STATE, roomManager.getSafePublicRoom(roomCode));

    // Assemble completed game summary
    const durationSeconds = room.gameStartedAt
      ? Math.max(0, Math.round((Date.now() - room.gameStartedAt.getTime()) / 1000))
      : 0;

    let endingStatus = 'completed';
    if (options.earlyEnd) {
      if (options.reason === 'insufficient_players' || options.reason === 'recovery_timeout') {
        endingStatus = 'early_end_recovery_timeout';
      } else if (options.reason === 'abandoned') {
        endingStatus = 'early_end_abandoned';
      } else {
        endingStatus = 'early_end_abandoned';
      }
    }

    const participants = rankings.map((r) => ({
      playerId: r.id,
      username: r.username,
      avatar: r.avatar,
      finalScore: r.score,
      rank: r.rank,
      isHost: Boolean(r.isHost)
    }));

    const summaryData = {
      gameId: room.gameId,
      roomCode: room.code,
      startedAt: room.gameStartedAt || new Date(),
      endedAt: new Date(),
      durationSeconds,
      completedRounds: Math.min(room.currentRound, room.totalRounds),
      totalRounds: room.totalRounds,
      endingStatus,
      settings: {
        capacity: room.settings.capacity,
        duration: room.settings.drawDuration || room.turnDuration,
        hintsEnabled: Boolean(room.settings.hintsEnabled),
        categories: room.settings.categories || []
      },
      participants,
      turnOutcomes: room.turnOutcomes || []
    };

    // Non-blocking durable persistence to MongoDB (does not block live score calculations)
    persistenceService
      .saveGameSummary(summaryData)
      .then((res) => {
        if (res.success) {
          logger.info({ gameId: room.gameId, summaryId: res.id }, 'Game summary safely persisted');
        } else {
          logger.warn(
            { gameId: room.gameId, reason: res.reason, error: res.error },
            'Game summary persistence skipped or failed'
          );
        }
      })
      .catch((err) => {
        logger.error({ gameId: room.gameId, err: err.message }, 'Unexpected error in persistence dispatch');
      });
  }

  /**
   * Clear all active turn timers on a room and increment turn/drawer generation IDs.
   * Does NOT touch recovery timers — use clearRecoveryTimers() for those.
   * @param {Object} room
   */
  clearTurnTimers(room) {
    // H-08: Only bump turn-related generations here
    room.turnGen = (room.turnGen || 0) + 1;
    room.drawerPauseGen = (room.drawerPauseGen || 0) + 1;

    if (room.turnTimer) clearInterval(room.turnTimer);
    if (room.wordSelectionTimer) clearTimeout(room.wordSelectionTimer);
    if (room.drawerPauseTimer) clearTimeout(room.drawerPauseTimer);
    if (room.turnResultsTimer) clearTimeout(room.turnResultsTimer);

    room.turnTimer = null;
    room.wordSelectionTimer = null;
    room.drawerPauseTimer = null;
    room.turnResultsTimer = null;
  }

  /**
   * Clear recovery-specific timers and bump recovery generation.
   * Must be called explicitly when entering or exiting recovery state.
   * @param {Object} room
   */
  clearRecoveryTimers(room) {
    room.recoveryGen = (room.recoveryGen || 0) + 1;

    if (room.recoveryTimer) clearTimeout(room.recoveryTimer);
    if (room.recoveryCountdownTimer) clearInterval(room.recoveryCountdownTimer);

    room.recoveryTimer = null;
    room.recoveryCountdownTimer = null;
  }
}

export const gameEngine = new GameEngine();
