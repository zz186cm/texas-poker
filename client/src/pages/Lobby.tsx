import { useState, FormEvent } from 'react';

interface LobbyProps {
  connected: boolean;
  onCreateRoom: (nickname: string, settings?: any) => void;
  onJoinRoom: (roomCode: string, nickname: string) => void;
}

export default function Lobby({ connected, onCreateRoom, onJoinRoom }: LobbyProps) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [gameType, setGameType] = useState<'long_deck' | 'short_deck'>('long_deck');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;
    onCreateRoom(nickname.trim(), {
      gameType,
      smallBlind: 5,
      bigBlind: 10,
      minPlayers: 2,
      maxPlayers: 6,
      startingChips: 1000,
    });
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) return;
    onJoinRoom(roomCode.trim().toUpperCase(), nickname.trim());
  };

  return (
    <div className="w-full max-w-md mx-auto p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-amber-400 mb-1">Texas Hold'em</h1>
        <p className="text-slate-400 text-sm">Online Poker</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-xs text-slate-500">{connected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex mb-6 bg-slate-800 rounded-lg p-1">
        <button
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'create' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('create')}
        >
          Create Room
        </button>
        <button
          className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${tab === 'join' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
          onClick={() => setTab('join')}
        >
          Join Room
        </button>
      </div>

      {tab === 'create' ? (
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nickname</label>
            <input
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:border-blue-500 outline-none"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={20}
              placeholder="Enter your name"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Game Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`py-2 rounded text-sm font-semibold border transition-colors ${gameType === 'long_deck' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                onClick={() => setGameType('long_deck')}
              >
                Long Deck (52)
              </button>
              <button
                type="button"
                className={`py-2 rounded text-sm font-semibold border transition-colors ${gameType === 'short_deck' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                onClick={() => setGameType('short_deck')}
              >
                Short Deck (36)
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-40"
            disabled={!connected || !nickname.trim()}
          >
            Create Room
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Nickname</label>
            <input
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white focus:border-blue-500 outline-none"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={20}
              placeholder="Enter your name"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Room Code</label>
            <input
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white uppercase tracking-widest text-center font-mono text-lg focus:border-blue-500 outline-none"
              value={roomCode}
              onChange={e => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              maxLength={6}
              placeholder="XXXXXX"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors disabled:opacity-40"
            disabled={!connected || !nickname.trim() || roomCode.trim().length < 6}
          >
            Join Room
          </button>
        </form>
      )}
    </div>
  );
}
