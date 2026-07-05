import { GameSettings, GameState, Card } from '../game-engine/types.js';
import type { Socket } from 'socket.io';

export interface RoomPlayer {
  id: string;
  name: string;
  ready: boolean;
  joinedAt: number;
}

export interface RoomState {
  code: string;
  settings: GameSettings;
  players: RoomPlayer[];
  phase: string;
  playerCount: number;
}

/** Per-room socket map keyed by player id */
export type SocketMap = Map<string, Socket>;

/** Events the server emits to clients */
export interface ServerEvents {
  room_joined: (data: { room: RoomState }) => void;
  room_updated: (data: { players: RoomPlayer[]; settings: GameSettings }) => void;
  game_started: (data: {}) => void;
  deal_hole_cards: (data: { cards: Card[] }) => void;
  community_cards: (data: { cards: Card[] }) => void;
  phase_change: (data: { from: string; to: string }) => void;
  player_turn: (data: { playerId: string; actions: string[]; timeBank: number }) => void;
  player_action: (data: { playerId: string; action: string; amount: number }) => void;
  player_folded: (data: { playerId: string }) => void;
  showdown: (data: { results: any[] }) => void;
  pot_won: (data: { playerId: string; amount: number }) => void;
  hand_over: (data: { winnerIds: string[]; potAmount: number }) => void;
  all_in: (data: { playerId: string }) => void;
  game_state: (data: { state: GameState }) => void;
  chat_broadcast: (data: { playerId: string; text: string }) => void;
  error: (data: { message: string }) => void;
}

export interface ClientEvents {
  create_room: (data: { nickname: string; settings?: Partial<GameSettings> }) => void;
  join_room: (data: { roomCode: string; nickname: string }) => void;
  leave_room: (data: {}) => void;
  ready: (data: {}) => void;
  start_game: (data: {}) => void;
  player_action: (data: { action: string; amount?: number }) => void;
  chat_message: (data: { text: string }) => void;
}
