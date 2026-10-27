import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Clock,
  Palette,
  Trophy,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  Send,
  RotateCcw,
  Home,
  LogOut,
  Users,
  Eye,
  Crown,
  Medal
} from 'lucide-react';
import {
  GAME_PHASES,
  PLAYER_ROLES,
  PLAYER_CONNECTION_STATUS
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import { AvatarBadge } from './AvatarPicker.jsx';
import ChatPanel from './ChatPanel.jsx';
import DrawingCanvas from './DrawingCanvas.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function GameEngineView() {
  const shouldReduceMotion = useReducedMotion();
  const {
    roomState,
    playerState,
    wordChoices,
    secretWord,
    turnSummary,
    gameRankings,
    guessMessages,
    selectWord,
    submitGuess,
    playAgain,
    returnToLobby,
    leaveRoom,
    error,
    clearError,
    rateLimitWarning
  } = useGame();
  const navigate = useNavigate();
  const [clockNow, setClockNow] = useState(Date.now());

  const handleLeaveGame = () => {
    leaveRoom();
    navigate('/');
  };

  useEffect(() => {
    if (!roomState?.phaseDeadlineAt) return undefined;
    const updateClock = () => setClockNow(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 250);
    return () => window.clearInterval(timer);
  }, [roomState?.phaseDeadlineAt]);

  if (!roomState) return null;

  const myGuestId = playerState?.guestId || localStorage.getItem('doodlr_guest_id');
  const myPlayer = roomState.players?.find((p) => p.id === myGuestId);
  const isDrawer = roomState.currentDrawerId === myGuestId;
  const isHost = Boolean(myPlayer?.isHost);
  const isSolved = Boolean(myPlayer?.isSolved) || myPlayer?.role === PLAYER_ROLES.SOLVED;
  const isSpectator = myPlayer?.role === PLAYER_ROLES.SPECTATOR;
  const currentDrawer = roomState.players?.find((p) => p.id === roomState.currentDrawerId);

  const remainingSeconds = roomState.remainingTime ?? roomState.turnDuration ?? 60;
  const isUrgent = remainingSeconds <= 10;

  const phaseRemainingSeconds = roomState.phaseDeadlineAt
    ? Math.max(0, Math.ceil((roomState.phaseDeadlineAt - clockNow) / 1000))
    : null;

  const handleSelectWord = async (word) => {
    try {
      await selectWord(word);
    } catch {
      // Error handled in context
    }
  };

  return (
    <div className="arcade-shell flex flex-col justify-between p-3 md:p-4 select-none">
      {/* Top Header / Authoritative Engine State */}
      <header className="arcade-topbar max-w-7xl mx-auto w-full flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeaveGame}
            className="gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave Game
          </Button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white rounded border border-slate-200 shadow-xs text-xs font-bold text-slate-700">
            <span className="text-slate-400">Room:</span>
            <span className="font-mono text-blue-600 font-extrabold">{roomState.roomCode}</span>
          </div>
        </div>

        {/* Center: Authoritative Turn / Round Status */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="px-3.5 py-1.5 bg-white/90 backdrop-blur rounded border border-blue-200 shadow-xs flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Round {roomState.currentRound} / {roomState.totalRounds}
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-bold text-blue-600">
              Turn {(roomState.currentTurnIndex || 0) + 1} / {roomState.totalTurnsInRound || roomState.players?.length || 1}
            </span>
          </div>

          {/* Authoritative Timer */}
          {roomState.phase === GAME_PHASES.DRAWING && (
            <motion.div
              animate={isUrgent ? { scale: [1, 1.08, 1] } : {}}
              transition={isUrgent ? { repeat: Infinity, duration: 0.8 } : {}}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded border font-mono font-extrabold text-sm shadow-xs transition-colors ${isUrgent
                  ? 'bg-rose-50 text-rose-600 border-rose-300'
                  : 'bg-white text-slate-800 border-blue-200'
                }`}
            >
              <Clock className={`w-4 h-4 ${isUrgent ? 'text-rose-500 animate-pulse' : 'text-blue-500'}`} />
              <span>{remainingSeconds}s</span>
            </motion.div>
          )}
        </div>

        {/* Right: Role indicator */}
        <div className="flex items-center gap-2">
          {isDrawer ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold border border-blue-700 shadow-[0_2px_0_#1d4ed8]">
              <Palette className="w-3.5 h-3.5" />
              <span>You are Drawing</span>
            </div>
          ) : isSolved ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-bold border border-emerald-700 shadow-[0_2px_0_#047857]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Solved</span>
            </div>
          ) : isSpectator ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-600 text-white rounded text-xs font-bold border border-slate-700">
              <Eye className="w-3.5 h-3.5" />
              <span>Spectating</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold border border-blue-700 shadow-[0_2px_0_#1d4ed8]">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Guessing</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Dynamic Game Stage */}
      <main className="arcade-game-main max-w-7xl mx-auto w-full py-2 grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Left Column: Stage Area (Word Selection / Drawing Canvas Area / Results) */}
        <div className="lg:col-span-3 space-y-3">
          {/* Recovery Warning Banner */}
          {(error || rateLimitWarning) && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between">
              <span>{error || rateLimitWarning}</span>
              {error && (
                <button type="button" onClick={clearError} className="ml-3 underline">
                  Dismiss
                </button>
              )}
            </div>
          )}

          {roomState.isRecovery && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="arcade-panel p-3.5 bg-blue-50 border-blue-300 text-blue-900 font-bold text-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0" />
                <span>
                  Waiting for players to reconnect... ({roomState.recoveryRemainingTime || 15}s remaining before early game end)
                </span>
              </div>
            </motion.div>
          )}

          {/* Phase 1: Round Setup */}
          {roomState.phase === GAME_PHASES.ROUND_SETUP && (
            <div className="arcade-panel p-10 text-center space-y-4">
              <Sparkles className="w-10 h-10 text-blue-600 mx-auto animate-spin" />
              <h2 className="text-xl font-extrabold text-slate-800">
                Starting Round {roomState.currentRound}...
              </h2>
              <p className="text-xs text-slate-500">Preparing player turn order and word pool.</p>
            </div>
          )}

          {/* Phase 2: Word Selection */}
          {roomState.phase === GAME_PHASES.WORD_SELECTION && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="arcade-panel p-6 md:p-8 text-center space-y-6"
            >
              {isDrawer ? (
                <div className="space-y-6 max-w-xl mx-auto">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200">
                      <Palette className="w-4 h-4 text-blue-600" /> Your Turn to Draw!
                    </div>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800">
                      Choose Your Secret Word
                    </h2>
                    <p className="text-xs text-slate-500">
                      Select one of the 3 words below. If time expires, a default word will be chosen.
                    </p>
                    <div className={`mx-auto w-fit flex items-center gap-1.5 px-3 py-1.5 rounded border font-mono text-sm font-extrabold ${phaseRemainingSeconds <= 3 ? 'bg-rose-50 border-rose-300 text-rose-600' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
                      <Clock className="w-4 h-4" />
                      Choose in {phaseRemainingSeconds ?? 10}s
                    </div>
                  </div>

                  {/* 3 Word Buttons or Loading Spinner (M-09) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    {Array.isArray(wordChoices) && wordChoices.length > 0 ? (
                      wordChoices.map((word) => (
                        <button
                          key={word}
                          type="button"
                          onClick={() => handleSelectWord(word)}
                          className="py-4 px-4 rounded bg-white hover:bg-blue-50 border-2 border-blue-300 text-blue-700 font-extrabold text-base shadow-[0_2px_0_#93c5fd] hover:border-blue-500 transition-all cursor-pointer capitalize active:translate-y-[2px]"
                        >
                          {word}
                        </button>
                      ))
                    ) : (
                      <div className="col-span-full py-8 flex flex-col items-center justify-center gap-3 text-slate-500">
                        <div className="w-7 h-7 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-slate-600">Generating secret word options...</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 space-y-4 max-w-md mx-auto">
                  <div className="w-14 h-14 rounded bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto animate-pulse">
                    <Palette className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-800">
                    {currentDrawer?.username || 'Drawer'} is choosing a word...
                  </h3>
                  <p className="text-xs text-slate-500">
                    Get ready! Drawing starts in {phaseRemainingSeconds ?? 10}s.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Phase 3: Active Drawing Turn */}
          {roomState.phase === GAME_PHASES.DRAWING && (
            <div className="space-y-4">
              {/* Word Header / Mask Banner */}
              <div className="arcade-panel p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {isDrawer ? 'Secret Word to Draw' : `Word Mask (${roomState.wordLength || 0} letters)`}
                  </span>
                  <div className="pt-1">
                    {isDrawer ? (
                      <div className="text-2xl md:text-3xl font-extrabold text-blue-600 tracking-wider capitalize">
                        {secretWord || roomState.secretWord || '***'}
                      </div>
                    ) : (
                      <div className="font-mono text-2xl md:text-3xl font-extrabold text-slate-800 tracking-[0.35em]">
                        {roomState.wordMask || '_ '.repeat(roomState.wordLength || 4)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-500">
                    Drawer: <span className="font-bold text-slate-800">{currentDrawer?.username || 'Player'}</span>
                  </div>
                  {roomState.hintsEnabled && !isDrawer && (
                    <div className="text-[11px] font-medium text-blue-600">
                      Hints revealed at 20s & 45s
                    </div>
                  )}
                </div>
              </div>

              {/* Live Synchronized Konva Drawing Canvas */}
              <DrawingCanvas />
            </div>
          )}

          {/* Phase 4: Turn Results */}
          {roomState.phase === GAME_PHASES.TURN_RESULTS && (
            <div className="space-y-4">
              {/* Keep canvas visible for turn-result transition */}
              <DrawingCanvas />

              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="arcade-panel p-5 md:p-6 text-center space-y-4"
              >
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                    Turn Completed
                  </span>
                  <h3 className="text-2xl font-extrabold text-slate-800">
                    The word was <span className="text-blue-600 capitalize">"{turnSummary?.secretWord || secretWord || roomState.secretWord}"</span>
                  </h3>
                  {turnSummary?.drawerBonus > 0 && (
                    <p className="text-xs font-bold text-emerald-600">
                      +{turnSummary.drawerBonus} pts drawer bonus awarded to {turnSummary.drawerUsername}
                    </p>
                  )}
                </div>

                {/* Solvers List */}
                <div className="max-w-md mx-auto space-y-2">
                  <span className="text-xs font-bold uppercase text-slate-400">Correct Guessers:</span>
                  {turnSummary?.solvers && turnSummary.solvers.length > 0 ? (
                    <div className="space-y-1.5">
                      {turnSummary.solvers.map((s, idx) => (
                        <div
                          key={s.playerId || idx}
                          className="flex items-center justify-between p-2.5 rounded bg-emerald-50/70 border border-emerald-200 text-xs font-bold text-emerald-900"
                        >
                          <span>{s.username}</span>
                          <span className="text-emerald-700">+{s.points} pts</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic py-1">No one guessed the word in time!</p>
                  )}
                </div>

                <div className="pt-1 text-xs font-semibold text-slate-400 flex items-center justify-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Next turn in {phaseRemainingSeconds ?? 5}s
                </div>
              </motion.div>
            </div>
          )}

          {/* Phase 5: Game Results */}
          {roomState.phase === GAME_PHASES.GAME_RESULTS && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="arcade-panel p-6 md:p-8 text-center space-y-6"
            >
              <div className="space-y-2">
                <div className="w-14 h-14 rounded bg-blue-100 border border-blue-300 flex items-center justify-center text-blue-600 mx-auto">
                  <Trophy className="w-7 h-7" />
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800">Final Game Results</h2>
                <p className="text-xs text-slate-500">Authoritative podium and standings</p>
              </div>

              {/* Final Podium Rankings */}
              <div className="max-w-md mx-auto space-y-2.5">
                {(gameRankings || []).map((player) => {
                  const medalEmoji =
                    player.rank === 1 ? '🥇' : player.rank === 2 ? '🥈' : player.rank === 3 ? '🥉' : null;

                  return (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded border transition-all ${player.rank === 1
                          ? 'bg-blue-50/80 border-blue-400 shadow-[0_2px_0_#93c5fd] ring-1 ring-blue-300'
                          : player.rank === 2
                            ? 'bg-slate-50 border-slate-300'
                            : player.rank === 3
                              ? 'bg-blue-50/40 border-blue-200'
                              : 'bg-white border-slate-200'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 text-center font-mono text-base font-extrabold text-slate-600">
                          {medalEmoji || `#${player.rank}`}
                        </span>
                        <AvatarBadge avatar={player.avatar} size="md" />
                        <div className="text-left">
                          <span className="text-sm font-extrabold text-slate-800">{player.username}</span>
                          {player.id === myGuestId && (
                            <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-base font-extrabold text-blue-600">
                        {player.score} <span className="text-xs text-slate-400">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Host Controls or Waiting Notice */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-sm mx-auto">
                {isHost ? (
                  <>
                    <Button
                      variant="brand"
                      onClick={playAgain}
                      className="w-full sm:w-1/2 cursor-pointer font-bold gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Play Again
                    </Button>
                    <Button
                      variant="outline"
                      onClick={returnToLobby}
                      className="w-full sm:w-1/2 cursor-pointer font-bold gap-2"
                    >
                      <Home className="w-4 h-4" />
                      Lobby
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 font-medium">
                    Waiting for the host to choose next action...
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column: Live Players Leaderboard & Guess Stream */}
        <div className="lg:col-span-1 space-y-4">
          {/* Players Scoreboard */}
          <div className="arcade-panel p-3 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                <Users className="w-4 h-4 text-blue-500" />
                Scoreboard
              </div>
              <span className="text-xs font-bold text-slate-500">
                {roomState.players?.length || 0}
              </span>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {(roomState.players || []).map((p) => {
                const isCurrent = p.id === myGuestId;
                const isPlayerDrawer = p.id === roomState.currentDrawerId;
                const isPlayerSolved = Boolean(p.isSolved);

                return (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between p-2 rounded border text-xs ${isCurrent
                        ? 'bg-blue-50/60 border-blue-200'
                        : 'bg-slate-50/50 border-slate-100'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <AvatarBadge avatar={p.avatar} size="sm" />
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-1">
                          <span>{p.username}</span>
                          {isPlayerDrawer && (
                            <span title="Drawer" className="text-blue-500 font-normal">✏️</span>
                          )}
                          {isPlayerSolved && (
                            <span title="Solved" className="text-emerald-500 font-normal">✅</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono font-extrabold text-blue-600">
                      {p.score || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Authoritative Role-Based Chat & Guessing Hub */}
          <ChatPanel className="h-[360px]" />
        </div>
      </main>

      {/* Footer (M-11) */}
      <footer className="max-w-6xl mx-auto w-full text-center text-[11px] text-slate-400 pt-3">
        {import.meta.env.DEV ? (
          <span>SketchSprint [Dev] — Room: {roomState.roomCode} · Phase: {roomState.phase}</span>
        ) : (
          <span>SketchSprint — Draw fast. Guess faster.</span>
        )}
      </footer>
    </div>
  );
}
