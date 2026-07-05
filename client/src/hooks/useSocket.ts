import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomState, GameState, Card, ShowdownResult } from '../types/game.js';

export interface ServerEvents {
  room_joined: { room: RoomState; playerId: string };
  room_updated: { players: any[]; settings: any };
  game_started: {};
  deal_hole_cards: { cards: Card[] };
  community_cards: { cards: Card[] };
  phase_change: { from: string; to: string };
  player_turn: { playerId: string; actions: string[] };
  player_action: { playerId: string; action: string; amount: number };
  player_folded: { playerId: string };
  showdown: { results: ShowdownResult[] };
  pot_won: { playerId: string; amount: number };
  hand_over: { winnerIds: string[]; potAmount: number };
  all_in: { playerId: string };
  game_state: { state: GameState };
  chat_broadcast: { playerId: string; text: string };
  error: { message: string };
}

type EventCallback<T> = (data: T) => void;

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [myId, setMyId] = useState<string>('');
  const callbacksRef = useRef<Map<string, Set<(...args: any[]) => void>>>(new Map());

  useEffect(() => {
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
    });
    socket.on('disconnect', () => {
      setConnected(false);
    });
    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    // Route all registered callbacks
    const cbMap = callbacksRef.current;
    const handler = (event: string, ...args: any[]) => {
      const cbs = cbMap.get(event);
      if (cbs) cbs.forEach(fn => fn(...args));
    };
    socket.onAny(handler);

    return () => {
      socket.offAny(handler);
      socket.close();
    };
  }, []);

  const on = useCallback(<K extends keyof ServerEvents>(
    event: K,
    callback: EventCallback<ServerEvents[K]>,
  ) => {
    const cbMap = callbacksRef.current;
    if (!cbMap.has(event)) cbMap.set(event, new Set());
    cbMap.get(event)!.add(callback as any);
    return () => { cbMap.get(event)?.delete(callback as any); };
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef, connected, myId, on, emit };
}

export default useSocket;
