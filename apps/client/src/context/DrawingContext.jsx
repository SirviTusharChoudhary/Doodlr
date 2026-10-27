import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { SOCKET_EVENTS } from '@doodlr/shared';
import { useSocket } from './SocketContext.jsx';

const DrawingContext = createContext(null);

export function DrawingProvider({ children }) {
  const { socketRef, isConnected, emitWithAck } = useSocket();

  const [strokes, setStrokes] = useState([]);
  const [warningMessage, setWarningMessage] = useState(null);
  const sequenceRef = useRef(0);

  // Auto-dismiss drawing warnings
  useEffect(() => {
    if (!warningMessage) return;
    const t = setTimeout(() => setWarningMessage(null), 4000);
    return () => clearTimeout(t);
  }, [warningMessage]);

  // Clean listeners for drawing synchronization
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Reset strokes when new turn starts
    const handleTurnStarted = () => {
      setStrokes([]);
      setWarningMessage(null);
      sequenceRef.current = 0;
    };

    // Live stroke drawn (received from other players)
    const handleStrokeDrawn = (stroke) => {
      if (typeof stroke.sequence === 'number' && stroke.sequence < sequenceRef.current) return;
      if (typeof stroke.sequence === 'number') sequenceRef.current = Math.max(sequenceRef.current, stroke.sequence);
      setStrokes((prev) => {
        const index = prev.findIndex((s) => s.id === stroke.id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = stroke;
          return updated;
        }
        return [...prev, stroke];
      });
    };

    // Stroke undone
    const handleStrokeUndone = ({ strokeId, sequence }) => {
      if (typeof sequence === 'number' && sequence < sequenceRef.current) return;
      if (typeof sequence === 'number') sequenceRef.current = sequence;
      setStrokes((prev) => prev.filter((s) => s.id !== strokeId));
    };

    // Canvas cleared
    const handleCanvasCleared = ({ sequence } = {}) => {
      if (typeof sequence === 'number' && sequence < sequenceRef.current) return;
      if (typeof sequence === 'number') sequenceRef.current = sequence;
      setStrokes([]);
    };

    // Snapshot sync (on join/reconnect)
    const handleDrawingSnapshot = (data) => {
      if (data?.strokes) {
        sequenceRef.current = data.sequence || 0;
        setStrokes(data.strokes);
      }
    };

    socket.on(SOCKET_EVENTS.TURN_STARTED, handleTurnStarted);
    socket.on(SOCKET_EVENTS.STROKE_DRAWN, handleStrokeDrawn);
    socket.on(SOCKET_EVENTS.STROKE_UNDONE, handleStrokeUndone);
    socket.on(SOCKET_EVENTS.CANVAS_CLEARED, handleCanvasCleared);
    socket.on(SOCKET_EVENTS.DRAWING_SNAPSHOT, handleDrawingSnapshot);

    return () => {
      socket.off(SOCKET_EVENTS.TURN_STARTED, handleTurnStarted);
      socket.off(SOCKET_EVENTS.STROKE_DRAWN, handleStrokeDrawn);
      socket.off(SOCKET_EVENTS.STROKE_UNDONE, handleStrokeUndone);
      socket.off(SOCKET_EVENTS.CANVAS_CLEARED, handleCanvasCleared);
      socket.off(SOCKET_EVENTS.DRAWING_SNAPSHOT, handleDrawingSnapshot);
    };
  }, [socketRef, isConnected]);

  // Submit stroke (Drawer only)
  const submitStroke = useCallback(async (strokeData) => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.SUBMIT_STROKE, strokeData, 4000);
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to submit stroke');
      }
      return res;
    } catch (err) {
      if (err.message) {
        setWarningMessage(err.message);
      }
      throw err;
    }
  }, [emitWithAck]);

  // Undo last completed stroke (Drawer only)
  const undoStroke = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.UNDO_STROKE, {}, 4000);
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to undo stroke');
      }
      return res;
    } catch (err) {
      if (err.message) {
        setWarningMessage(err.message);
      }
      throw err;
    }
  }, [emitWithAck]);

  // Clear canvas (Drawer only)
  const clearCanvas = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.CLEAR_CANVAS, {}, 4000);
      if (!res?.success) {
        throw new Error(res?.error || 'Failed to clear canvas');
      }
      return res;
    } catch (err) {
      if (err.message) {
        setWarningMessage(err.message);
      }
      throw err;
    }
  }, [emitWithAck]);

  // Request snapshot (New joiner/reconnecting client)
  const requestSnapshot = useCallback(async () => {
    try {
      const res = await emitWithAck(SOCKET_EVENTS.DRAWING_SNAPSHOT, {}, 5000);
      if (res?.success && res.data?.strokes) {
        setStrokes(res.data.strokes);
        return res.data;
      }
      throw new Error(res?.error || 'Failed to get drawing snapshot');
    } catch (err) {
      throw err;
    }
  }, [emitWithAck]);

  const value = {
    strokes,
    setStrokes,
    warningMessage,
    setWarningMessage,
    submitStroke,
    undoStroke,
    clearCanvas,
    requestSnapshot
  };

  return <DrawingContext.Provider value={value}>{children}</DrawingContext.Provider>;
}

export function useDrawing() {
  const context = useContext(DrawingContext);
  if (!context) {
    throw new Error('useDrawing must be used within a DrawingProvider');
  }
  return context;
}
