import { useState, useCallback, useEffect } from 'react';
import Lobby from './pages/Lobby.js';
import GameTable from './pages/GameTable.js';
import useSocket from './hooks/useSocket.js';
import { RoomState, GameState, Card, ShowdownResult } from './types/game.js';

export default function App() {
  const { connected, emit, on } = useSocket();
  const [screen, setScreen] = useState<'lobby' | 'table'>('lobby');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [myId, setMyId] = useState('');
  const [error, setError] = useState('');

  // Listen for room events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on('room_joined', (data) => {
      setRoom(data.room);
      setMyId(data.playerId);
      setScreen('table');
      setError('');
    }));

    unsubs.push(on('room_updated', (data) => {
      setRoom(prev => prev ? { ...prev, players: data.players, settings: data.settings } : prev);
    }));

    unsubs.push(on('error', (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 5000);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [on]);

  const createRoom = useCallback((nickname: string, settings?: any) => {
    emit('create_room', { nickname, settings });
  }, [emit]);

  const joinRoom = useCallback((roomCode: string, nickname: string) => {
    emit('join_room', { roomCode: roomCode.toUpperCase(), nickname });
  }, [emit]);

  const leaveRoom = useCallback(() => {
    emit('leave_room');
    setRoom(null);
    setScreen('lobby');
  }, [emit]);

  if (screen === 'table' && room) {
    return (
      <div className="min-h-screen">
        <GameTable
          room={room}
          myId={myId}
          emit={emit}
          on={on}
          onLeave={leaveRoom}
        />
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Lobby
        connected={connected}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
      />
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
}
