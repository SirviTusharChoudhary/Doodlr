import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  LogIn,
  ArrowLeft,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import {
  APP_NAME,
  GAME_CONSTANTS,
  UsernameSchema,
  normalizeUsername
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import AvatarPicker, { AvatarBadge } from '../components/AvatarPicker.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function JoinRoomPage() {
  const { roomCode: paramCode } = useParams();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const {
    username,
    avatar,
    saveProfile,
    joinRoom,
    isConnected,
    isLoading,
    error,
    clearError
  } = useGame();

  const [nameInput, setNameInput] = useState(username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(avatar || GAME_CONSTANTS.PRESET_AVATARS[0]);
  const [codeInput, setCodeInput] = useState(paramCode ? paramCode.toUpperCase() : '');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (paramCode) {
      setCodeInput(paramCode.toUpperCase());
    }
  }, [paramCode]);

  const handleJoin = async (e) => {
    e.preventDefault();
    clearError();
    setValidationError('');

    const nameParsed = UsernameSchema.safeParse(normalizeUsername(nameInput));
    if (!nameParsed.success) {
      setValidationError(nameParsed.error.issues[0]?.message || 'Please enter a valid nickname.');
      return;
    }
    const validName = nameParsed.data;

    const cleanCode = codeInput.trim().toUpperCase();
    if (!cleanCode || cleanCode.length !== 6) {
      setValidationError('Please enter a valid 6-character room code.');
      return;
    }

    saveProfile(validName, selectedAvatar);

    try {
      const room = await joinRoom(cleanCode, validName, selectedAvatar);
      navigate(`/room/${room.roomCode}`);
    } catch {
      // Error handled in context
    }
  };

  return (
    <div className="arcade-shell flex flex-col justify-between p-4 md:p-5">
      <header className="arcade-topbar max-w-md mx-auto w-full flex items-center justify-between pb-3 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/')}
          className="gap-2 text-slate-600 hover:text-slate-900 cursor-pointer font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Button>
        <div className="flex items-center gap-2 px-3 py-1 bg-white rounded border border-slate-200 text-xs font-bold text-blue-700">
          <LogIn className="w-3.5 h-3.5" />
          <span>Join Game</span>
        </div>
      </header>

      <main className="max-w-md mx-auto w-full py-4">
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="arcade-panel p-4 md:p-5 space-y-4"
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded bg-blue-600 flex items-center justify-center text-white mx-auto border border-blue-700 shadow-[0_2px_0_#1d4ed8]">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-800">Join with Room Code</h1>
            <p className="text-xs text-slate-500">
              Enter the 6-character invite code and your player details
            </p>
          </div>

          {(error || validationError) && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error || validationError}</span>
            </div>
          )}

          <form onSubmit={handleJoin} noValidate className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                6-Character Room Code
              </label>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                maxLength={6}
                disabled={Boolean(paramCode)}
                className="w-full px-4 py-3 text-center text-xl font-mono font-extrabold tracking-[0.25em] rounded border-2 border-blue-200 text-blue-700 focus:outline-none focus:border-blue-500 uppercase placeholder:text-slate-300"
              />
            </div>

            <div className="flex items-center gap-3">
              <AvatarBadge avatar={selectedAvatar} size="lg" className="shrink-0" />
              <div className="w-full space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Player Nickname
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter nickname..."
                  maxLength={GAME_CONSTANTS.MAX_USERNAME_LENGTH}
                  className="w-full px-3 py-2.5 rounded border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <AvatarPicker selected={selectedAvatar} onSelect={setSelectedAvatar} />

            <Button
              type="submit"
              variant="brand"
              disabled={!isConnected || isLoading || codeInput.trim().length !== 6 || nameInput.trim().length < GAME_CONSTANTS.MIN_USERNAME_LENGTH}
              className="w-full h-11 text-base font-extrabold gap-2 cursor-pointer"
            >
              <LogIn className="w-5 h-5" />
              {isLoading ? 'Joining Room...' : 'Enter Game'}
            </Button>
          </form>
        </motion.div>
      </main>

      <footer className="max-w-md mx-auto w-full text-center text-xs text-slate-400 pt-4">
        {APP_NAME} — Join Room Code
      </footer>
    </div>
  );
}
