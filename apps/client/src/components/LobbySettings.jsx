import React, { useState } from 'react';
import {
  Settings,
  Users,
  Repeat,
  Timer,
  Lightbulb,
  Layers,
  FileText,
  Lock
} from 'lucide-react';
import { GAME_CONSTANTS } from '@doodlr/shared';
import { Button } from '@/components/ui/button.jsx';

export default function LobbySettings({ settings, isHost, onUpdate }) {
  const [capacity, setCapacity] = useState(settings?.capacity || 8);
  const [rounds, setRounds] = useState(settings?.rounds || 2);
  const [drawDuration, setDrawDuration] = useState(settings?.drawDuration || 60);
  const [hintsEnabled, setHintsEnabled] = useState(settings?.hintsEnabled !== false);
  const [categories, setCategories] = useState(
    settings?.categories || [...GAME_CONSTANTS.BUILTIN_CATEGORIES]
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggleCategory = (cat) => {
    if (!isHost) return;
    setCategories((prev) => {
      const exists = prev.includes(cat);
      if (exists) {
        if (prev.length === 1) {
          return prev; // Keep at least one category
        }
        return prev.filter((c) => c !== cat);
      } else {
        return [...prev, cat];
      }
    });
  };

  const handleSave = async () => {
    if (!isHost) return;
    setIsSaving(true);
    try {
      await onUpdate({
        capacity: Number(capacity),
        rounds: Number(rounds),
        drawDuration: Number(drawDuration),
        hintsEnabled: Boolean(hintsEnabled),
        categories
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Read-only view for non-host
  if (!isHost) {
    return (
      <div className="arcade-panel p-4 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
            <Settings className="w-5 h-5 text-blue-600" />
            Room Settings
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            <Lock className="w-3 h-3" /> Host Controlled
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded bg-slate-50/70 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-600" /> Max Players
            </span>
            <p className="font-bold text-slate-800 text-sm">{settings?.capacity || 8}</p>
          </div>

          <div className="p-3 rounded bg-slate-50/70 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5 text-blue-600" /> Rounds
            </span>
            <p className="font-bold text-slate-800 text-sm">{settings?.rounds || 2}</p>
          </div>

          <div className="p-3 rounded bg-slate-50/70 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Timer className="w-3.5 h-3.5 text-blue-600" /> Draw Time
            </span>
            <p className="font-bold text-slate-800 text-sm">{settings?.drawDuration || 60}s</p>
          </div>

          <div className="p-3 rounded bg-slate-50/70 border border-slate-200 space-y-1">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Lightbulb className="w-3.5 h-3.5 text-blue-600" /> Hints
            </span>
            <p className="font-bold text-slate-800 text-sm">
              {settings?.hintsEnabled ? '20s & 45s' : 'Disabled'}
            </p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-600" /> Active Categories
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(settings?.categories || []).map((cat) => (
              <span
                key={cat}
                className="px-2.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-800 font-semibold capitalize text-[11px]"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Interactive Host View
  return (
    <div className="arcade-panel p-4 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 font-bold text-slate-800 text-base">
          <Settings className="w-5 h-5 text-blue-600" />
          Room Configuration
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800 border border-blue-200">
          Host Controls
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Capacity */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" /> Max Players (2–8)
          </label>
          <select
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full px-3 py-2 rounded border border-slate-200 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((num) => (
              <option key={num} value={num}>
                {num} Players
              </option>
            ))}
          </select>
        </div>

        {/* Rounds */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-blue-600" /> Full Rounds (1–5)
          </label>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="w-full px-3 py-2 rounded border border-slate-200 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <option key={r} value={r}>
                {r} {r === 1 ? 'Round' : 'Rounds'}
              </option>
            ))}
          </select>
        </div>

        {/* Draw Duration */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-blue-600" /> Draw Duration
          </label>
          <select
            value={drawDuration}
            onChange={(e) => setDrawDuration(Number(e.target.value))}
            className="w-full px-3 py-2 rounded border border-slate-200 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {GAME_CONSTANTS.ALLOWED_TURN_DURATIONS.map((dur) => (
              <option key={dur} value={dur}>
                {dur} Seconds
              </option>
            ))}
          </select>
        </div>

        {/* Hints */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-blue-600" /> Hints
          </label>
          <button
            type="button"
            onClick={() => setHintsEnabled(!hintsEnabled)}
            className={`w-full px-3 py-2 rounded border text-sm font-semibold transition-colors flex items-center justify-between cursor-pointer ${hintsEnabled
                ? 'bg-blue-50 border-blue-300 text-blue-800'
                : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}
          >
            <span>Automatic Hints (20s & 45s)</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${hintsEnabled ? 'bg-blue-200 text-blue-900' : 'bg-slate-200 text-slate-600'
                }`}
            >
              {hintsEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* Built-in Categories */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-600" /> Word Categories
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {GAME_CONSTANTS.BUILTIN_CATEGORIES.map((cat) => {
            const isSelected = categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`px-3 py-2 rounded border text-xs font-bold capitalize transition-all cursor-pointer ${isSelected
                    ? 'bg-blue-600 border-blue-700 text-white shadow-[0_2px_0_#1d4ed8]'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>


      {/* Apply Button */}
      <Button
        variant="brand"
        className="w-full font-bold cursor-pointer"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? 'Updating...' : 'Save Settings'}
      </Button>
    </div>
  );
}
