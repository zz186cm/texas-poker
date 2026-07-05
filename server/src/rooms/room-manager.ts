import { Room, createRoom } from './room.js';
import { RoomState } from './room-types.js';
import { GameSettings, GameType } from '../game-engine/types.js';
import { defaultSettings } from '../game-engine/game.js';

export class RoomManager {
  private rooms = new Map<string, Room>();

  /** Create a new room. */
  create(settings?: Partial<GameSettings>, hostId: string = 'unknown'): Room {
    const fullSettings: GameSettings = {
      ...defaultSettings(),
      ...settings,
    };
    const existing = new Set(this.rooms.keys());
    const room = createRoom(fullSettings, hostId, existing);
    this.rooms.set(room.code, room);
    return room;
  }

  /** Get a room by code. */
  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  /** Delete a room. */
  delete(code: string): boolean {
    return this.rooms.delete(code.toUpperCase());
  }

  /** List all public-joinable rooms (waiting to start). */
  list(): RoomState[] {
    const list: RoomState[] = [];
    for (const room of this.rooms.values()) {
      if (!room.started && room.players.length < room.settings.maxPlayers) {
        list.push(room.getState());
      }
    }
    return list;
  }

  /** Find which room a player is in. */
  findByPlayer(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.players.some(p => p.id === playerId)) return room;
    }
    return undefined;
  }

  /** Clean up empty rooms. */
  cleanup(): void {
    for (const [code, room] of this.rooms) {
      if (room.players.length === 0) {
        this.rooms.delete(code);
      }
    }
  }
}

// Singleton
export const roomManager = new RoomManager();
