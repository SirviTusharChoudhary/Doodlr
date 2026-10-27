/**
 * Doodlr - Pure Domain Game Rules & Utilities
 *
 * All functions are pure, deterministic, and testable without side-effects.
 * Note: Secret word matching and hint selection logic are pure domain functions
 * that in production are called strictly on the server to prevent exposing
 * secret words to unauthorized clients.
 */

import {
  GAME_CONSTANTS,
  GAME_PHASES,
  PLAYER_CONNECTION_STATUS,
  PLAYER_ROLES
} from './constants.js';

/**
 * Normalize username: trim, collapse internal spaces, remove forbidden characters
 * @param {string} username
 * @returns {string}
 */
export function normalizeUsername(username) {
  if (typeof username !== 'string') return '';
  return username
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-zA-Z0-9_\- ]/g, '');
}

/**
 * Normalize guess text for consistent comparison
 * Trims, lowercases, collapses whitespace, removes diacritics
 * @param {string} text
 * @returns {string}
 */
export function normalizeGuess(text) {
  if (typeof text !== 'string') return '';
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Check if a guess matches the secret word exactly (normalized)
 * @param {string} guess
 * @param {string} secretWord
 * @returns {boolean}
 */
export function isExactMatch(guess, secretWord) {
  const normGuess = normalizeGuess(guess);
  const normSecret = normalizeGuess(secretWord);
  if (!normGuess || !normSecret) return false;
  return normGuess === normSecret;
}


/**
 * Calculate speed-based guesser points
 * Formula: 100 + floor(400 * (remainingTime / turnDuration))
 * Clamped strictly to [100, 500]
 * @param {number} remainingTime - Time left in seconds
 * @param {number} turnDuration - Total turn duration in seconds
 * @returns {number} Integer points between 100 and 500
 */
export function calculateGuesserScore(remainingTime, turnDuration) {
  if (turnDuration <= 0) return GAME_CONSTANTS.MIN_GUESSER_POINTS;
  const ratio = Math.max(0, Math.min(1, remainingTime / turnDuration));
  const points = GAME_CONSTANTS.MIN_GUESSER_POINTS + Math.floor(400 * ratio);
  return Math.min(
    GAME_CONSTANTS.MAX_GUESSER_POINTS,
    Math.max(GAME_CONSTANTS.MIN_GUESSER_POINTS, points)
  );
}

/**
 * Calculate drawer bonus points at the end of a turn
 * 50 points per unique correct guesser. 0 if turn is forfeited.
 * @param {number} uniqueSolversCount
 * @param {boolean} [isForfeited=false]
 * @returns {number}
 */
export function calculateDrawerBonus(uniqueSolversCount, isForfeited = false) {
  if (isForfeited || uniqueSolversCount <= 0) return 0;
  return GAME_CONSTANTS.DRAWER_BONUS_PER_GUESSER * uniqueSolversCount;
}

/**
 * Check if a character is a maskable/revealable letter (ASCII letter A-Z, case-insensitive)
 * Spaces, punctuation, and digits are never masked and never chosen as hints (H-02).
 * @param {string} char
 * @returns {boolean}
 */
export function isMaskableLetter(char) {
  return /^[a-zA-Z]$/.test(char);
}

/**
 * Create initial masked representation of the secret word
 * Letters become '_', while spaces and punctuation remain unchanged.
 * @param {string} secretWord
 * @returns {string} Masked string with characters separated by spaces for display
 */
export function initializeWordMask(secretWord) {
  if (!secretWord) return '';
  return secretWord
    .split('')
    .map((char) => (isMaskableLetter(char) ? '_' : char))
    .join(' ');
}

/**
 * Reveal an unrevealed letter character across all occurrences
 * Selects a random unrevealed letter, reveals all instances of it.
 * Spaces and punctuation are never picked.
 * @param {string} secretWord
 * @param {string} currentMask - Current masked string with space separators
 * @returns {{ newMask: string, revealedLetter: string|null }}
 */
export function revealHintLetter(secretWord, currentMask) {
  if (!secretWord || !currentMask) {
    return { newMask: currentMask, revealedLetter: null };
  }

  const wordChars = secretWord.split('');
  // currentMask is space-separated representation: 'c _ _ t' -> array of chars
  const maskChars = currentMask.split(' ');

  // Identify all distinct unrevealed letter characters (digits/punctuation are never hints)
  const unrevealedLetters = new Set();
  for (let i = 0; i < wordChars.length; i++) {
    const char = wordChars[i];
    if (isMaskableLetter(char) && maskChars[i] === '_') {
      unrevealedLetters.add(char.toUpperCase());
    }
  }

  if (unrevealedLetters.size === 0) {
    return { newMask: currentMask, revealedLetter: null };
  }

  // Pick a random unrevealed letter
  const candidates = Array.from(unrevealedLetters);
  const randomIndex = Math.floor(Math.random() * candidates.length);
  const chosenLetter = candidates[randomIndex];

  // Reveal all occurrences of the chosen letter (case-preserving from secretWord)
  for (let i = 0; i < wordChars.length; i++) {
    if (wordChars[i].toUpperCase() === chosenLetter) {
      maskChars[i] = wordChars[i];
    }
  }

  return {
    newMask: maskChars.join(' '),
    revealedLetter: chosenLetter
  };
}


/**
 * Check which players are eligible to participate in a full round snapshot
 * Excludes spectators, inactive players, and players with expired disconnect grace
 * @param {Array<Object>} players
 * @returns {Array<Object>}
 */
export function getEligiblePlayers(players) {
  if (!Array.isArray(players)) return [];
  return players.filter((player) => {
    if (!player) return false;
    const isSpectator = player.role === PLAYER_ROLES.SPECTATOR;
    const isConnectedOrGrace =
      player.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED ||
      player.connectionStatus === PLAYER_CONNECTION_STATUS.DISCONNECTED_GRACE;

    return !isSpectator && isConnectedOrGrace;
  });
}

/**
 * Build a deterministic cyclic turn order for a full round
 * Advances the starting player across full rounds so the same drawer isn't always first
 * @param {Array<Object>} eligiblePlayers - Snapshot of eligible players
 * @param {number} roundIndex - 1-indexed full round number
 * @returns {Array<Object>} Scheduled drawer order for the full round
 */
export function buildFullRoundTurnOrder(eligiblePlayers, roundIndex = 1) {
  if (!Array.isArray(eligiblePlayers) || eligiblePlayers.length === 0) return [];

  // Deterministically sort by id
  const sorted = [...eligiblePlayers].sort((a, b) => (a.id > b.id ? 1 : -1));

  // Advance starting position across full rounds
  const offset = Math.max(0, roundIndex - 1) % sorted.length;
  const scheduled = [];

  for (let i = 0; i < sorted.length; i++) {
    const index = (offset + i) % sorted.length;
    scheduled.push(sorted[index]);
  }

  return scheduled;
}

/**
 * Compute final rankings from player scores with deterministic tie-breaking
 * @param {Array<Object>} players
 * @returns {Array<Object>} Sorted players with rank (1-indexed)
 */
export function calculateFinalRankings(players) {
  if (!Array.isArray(players)) return [];

  // Sort descending by score; break ties deterministically by earliest join or id
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const aTime = a.joinedAt || 0;
    const bTime = b.joinedAt || 0;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id > b.id ? 1 : -1;
  });

  // Competition (standard) ranking: equal scores share the same rank.
  // The next rank after a group of ties skips as many positions as the group size.
  // e.g. scores [100, 100, 80] → ranks [1, 1, 3]
  let currentRank = 1;
  return sorted.map((player, index) => {
    if (index > 0 && player.score !== sorted[index - 1].score) {
      currentRank = index + 1;
    }
    return {
      rank: currentRank,
      id: player.id,
      username: player.username,
      avatar: player.avatar,
      score: player.score
    };
  });
}

