import { Card, HandLevel, HandResult, GameType, Suit } from './types.js';

/**
 * Hand level ordering — short deck swaps Flush and Full House.
 */
export function getHandLevelOrder(gameType: GameType): Record<HandLevel, number> {
  if (gameType === GameType.SHORT_DECK) {
    return {
      [HandLevel.HIGH_CARD]: 1,
      [HandLevel.ONE_PAIR]: 2,
      [HandLevel.TWO_PAIR]: 3,
      [HandLevel.THREE_OF_A_KIND]: 4,
      [HandLevel.STRAIGHT]: 5,
      [HandLevel.FULL_HOUSE]: 6,   // ↓ lower than flush
      [HandLevel.FLUSH]: 7,        // ↑ higher than full house
      [HandLevel.FOUR_OF_A_KIND]: 8,
      [HandLevel.STRAIGHT_FLUSH]: 9,
      [HandLevel.ROYAL_FLUSH]: 10,
    };
  }
  // Long deck (standard)
  return {
    [HandLevel.HIGH_CARD]: 1,
    [HandLevel.ONE_PAIR]: 2,
    [HandLevel.TWO_PAIR]: 3,
    [HandLevel.THREE_OF_A_KIND]: 4,
    [HandLevel.STRAIGHT]: 5,
    [HandLevel.FLUSH]: 6,
    [HandLevel.FULL_HOUSE]: 7,
    [HandLevel.FOUR_OF_A_KIND]: 8,
    [HandLevel.STRAIGHT_FLUSH]: 9,
    [HandLevel.ROYAL_FLUSH]: 10,
  };
}

// ─── Group ranks & suits ───────────────────────────────

function rankCounts(ranks: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of ranks) m.set(r, (m.get(r) ?? 0) + 1);
  return m;
}

// ─── Detecting the 5-card pattern ──────────────────────

/**
 * Detect a straight and return its highest card rank (or null).
 * Works for both long deck and short deck (A-6-7-8-9 wheel).
 */
export function detectStraight(ranks: number[], gameType: GameType): number | null {
  const uniq = [...new Set(ranks)].sort((a, b) => b - a); // desc

  // Normal 5-in-a-row check
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) return uniq[i];
  }

  // Wheel: A-2-3-4-5 (long deck only)
  if (gameType === GameType.LONG_DECK && ranks.includes(14)) {
    if ([2, 3, 4, 5].every(r => ranks.includes(r))) return 5;
  }

  // Short deck wheel: A-6-7-8-9 (A acts as low, 5 is absent)
  if (gameType === GameType.SHORT_DECK && ranks.includes(14)) {
    if ([6, 7, 8, 9].every(r => ranks.includes(r))) return 9;
  }

  return null;
}

/**
 * Detect a flush. Returns the suit if found, else null.
 */
export function detectFlush(cards: Card[]): Suit | null {
  const suitCount: Record<string, number> = {};
  for (const c of cards) {
    suitCount[c.suit] = (suitCount[c.suit] ?? 0) + 1;
    if (suitCount[c.suit] === 5) return c.suit;
  }
  return null;
}

// ─── Evaluate exactly 5 cards ──────────────────────────

/**
 * Evaluate the best hand from exactly 5 cards.
 * Returns the hand level, primary rank, and kickers sorted desc.
 *
 * This is the innermost building block — every 7-card evaluation
 * enumerates C(7,5) combinations and calls this.
 */
export function evaluate5(cards: Card[], gameType: GameType): HandResult | null {
  if (cards.length !== 5) return null;

  const ranks = cards.map(c => c.rank);
  const sortedRanks = [...ranks].sort((a, b) => b - a);
  const counts = rankCounts(sortedRanks);
  const isFlush = detectFlush(cards) !== null;
  const straightHigh = detectStraight(sortedRanks, gameType);
  const isStraight = straightHigh !== null;
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Royal flush
  if (isFlush && isStraight && straightHigh === 14) {
    return { level: HandLevel.ROYAL_FLUSH, primary: 14, kickers: [], cards };
  }

  // Straight flush
  if (isFlush && isStraight) {
    return { level: HandLevel.STRAIGHT_FLUSH, primary: straightHigh!, kickers: [], cards };
  }

  // Four of a kind
  if (groups[0][1] === 4) {
    const quad = groups[0][0];
    const kicker = groups[1][0];
    return { level: HandLevel.FOUR_OF_A_KIND, primary: quad, kickers: [kicker], cards };
  }

  // Full house
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { level: HandLevel.FULL_HOUSE, primary: groups[0][0], kickers: [groups[1][0]], cards };
  }

  // Flush
  if (isFlush) {
    return { level: HandLevel.FLUSH, primary: sortedRanks[0], kickers: sortedRanks.slice(1), cards };
  }

  // Straight
  if (isStraight) {
    return { level: HandLevel.STRAIGHT, primary: straightHigh!, kickers: [], cards };
  }

  // Three of a kind
  if (groups[0][1] === 3) {
    const tri = groups[0][0];
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { level: HandLevel.THREE_OF_A_KIND, primary: tri, kickers, cards };
  }

  // Two pair
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2][0];
    return { level: HandLevel.TWO_PAIR, primary: highPair, kickers: [lowPair, kicker], cards };
  }

  // One pair
  if (groups[0][1] === 2) {
    const pair = groups[0][0];
    const kickers = groups.slice(1).map(g => g[0]).sort((a, b) => b - a);
    return { level: HandLevel.ONE_PAIR, primary: pair, kickers, cards };
  }

  // High card
  return { level: HandLevel.HIGH_CARD, primary: sortedRanks[0], kickers: sortedRanks.slice(1), cards };
}

// ─── Compare two hands ─────────────────────────────────

export function compareHands(a: HandResult, b: HandResult, gameType: GameType): number {
  const order = getHandLevelOrder(gameType);
  const diff = order[a.level] - order[b.level];
  if (diff !== 0) return diff;

  // Same level — compare primary
  if (a.primary !== b.primary) return a.primary - b.primary;

  // Same primary — compare kickers one by one
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0; // tie
}

/** Utility: pretty-print a hand level */
export function handLevelName(level: HandLevel): string {
  const names: Record<HandLevel, string> = {
    [HandLevel.HIGH_CARD]: 'High Card',
    [HandLevel.ONE_PAIR]: 'One Pair',
    [HandLevel.TWO_PAIR]: 'Two Pair',
    [HandLevel.THREE_OF_A_KIND]: 'Three of a Kind',
    [HandLevel.STRAIGHT]: 'Straight',
    [HandLevel.FLUSH]: 'Flush',
    [HandLevel.FULL_HOUSE]: 'Full House',
    [HandLevel.FOUR_OF_A_KIND]: 'Four of a Kind',
    [HandLevel.STRAIGHT_FLUSH]: 'Straight Flush',
    [HandLevel.ROYAL_FLUSH]: 'Royal Flush',
  };
  return names[level] ?? 'Unknown';
}

/** Utility: describe a HandResult as a readable string */
export function describeHand(result: HandResult): string {
  const name = handLevelName(result.level);
  const cardStr = result.cards.map(c => {
    const rankNames: Record<number, string> = {
      2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',
      9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A',
    };
    const suitSymbols: Record<string, string> = {
      spades:'♠',hearts:'♥',diamonds:'♦',clubs:'♣',
    };
    return `${suitSymbols[c.suit] ?? '?'}${rankNames[c.rank] ?? '?'}`;
  }).join(' ');
  return `${name} (${cardStr})`;
}
