import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GameType, HandLevel, Suit, ActionType, Phase, type Card } from './types.js';
import { createDeck } from './deck.js';
import { evaluate5, compareHands, getHandLevelOrder } from './hand-rank.js';
import { evaluateBestHand } from './evaluator.js';
import { Game, defaultSettings } from './game.js';
import { computeSidePots } from './side-pot.js';

function c(rankStr: string, suit: Suit): Card {
  const rankMap: Record<string, number> = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
    'J':11,'Q':12,'K':13,'A':14,
  };
  return { rank: rankMap[rankStr] ?? parseInt(rankStr), suit };
}

// Deck
describe('Deck', () => {
  it('creates 52 cards for long deck', () => {
    assert.equal(createDeck(GameType.LONG_DECK).length, 52);
  });
  it('creates 36 cards for short deck (6-A)', () => {
    const deck = createDeck(GameType.SHORT_DECK);
    assert.equal(deck.length, 36);
    assert.ok(deck.every(c => c.rank >= 6));
  });
});

// evaluate5
describe('evaluate5', () => {
  it('royal flush', () => {
    const hand = [c('A',Suit.SPADES), c('K',Suit.SPADES), c('Q',Suit.SPADES), c('J',Suit.SPADES), c('10',Suit.SPADES)];
    assert.equal(evaluate5(hand, GameType.LONG_DECK)?.level, HandLevel.ROYAL_FLUSH);
  });
  it('straight flush', () => {
    const hand = [c('9',Suit.HEARTS), c('8',Suit.HEARTS), c('7',Suit.HEARTS), c('6',Suit.HEARTS), c('5',Suit.HEARTS)];
    const r = evaluate5(hand, GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.STRAIGHT_FLUSH);
    assert.equal(r?.primary, 9);
  });
  it('four of a kind', () => {
    const r = evaluate5([c('A',Suit.SPADES),c('A',Suit.HEARTS),c('A',Suit.DIAMONDS),c('A',Suit.CLUBS),c('K',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.FOUR_OF_A_KIND);
  });
  it('full house', () => {
    const r = evaluate5([c('K',Suit.SPADES),c('K',Suit.HEARTS),c('K',Suit.DIAMONDS),c('Q',Suit.CLUBS),c('Q',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.FULL_HOUSE);
  });
  it('flush', () => {
    const r = evaluate5([c('A',Suit.CLUBS),c('J',Suit.CLUBS),c('7',Suit.CLUBS),c('5',Suit.CLUBS),c('3',Suit.CLUBS)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.FLUSH);
  });
  it('straight', () => {
    const r = evaluate5([c('9',Suit.SPADES),c('8',Suit.HEARTS),c('7',Suit.DIAMONDS),c('6',Suit.CLUBS),c('5',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.STRAIGHT);
    assert.equal(r?.primary, 9);
  });
  it('wheel A-2-3-4-5 (long deck)', () => {
    const r = evaluate5([c('A',Suit.SPADES),c('2',Suit.HEARTS),c('3',Suit.DIAMONDS),c('4',Suit.CLUBS),c('5',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.STRAIGHT);
    assert.equal(r?.primary, 5);
  });
  it('wheel A-6-7-8-9 (short deck)', () => {
    const r = evaluate5([c('A',Suit.SPADES),c('6',Suit.HEARTS),c('7',Suit.DIAMONDS),c('8',Suit.CLUBS),c('9',Suit.SPADES)], GameType.SHORT_DECK);
    assert.equal(r?.level, HandLevel.STRAIGHT);
    assert.equal(r?.primary, 9);
  });
  it('three of a kind', () => {
    const r = evaluate5([c('7',Suit.SPADES),c('7',Suit.HEARTS),c('7',Suit.DIAMONDS),c('K',Suit.CLUBS),c('2',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.THREE_OF_A_KIND);
  });
  it('two pair', () => {
    const r = evaluate5([c('J',Suit.SPADES),c('J',Suit.HEARTS),c('8',Suit.DIAMONDS),c('8',Suit.CLUBS),c('A',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.TWO_PAIR);
  });
  it('one pair', () => {
    const r = evaluate5([c('10',Suit.SPADES),c('10',Suit.HEARTS),c('8',Suit.DIAMONDS),c('K',Suit.CLUBS),c('3',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.ONE_PAIR);
  });
  it('high card', () => {
    const r = evaluate5([c('A',Suit.SPADES),c('J',Suit.HEARTS),c('8',Suit.DIAMONDS),c('5',Suit.CLUBS),c('3',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.HIGH_CARD);
    assert.equal(r?.primary, 14);
  });
});

// Long Deck vs Short Deck
describe('Long Deck vs Short Deck', () => {
  it('flush > full house in short deck', () => {
    assert.ok(getHandLevelOrder(GameType.SHORT_DECK)[HandLevel.FLUSH] > getHandLevelOrder(GameType.SHORT_DECK)[HandLevel.FULL_HOUSE]);
  });
  it('full house > flush in long deck', () => {
    assert.ok(getHandLevelOrder(GameType.LONG_DECK)[HandLevel.FULL_HOUSE] > getHandLevelOrder(GameType.LONG_DECK)[HandLevel.FLUSH]);
  });
  it('flush beats full house in evaluator (short deck)', () => {
    const flush = evaluate5([c('A',Suit.SPADES),c('K',Suit.SPADES),c('Q',Suit.SPADES),c('J',Suit.SPADES),c('9',Suit.SPADES)], GameType.SHORT_DECK);
    const fh = evaluate5([c('A',Suit.HEARTS),c('A',Suit.DIAMONDS),c('A',Suit.CLUBS),c('K',Suit.HEARTS),c('K',Suit.DIAMONDS)], GameType.SHORT_DECK);
    assert.ok(compareHands(flush!, fh!, GameType.SHORT_DECK) > 0);
  });
});

// evaluateBestHand (7-card)
describe('evaluateBestHand', () => {
  it('royal flush is best among 7 cards', () => {
    const r = evaluateBestHand([
      c('A',Suit.SPADES),c('A',Suit.HEARTS),
      c('A',Suit.DIAMONDS),c('K',Suit.SPADES),c('Q',Suit.SPADES),c('J',Suit.SPADES),c('10',Suit.SPADES),
    ], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.ROYAL_FLUSH);
  });
  it('finds flush from 7', () => {
    const r = evaluateBestHand([c('A',Suit.SPADES),c('K',Suit.SPADES),c('2',Suit.SPADES),c('5',Suit.SPADES),c('9',Suit.HEARTS),c('3',Suit.CLUBS),c('7',Suit.SPADES)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.FLUSH);
  });
  it('straight over high card', () => {
    const r = evaluateBestHand([c('9',Suit.SPADES),c('8',Suit.HEARTS),c('7',Suit.DIAMONDS),c('6',Suit.CLUBS),c('5',Suit.SPADES),c('A',Suit.HEARTS),c('K',Suit.CLUBS)], GameType.LONG_DECK);
    assert.equal(r?.level, HandLevel.STRAIGHT);
  });
});

// computeSidePots
describe('computeSidePots', () => {
  function mp(id: string, totalBet: number, folded = false) {
    return { id, name: id, chips: 1000, holeCards: [] as Card[], currentBet: 0, totalBet, isFolded: folded, isAllIn: false, isSittingOut: false, seatIndex: 0 };
  }
  it('single pot', () => {
    const pots = computeSidePots([mp('A',100),mp('B',100),mp('C',100)]);
    assert.equal(pots.length, 1);
    assert.equal(pots[0].amount, 300);
  });
  it('main + side pot', () => {
    const pots = computeSidePots([mp('short',50),mp('big1',200),mp('big2',200)]);
    assert.equal(pots.length, 2);
    assert.equal(pots[0].amount, 150);
    assert.equal(pots[0].eligiblePlayerIds.length, 3);
    assert.equal(pots[1].amount, 300);
    assert.equal(pots[1].eligiblePlayerIds.length, 2);
  });
  it('excludes folded', () => {
    const pots = computeSidePots([mp('A',100),mp('B',100,true),mp('C',100)]);
    assert.deepEqual(pots[0].eligiblePlayerIds, ['A', 'C']);
  });
});

// Game flow
describe('Game flow', () => {
  it('starts a hand and deals hole cards', () => {
    const g = new Game(defaultSettings(GameType.LONG_DECK, 4), [
      { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' },
    ]);
    const r = g.startHand();
    assert.ok(r.success);
    assert.equal(r.gameState.phase, Phase.PREFLOP);
    for (const p of r.gameState.players) assert.equal(p.holeCards.length, 2);
  });

  it('play through to showdown', () => {
    const g = new Game(defaultSettings(GameType.LONG_DECK, 4), [
      { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }, { id: 'p4', name: 'D' },
    ]);
    g.startHand();
    let r: any;
    for (let i = 0; i < 50; i++) {
      const pid = g.players[g.currentPlayerIndex]?.id;
      if (!pid) break;
      r = g.handleAction(pid, { type: ActionType.CALL, amount: 0 });
      if (!r.success) r = g.handleAction(pid, { type: ActionType.CHECK, amount: 0 });
      if (r.gameState.phase === Phase.HAND_OVER) break;
    }
    assert.equal(r!.gameState.phase, Phase.HAND_OVER);
  });

  it('all-in across all streets', () => {
    const g = new Game(defaultSettings(GameType.LONG_DECK, 2), [
      { id: 'p1', name: 'Short' }, { id: 'p2', name: 'Deep' },
    ]);
    g.players[0].chips = 100;
    g.players[1].chips = 1000;
    g.startHand();

    const p1id = g.players[g.currentPlayerIndex].id;
    let r = g.handleAction(p1id, { type: ActionType.ALL_IN, amount: 0 });
    assert.ok(r.success);

    const p2id = g.players[g.currentPlayerIndex].id;
    r = g.handleAction(p2id, { type: ActionType.CALL, amount: 0 });
    assert.ok(r.success);
    assert.equal(r.gameState.phase, Phase.FLOP);

    r = g.handleAction(p2id, { type: ActionType.CHECK, amount: 0 });
    assert.ok(r.success);
    assert.equal(r.gameState.phase, Phase.TURN);

    r = g.handleAction(p2id, { type: ActionType.CHECK, amount: 0 });
    assert.ok(r.success);
    assert.equal(r.gameState.phase, Phase.RIVER);

    r = g.handleAction(p2id, { type: ActionType.CHECK, amount: 0 });
    assert.ok(r.success);
    assert.equal(r.gameState.phase, Phase.HAND_OVER);
  });

  it('short deck (36 cards)', () => {
    const g = new Game(defaultSettings(GameType.SHORT_DECK, 3), [
      { id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' },
    ]);
    const r = g.startHand();
    assert.ok(r.success);
    assert.equal(g.deck.length, 30);
  });
});

// Tie-breaking
describe('Tie-breaking', () => {
  it('higher pair beats lower pair', () => {
    const a = evaluate5([c('A',Suit.SPADES),c('A',Suit.HEARTS),c('K',Suit.DIAMONDS),c('Q',Suit.CLUBS),c('J',Suit.SPADES)], GameType.LONG_DECK);
    const k = evaluate5([c('K',Suit.SPADES),c('K',Suit.HEARTS),c('A',Suit.DIAMONDS),c('Q',Suit.CLUBS),c('J',Suit.SPADES)], GameType.LONG_DECK);
    assert.ok(compareHands(a!, k!, GameType.LONG_DECK) > 0);
  });
  it('kicker resolves tie', () => {
    const kk = evaluate5([c('A',Suit.SPADES),c('A',Suit.HEARTS),c('K',Suit.DIAMONDS),c('5',Suit.CLUBS),c('3',Suit.SPADES)], GameType.LONG_DECK);
    const qk = evaluate5([c('A',Suit.SPADES),c('A',Suit.HEARTS),c('Q',Suit.DIAMONDS),c('5',Suit.CLUBS),c('3',Suit.SPADES)], GameType.LONG_DECK);
    assert.ok(compareHands(kk!, qk!, GameType.LONG_DECK) > 0);
  });
  it('exact tie returns 0', () => {
    const h1 = evaluate5([c('A',Suit.SPADES),c('A',Suit.HEARTS),c('K',Suit.DIAMONDS),c('Q',Suit.CLUBS),c('J',Suit.SPADES)], GameType.LONG_DECK);
    const h2 = evaluate5([c('A',Suit.DIAMONDS),c('A',Suit.CLUBS),c('K',Suit.SPADES),c('Q',Suit.HEARTS),c('J',Suit.DIAMONDS)], GameType.LONG_DECK);
    assert.equal(compareHands(h1!, h2!, GameType.LONG_DECK), 0);
  });
});
