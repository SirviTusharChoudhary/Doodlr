import React from 'react';
import { GAME_CONSTANTS } from '@doodlr/shared';

const AVATAR_EMOJIS = {
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  panda: '🐼',
  bear: '🐻',
  rabbit: '🐰',
  koala: '🐨',
  lion: '🦁'
};

const AVATAR_COLORS = {
  cat: 'bg-blue-100 border-blue-300 text-blue-700',
  dog: 'bg-indigo-100 border-indigo-300 text-indigo-700',
  fox: 'bg-rose-100 border-rose-300 text-rose-700',
  panda: 'bg-slate-100 border-slate-300 text-slate-700',
  bear: 'bg-cyan-100 border-cyan-300 text-cyan-700',
  rabbit: 'bg-pink-100 border-pink-300 text-pink-700',
  koala: 'bg-emerald-100 border-emerald-300 text-emerald-700',
  lion: 'bg-sky-100 border-sky-300 text-sky-700'
};

export function getAvatarEmoji(avatarKey) {
  return AVATAR_EMOJIS[avatarKey] || '🎨';
}

export function AvatarBadge({ avatar, size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-10 h-10 text-xl',
    lg: 'w-14 h-14 text-3xl',
    xl: 'w-20 h-20 text-4xl'
  };

  const styleClass = AVATAR_COLORS[avatar] || 'bg-slate-100 border-slate-300';

  return (
    <div
      className={`rounded border-2 flex items-center justify-center select-none shadow-sm ${sizeClasses[size] || sizeClasses.md} ${styleClass} ${className}`}
    >
      {getAvatarEmoji(avatar)}
    </div>
  );
}

export default function AvatarPicker({ selected, onSelect }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
        Choose Avatar
      </label>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
        {GAME_CONSTANTS.PRESET_AVATARS.map((key) => {
          const isSelected = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`relative flex flex-col items-center justify-center p-2 rounded border-2 transition-all duration-150 cursor-pointer ${isSelected
                  ? 'border-blue-600 bg-blue-50 shadow-sm scale-105 ring-2 ring-blue-400/50'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                }`}
            >
              <span className="text-2xl select-none">{getAvatarEmoji(key)}</span>
              <span className="text-[10px] font-semibold text-slate-600 capitalize mt-1">
                {key}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
