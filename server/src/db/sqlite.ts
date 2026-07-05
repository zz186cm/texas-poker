import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'poker.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    _initSchema(db);
  }
  return db;
}

function _initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      game_type TEXT NOT NULL DEFAULT 'long_deck',
      small_blind INTEGER NOT NULL DEFAULT 5,
      big_blind INTEGER NOT NULL DEFAULT 10,
      starting_chips INTEGER NOT NULL DEFAULT 1000,
      max_players INTEGER NOT NULL DEFAULT 6,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      current_room TEXT REFERENCES rooms(code) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hand_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      hand_number INTEGER NOT NULL,
      winner_ids TEXT NOT NULL,
      hand_level INTEGER NOT NULL,
      pot_amount INTEGER NOT NULL,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_hand_histories_room
      ON hand_histories(room_code);
  `);
}

export function saveRoom(room: {
  code: string; gameType: string; smallBlind: number;
  bigBlind: number; startingChips: number; maxPlayers: number;
}): void {
  const d = getDb();
  d.prepare(`
    INSERT INTO rooms (code, game_type, small_blind, big_blind, starting_chips, max_players)
    VALUES (@code, @gameType, @smallBlind, @bigBlind, @startingChips, @maxPlayers)
    ON CONFLICT(code) DO UPDATE SET
      game_type=excluded.game_type, small_blind=excluded.small_blind,
      big_blind=excluded.big_blind, starting_chips=excluded.starting_chips,
      max_players=excluded.max_players, updated_at=datetime('now')
  `).run(room);
}

export function deleteRoom(code: string): void {
  getDb().prepare('DELETE FROM rooms WHERE code = ?').run(code);
}

export function saveHandHistory(entry: {
  roomCode: string; handNumber: number;
  winnerIds: string; handLevel: number; potAmount: number;
}): void {
  getDb().prepare(`
    INSERT INTO hand_histories (room_code, hand_number, winner_ids, hand_level, pot_amount)
    VALUES (@roomCode, @handNumber, @winnerIds, @handLevel, @potAmount)
  `).run(entry);
}

export function getPlayerCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM players').get() as any;
  return row?.count ?? 0;
}

export function upsertPlayer(id: string, name: string, roomCode?: string): void {
  const d = getDb();
  if (roomCode) {
    d.prepare('INSERT INTO players (id, name, current_room) VALUES (@id, @name, @room) ON CONFLICT(id) DO UPDATE SET name=excluded.name, current_room=@room').run({ id, name, room: roomCode });
  } else {
    d.prepare('INSERT INTO players (id, name) VALUES (@id, @name) ON CONFLICT(id) DO UPDATE SET name=excluded.name').run({ id, name });
  }
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export default { getDb, saveRoom, deleteRoom, saveHandHistory, getPlayerCount, upsertPlayer, closeDb };
