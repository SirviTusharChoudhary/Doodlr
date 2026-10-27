import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { SOCKET_EVENTS, MESSAGE_TYPES } from '@doodlr/shared';
import { useSocket } from './SocketContext.jsx';
import { useRoom } from './RoomContext.jsx';

const GameEngineContext = createContext(null);

export function GameEngineProvider({ children }) {
  const { socketRef, isConnected, emitWithAck } = useSocket();
  const { setRoomState, playerState, setError } = useRoom();

  const [wordChoices, setWordChoices] = useState(null);
  const [turnInfo, setTurnInfo] = useState(null);
  const [turnSummary, setTurnSummary] = useState(null);
  const [gameRankings, setGameRankings] = useState(null);
  const [secretWord, setSecretWord] = useState(null);

  // Chat & Guesses
  const [messages, setMessages] = useState([]);
  const [guessMessages, setGuessMessages] = useState([]);
  const [rateLimitWarning, setRateLimitWarning] = useState(null);

  useEffect(() => {
    if (!rateLimitWarning) return;
    const t = setTimeout(() => setRateLimitWarning(null), 3000);
    return () => clearTimeout(t);
  }, [rateLimitWarning]);

  useEffect(() => {
    if (Array.isArray(playerState?.wordChoices) && playerState.wordChoices.length > 0) {
      setWordChoices(playerState.wordChoices);
    }
    if (playerState?.secretWord) {
      setSecretWord(playerState.secretWord);
    }
  }, [playerState]);

  // Clean listeners for authoritative game events
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleGameStarted = () => {
      setTurnSummary(null);
      setGameRankings(null);
      setSecretWord(null);
      setMessages([]);
      setGuessMessages([]);
    };

    const handleWordChoices = (data) => {
      setWordChoices(data.choices);
    };

    const handleSecretWord = (data) => {
      setSecretWord(data?.secretWord || null);
    };

    const handleTurnStarted = (data) => {
      setTurnInfo(data);
      setWordChoices(null);
      setTurnSummary(null);
      setGuessMessages([]);
      setRoomState((prev) => (prev ? { ...prev, wordMask: data.wordMask } : prev));
    };

    const handleTurnHint = (data) => {
      setTurnInfo((prev) => (prev ? { ...prev, wordMask: data.wordMask } : prev));
      setRoomState((prev) => (prev ? { ...prev, wordMask: data.wordMask } : prev));
    };

    const handleTurnTick = (data) => {
      setRoomState((prev) => (prev ? { ...prev, remainingTime: data.remainingTime } : prev));
    };


    const handleChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg].slice(-200));
    };

    const handleGuessMessage = (msg) => {
      setMessages((prev) => [...prev, msg].slice(-200));
      setGuessMessages((prev) => [...prev, msg].slice(-200));
    };

    const handleSystemMessage = (msg) => {
      setMessages((prev) => [...prev, msg].slice(-200));
      setGuessMessages((prev) => [...prev, msg].slice(-200));
    };

    const handlePlayerSolved = () => {};

    const handleTurnEnded = (data) => {
      setTurnSummary(data);
      if (data?.secretWord) {
        setSecretWord(data.secretWord);
      }
    };

    const handleGameResults = (data) => {
      setGameRankings(data.rankings);
      // Winner podium celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.5 },
          colors: ['#eab308', '#f97316', '#3b82f6', '#ec4899']
        });
      } catch {
        // Safe fallback
      }
    };

    const handleGameResumed = () => {
      setTurnSummary(null);
      setGameRankings(null);
    };

    socket.on(SOCKET_EVENTS.GAME_STARTED, handleGameStarted);
    socket.on(SOCKET_EVENTS.WORD_CHOICES, handleWordChoices);
    socket.on(SOCKET_EVENTS.SECRET_WORD, handleSecretWord);
    socket.on(SOCKET_EVENTS.TURN_STARTED, handleTurnStarted);
    socket.on(SOCKET_EVENTS.TURN_HINT, handleTurnHint);
    socket.on(SOCKET_EVENTS.TURN_TICK, handleTurnTick);
    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
    socket.on(SOCKET_EVENTS.GUESS_MESSAGE, handleGuessMessage);
    socket.on(SOCKET_EVENTS.SYSTEM_MESSAGE, handleSystemMessage);
    socket.on(SOCKET_EVENTS.PLAYER_SOLVED, handlePlayerSolved);
    socket.on(SOCKET_EVENTS.TURN_ENDED, handleTurnEnded);
    socket.on(SOCKET_EVENTS.GAME_ENDED, handleGameResults);

    return () => {
      socket.off(SOCKET_EVENTS.GAME_STARTED, handleGameStarted);
      socket.off(SOCKET_EVENTS.WORD_CHOICES, handleWordChoices);
      socket.off(SOCKET_EVENTS.SECRET_WORD, handleSecretWord);
      socket.off(SOCKET_EVENTS.TURN_STARTED, handleTurnStarted);
      socket.off(SOCKET_EVENTS.TURN_HINT, handleTurnHint);
      socket.off(SOCKET_EVENTS.TURN_TICK, handleTurnTick);
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, handleChatMessage);
      socket.off(SOCKET_EVENTS.GUESS_MESSAGE, handleGuessMessage);
      socket.off(SOCKET_EVENTS.SYSTEM_MESSAGE, handleSystemMessage);
      socket.off(SOCKET_EVENTS.PLAYER_SOLVED, handlePlayerSolved);
      socket.off(SOCKET_EVENTS.TURN_ENDED, handleTurnEnded);
      socket.off(SOCKET_EVENTS.GAME_ENDED, handleGameResults);
    };
  }, [socketRef, isConnected, setRoomState]);

  // Start game (Private Host only)
  const startGame = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.START_GAME, {});
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to start game');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [emitWithAck, setError]);

  // Drawer chooses word
  const selectWord = useCallback(async (word) => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.SELECT_WORD, { word });
      if (res?.success) {
        setWordChoices(null);
      } else {
        throw new Error(res?.error || 'Failed to select word');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [emitWithAck, setError]);

  // Submit guess
  const submitGuess = useCallback(async (guessText) => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.SUBMIT_GUESS, { text: guessText });
      if (!res?.success) {
        if (res?.error?.includes('Rate limit') || res?.error?.includes('quickly')) {
          setRateLimitWarning(res.error);
        }
      }
      return res;
    } catch (err) {
      if (err.message?.includes('Rate limit') || err.message?.includes('quickly')) {
        setRateLimitWarning(err.message);
      }
      throw err;
    }
  }, [emitWithAck]);

  // Send lobby / general chat
  const sendChat = useCallback(async (text) => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.SEND_CHAT, { text });
      if (!res?.success) {
        if (res?.error?.includes('Rate limit') || res?.error?.includes('quickly')) {
          setRateLimitWarning(res.error);
        }
      }
      return res;
    } catch (err) {
      if (err.message?.includes('Rate limit') || err.message?.includes('quickly')) {
        setRateLimitWarning(err.message);
      }
      throw err;
    }
  }, [emitWithAck]);

  // Play again (Private Host)
  const playAgain = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.PLAY_AGAIN, {});
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to play again');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [emitWithAck, setError]);

  // Return to lobby (Private Host)
  const returnToLobby = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.RETURN_TO_LOBBY, {});
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to return to lobby');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [emitWithAck, setError]);

  const value = {
    wordChoices,
    secretWord,
    turnInfo,
    turnSummary,
    gameRankings,
    messages,
    guessMessages,
    rateLimitWarning,
    startGame,
    selectWord,
    submitGuess,
    sendChat,
    playAgain,
    returnToLobby
  };

  return <GameEngineContext.Provider value={value}>{children}</GameEngineContext.Provider>;
}

export function useGameEngine() {
  const context = useContext(GameEngineContext);
  if (!context) {
    throw new Error('useGameEngine must be used within a GameEngineProvider');
  }
  return context;
}
