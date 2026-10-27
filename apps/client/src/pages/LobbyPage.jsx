import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Crown,
  Copy,
  Check,
  Users,
  Play,
  LogOut,
  Sparkles,
  Wifi,
  WifiOff,
  Zap,
  Globe,
  Loader2
} from 'lucide-react';
import {
  APP_NAME,
  GAME_CONSTANTS,
  GAME_PHASES,
  PLAYER_CONNECTION_STATUS,
  UsernameSchema,
  normalizeUsername
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import AvatarPicker, { AvatarBadge } from '../components/AvatarPicker.jsx';
import LobbySettings from '../components/LobbySettings.jsx';
import NotificationBanner from '../components/NotificationBanner.jsx';
import GameEngineView from '../components/GameEngineView.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function LobbyPage() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const {
    username,
    avatar,
    reconnectToken,
    saveProfile,
    roomState,
    playerState,
    isConnected,
    isLoading,
    error,
    clearError,
    notification,
    clearNotification,
    joinRoom,
    updateSettings,
    startGame,
    leaveRoom
  } = useGame();

  const [searchParams] = useSearchParams();
  const shouldAutoJoin = searchParams.get('join') === '1';
  const [copied, setCopied] = useState(false);
  const [directName, setDirectName] = useState(username || '');
  const [directAvatar, setDirectAvatar] = useState(avatar || GAME_CONSTANTS.PRESET_AVATARS[0]);
  const [hasAttemptedAutoJoin, setHasAttemptedAutoJoin] = useState(false);

  // A refresh keeps the room URL but loses React state. Restore only with the
  // signed reconnect credential; an URL by itself never grants room access.
  useEffect(() => {
    if (
      !hasAttemptedAutoJoin &&
      isConnected &&
      roomCode &&
      (!roomState || roomState.roomCode !== roomCode.toUpperCase())
    ) {
      if (username && (shouldAutoJoin || reconnectToken)) {
        setHasAttemptedAutoJoin(true);
        joinRoom(roomCode).catch(() => { });
      }
    }
  }, [shouldAutoJoin, reconnectToken, isConnected, roomCode, roomState, username, hasAttemptedAutoJoin, joinRoom]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${roomCode || roomState?.roomCode}?join=1`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDirectJoin = async (e) => {
    e.preventDefault();
    const parsed = UsernameSchema.safeParse(normalizeUsername(directName));
    if (!parsed.success) {
      return;
    }
    saveProfile(parsed.data, directAvatar);
    try {
      await joinRoom(roomCode, parsed.data, directAvatar);
    } catch {
      // Error captured in context
    }
  };

  const handleLeave = () => {
    leaveRoom();
    navigate('/');
  };

  const handleStartGame = async () => {
    try {
      await startGame();
    } catch {
      // Error captured in context
    }
  };

  // If user navigated directly via URL and has not joined yet
  if (!roomState || roomState.roomCode !== roomCode?.toUpperCase()) {
    return (
      <div className="arcade-shell flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="arcade-panel max-w-md w-full p-5 md:p-6 space-y-4"
        >
          <div className="text-center space-y-1">
            <h2 className="text-xl font-extrabold text-slate-800">Join Room</h2>
            <p className="text-xs text-slate-500">
              You were invited to room <span className="font-mono font-bold text-blue-700">{roomCode}</span>
            </p>
          </div>

          {error && <NotificationBanner type="error" message={error} onDismiss={clearError} />}

          <form onSubmit={handleDirectJoin} noValidate className="space-y-4">
            <div className="flex gap-4 items-center">
              <AvatarBadge avatar={directAvatar} size="lg" className="shrink-0" />
              <div className="w-full space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Your Nickname
                </label>
                <input
                  type="text"
                  value={directName}
                  onChange={(e) => setDirectName(e.target.value)}
                  placeholder="Enter nickname..."
                  maxLength={GAME_CONSTANTS.MAX_USERNAME_LENGTH}
                  className="w-full px-4 py-2.5 rounded border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  required
                />
              </div>
            </div>

            <AvatarPicker selected={directAvatar} onSelect={setDirectAvatar} />

            <div className="pt-2 flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/')}
                className="w-1/3 cursor-pointer"
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="brand"
                disabled={isLoading || !isConnected || directName.trim().length < 3}
                className="w-2/3 cursor-pointer font-bold"
              >
                {isLoading ? 'Joining...' : 'Join Game'}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  // Render authoritative GameEngineView during active game phases
  if (roomState.phase !== GAME_PHASES.LOBBY) {
    return <GameEngineView />;
  }

  const isHost = Boolean(playerState?.isHost);
  const players = roomState.players || [];
  const activePlayers = players.filter(
    (p) => p.connectionStatus === PLAYER_CONNECTION_STATUS.CONNECTED
  );
  const canStart = isHost && activePlayers.length >= GAME_CONSTANTS.MIN_PLAYERS;

  return (
    <div className="arcade-shell flex flex-col justify-between p-4 md:p-5">
      {/* Top Bar */}
      <header className="arcade-topbar max-w-6xl mx-auto w-full flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeave}
            className="gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer font-semibold"
          >
            <LogOut className="w-4 h-4" />
            Leave Lobby
          </Button>
        </div>

        {/* Room Details & Copy */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3.5 py-1.5 rounded border border-blue-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Room:
            </span>
            <span className="font-mono text-base font-extrabold text-blue-600 tracking-wider">
              {roomState.roomCode}
            </span>
            <button
              onClick={handleCopyLink}
              title="Copy shareable room link"
              className="p-1.5 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Lobby View */}
      <main className="max-w-6xl mx-auto w-full py-3 space-y-3">
        {/* Notifications */}
        {error && <NotificationBanner type="error" message={error} onDismiss={clearError} />}
        {notification && (
          <NotificationBanner
            type="info"
            message={notification}
            onDismiss={clearNotification}
          />
        )}


        <div className="arcade-lobby-grid grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_300px] gap-3">
          {/* Left Column: Players List & Start Controls */}
          <div className="lg:col-span-1 space-y-3">
            {/* Players Box */}
            <div className="arcade-panel p-3 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                  <Users className="w-5 h-5 text-blue-500" />
                  Players
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {activePlayers.length} connected / {roomState.settings?.capacity || 8}
                </span>
              </div>

              {/* Player Cards */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {players.map((p) => {
                  const isPlayerHost = Boolean(p.isHost);
                  const isCurrent = p.id === playerState?.guestId;
                  const isDisconnected =
                    p.connectionStatus === PLAYER_CONNECTION_STATUS.DISCONNECTED_GRACE;

                  return (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex items-center justify-between p-3 rounded border transition-all ${isCurrent
                        ? 'bg-blue-50/70 border-blue-300 shadow-sm'
                        : 'bg-slate-50/70 border-slate-100'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <AvatarBadge avatar={p.avatar} size="md" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-800">
                              {p.username}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/80 px-1.5 py-0.5 rounded">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                            {isDisconnected ? (
                              <span className="text-blue-600 flex items-center gap-1">
                                <WifiOff className="w-3 h-3" /> Reconnecting...
                              </span>
                            ) : (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <Wifi className="w-3 h-3" /> Online
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {isPlayerHost && (
                        <div
                          title="Room Host"
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-100 text-blue-800 text-xs font-bold border border-blue-200"
                        >
                          <Crown className="w-3.5 h-3.5 text-blue-600" />
                          <span>Host</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Start Game Action Card (Host Controls) */}
            <div className="arcade-panel p-3 space-y-3">
              {isHost ? (
                <div className="space-y-3">
                  <Button
                    variant="brand"
                    size="lg"
                    onClick={handleStartGame}
                    disabled={!canStart || isLoading}
                    className="w-full gap-2 font-bold cursor-pointer shadow-md"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Start Game
                  </Button>
                  {!canStart && (
                    <p className="text-xs text-center text-slate-500 font-medium">
                      Need at least {GAME_CONSTANTS.MIN_PLAYERS} connected players to start.
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-3 space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-50 text-blue-600 text-xs font-bold border border-blue-200 animate-pulse">
                    <Sparkles className="w-3.5 h-3.5" /> Waiting for Host
                  </div>
                  <p className="text-xs text-slate-500">
                    The host will start the game once everyone is ready!
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Settings & Lobby Chat */}
          <div className="lg:col-span-2 space-y-3">
            <LobbySettings
              settings={roomState.settings}
              isHost={isHost}
              onUpdate={updateSettings}
            />
            <ChatPanel className="h-[260px]" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto w-full text-center text-xs text-slate-400 pt-6">
        <p>
          {APP_NAME} — Private Room Lobby
        </p>
      </footer>
    </div>
  );
}
