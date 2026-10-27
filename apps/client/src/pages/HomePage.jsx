import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Paintbrush,
  PlusCircle,
  LogIn,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  APP_NAME,
  APP_TAGLINE,
  GAME_CONSTANTS,
  UsernameSchema,
  normalizeUsername
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import AvatarPicker, { AvatarBadge } from '../components/AvatarPicker.jsx';
import NotificationBanner from '../components/NotificationBanner.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function HomePage() {
  const navigate = useNavigate();
  const {
    username,
    avatar,
    saveProfile,
    createPrivateRoom,
    joinRoom,
    isConnected,
    isLoading,
    error,
    clearError
  } = useGame();

  const [nameInput, setNameInput] = useState(username);
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    clearError();
  }, [clearError]);

  const validateProfile = () => {
    const trimmed = normalizeUsername(nameInput);
    const parsed = UsernameSchema.safeParse(trimmed);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message || 'Please enter a valid nickname.');
      return null;
    }
    setLocalError('');
    saveProfile(parsed.data, selectedAvatar);
    return parsed.data;
  };


  const handleCreateRoom = () => {
    const validName = validateProfile();
    if (!validName) return;
    navigate('/create');
  };

  const handleJoinWithCode = (e) => {
    e.preventDefault();
    const validName = validateProfile();
    if (!validName) return;

    const code = joinCodeInput.trim().toUpperCase();
    if (!code || code.length !== 6) {
      setLocalError('Please enter a valid 6-character room code.');
      return;
    }

    navigate(`/join/${code}`);
  };

  return (
    <div className="arcade-shell arcade-home flex flex-col justify-between p-4 md:p-5">
      {/* Top Header */}
      <header className="arcade-topbar max-w-5xl mx-auto w-full flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-blue-600 flex items-center justify-center text-white border border-blue-700 shadow-[0_2px_0_#1d4ed8]">
            <Paintbrush className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-blue-700">
              {APP_NAME}
            </h1>
            <p className="text-xs font-semibold text-slate-500">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold ${isConnected
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500 animate-ping'
                }`}
            />
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </header>

      {/* Main Form & Cards */}
      <main className="max-w-4xl mx-auto w-full pt-4 space-y-4">
        {/* Errors / Warnings */}
        {(error || localError) && (
          <NotificationBanner
            type="error"
            message={error || localError}
            onDismiss={() => {
              clearError();
              setLocalError('');
            }}
          />
        )}

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="arcade-panel p-4 md:p-5 space-y-4"
        >
          {/* Guest Profile Card */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                Player Profile
              </h2>
              <span className="text-xs font-semibold text-slate-400">Guest Identity</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <AvatarBadge avatar={selectedAvatar} size="xl" className="shrink-0" />
              <div className="w-full space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Nickname
                  </label>
                  <span className="text-xs text-slate-400">
                    {nameInput.trim().length} / {GAME_CONSTANTS.MAX_USERNAME_LENGTH}
                  </span>
                </div>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    if (localError) setLocalError('');
                  }}
                  placeholder="Enter your nickname..."
                  maxLength={GAME_CONSTANTS.MAX_USERNAME_LENGTH}
                  className="w-full px-4 py-3 rounded border border-slate-200 text-base font-bold text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
                />
              </div>
            </div>

            {/* Avatar Selector */}
            <AvatarPicker
              selected={selectedAvatar}
              onSelect={(av) => setSelectedAvatar(av)}
            />
          </div>

          <div className="h-px bg-slate-100 my-4" />

          {/* Private Room Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Create Private Room Card */}
            <div className="p-4 rounded border border-blue-200 bg-blue-50/60 flex flex-col justify-between space-y-3 hover:border-blue-400 transition-all">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                  <PlusCircle className="w-5 h-5 text-blue-600" />
                  Create Private Room
                </div>
                <p className="text-xs text-slate-500">
                  Host a game with customizable rounds, drawing timers, categories, and shareable code.
                </p>
              </div>

              <Button
                variant="brand"
                size="lg"
                onClick={handleCreateRoom}
                disabled={isLoading || !isConnected}
                className="w-full gap-2 cursor-pointer font-bold"
              >
                {isLoading ? 'Creating Room...' : 'Create Private Room'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Join by Code Card */}
            <div className="p-4 rounded border border-slate-200 bg-white flex flex-col justify-between space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
                  <LogIn className="w-5 h-5 text-blue-600" />
                  Join with Code
                </div>
                <p className="text-xs text-slate-500">
                  Enter a 6-letter room code shared by a friend to jump in.
                </p>
              </div>

              <form onSubmit={handleJoinWithCode} className="flex gap-2">
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  maxLength={6}
                  className="w-full px-3 py-2.5 rounded border border-slate-200 font-mono font-bold text-center tracking-widest text-slate-800 placeholder:tracking-normal placeholder:font-sans placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 uppercase"
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={isLoading || !isConnected || joinCodeInput.trim().length !== 6}
                  className="font-bold cursor-pointer shrink-0"
                >
                  Join
                </Button>
              </form>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-slate-400 pt-6">
        <p>{APP_NAME} — Fast-paced multiplayer drawing and guessing with private rooms.</p>
      </footer>
    </div>
  );
}
