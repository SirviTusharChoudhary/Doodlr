import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  PlusCircle,
  ArrowLeft,
  Users,
  Clock,
  RotateCcw,
  Lightbulb,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import {
  APP_NAME,
  GAME_CONSTANTS,
  UsernameSchema,
  RoomSettingsSchema,
  normalizeUsername
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import AvatarPicker, { AvatarBadge } from '../components/AvatarPicker.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const {
    username,
    avatar,
    saveProfile,
    createPrivateRoom,
    isConnected,
    isLoading,
    error,
    clearError
  } = useGame();

  const [nameInput, setNameInput] = useState(username || '');
  const [selectedAvatar, setSelectedAvatar] = useState(avatar || GAME_CONSTANTS.PRESET_AVATARS[0]);
  const [capacity, setCapacity] = useState(8);
  const [rounds, setRounds] = useState(2);
  const [drawDuration, setDrawDuration] = useState(60);
  const [hintsEnabled, setHintsEnabled] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState([...GAME_CONSTANTS.BUILTIN_CATEGORIES]);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    clearError();
  }, [clearError]);

  const toggleCategory = (cat) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) {
        setValidationError('At least one category must be active.');
        return;
      }
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
    setValidationError('');
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    clearError();
    setValidationError('');

    const nameParsed = UsernameSchema.safeParse(normalizeUsername(nameInput));
    if (!nameParsed.success) {
      setValidationError(nameParsed.error.issues[0]?.message || 'Please enter a valid nickname.');
      return;
    }
    saveProfile(nameParsed.data, selectedAvatar);

    const settingsParsed = RoomSettingsSchema.safeParse({
      capacity: Number(capacity),
      rounds: Number(rounds),
      drawDuration: Number(drawDuration),
      hintsEnabled: Boolean(hintsEnabled),
      categories: selectedCategories
    });
    if (!settingsParsed.success) {
      setValidationError(settingsParsed.error.issues[0]?.message || 'Please check the room settings.');
      return;
    }

    try {
      const room = await createPrivateRoom(settingsParsed.data, {
        username: nameParsed.data,
        avatar: selectedAvatar
      });
      navigate(`/room/${room.roomCode}`);
    } catch {
      // Error handled in context
    }
  };

  const selectClass =
    'w-full p-2 rounded border border-slate-200 font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer';

  return (
    <div className="arcade-shell flex flex-col justify-between p-4 md:p-5">
      <header className="arcade-topbar max-w-3xl mx-auto w-full flex items-center justify-between pb-3 border-b">
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
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New Private Game</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto w-full py-4">
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="arcade-panel p-4 md:p-5 space-y-4"
        >
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">Configure Your Private Game</h1>
            <p className="text-xs text-slate-500 mt-1">
              Rounds, draw time, hints, and built-in word categories
            </p>
          </div>

          {(error || validationError) && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error || validationError}</span>
            </div>
          )}

          <form onSubmit={handleCreateRoom} noValidate className="space-y-4">
            <div className="bg-blue-50/70 p-3 rounded border border-blue-100 space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Host Identity
              </h4>
              <div className="flex items-center gap-3">
                <AvatarBadge avatar={selectedAvatar} size="lg" className="shrink-0" />
                <div className="w-full space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Your Nickname</label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your nickname..."
                    maxLength={GAME_CONSTANTS.MAX_USERNAME_LENGTH}
                    className="w-full px-3 py-2 rounded border border-slate-200 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm"
                  />
                </div>
              </div>
              <AvatarPicker selected={selectedAvatar} onSelect={setSelectedAvatar} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Capacity</span>
                </div>
                <select value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={selectClass}>
                  {[2, 3, 4, 5, 6, 7, 8].map((c) => (
                    <option key={c} value={c}>
                      {c} Players max
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <RotateCcw className="w-4 h-4 text-blue-600" />
                  <span>Rounds</span>
                </div>
                <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className={selectClass}>
                  {[1, 2, 3, 4, 5].map((r) => (
                    <option key={r} value={r}>
                      {r} {r === 1 ? 'Round' : 'Rounds'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-white p-3 rounded border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>Turn Time</span>
                </div>
                <select
                  value={drawDuration}
                  onChange={(e) => setDrawDuration(Number(e.target.value))}
                  className={selectClass}
                >
                  {GAME_CONSTANTS.ALLOWED_TURN_DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} seconds
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded border border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                <div>
                  <p className="text-xs font-bold text-slate-800">Hints</p>
                  <p className="text-[11px] text-slate-500">Reveals letters at 20s and 45s</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHintsEnabled(!hintsEnabled)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer ${
                  hintsEnabled ? 'bg-blue-600' : 'bg-slate-200'
                }`}
                aria-pressed={hintsEnabled}
                aria-label="Toggle hints"
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    hintsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span>Word Categories</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {GAME_CONSTANTS.BUILTIN_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded text-xs font-bold capitalize transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button
              type="submit"
              variant="brand"
              disabled={!isConnected || isLoading || nameInput.trim().length < GAME_CONSTANTS.MIN_USERNAME_LENGTH}
              className="w-full h-11 text-base font-extrabold gap-2 cursor-pointer"
            >
              <PlusCircle className="w-5 h-5" />
              {isLoading ? 'Creating Room...' : 'Create Room & Enter Lobby'}
            </Button>
          </form>
        </motion.div>
      </main>

      <footer className="max-w-3xl mx-auto w-full text-center text-xs text-slate-400 pt-4">
        {APP_NAME} — Private Game Configuration
      </footer>
    </div>
  );
}
