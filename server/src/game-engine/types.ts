// ============================================================
// Game Type — Long Deck (standard) vs Short Deck (6+ Hold'em)
// ============================================================
export enum GameType {
  LONG_DECK = 'long_deck',
  SHORT_DECK = 'short_deck',
}

// ============================================================
// Suit
// ============================================================
export enum Suit {
  SPADES = 'spades',
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.SPADES]: '♠',
  [Suit.HEARTS]: '♥',
  [Suit.DIAMONDS]: '♦',
  [Suit.CLUBS]: '♣',
};

// ============================================================
// Card — rank: 2..14 (11=J, 12=Q, 13=K, 14=A)
// ============================================================
export interface Card {
  rank: number;
  suit: Suit;
}

export const RANK_NAMES: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function cardToString(c: Card): string {
  return `${SUIT_SYMBOLS[c.suit]}${RANK_NAMES[c.rank]}`;
}

// ============================================================
// Hand Level
// ============================================================
export enum HandLevel {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
  ROYAL_FLUSH = 10,
}

// ============================================================
// Evaluated Hand Result
// ============================================================
export interface HandResult {
  level: HandLevel;
  /** Primary comparison value (e.g. rank of the pair in one-pair) */
  primary: number;
  /** Kickers, sorted high → low, for tie-breaking */
  kickers: number[];
  /** The 5 cards that make up this hand */
  cards: Card[];
}

// ============================================================
// Game Phase
// ============================================================
export enum Phase {
  WAITING = 'waiting',       // waiting for players
  PREFLOP = 'preflop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  HAND_OVER = 'hand_over',   // round finished, preparing next
}

// ============================================================
// Player Action
// ============================================================
export enum ActionType {
  FOLD = 'fold',
  CHECK = 'check',
  CALL = 'call',
  RAISE = 'raise',
  ALL_IN = 'all-in',
}

export interface PlayerAction {
  type: ActionType;
  amount: number; // 0 for fold/check
}

// ============================================================
// Player State (within a game)
// ============================================================
export interface PlayerState {
  id: string;
  name: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;      // chips committed in this betting round
  totalBet: number;        // chips committed this hand
  isFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  seatIndex: number;
}

// ============================================================
// Pot (supports side pots)
// ============================================================
export interface Pot {
  amount: number;
  eligiblePlayerIds: string[]; // only these players can win this pot
}

// ============================================================
// Game Settings
// ============================================================
export interface GameSettings {
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  minPlayers: number;    // 2
  maxPlayers: number;    // 2-6 (or up to 9 for long deck)
  startingChips: number;
}

// ============================================================
// Room / Game State (serializable for persistence)
// ============================================================
export interface GameState {
  settings: GameSettings;
  phase: Phase;
  players: PlayerState[];
  communityCards: Card[];
  deck: Card[];
  pots: Pot[];
  dealerIndex: number;
  currentPlayerIndex: number;
  lastRaiserIndex: number | null;
  minRaise: number;
  currentBet: number;    // current round's bet to call
  handCount: number;
  handHistory: HandHistoryEntry[];
}

export interface HandHistoryEntry {
  handNumber: number;
  winnerIds: string[];
  handLevel: HandLevel;
  potAmount: number;
}

// ============================================================
// Room Info (lobby-facing)
// ============================================================
export interface RoomInfo {
  code: string;
  settings: GameSettings;
  playerCount: number;
  maxPlayers: number;
  phase: Phase;
}
