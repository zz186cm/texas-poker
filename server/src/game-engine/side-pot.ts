import { PlayerState, Pot } from './types.js';

/**
 * Compute side pots from a list of players.
 *
 * Algorithm:
 * 1. Collect all non-folded players who bet > 0, sorted by totalBet ascending.
 * 2. Iterate: at each level `prev`, all remaining eligible players
 *    contribute `current.totalBet - prev` chips to a pot.
 * 3. That pot belongs to everyone who bet at least `current.totalBet`.
 *
 * Edge cases:
 *   - Folded players are excluded from all pots.
 *   - A player who folded cannot win any pot.
 *   - If only 1 player remains (everyone else folded), they win everything.
 */
export function computeSidePots(players: PlayerState[]): Pot[] {
  // Only non-folded players can win
  const active = players
    .filter(p => !p.isFolded)
    .sort((a, b) => a.totalBet - b.totalBet);

  if (active.length === 0) return [];

  const pots: Pot[] = [];
  let prevLevel = 0;

  for (const player of active) {
    const level = player.totalBet;
    if (level === prevLevel) continue;

    const contribution = level - prevLevel;
    if (contribution <= 0) continue;

    // All players who bet >= level share in this pot slice
    const eligible = active
      .filter(p => p.totalBet >= level)
      .map(p => p.id);

    const amount = contribution * eligible.length;
    pots.push({ amount, eligiblePlayerIds: eligible });
    prevLevel = level;
  }

  return pots;
}

/**
 * Award pots to winners.
 *
 * For each pot, find the best hand among eligible players.
 * If tied, the pot is split equally (rounded down, remainder stays).
 *
 * Returns a map of playerId → chips won from this hand.
 */
export function awardPots(
  pots: Pot[],
  playerHands: Map<string, { level: number; primary: number; kickers: number[] }>,
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    // Find best hand among eligible players
    const eligible = pot.eligiblePlayerIds;
    let bestScore = -Infinity;
    let bestPlayers: string[] = [];

    for (const id of eligible) {
      const hand = playerHands.get(id);
      if (!hand) continue;
      const score = encodeHandForSidePot(hand);
      if (score > bestScore) {
        bestScore = score;
        bestPlayers = [id];
      } else if (score === bestScore) {
        bestPlayers.push(id);
      }
    }

    // Split pot among tied winners
    const share = Math.floor(pot.amount / bestPlayers.length);
    const remainder = pot.amount - share * bestPlayers.length;
    for (const id of bestPlayers) {
      winnings.set(id, (winnings.get(id) ?? 0) + share);
    }
    // Remainder chips stay in the pot (or could be awarded arbitrarily)
    if (remainder > 0 && bestPlayers.length > 0) {
      winnings.set(bestPlayers[0], (winnings.get(bestPlayers[0]) ?? 0) + remainder);
    }
  }

  return winnings;
}

/**
 * Encode a hand into a single comparable number for side pot sorting.
 * Uses the same logic as hand-rank.ts compareHands but as a scalar.
 */
function encodeHandForSidePot(hand: { level: number; primary: number; kickers: number[] }): number {
  // level (0-10) * 10^10 + primary * 10^8 + kickers ...
  let score = hand.level * 1_000_000_000;
  score += hand.primary * 10_000_000;
  for (let i = 0; i < Math.min(hand.kickers.length, 3); i++) {
    score += hand.kickers[i] * Math.pow(10, 5 - i * 2);
  }
  return score;
}

export { encodeHandForSidePot };
