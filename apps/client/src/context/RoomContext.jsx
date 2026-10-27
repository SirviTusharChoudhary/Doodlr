import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SOCKET_EVENTS, STORAGE_KEYS, normalizeUsername } from '@doodlr/shared';
import { useSocket } from './SocketContext.jsx';
import { useAuth } from './AuthContext.jsx';

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const { socketRef, isConnected, emitWithAck } = useSocket();
  const { username, avatar, reconnectToken, saveAuthSession, clearAuthSession } = useAuth();
  const wasConnectedRef = React.useRef(false);

  const [roomState, setRoomState] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);


  const clearError = useCallback(() => setError(null), []);
  const clearNotification = useCallback(() => setNotification(null), []);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notification) return undefined;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Listen to authoritative room updates from server
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleRoomState = (updatedRoom) => {
      setRoomState(updatedRoom);
      setPlayerState((prev) => {
        if (!prev || !updatedRoom?.players) return prev;
        const me = updatedRoom.players.find((player) => player.id === prev.guestId);
        if (!me) return prev;
        return {
          ...prev,
          isHost: Boolean(me.isHost),
          role: me.role,
          username: me.username,
          avatar: me.avatar
        };
      });
    };

    const handleHostTransferred = ({ username: newHostName }) => {
      setNotification(`Host was transferred to ${newHostName || 'another player'}.`);
    };

    const handlePlayerJoined = ({ player }) => {
      setNotification(`${player.username} joined the room.`);
    };

    const handlePlayerLeft = ({ username: leftName }) => {
      setNotification(`${leftName || 'A player'} left the room.`);
    };

    const handleRoomError = ({ message }) => {
      setError(message);
    };

    socket.on(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
    socket.on(SOCKET_EVENTS.HOST_TRANSFERRED, handleHostTransferred);
    socket.on(SOCKET_EVENTS.PLAYER_JOINED, handlePlayerJoined);
    socket.on(SOCKET_EVENTS.PLAYER_LEFT, handlePlayerLeft);
    socket.on(SOCKET_EVENTS.ROOM_ERROR, handleRoomError);

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_STATE, handleRoomState);
      socket.off(SOCKET_EVENTS.HOST_TRANSFERRED, handleHostTransferred);
      socket.off(SOCKET_EVENTS.PLAYER_JOINED, handlePlayerJoined);
      socket.off(SOCKET_EVENTS.PLAYER_LEFT, handlePlayerLeft);
      socket.off(SOCKET_EVENTS.ROOM_ERROR, handleRoomError);
    };
  }, [socketRef, isConnected]);


  // Create Private Room
  const createPrivateRoom = useCallback(async (settings = {}, profile = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await emitWithAck(SOCKET_EVENTS.CREATE_ROOM, {
        username: profile.username || username,
        avatar: profile.avatar || avatar,
        reconnectToken: reconnectToken || undefined,
        settings
      });

      setIsLoading(false);

      if (res?.success) {
        setRoomState(res.data.room);
        setPlayerState(res.data.player);

        if (res.data.player?.guestId) {
          saveAuthSession(res.data.player.guestId, res.data.reconnectToken);
        }
        return res.data.room;
      } else {
        const errMsg = res?.error || 'Failed to create room';
        setError(errMsg);
        throw new Error(errMsg);
      }
    } catch (err) {
      setIsLoading(false);
      if (!err.message?.includes('Failed to create room')) {
        setError(err.message || 'Failed to create room');
      }
      throw err;
    }
  }, [username, avatar, reconnectToken, emitWithAck, saveAuthSession]);

  // Join Existing Room
  const joinRoom = useCallback(async (targetRoomCode, customUsername, customAvatar) => {
    setIsLoading(true);
    setError(null);

    const nameToUse = customUsername ? normalizeUsername(customUsername) : username;
    const avatarToUse = customAvatar || avatar;

    try {
      const res = await emitWithAck(SOCKET_EVENTS.JOIN_ROOM, {
        roomCode: targetRoomCode.trim().toUpperCase(),
        username: nameToUse,
        avatar: avatarToUse,
        reconnectToken: reconnectToken || undefined
      });

      setIsLoading(false);

      if (res?.success) {
        setRoomState(res.data.room);
        setPlayerState(res.data.player);

        if (res.data.player?.guestId) {
          saveAuthSession(res.data.player.guestId, res.data.reconnectToken);
        }
        return res.data.room;
      } else {
        const errMsg = res?.error || 'Failed to join room';
        setError(errMsg);
        throw new Error(errMsg);
      }
    } catch (err) {
      setIsLoading(false);
      setError(err.message || 'Failed to join room');
      throw err;
    }
  }, [username, avatar, reconnectToken, emitWithAck, saveAuthSession]);

  useEffect(() => {
    if (isConnected) {
      if (
        !wasConnectedRef.current &&
        roomState?.roomCode &&
        reconnectToken
      ) {
        joinRoom(roomState.roomCode).catch(() => {});
      }
      wasConnectedRef.current = true;
    } else {
      wasConnectedRef.current = false;
    }
  }, [isConnected, roomState?.roomCode, reconnectToken, joinRoom]);

  // Update Private Room Settings (Host only)
  const updateSettings = useCallback(async (newSettings) => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.UPDATE_SETTINGS, newSettings);
      if (res?.success) {
        if (res.data?.room) {
          setRoomState(res.data.room);
        }
      } else {
        setError(res?.error || 'Failed to update settings');
      }
    } catch (err) {
      setError(err.message);
    }
  }, [emitWithAck]);

  // Leave current room
  const leaveRoom = useCallback(async () => {
    if (!socketRef.current) return;
    try {
      await emitWithAck(SOCKET_EVENTS.LEAVE_ROOM, {}, 3000).catch(() => {});
    } finally {
      setRoomState(null);
      setPlayerState(null);
      setError(null);
      setNotification(null);
      clearAuthSession();
    }
  }, [socketRef, emitWithAck, clearAuthSession]);

  const value = {
    roomState,
    setRoomState,
    playerState,
    setPlayerState,
    isLoading,
    error,
    setError,
    clearError,
    notification,
    setNotification,
    clearNotification,
    createPrivateRoom,
    joinRoom,
    updateSettings,
    leaveRoom
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
}
