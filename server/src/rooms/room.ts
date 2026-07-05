import { Socket } from 'socket.io';
import { Game, defaultSettings, ActionResult } from '../game-engine/game.js';
import {
  GameSettings, GameState, GameType, Phase, ActionType, HandLevel,
  type Card,
} from '../game-engine/types.js';
import { getHandLevelOrder } from '../game-engine/hand-rank.js';
import { rankPlayersAtShowdown } from '../game-engine/evaluator.js';
import { computeSidePots } from '../game-engine/side-pot.js';
import { RoomPlayer, RoomState, SocketMap } from './room-types.js';
import { saveRoom, deleteRoom as dbDeleteRoom, saveHandHistory } from '../db/sqlite.js';

const ROOM_CODE_LENGTH = 6;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion, letters only

function generateRoomCode(existingCodes: Set<string>): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

export class Room {
  public code: string;
  public settings: GameSettings;
  public game: Game;
  public players: RoomPlayer[] = [];
  public sockets: SocketMap = new Map();
  public hostId: string | null = null;
  public started = false;

  private _handInProgress = false;

  constructor(code: string, settings: GameSettings, hostId: string) {
    this.code = code;
    this.settings = settings;
    this.game = new Game(settings);
    this.hostId = hostId;
  }

  /** Add a player to the room. Returns the new RoomPlayer. */
  addPlayer(socket: Socket, id: string, name: string): RoomPlayer | null {
    if (this.players.length >= this.settings.maxPlayers) return null;
    if (this.players.some(p => p.id === id)) return null;
    if (this.started) return null;

    const rp: RoomPlayer = { id, name, ready: false, joinedAt: Date.now() };
    this.players.push(rp);
    this.sockets.set(id, socket);
    this.game.addPlayer(id, name);

    // First player becomes host
    if (!this.hostId) this.hostId = id;

    // Persist room + player
    saveRoom({
      code: this.code, gameType: this.settings.gameType,
      smallBlind: this.settings.smallBlind, bigBlind: this.settings.bigBlind,
      startingChips: this.settings.startingChips, maxPlayers: this.settings.maxPlayers,
    });

    return rp;
  }

  /** Remove a player from the room. */
  removePlayer(playerId: string): void {
    this.players = this.players.filter(p => p.id !== playerId);
    this.sockets.delete(playerId);
    this.game.removePlayer(playerId);

    if (this.hostId === playerId && this.players.length > 0) {
      this.hostId = this.players[0].id; // reassign host
    }
    if (this.players.length === 0) {
      dbDeleteRoom(this.code);
    }
  }

  /** Get a snapshot for clients. */
  getState(): RoomState {
    return {
      code: this.code,
      settings: this.settings,
      players: this.players,
      phase: this.game.phase,
      playerCount: this.players.length,
    };
  }

  /** All players ready? */
  allReady(): boolean {
    return this.players.length >= this.settings.minPlayers &&
      this.players.every(p => p.ready);
  }

  /** Start a new hand. Returns the result or error. */
  startHand(): ActionResult {
    this._handInProgress = true;
    const result = this.game.startHand();
    if (result.success) {
      this._emitGameState();
      this._emitHoleCards();
      this._emitPhaseChange(result);
      // Broadcast player turn for the first player
      this._emitTurnInfo();
    }
    return result;
  }

  /** Handle a player action. */
  handleAction(playerId: string, action: { type: string; amount?: number }): ActionResult {
    const playerAction: { type: ActionType; amount: number } = {
      type: action.type as ActionType,
      amount: action.amount ?? 0,
    };
    const result = this.game.handleAction(playerId, playerAction);
    if (result.success) {
      // Broadcast action
      this._broadcast('player_action', {
        playerId,
        action: action.type,
        amount: action.amount ?? 0,
      });

      // Check for events that need special handling
      for (const ev of result.events) {
        switch (ev.type) {
          case 'deal_community':
            this._broadcast('community_cards', { cards: ev.cards });
            break;
          case 'phase_change':
            this._broadcast('phase_change', { from: ev.from, to: ev.to });
            break;
          case 'player_folded':
            this._broadcast('player_folded', { playerId: ev.playerId });
            break;
          case 'showdown':
            this._broadcast('showdown', { results: ev.results });
            break;
          case 'pot_won':
            this._broadcast('pot_won', { playerId: ev.playerId, amount: ev.amount });
            break;
          case 'hand_over': {
            this._broadcast('hand_over', { winnerIds: ev.winnerIds, potAmount: ev.potAmount });
            // Persist hand history
            saveHandHistory({
              roomCode: this.code,
              handNumber: this.game.handCount,
              winnerIds: ev.winnerIds.join(','),
              handLevel: 0, // simplified
              potAmount: ev.potAmount,
            });
            this._handInProgress = false;
            break;
          }
          case 'all_in':
            this._broadcast('all_in', { playerId: ev.playerId });
            break;
        }
      }

      // Emit player turn info if hand is still in progress
      if (this.game.phase !== Phase.HAND_OVER && this.game.phase !== Phase.SHOWDOWN) {
        this._emitTurnInfo();
      }
    }
    return result;
  }

  // ── Private helpers ──────────────────────────────────

  private _broadcast(event: string, data: any): void {
    for (const [_, socket] of this.sockets) {
      socket.emit(event, data);
    }
  }

  private _sendTo(playerId: string, event: string, data: any): void {
    this.sockets.get(playerId)?.emit(event, data);
  }

  private _emitGameState(): void {
    const state = this.game.getState();
    // Strip hole cards for broadcast
    const sanitized: any = { ...state, players: state.players.map(p => ({ ...p, holeCards: [] })) };
    this._broadcast('game_state', { state: sanitized });
  }

  private _emitHoleCards(): void {
    for (const p of this.game.players) {
      this._sendTo(p.id, 'deal_hole_cards', { cards: p.holeCards });
    }
  }

  private _emitPhaseChange(result: ActionResult): void {
    for (const ev of result.events) {
      if (ev.type === 'phase_change') {
        this._broadcast('phase_change', { from: ev.from, to: ev.to });
      }
    }
  }

  private _emitTurnInfo(): void {
    const cp = this.game.players[this.game.currentPlayerIndex];
    if (cp) {
      this._broadcast('player_turn', {
        playerId: cp.id,
        actions: this._availableActions(cp.id),
        timeBank: 30,
      });
    }
  }

  private _availableActions(playerId: string): string[] {
    const actions: string[] = [];
    const p = this.game.players[this.game.currentPlayerIndex];
    if (!p || p.id !== playerId) return actions;

    actions.push('fold');
    if (p.currentBet >= this.game.currentBet) {
      actions.push('check');
    }
    if (this.game.currentBet > 0) {
      actions.push('call');
    }
    if (p.chips > 0) {
      actions.push('raise');
      actions.push('all-in');
    }
    return actions;
  }
}

export function createRoom(settings: GameSettings, hostId: string, existingCodes: Set<string>): Room {
  const code = generateRoomCode(existingCodes);
  return new Room(code, settings, hostId);
}
