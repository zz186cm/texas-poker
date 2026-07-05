// Mirror of server types for the client

export enum GameType {
  LONG_DECK = 'long_deck',
  SHORT_DECK = 'short_deck',
}

export enum Suit {
  SPADES = 'spades',
  HEARTS = 'hearts',
  DIAMONDS = 'diamonds',
  CLUBS = 'clubs',
}

export const SUIT_SYMBOLS: Record<string, string> = {
  spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663',
};

export interface Card {
  rank: number;
  suit: Suit;
}

export const RANK_NAMES: Record<number, string> = {
  2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',
  11:'J',12:'Q',13:'K',14:'A',
};

export enum Phase {
  WAITING = 'waiting',
  PREFLOP = 'preflop',
  FLOP = 'flop',
  TURN = 'turn',
  RIVER = 'river',
  SHOWDOWN = 'showdown',
  HAND_OVER = 'hand_over',
}

export enum HandLevel {
  HIGH_CARD=1, ONE_PAIR=2, TWO_PAIR=3, THREE_OF_A_KIND=4,
  STRAIGHT=5, FLUSH=6, FULL_HOUSE=7, FOUR_OF_A_KIND=8,
  STRAIGHT_FLUSH=9, ROYAL_FLUSH=10,
}

export const HAND_LEVEL_NAMES: Record<number, string> = {
  1:'High Card',2:'One Pair',3:'Two Pair',4:'Three of a Kind',
  5:'Straight',6:'Flush',7:'Full House',8:'Four of a Kind',
  9:'Straight Flush',10:'Royal Flush',
};

export interface GameSettings {
  gameType: GameType;
  smallBlind: number;
  bigBlind: number;
  minPlayers: number;
  maxPlayers: number;
  startingChips: number;
}

export interface PlayerState {
  id: string;
  name: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;
  totalBet: number;
  isFolded: boolean;
  isAllIn: boolean;
  isSittingOut: boolean;
  seatIndex: number;
}

export interface PotInfo {
  amount: number;
  eligiblePlayerIds: string[];
}

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

export interface GameState {
  settings: GameSettings;
  phase: Phase;
  players: PlayerState[];
  communityCards: Card[];
  pots: PotInfo[];
  dealerIndex: number;
  currentPlayerIndex: number;
  currentBet: number;
  handCount: number;
}

export interface ShowdownResult {
  playerId: string;
  handLevel: number;
  description: string;
  cards: Card[];
}
