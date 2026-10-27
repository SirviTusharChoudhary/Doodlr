/**
 * Doodlr - Shared Socket.IO Event Names & Message Contracts
 *
 * Each event defines:
 * - Direction (Client -> Server or Server -> Client)
 * - Required Role & Authorization
 * - Recipient Scope
 * - Payload structure and expected Acknowledgement
 */

export const SOCKET_EVENTS = {
  // ==========================================
  // CLIENT -> SERVER EVENTS
  // ==========================================

  /**
   * Explicitly create a new private room
   * Role: Guest
   * Payload: { username, avatar, settings?, reconnectToken? }
   * Ack: { success: boolean, data?: { room: SafePublicRoomState, player: PrivatePlayerState, token: string }, error?: string }
   */
  CREATE_ROOM: 'room:create',

  /**
   * Join an existing room
   * Role: Guest
   * Payload: { username, avatar, roomCode, reconnectToken? }
   * Ack: { success: boolean, data?: { room: SafePublicRoomState, player: PrivatePlayerState, token: string }, error?: string }
   */
  JOIN_ROOM: 'room:join',

  /**
   * Explicitly leave the current room
   * Role: Any connected player
   * Payload: {}
   * Ack: { success: boolean }
   */
  LEAVE_ROOM: 'room:leave',

  /**
   * Update room settings (Private rooms only)
   * Role: Room Host in LOBBY phase
   * Payload: RoomSettingsSchema
   * Ack: { success: boolean, error?: string }
   */
  UPDATE_SETTINGS: 'room:update_settings',

  /**
   * Manually start the game (Private rooms only)
   * Role: Room Host in LOBBY phase with >= 2 active players
   * Payload: {}
   * Ack: { success: boolean, error?: string }
   */
  START_GAME: 'game:start',

  /**
   * Drawer selects one of the 3 secret word choices
   * Role: Current Drawer in WORD_SELECTION phase
   * Payload: { wordIndex?: number, word?: string }
   * Ack: { success: boolean, error?: string }
   */
  SELECT_WORD: 'game:select_word',

  /**
   * Submit a drawing stroke mutation
   * Role: Current Drawer in DRAWING phase
   * Payload: StrokeSchema
   * Ack: { success: boolean, sequence?: number, error?: string }
   */
  SUBMIT_STROKE: 'draw:stroke',

  /**
   * Clear canvas
   * Role: Current Drawer in DRAWING phase
   * Payload: {}
   * Ack: { success: boolean, error?: string }
   */
  CLEAR_CANVAS: 'draw:clear',

  /**
   * Undo the last completed stroke
   * Role: Current Drawer in DRAWING phase
   * Payload: {}
   * Ack: { success: boolean, error?: string }
   */
  UNDO_STROKE: 'draw:undo',

  /**
   * Submit a word guess
   * Role: Active Guesser in DRAWING phase (Rate limited: <= 5 per 3s)
   * Payload: { text: string }
   * Ack: { success: boolean, isCorrect?: boolean, error?: string }
   */
  SUBMIT_GUESS: 'guess:submit',

  /**
   * Send a general room chat message
   * Role: Any connected player when chat is permitted
   * Payload: { text: string }
   * Ack: { success: boolean, error?: string }
   */
  SEND_CHAT: 'chat:send',

  /**
   * Play again with same players (Private room host)
   * Role: Room Host in GAME_RESULTS phase
   * Payload: {}
   * Ack: { success: boolean, error?: string }
   */
  PLAY_AGAIN: 'game:play_again',

  /**
   * Return room to lobby (Private room host)
   * Role: Room Host in GAME_RESULTS phase
   * Payload: {}
   * Ack: { success: boolean, error?: string }
   */
  RETURN_TO_LOBBY: 'game:return_to_lobby',

  // ==========================================
  // SERVER -> CLIENT EVENTS
  // ==========================================

  /**
   * Authoritative room state synchronization
   * Recipients: Broadcast to room or targeted to single client
   * Payload: SafePublicRoomState
   */
  ROOM_STATE: 'room:state',

  /**
   * Targeted join acknowledgement with private token & player info
   * Recipients: Target client only
   * Payload: { room: SafePublicRoomState, player: PrivatePlayerState, token: string }
   */
  ROOM_JOINED: 'room:joined',

  /**
   * Room error notification
   * Recipients: Target client or room
   * Payload: { code: string, message: string }
   */
  ROOM_ERROR: 'room:error',

  /**
   * New player joined the room
   * Recipients: Room broadcast
   * Payload: { player: SafePublicPlayerState }
   */
  PLAYER_JOINED: 'player:joined',

  /**
   * Player left or disconnected
   * Recipients: Room broadcast
   * Payload: { playerId: string, username: string, reason: string }
   */
  PLAYER_LEFT: 'player:left',

  /**
   * Host role transferred to next oldest player
   * Recipients: Room broadcast
   * Payload: { newHostId: string, username: string }
   */
  HOST_TRANSFERRED: 'host:transferred',

  /**
   * Game has officially started
   * Recipients: Room broadcast
   * Payload: { totalRounds: number, startingPlayerId: string }
   */
  GAME_STARTED: 'game:started',

  /**
   * Word choices sent exclusively to drawer (NEVER broadcast)
   * Recipients: Current Drawer ONLY
   * Payload: { choices: string[], timeoutSeconds: number }
   */
  WORD_CHOICES: 'game:word_choices',

  /**
   * Secret word sent exclusively to the active drawer (NEVER broadcast)
   * Recipients: Current Drawer ONLY
   * Payload: { secretWord: string }
   */
  SECRET_WORD: 'game:secret_word',

  /**
   * Turn started with masked word for guessers
   * Recipients: Room broadcast
   * Payload: { drawerId: string, drawerUsername: string, wordMask: string, wordLength: number, duration: number }
   */
  TURN_STARTED: 'turn:started',

  /**
   * Hint revealed: a letter character revealed across all occurrences
   * Recipients: Room broadcast (drawer, guessers, spectators)
   * Payload: { wordMask: string, revealedLetter: string }
   */
  TURN_HINT: 'turn:hint',

  /**
   * Authoritative timer tick
   * Recipients: Room broadcast
   * Payload: { remainingTime: number, totalDuration: number }
   */
  TURN_TICK: 'turn:tick',

  /**
   * Stroke broadcast for live canvas rendering
   * Recipients: Room broadcast (excluding sender socket)
   * Payload: StrokeSchema
   */
  STROKE_DRAWN: 'draw:stroke_drawn',

  /**
   * Canvas cleared broadcast
   * Recipients: Room broadcast (excluding sender socket)
   * Payload: {}
   */
  CANVAS_CLEARED: 'draw:cleared',

  /**
   * Canvas undo broadcast
   * Recipients: Room broadcast (excluding sender socket)
   * Payload: { undoneStrokeId?: string }
   */
  STROKE_UNDONE: 'draw:undone',

  /**
   * Ephemeral drawing snapshot for reconnecting players / spectators
   * Recipients: Single connecting client
   * Payload: { strokes: StrokeSchema[] }
   */
  DRAWING_SNAPSHOT: 'draw:snapshot',

  /**
   * Raw guess chat message
   * Recipients: STRICTLY Drawer and Active Unsolved Guessers ONLY
   * (Never sent to solved players, spectators, or public logs)
   * Payload: { id: string, type: 'guess', playerId: string, username: string, text: string, timestamp: string }
   */
  GUESS_MESSAGE: 'guess:message',

  /**
   * General room chat message
   * Recipients: All permitted players in the room
   * Payload: { id: string, type: 'chat', playerId: string, username: string, text: string, timestamp: string }
   */
  CHAT_MESSAGE: 'chat:message',

  /**
   * Authoritative system notice
   * Recipients: Room broadcast or targeted client
   * Payload: { id: string, type: 'system', text: string, timestamp: string, level?: string }
   */
  SYSTEM_MESSAGE: 'chat:system',


  /**
   * Notification that a player solved the secret word
   * Recipients: Room broadcast (does NOT reveal the secret word)
   * Payload: { playerId: string, username: string, pointsEarned: number, order: number }
   */
  PLAYER_SOLVED: 'player:solved',

  /**
   * Turn ended summary: reveals secret word, points awarded, drawer bonus
   * Recipients: Room broadcast
   * Payload: { secretWord: string, reason: string, solvers: Array<{ playerId: string, points: number }>, drawerBonus: number }
   */
  TURN_ENDED: 'turn:ended',

  /**
   * Game ended with final scoreboard and podium
   * Recipients: Room broadcast
   * Payload: { rankings: Array<{ rank: number, playerId: string, username: string, avatar: string, score: number }> }
   */
  GAME_ENDED: 'game:ended',


  /**
   * Reconnect recovery notification
   * Recipients: Reconnecting client
   * Payload: { room: SafePublicRoomState, player: PrivatePlayerState }
   */
  RECONNECT_SUCCESS: 'auth:reconnect_success'
};

