import { Socket } from 'socket.io';
import { roomManager } from '../rooms/room-manager.js';
import { Room } from '../rooms/room.js';
import { GameSettings } from '../game-engine/types.js';
import { upsertPlayer } from '../db/sqlite.js';

/** Generate a simple unique player ID */
let _idCounter = 0;
function generatePlayerId(): string {
  return `p${Date.now().toString(36)}${(_idCounter++).toString(36)}`;
}

export function registerSocketHandlers(socket: Socket): void {
  // Store player info on the socket
  let playerId = '';
  let playerName = '';
  let currentRoom: Room | null = null;

  // ── CREATE ROOM ──────────────────────────────────────

  socket.on('create_room', (data: { nickname: string; settings?: Partial<GameSettings> }) => {
    const name = (data.nickname || 'Anonymous').trim().slice(0, 20);
    playerId = generatePlayerId();
    playerName = name;

    const room = roomManager.create(data.settings, playerId);
    currentRoom = room;

    const rp = room.addPlayer(socket, playerId, name);
    if (!rp) {
      socket.emit('error', { message: 'Could not join room' });
      roomManager.delete(room.code);
      return;
    }

    upsertPlayer(playerId, name, room.code);
    socket.join(room.code);
    socket.emit('room_joined', { room: room.getState() });
  });

  // ── JOIN ROOM ────────────────────────────────────────

  socket.on('join_room', (data: { roomCode: string; nickname: string }) => {
    const room = roomManager.get(data.roomCode);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (room.started) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    const name = (data.nickname || 'Anonymous').trim().slice(0, 20);
    playerId = generatePlayerId();
    playerName = name;
    currentRoom = room;

    const rp = room.addPlayer(socket, playerId, name);
    if (!rp) {
      socket.emit('error', { message: 'Room is full or name taken' });
      return;
    }

    upsertPlayer(playerId, name, room.code);
    socket.join(room.code);
    socket.emit('room_joined', { room: room.getState() });
    // Notify others
    socket.to(room.code).emit('room_updated', {
      players: room.players,
      settings: room.settings,
    });
  });

  // ── LEAVE ROOM ───────────────────────────────────────

  socket.on('leave_room', () => {
    if (!currentRoom || !playerId) return;
    const room = currentRoom;
    room.removePlayer(playerId);
    socket.leave(room.code);

    if (room.players.length > 0) {
      socket.to(room.code).emit('room_updated', {
        players: room.players,
        settings: room.settings,
      });
    } else {
      roomManager.delete(room.code);
    }

    currentRoom = null;
  });

  // ── READY ────────────────────────────────────────────

  socket.on('ready', () => {
    if (!currentRoom || !playerId) return;
    const p = currentRoom.players.find(p => p.id === playerId);
    if (p) {
      p.ready = !p.ready;
      socket.to(currentRoom.code).emit('room_updated', {
        players: currentRoom.players,
        settings: currentRoom.settings,
      });
      socket.emit('room_updated', {
        players: currentRoom.players,
        settings: currentRoom.settings,
      });
    }
  });

  // ── START GAME ───────────────────────────────────────

  socket.on('start_game', () => {
    if (!currentRoom || !playerId) return;
    if (currentRoom.hostId !== playerId) {
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    if (!currentRoom.allReady()) {
      socket.emit('error', { message: 'Not all players are ready' });
      return;
    }

    currentRoom.started = true;
    socket.to(currentRoom.code).emit('game_started', {});
    socket.emit('game_started', {});

    // Deal first hand
    const result = currentRoom.startHand();
    if (!result.success) {
      socket.emit('error', { message: result.error ?? 'Failed to start hand' });
    }
  });

  // ── PLAYER ACTION ────────────────────────────────────

  socket.on('player_action', (data: { action: string; amount?: number }) => {
    if (!currentRoom || !playerId) return;
    const result = currentRoom.handleAction(playerId, { type: data.action, amount: data.amount });
    if (!result.success) {
      socket.emit('error', { message: result.error ?? 'Action failed' });
    }
  });

  // ── CHAT ─────────────────────────────────────────────

  socket.on('chat_message', (data: { text: string }) => {
    if (!currentRoom || !playerId) return;
    const text = (data.text || '').trim().slice(0, 200);
    if (!text) return;
    socket.to(currentRoom.code).emit('chat_broadcast', {
      playerId,
      text,
    });
    socket.emit('chat_broadcast', { playerId, text });
  });

  // ── DISCONNECT ───────────────────────────────────────

  socket.on('disconnect', () => {
    if (currentRoom && playerId) {
      currentRoom.removePlayer(playerId);
      if (currentRoom.players.length > 0) {
        socket.to(currentRoom.code).emit('room_updated', {
          players: currentRoom.players,
          settings: currentRoom.settings,
        });
      } else {
        roomManager.delete(currentRoom.code);
      }
    }
  });
}

export default registerSocketHandlers;
