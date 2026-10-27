import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './context/GameContext.jsx';
import HomePage from './pages/HomePage.jsx';
import CreateRoomPage from './pages/CreateRoomPage.jsx';
import JoinRoomPage from './pages/JoinRoomPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import ConnectionStatusBar from './components/ConnectionStatusBar.jsx';

export default function App() {
  return (
    <GameProvider>
      <div className="arcade-shell min-h-screen">
        <ConnectionStatusBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateRoomPage />} />
          <Route path="/join" element={<JoinRoomPage />} />
          <Route path="/join/:roomCode" element={<JoinRoomPage />} />
          <Route path="/room/:roomCode" element={<LobbyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </GameProvider>
  );
}
