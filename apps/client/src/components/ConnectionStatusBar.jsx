import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useSocket } from '../context/SocketContext.jsx';

export default function ConnectionStatusBar() {
  const { isConnected, connectionError } = useSocket();

  if (isConnected) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="bg-blue-700 text-white text-xs font-bold py-2 px-4 sticky top-0 z-50 flex items-center justify-center gap-2"
      >
        <WifiOff className="w-3.5 h-3.5 animate-pulse" />
        <span>
          {connectionError
            ? `Connection issue: ${connectionError}. Reconnecting...`
            : 'Connecting to SketchSprint game server...'}
        </span>
        <RefreshCw className="w-3 h-3 animate-spin ml-1" />
      </motion.div>
    </AnimatePresence>
  );
}
