import { useState, useEffect, useCallback, useRef } from 'react';
import type { Card as CardType } from '../types/game.js';
import { SUIT_SYMBOLS, RANK_NAMES, HAND_LEVEL_NAMES, Phase } from '../types/game.js';
import type { RoomState, GameState, ShowdownResult } from '../types/game.js';
import type { ServerEvents } from '../hooks/useSocket.js';

interface GameTableProps {
  room: RoomState;
  myId: string;
  emit: (event: string, data?: any) => void;
  on: <K extends keyof ServerEvents>(event: K, cb: (data: ServerEvents[K]) => void) => () => void;
  onLeave: () => void;
}

export default function GameTable({ room, myId, emit, on, onLeave }: GameTableProps) {
  // Game state (synced from server)
  const [phase, setPhase] = useState<string>('waiting');
  const [players, setPlayers] = useState<any[]>([]);
  const [holeCards, setHoleCards] = useState<CardType[]>([]);
  const [communityCards, setCommunityCards] = useState<CardType[]>([]);
  const [currentBet, setCurrentBet] = useState(0);
  const [pots, setPots] = useState<{ amount: number }[]>([]);
  const [currentPlayerId, setCurrentPlayerId] = useState('');
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [showdownResults, setShowdownResults] = useState<ShowdownResult[]>([]);
  const [handResult, setHandResult] = useState<{ winnerIds: string[]; potAmount: number } | null>(null);
  const [chatLog, setChatLog] = useState<{ playerId: string; text: string }[]>([]);
  const [chatText, setChatText] = useState('');
  const [raiseAmount, setRaiseAmount] = useState(20);
  const [gameStarted, setGameStarted] = useState(false);
  const [dealerIndex, setDealerIndex] = useState(0);

  const chatRef = useRef<HTMLDivElement>(null);

  // Find my player index
  const myIndex = players.findIndex((p: any) => p.id === myId);
  const myPlayer = players[myIndex];

  // Listen to server events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on('room_updated', (data) => {
      setPlayers(data.players.map((rp: any) => ({
        id: rp.id, name: rp.name, chips: 0,
        holeCards: [], currentBet: 0, isFolded: false, isAllIn: false,
        seatIndex: 0, ready: rp.ready,
      })));
    }));

    unsubs.push(on('game_started', () => {
      setGameStarted(true);
      setShowdownResults([]);
      setHandResult(null);
    }));

    unsubs.push(on('deal_hole_cards', (data) => {
      setHoleCards(data.cards);
    }));

    unsubs.push(on('game_state', (data) => {
      const s = data.state;
      setPlayers(s.players);
      setCommunityCards(s.communityCards);
      setCurrentBet(s.currentBet);
      setPots(s.pots);
      setPhase(s.phase);
      setCurrentPlayerId(s.players[s.currentPlayerIndex]?.id ?? '');
      setDealerIndex(s.dealerIndex);
    }));

    unsubs.push(on('community_cards', (data) => {
      setCommunityCards(data.cards);
    }));

    unsubs.push(on('phase_change', (data) => {
      setPhase(data.to);
    }));

    unsubs.push(on('player_turn', (data) => {
      setCurrentPlayerId(data.playerId);
      setAvailableActions(data.actions);
    }));

    unsubs.push(on('player_action', (data) => {
      // Update player chips/bets from game_state or manually refresh
    }));

    unsubs.push(on('player_folded', (data) => {
      setPlayers(prev => prev.map(p =>
        p.id === data.playerId ? { ...p, isFolded: true } : p
      ));
    }));

    unsubs.push(on('showdown', (data) => {
      setShowdownResults(data.results);
    }));

    unsubs.push(on('pot_won', (data) => {}));

    unsubs.push(on('hand_over', (data) => {
      setHandResult({ winnerIds: data.winnerIds, potAmount: data.potAmount });
    }));

    unsubs.push(on('all_in', (data) => {
      setPlayers(prev => prev.map(p =>
        p.id === data.playerId ? { ...p, isAllIn: true } : p
      ));
    }));

    unsubs.push(on('chat_broadcast', (data) => {
      setChatLog(prev => [...prev.slice(-49), data]);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [on]);

  // Auto-scroll chat
  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [chatLog]);

  const isMyTurn = currentPlayerId === myId && phase !== Phase.HAND_OVER && phase !== Phase.WAITING;

  const doAction = (action: string, amount?: number) => {
    emit('player_action', { action, amount });
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    emit('chat_message', { text: chatText.trim() });
    setChatText('');
  };

  const toggleReady = () => emit('ready');
  const startGame = () => emit('start_game');

  const myChips = myPlayer?.chips ?? 0;
  const totalPot = pots.reduce((s, p) => s + p.amount, 0);

  // Determine if I'm the host
  const amHost = room.players[0]?.id === myId;
  const isDealer = (idx: number) => !gameStarted ? false : idx === dealerIndex;

  // Get position label for a player (庄家/小盲/大盲)
  const getPosition = (idx: number) => {
    if (phase === Phase.WAITING || phase === Phase.HAND_OVER) return null;
    const total = players.length;
    if (total < 2) return null;
    const sbIndex = (dealerIndex + 1) % total;
    const bbIndex = (dealerIndex + 2) % total;
    if (idx === dealerIndex) return { label: '庄家', abbrev: 'D' };
    if (idx === sbIndex) return { label: '小盲', abbrev: 'SB' };
    if (idx === bbIndex) return { label: '大盲', abbrev: 'BB' };
    return null;
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950">
      {/* Header bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold">Texas Hold'em</span>
          <span className="text-slate-500 text-xs">Room: <span className="text-slate-300 font-mono tracking-widest">{room.code}</span></span>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${room.settings.gameType === 'short_deck' ? 'bg-purple-700 text-purple-200' : 'bg-blue-700 text-blue-200'}`}>
            {room.settings.gameType === 'short_deck' ? 'Short Deck' : 'Long Deck'}
          </span>
        </div>
        <button onClick={onLeave} className="text-xs text-slate-400 hover:text-red-400 transition-colors">Leave</button>
      </header>

      {/* Main table area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-2">
        {/* Opponent seats */}
        <div className="flex gap-4 flex-wrap justify-center">
          {players.filter((p: any) => p.id !== myId).map((p: any) => (
            <div
              key={p.id}
              className={`player-seat w-32 text-center ${currentPlayerId === p.id ? 'player-seat-active' : 'player-seat-inactive'}`}
            >
              <div className="text-xs font-semibold truncate">
                {p.name} {(() => { const idx = players.indexOf(p); const pos = getPosition(idx); if (pos) return <span className={'ml-1 font-bold ' + (pos.abbrev === 'D' ? 'text-yellow-400' : 'text-cyan-400')}>{pos.label}</span>; return ''; })()}
              </div>
              {gameStarted && (
                <>
                  <div className="flex justify-center gap-0.5 mt-1">
                    {[0,1].map(i => (
                      <div key={i} className="w-6 h-8 rounded bg-gradient-to-br from-blue-800 to-blue-600 border border-blue-400" />
                    ))}
                  </div>
                  {p.currentBet > 0 && <div className="chip-stack mt-1">{p.currentBet}</div>}
                  {p.isFolded && <div className="text-xs text-red-400 mt-1">FOLD</div>}
                  {p.isAllIn && <div className="text-xs text-yellow-400 mt-1">ALL-IN</div>}
                </>
              )}
              <div className="text-xs text-slate-400 mt-1">{p.chips}</div>
              {!gameStarted && room.players.find((rp: any) => rp.id === p.id)?.ready && (
                <div className="text-xs text-green-400">Ready</div>
              )}
            </div>
          ))}
        </div>

        {/* Turn indicator */}
        {gameStarted && currentPlayerId && (
          <div className="mb-2 px-4 py-1.5 rounded-full text-sm font-semibold bg-slate-800/80 border border-slate-600">
            {currentPlayerId === myId ? (
              <span className="text-yellow-400">请行动</span>
            ) : (
              <span className="text-slate-300">轮到 <span className="text-amber-300">{players.find(p => p.id === currentPlayerId)?.name ?? '??'}</span> 行动</span>
            )}
          </div>
        )}

        {/* Community cards area */}
        <div className="my-6 flex flex-col items-center gap-3">
          {/* Community cards */}
          <div className="flex gap-2">
            {[0,1,2,3,4].map(i => {
              const card = communityCards[i];
              return card ? <CardDisplay key={i} card={card} /> : <div key={i} className="card-slot" />;
            })}
          </div>

          {/* Pot */}
          {totalPot > 0 && <div className="pot-display">Pot: {totalPot}</div>}
        </div>

        {/* My seat */}
        <div className={`player-seat w-64 mb-3 ${isMyTurn ? 'player-seat-active' : 'player-seat-inactive'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">
              {myPlayer?.name ?? 'You'}
              {myIndex >= 0 && (() => { const pos = getPosition(myIndex); if (pos) return <span className={'ml-1 font-bold ' + (pos.abbrev === 'D' ? 'text-yellow-400' : 'text-cyan-400')}>{pos.label}</span>; return ''; })()}
            </span>
            <span className="chip-stack">{myChips}</span>
          </div>
          <div className="flex justify-center gap-1 mb-2">
            {gameStarted && holeCards.length === 2 ? (
              holeCards.map((card, i) => <CardDisplay key={i} card={card} />)
            ) : (
              [0,1].map(i => <div key={i} className="card-slot" />)
            )}
          </div>
          {myPlayer?.currentBet > 0 && <div className="chip-stack text-center">Bet: {myPlayer.currentBet}</div>}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-2">
          <button className="btn-action bg-red-700 hover:bg-red-600 text-white disabled:opacity-30" disabled={!isMyTurn || !availableActions.includes('fold')} onClick={() => doAction('fold')}>Fold</button>
          <button className="btn-action bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-30" disabled={!isMyTurn || !availableActions.includes('check')} onClick={() => doAction('check')}>Check</button>
          <button className="btn-action bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-30" disabled={!isMyTurn || !availableActions.includes('call')} onClick={() => doAction('call')}>
            Call {currentBet > 0 ? currentBet - (myPlayer?.currentBet ?? 0) : ''}
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              className="w-16 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-sm text-center"
              value={raiseAmount}
              onChange={e => setRaiseAmount(Math.max(10, parseInt(e.target.value) || 10))}
              min={10}
            />
            <button className="btn-action bg-orange-700 hover:bg-orange-600 text-white disabled:opacity-30 text-xs" disabled={!isMyTurn || !availableActions.includes('raise')} onClick={() => doAction('raise', raiseAmount)}>Raise</button>
          </div>
          <button className="btn-action bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-30" disabled={!isMyTurn || !availableActions.includes('all-in')} onClick={() => doAction('all-in')}>All-in</button>
        </div>

        {/* Pre-game controls */}
        {!gameStarted && (
          <div className="flex gap-3 mt-2">
            <button
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${room.players.find(p => p.id === myId)?.ready ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              onClick={toggleReady}
            >
              {room.players.find(p => p.id === myId)?.ready ? 'Ready!' : 'Ready'}
              </button>
              {amHost && (
                <button className="btn-primary" onClick={startGame} disabled={room.players.length < 2}>
                Start Game
                </button>
              )}
            </div>
          )}

        {/* Hand result */}
        {handResult && (
          <div className="mt-2 px-4 py-2 bg-slate-800/80 rounded-lg border border-amber-600 text-center">
            <div className="text-amber-400 font-bold">
              {players.filter((p: any) => handResult.winnerIds.includes(p.id)).map((p: any) => p.name).join(', ')} won {handResult.potAmount} chips!
            </div>
            {showdownResults.length > 0 && (
              <div className="mt-1 text-xs text-slate-400">
                {showdownResults.map(r => (
                  <div key={r.playerId}>
                    {players.find((p: any) => p.id === r.playerId)?.name ?? '?'}: {r.description} ({r.cards.map(c => `${SUIT_SYMBOLS[c.suit]}${RANK_NAMES[c.rank]}`).join(' ')})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Chat */}
      <div className="border-t border-slate-700/50 bg-slate-900/50">
        <div ref={chatRef} className="h-20 overflow-y-auto px-3 py-1 text-xs space-y-0.5">
          {chatLog.map((msg, i) => (
            <div key={i}>
              <span className="text-amber-400">{players.find((p: any) => p.id === msg.playerId)?.name ?? '???'}: </span>
              <span className="text-slate-300">{msg.text}</span>
            </div>
          ))}
        </div>
        <form onSubmit={sendChat} className="flex border-t border-slate-700/50">
          <input
            className="flex-1 px-3 py-1.5 bg-transparent text-white text-sm outline-none placeholder-slate-500"
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            placeholder="Chat..."
            maxLength={200}
          />
          <button type="submit" className="px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300">Send</button>
        </form>
      </div>
    </div>
  );
}

// ─── Card display component ─────────────────────────────

function CardDisplay({ card }: { card: CardType }) {
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <div className={`card ${isRed ? 'card-red' : 'card-black'} bg-slate-100 text-slate-900`}>
      <div className="flex flex-col items-center leading-none">
        <span className="text-[10px]">{RANK_NAMES[card.rank]}</span>
        <span className="text-xs">{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );
}
