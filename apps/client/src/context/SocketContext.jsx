import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Singleton socket connection
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setConnectionError(null);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, reconnect manually
        socket.connect();
      }
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      setConnectionError(err.message || 'Unable to connect to game server');
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /**
   * Promisified socket emission with acknowledgment and timeout protection
   * @param {string} event
   * @param {Object} data
   * @param {number} [timeoutMs=8000]
   * @returns {Promise<any>}
   */
  const emitWithAck = useCallback((event, data = {}, timeoutMs = 8000) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        return reject(new Error('Connection lost. Please wait while reconnecting...'));
      }

      let settled = false;
      let timer = null;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('The server took too long to respond. Please try again.'));
        }, timeoutMs);
      }

      socket.emit(event, data, (response) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(response);
      });
    });
  }, []);

  const value = {
    socketRef,
    isConnected,
    connectionError,
    emitWithAck
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
