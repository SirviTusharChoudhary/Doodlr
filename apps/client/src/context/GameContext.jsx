import React from 'react';
import { SocketProvider, useSocket } from './SocketContext.jsx';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { RoomProvider, useRoom } from './RoomContext.jsx';
import { GameEngineProvider, useGameEngine } from './GameEngineContext.jsx';
import { DrawingProvider, useDrawing } from './DrawingContext.jsx';

/**
 * Root GameProvider composed of focused, decoupled context providers
 */
export function GameProvider({ children }) {
  return (
    <SocketProvider>
      <AuthProvider>
        <RoomProvider>
          <GameEngineProvider>
            <DrawingProvider>{children}</DrawingProvider>
          </GameEngineProvider>
        </RoomProvider>
      </AuthProvider>
    </SocketProvider>
  );
}

/**
 * Composite hook that aggregates state and methods from all 5 sub-contexts.
 * Preserves 100% backward compatibility for existing components.
 */
export function useGame() {
  const socket = useSocket();
  const auth = useAuth();
  const room = useRoom();
  const engine = useGameEngine();
  const drawing = useDrawing();

  return {
    // Socket
    isConnected: socket.isConnected,
    connectionError: socket.connectionError,

    // Auth
    username: auth.username,
    avatar: auth.avatar,
    guestId: auth.guestId,
    reconnectToken: auth.reconnectToken,
    saveProfile: auth.saveProfile,

    // Room
    roomState: room.roomState,
    playerState: room.playerState,
    isLoading: room.isLoading,
    error: room.error,
    setError: room.setError,
    clearError: room.clearError,
    notification: room.notification,
    clearNotification: room.clearNotification,
    createPrivateRoom: room.createPrivateRoom,
    joinRoom: room.joinRoom,
    updateSettings: room.updateSettings,
    leaveRoom: room.leaveRoom,

    // Game Engine
    wordChoices: engine.wordChoices,
    secretWord: engine.secretWord || room.roomState?.secretWord,
    turnInfo: engine.turnInfo,
    turnSummary: engine.turnSummary,
    gameRankings: engine.gameRankings,
    messages: engine.messages,
    guessMessages: engine.guessMessages,
    rateLimitWarning: engine.rateLimitWarning,
    startGame: engine.startGame,
    selectWord: engine.selectWord,
    submitGuess: engine.submitGuess,
    sendChat: engine.sendChat,
    playAgain: engine.playAgain,
    returnToLobby: engine.returnToLobby,

    // Drawing
    strokes: drawing.strokes,
    setStrokes: drawing.setStrokes,
    warningMessage: drawing.warningMessage,
    setWarningMessage: drawing.setWarningMessage,
    submitStroke: drawing.submitStroke,
    undoStroke: drawing.undoStroke,
    clearCanvas: drawing.clearCanvas,
    requestSnapshot: drawing.requestSnapshot
  };
}

// Re-export focused hooks for granular usage
export { useSocket, useAuth, useRoom, useGameEngine, useDrawing };