/**
 * @typedef {Object} SafePublicPlayerState
 * @property {string} id - Stable player guest ID
 * @property {string} username - Display name unique within room
 * @property {string} avatar - Selected preset avatar
 * @property {number} score - Authoritative cumulative score
 * @property {string} role - One of PLAYER_ROLES
 * @property {string} connectionStatus - One of PLAYER_CONNECTION_STATUS
 * @property {boolean} isHost - Whether player has host privileges
 * @property {boolean} isSolved - Whether player has solved the current turn's word
 */

/**
 * @typedef {Object} SafePublicRoomState
 * @property {string} roomCode - Room identifier
 * @property {string} phase - Current GAME_PHASES
 * @property {number} currentRound - Current full round (1-indexed)
 * @property {number} totalRounds - Total full rounds in game
 * @property {number} currentTurnIndex - Current drawer index in turn queue
 * @property {number} totalTurnsInRound - Scheduled turns in this round snapshot
 * @property {string|null} currentDrawerId - ID of active drawer
 * @property {string} wordMask - Hidden representation (e.g. "_ _ _ _ _")
 * @property {number} wordLength - Length of secret word in characters
 * @property {number} remainingTime - Authoritative remaining time in seconds
 * @property {number} turnDuration - Current turn duration in seconds
 * @property {SafePublicPlayerState[]} players - Public player states
 * @property {Object} settings - Active room configuration
 * @property {boolean} isRecovery - Whether room is in <2 player recovery window
 * @property {number} recoveryRemainingTime - Seconds remaining in recovery window
 */

/**
 * @typedef {Object} PrivatePlayerState
 * @property {string} guestId - Stable bearer identifier
 * @property {string} [reconnectToken] - Signed bearer reconnect JWT
 * @property {string} [secretWord] - Strictly present ONLY if drawer in DRAWING/WORD_SELECTION
 * @property {string[]} [wordChoices] - Strictly present ONLY if drawer in WORD_SELECTION
 * @property {Object} permissions - Derived permissions from derivePlayerPermissions
 */
