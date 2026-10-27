/**
 * Doodlr - Shared Game Constants and Phase/Role Definitions
 * Centralized configuration across client and server.
 */

export const APP_NAME = 'SketchSprint';
export const APP_TAGLINE = 'Draw fast. Guess faster.';

/**
 * LocalStorage Keys
 */
export const STORAGE_KEYS = {
  USERNAME: 'doodlr_username',
  AVATAR: 'doodlr_avatar',
  GUEST_ID: 'doodlr_guest_id',
  RECONNECT_TOKEN: 'doodlr_reconnect_token'
};

/**
 * Game Phases State Machine
 * @readonly
 * @enum {string}
 */
export const GAME_PHASES = {
  LOBBY: 'LOBBY',                   // Private room waiting for host to configure / start
  ROUND_SETUP: 'ROUND_SETUP',       // Establishing eligible-player snapshot & turn order
  WORD_SELECTION: 'WORD_SELECTION', // Drawer choosing secret word (10s timer)
  DRAWING: 'DRAWING',               // Active turn: drawing & guessing in progress
  TURN_RESULTS: 'TURN_RESULTS',     // Turn ended: score summary, reveal word
  GAME_RESULTS: 'GAME_RESULTS',     // Full game ended: final podium & rankings
  RECOVERY: 'RECOVERY',             // Player count dropped < 2; 15s grace window
  CLOSED: 'CLOSED'                  // Room terminated / archived
};

/**
 * Player Connection Status
 * @readonly
 * @enum {string}
 */
export const PLAYER_CONNECTION_STATUS = {
  CONNECTED: 'CONNECTED',
  DISCONNECTED_GRACE: 'DISCONNECTED_GRACE',
  INACTIVE: 'INACTIVE',
  LEFT: 'LEFT'
};

/**
 * Player Gameplay Roles
 * @readonly
 * @enum {string}
 */
export const PLAYER_ROLES = {
  DRAWER: 'DRAWER',
  ACTIVE_GUESSER: 'ACTIVE_GUESSER',
  SOLVED: 'SOLVED',
  SPECTATOR: 'SPECTATOR'
};


/**
 * Turn Outcomes
 * @readonly
 * @enum {string}
 */
export const TURN_OUTCOMES = {
  COMPLETED: 'completed',
  TIMEOUT: 'timeout',
  SKIPPED: 'skipped',
  FORFEITED: 'forfeited'
};

/**
 * Chat and Guess Message Types
 * @readonly
 * @enum {string}
 */
export const MESSAGE_TYPES = {
  CHAT: 'chat',
  GUESS: 'guess',
  SYSTEM: 'system'
};

/**
 * Central Game Limits & Numerical Rules
 */
export const GAME_CONSTANTS = {
  // Player settings
  MIN_USERNAME_LENGTH: 3,
  MAX_USERNAME_LENGTH: 16,
  PRESET_AVATARS: [
    'cat',
    'dog',
    'fox',
    'panda',
    'bear',
    'rabbit',
    'koala',
    'lion'
  ],

  // Room limits
  MAX_ACTIVE_ROOMS: 500,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  DEFAULT_ROUNDS: 2,
  MIN_ROUNDS: 1,
  MAX_ROUNDS: 5,

  // Turn timing (seconds)
  DEFAULT_TURN_DURATION: 60,
  ALLOWED_TURN_DURATIONS: [30, 45, 60, 75, 90],
  WORD_SELECTION_TIMEOUT: 10,
  HINT_TIMES: [20, 45],
  TURN_RESULTS_DURATION: 5,

  // Disconnect & recovery policies (seconds)
  DRAWER_DISCONNECT_GRACE: 10,
  GUESSER_DISCONNECT_GRACE: 10,
  HOST_DISCONNECT_GRACE: 10,
  ROOM_RECOVERY_TIMEOUT: 15,
  PRIVATE_ROOM_REJOIN_WINDOW: 60,

  // Canvas logical coordinates & limits
  CANVAS_WIDTH: 1000,
  CANVAS_HEIGHT: 600,
  MAX_STROKES_PER_TURN: 300,
  MAX_POINTS_PER_TURN: 12000,
  MAX_STROKE_POINTS: 1000,
  MIN_BRUSH_SIZE: 1,
  MAX_BRUSH_SIZE: 50,
  DEFAULT_BRUSH_SIZE: 4,
  DEFAULT_BRUSH_COLOR: '#000000',

  // Guessing & Rate limits
  MAX_GUESSES_PER_WINDOW: 5,
  GUESS_RATE_WINDOW_MS: 3000,
  MAX_GUESS_LENGTH: 64,

  // Scoring
  MIN_GUESSER_POINTS: 100,
  MAX_GUESSER_POINTS: 500,
  DRAWER_BONUS_PER_GUESSER: 50,


  // Word categories
  BUILTIN_CATEGORIES: [
    'animals',
    'food',
    'objects',
    'places',
    'activities',
    'technology'
  ]
};

/**
 * Derived permissions for a player based on explicit status and phase
 * @param {Object} player
 * @param {string} player.role - One of PLAYER_ROLES
 * @param {string} player.connectionStatus - One of PLAYER_CONNECTION_STATUS
 * @param {boolean} [player.isHost]
 * @param {string} gamePhase - One of GAME_PHASES
 * @returns {Object} Explicit permission flags
 */
export function derivePlayerPermissions(player, gamePhase) {
  const isConnected = player.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED;
  const isDrawer = player.role === PLAYER_ROLES.DRAWER;
  const isActiveGuesser = player.role === PLAYER_ROLES.ACTIVE_GUESSER;
  const isSolved = player.role === PLAYER_ROLES.SOLVED;
  const isSpectator = player.role === PLAYER_ROLES.SPECTATOR;
  const isHost = Boolean(player.isHost);

  return {
    // Drawing permissions
    canDraw: isConnected && isDrawer && gamePhase === GAME_PHASES.DRAWING,
    canSelectWord: isConnected && isDrawer && gamePhase === GAME_PHASES.WORD_SELECTION,

    // Guessing permissions (strictly active unsolved guessers during DRAWING)
    canGuess: isConnected && isActiveGuesser && gamePhase === GAME_PHASES.DRAWING,

    // Chat permissions (solved players and drawer cannot chat during DRAWING)
    canChat:
      isConnected &&
      !isSpectator &&
      (gamePhase === GAME_PHASES.LOBBY ||
        gamePhase === GAME_PHASES.TURN_RESULTS ||
        gamePhase === GAME_PHASES.GAME_RESULTS ||
        (gamePhase === GAME_PHASES.DRAWING && isActiveGuesser)),

    // Host controls
    canChangeSettings: isConnected && isHost && gamePhase === GAME_PHASES.LOBBY,
    canStartGame: isConnected && isHost && gamePhase === GAME_PHASES.LOBBY,

    // View status indicators
    isDrawer,
    isActiveGuesser,
    isSolved,
    isSpectator,
    isConnected
  };
}
