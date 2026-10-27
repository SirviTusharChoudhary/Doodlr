import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Send,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Palette,
  Eye,
  Zap,
  Lock
} from 'lucide-react';
import {
  GAME_PHASES,
  PLAYER_ROLES,
  GAME_CONSTANTS
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import { Button } from '@/components/ui/button.jsx';

export default function ChatPanel({ className = '' }) {
  const {
    roomState,
    playerState,
    messages,
    submitGuess,
    sendChat,
    rateLimitWarning
  } = useGame();

  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const messagesEndRef = useRef(null);

  const myGuestId = playerState?.guestId || localStorage.getItem('doodlr_guest_id');
  const myPlayer = roomState?.players?.find((p) => p.id === myGuestId);

  const isDrawingPhase = roomState?.phase === GAME_PHASES.DRAWING;
  const isDrawer = roomState?.currentDrawerId === myGuestId;
  const isSolved = Boolean(myPlayer?.isSolved) || myPlayer?.role === PLAYER_ROLES.SOLVED;
  const isSpectator = myPlayer?.role === PLAYER_ROLES.SPECTATOR;

  // Auto-scroll messages container
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (isDrawingPhase) {
        // Active guess submission
        const result = await submitGuess(text);
        if (result?.success) {
          setInputText('');
        } else if (result?.error) {
          setErrorMessage(result.error);
        }
      } else {
        const result = await sendChat(text);
        if (result?.success !== false) {
          setInputText('');
        } else if (result?.error) {
          setErrorMessage(result.error);
        }
      }
    } catch (err) {
      setErrorMessage(err?.message || 'Failed to send message');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`arcade-panel flex flex-col overflow-hidden h-[500px] md:h-[580px] ${className}`}>
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-600" />
          <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
            {isDrawingPhase ? 'Live Guesses & Chat' : 'Room Chat'}
          </span>
        </div>
        <span className="text-[11px] font-bold text-slate-400">
          {messages.length} {messages.length === 1 ? 'msg' : 'msgs'}
        </span>
      </div>

      {/* Message Feed Stream */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1">
            <MessageSquare className="w-8 h-8 stroke-[1.5] text-slate-300" />
            <p className="font-medium text-xs">No messages yet.</p>
            <p className="text-[11px] text-slate-400">
              {isDrawingPhase ? 'Start guessing the secret word!' : 'Say hello to your room!'}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.playerId === myGuestId;

            // 1. Solved Notice
            if (msg.type === 'solved') {
              return (
                <motion.div
                  key={msg.id || idx}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold flex items-center gap-2 shadow-xs"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{msg.text}</span>
                </motion.div>
              );
            }

            // 2. Authoritative System Notice
            if (msg.type === 'system') {
              return (
                <div
                  key={msg.id || idx}
                  className="py-1 px-3 rounded bg-slate-100 text-slate-600 text-[11px] font-semibold text-center my-1 border border-slate-200"
                >
                  <span>{msg.text}</span>
                </div>
              );
            }

            // 4. Raw Guesses and Regular Chat
            return (
              <div
                key={msg.id || idx}
                className={`p-2 rounded border transition-all ${isMe
                    ? 'bg-blue-50 border-blue-200 ml-4'
                    : 'bg-slate-50/70 border-slate-100 mr-4'
                  }`}
              >
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span>{msg.username}</span>
                    {msg.type === 'guess' && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200">
                        GUESS
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <p className="text-slate-800 font-medium break-words leading-relaxed select-text">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>


      {/* Role-Specific Controls and Input Boundary */}
      <div className="p-3 border-t border-slate-100 bg-white">
        {/* State 1: Solved Player Panel */}
        {isDrawingPhase && isSolved ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-3 rounded bg-emerald-50 border border-emerald-200 text-center space-y-1"
          >
            <div className="flex items-center justify-center gap-1.5 text-emerald-800 font-extrabold text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>You Solved the Word!</span>
            </div>
            <p className="text-[11px] text-emerald-700 font-medium">
              You're locked from guessing for the rest of this turn to keep the game fair.
            </p>
          </motion.div>
        ) : isDrawingPhase && isDrawer ? (
          /* State 2: Drawer Panel */
          <div className="p-3 rounded bg-blue-50 border border-blue-200 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-blue-800 font-extrabold text-xs">
              <Palette className="w-4 h-4 text-blue-600" />
              <span>You Are Drawing</span>
            </div>
            <p className="text-[11px] text-blue-700 font-medium">
              Watch your opponents' guesses arrive in real-time above!
            </p>
          </div>
        ) : isDrawingPhase && isSpectator ? (
          /* State 3: Spectator Panel */
          <div className="p-3 rounded bg-slate-100 border border-slate-200 text-center space-y-1">
            <div className="flex items-center justify-center gap-1.5 text-slate-700 font-extrabold text-xs">
              <Eye className="w-4 h-4 text-slate-500" />
              <span>Spectating Active Round</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              You will join the drawing and guessing order at the next round boundary.
            </p>
          </div>
        ) : (
          /* State 4: Active Input Form (Active Guesser during DRAWING or General Chat in other phases) */
          <form onSubmit={handleSubmit} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={
                    isDrawingPhase
                      ? 'Type your guess here...'
                      : 'Send a message to the room...'
                  }
                  maxLength={isDrawingPhase ? GAME_CONSTANTS.MAX_GUESS_LENGTH : 200}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 pr-14 text-xs font-semibold rounded border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-300 pointer-events-none">
                  {inputText.length}/{isDrawingPhase ? GAME_CONSTANTS.MAX_GUESS_LENGTH : 200}
                </span>
              </div>

              <Button
                type="submit"
                variant="brand"
                size="sm"
                disabled={isSubmitting || !inputText.trim()}
                className="gap-1.5 cursor-pointer font-bold px-4 h-9"
              >
                <span>{isDrawingPhase ? 'Guess' : 'Send'}</span>
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>

            {(errorMessage || rateLimitWarning) && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] font-bold text-rose-500 px-1"
              >
                {errorMessage || rateLimitWarning}
              </motion.p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