/**
 * Validate allowed phase transitions in the state machine
 * @param {string} currentPhase
 * @param {string} targetPhase
 * @returns {boolean}
 */
export function isValidPhaseTransition(currentPhase, targetPhase) {
  const transitions = {
    [GAME_PHASES.LOBBY]: [GAME_PHASES.ROUND_SETUP, GAME_PHASES.CLOSED],
    [GAME_PHASES.ROUND_SETUP]: [GAME_PHASES.WORD_SELECTION, GAME_PHASES.RECOVERY, GAME_PHASES.CLOSED],
    [GAME_PHASES.WORD_SELECTION]: [
      GAME_PHASES.DRAWING,
      GAME_PHASES.ROUND_SETUP,
      GAME_PHASES.TURN_RESULTS,
      GAME_PHASES.RECOVERY,
      GAME_PHASES.CLOSED
    ],
    [GAME_PHASES.DRAWING]: [
      GAME_PHASES.TURN_RESULTS,
      GAME_PHASES.RECOVERY,
      GAME_PHASES.CLOSED
    ],
    [GAME_PHASES.TURN_RESULTS]: [
      GAME_PHASES.WORD_SELECTION,
      GAME_PHASES.ROUND_SETUP,
      GAME_PHASES.GAME_RESULTS,
      GAME_PHASES.RECOVERY,
      GAME_PHASES.CLOSED
    ],
    [GAME_PHASES.GAME_RESULTS]: [
      GAME_PHASES.LOBBY,
      GAME_PHASES.ROUND_SETUP,
      GAME_PHASES.CLOSED
    ],
    [GAME_PHASES.RECOVERY]: [
      GAME_PHASES.DRAWING,
      GAME_PHASES.WORD_SELECTION,
      GAME_PHASES.ROUND_SETUP,
      GAME_PHASES.TURN_RESULTS,
      GAME_PHASES.GAME_RESULTS,
      GAME_PHASES.CLOSED
    ],
    [GAME_PHASES.CLOSED]: []
  };

  const allowed = transitions[currentPhase] || [];
  return allowed.includes(targetPhase);
}
