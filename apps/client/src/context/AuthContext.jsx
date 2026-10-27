import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  STORAGE_KEYS,
  GAME_CONSTANTS,
  normalizeUsername
} from '@doodlr/shared';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.USERNAME) || '';
  });

  const [avatar, setAvatar] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AVATAR);
    return GAME_CONSTANTS.PRESET_AVATARS.includes(saved)
      ? saved
      : GAME_CONSTANTS.PRESET_AVATARS[0];
  });

  const [guestId, setGuestId] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.GUEST_ID) || null;
  });

  const [reconnectToken, setReconnectToken] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.RECONNECT_TOKEN) || null;
  });

  const saveProfile = useCallback((newUsername, newAvatar) => {
    const normalized = normalizeUsername(newUsername);
    setUsername(normalized);
    setAvatar(newAvatar);
    localStorage.setItem(STORAGE_KEYS.USERNAME, normalized);
    localStorage.setItem(STORAGE_KEYS.AVATAR, newAvatar);
  }, []);

  const saveAuthSession = useCallback((newGuestId, newReconnectToken) => {
    if (newGuestId) {
      setGuestId(newGuestId);
      localStorage.setItem(STORAGE_KEYS.GUEST_ID, newGuestId);
    }
    if (newReconnectToken) {
      setReconnectToken(newReconnectToken);
      localStorage.setItem(STORAGE_KEYS.RECONNECT_TOKEN, newReconnectToken);
    }
  }, []);

  const clearAuthSession = useCallback(() => {
    setGuestId(null);
    setReconnectToken(null);
    localStorage.removeItem(STORAGE_KEYS.GUEST_ID);
    localStorage.removeItem(STORAGE_KEYS.RECONNECT_TOKEN);
  }, []);

  const value = {
    username,
    avatar,
    guestId,
    reconnectToken,
    saveProfile,
    saveAuthSession,
    clearAuthSession
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
