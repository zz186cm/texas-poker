import { Card, HandResult, GameType } from './types.js';
import { evaluate5, compareHands } from './hand-rank.js';

/**
 * Generate all C(n, k) combinations of indices.
 * Uses lexicographic generation — simple, fast enough for n ≤ 7.
 */
function* combinations(n: number, k: number): Generator<number[]> {
  const indices: number[] = Array.from({ length: k }, (_, i) => i);
  yield [...indices];

  while (true) {
    let i = k - 1;
    while (i >= 0 && indices[i] === i + n - k) i--;
    if (i < 0) return;
    indices[i]++;
    for (let j = i + 1; j < k; j++) {
      indices[j] = indices[j - 1] + 1;
    }
    yield [...indices];
  }
}

/**
 * Evaluate the best 5-card hand from 7 cards (2 hole + 5 community).
 *
 * Enumerates all C(7,5) = 21 combinations, evaluates each,
 * returns the best hand result.
 */
export function evaluateBestHand(cards: Card[], gameType: GameType): HandResult | null {
  if (cards.length < 5) return null;

  let best: HandResult | null = null;

  for (const idx of combinations(cards.length, 5)) {
    const fiveCards = idx.map(i => cards[i]);
    const result = evaluate5(fiveCards, gameType);
    if (result === null) continue;

    if (best === null || compareHands(result, best, gameType) > 0) {
      best = result;
    }
  }

  return best;
}

/**
 * Compare two players' best hands.
 * Returns:
 *   > 0  → a wins
 *   = 0  → tie
 *   < 0  → b wins
 */
export function compareHandsAtShowdown(
  playerACards: Card[],
  playerBCards: Card[],
  communityCards: Card[],
  gameType: GameType,
): number {
  const allA = [...playerACards, ...communityCards];
  const allB = [...playerBCards, ...communityCards];
  const handA = evaluateBestHand(allA, gameType);
  const handB = evaluateBestHand(allB, gameType);
  if (handA === null && handB === null) return 0;
  if (handA === null) return -1;
  if (handB === null) return 1;
  return compareHands(handA, handB, gameType);
}

/**
 * Rank all active players at showdown.
 * Returns array of { playerId, handResult, cards }, sorted best → worst.
 */
export function rankPlayersAtShowdown(
  players: { id: string; holeCards: Card[] }[],
  communityCards: Card[],
  gameType: GameType,
): { id: string; handResult: HandResult | null; allCards: Card[] }[] {
  const results = players.map(p => ({
    id: p.id,
    handResult: evaluateBestHand([...p.holeCards, ...communityCards], gameType),
    allCards: [...p.holeCards, ...communityCards],
  }));

  results.sort((a, b) => {
    if (a.handResult === null && b.handResult === null) return 0;
    if (a.handResult === null) return 1;
    if (b.handResult === null) return -1;
    return compareHands(b.handResult, a.handResult, gameType); // desc
  });

  return results;
}

export { combinations };
