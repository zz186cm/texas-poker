import { Card, Suit, GameType } from './types.js';

/** All four suits */
const ALL_SUITS: Suit[] = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];

/**
 * Create a deck of cards based on game type.
 * Long deck: 2..14 × 4 suits = 52 cards
 * Short deck: 6..14 × 4 suits = 36 cards
 */
export function createDeck(gameType: GameType): Card[] {
  const minRank = gameType === GameType.LONG_DECK ? 2 : 6;
  const maxRank = 14; // Ace
  const cards: Card[] = [];
  for (let rank = minRank; rank <= maxRank; rank++) {
    for (const suit of ALL_SUITS) {
      cards.push({ rank, suit });
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle (in-place)
 */
export function shuffleDeck(deck: Card[]): void {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

/**
 * Deal n cards from the top of the deck.
 * Returns the dealt cards; mutates the deck array.
 */
export function dealCards(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}

/**
 * Clone a deck (for deterministic testing)
 */
export function cloneDeck(deck: Card[]): Card[] {
  return deck.map(c => ({ ...c }));
}

/**
 * Create a fresh shuffled deck
 */
export function createShuffledDeck(gameType: GameType): Card[] {
  const deck = createDeck(gameType);
  shuffleDeck(deck);
  return deck;
}
