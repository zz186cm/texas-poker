import {
  GameType, Card, PlayerState, PlayerAction, ActionType,
  Phase, Pot, HandLevel, GameSettings, GameState, HandHistoryEntry,
} from './types.js';
import { createShuffledDeck, dealCards } from './deck.js';
import { evaluateBestHand, rankPlayersAtShowdown } from './evaluator.js';
import { compareHands, getHandLevelOrder, handLevelName } from './hand-rank.js';
import { computeSidePots } from './side-pot.js';

export interface ActionResult {
  success: boolean;
  error?: string;
  gameState: GameState;
  events: GameEvent[];
}

export type GameEvent =
  | { type: 'deal_hole'; playerId: string; cards: Card[] }
  | { type: 'deal_community'; cards: Card[] }
  | { type: 'player_action'; playerId: string; action: PlayerAction }
  | { type: 'player_folded'; playerId: string }
  | { type: 'phase_change'; from: Phase; to: Phase }
  | { type: 'showdown'; results: { playerId: string; handLevel: HandLevel; primary: number; description: string; cards: Card[] }[] }
  | { type: 'pot_won'; playerId: string; amount: number; potIndex: number }
  | { type: 'hand_over'; winnerIds: string[]; potAmount: number }
  | { type: 'all_in'; playerId: string }
  | { type: 'error'; message: string };

export function defaultSettings(gameType: GameType = GameType.LONG_DECK, maxPlayers: number = 6): GameSettings {
  return {
    gameType,
    smallBlind: 5,
    bigBlind: 10,
    minPlayers: 2,
    maxPlayers,
    startingChips: 1000,
  };
}

export class Game {
  public settings: GameSettings;
  public players: PlayerState[];
  public phase: Phase = Phase.WAITING;
  public communityCards: Card[] = [];
  public deck: Card[] = [];
  public pots: Pot[] = [];
  public dealerIndex = 0;
  public currentPlayerIndex = 0;
  public lastRaiserIndex: number | null = null;
  public playersActedThisRound = new Set<string>();
  public currentBet = 0;
  public minRaise = 0;
  public handCount = 0;
  public handHistory: HandHistoryEntry[] = [];
  public buttonIndex = 0;

  constructor(settings: GameSettings, initialPlayers: { id: string; name: string }[] = []) {
    this.settings = { ...settings };
    this.players = initialPlayers.map((p, i) => this._createPlayer(p.id, p.name, i));
  }

  getState(): GameState {
    return {
      settings: { ...this.settings },
      phase: this.phase,
      players: this.players.map(p => ({ ...p, holeCards: [...p.holeCards] })),
      communityCards: [...this.communityCards],
      deck: [],
      pots: this.pots.map(p => ({ ...p, eligiblePlayerIds: [...p.eligiblePlayerIds] })),
      dealerIndex: this.dealerIndex,
      currentPlayerIndex: this.currentPlayerIndex,
      lastRaiserIndex: this.lastRaiserIndex,
      minRaise: this.minRaise,
      currentBet: this.currentBet,
      handCount: this.handCount,
      handHistory: [...this.handHistory],
    };
  }

  addPlayer(id: string, name: string): boolean {
    if (this.phase !== Phase.WAITING) return false;
    if (this.players.length >= this.settings.maxPlayers) return false;
    if (this.players.some(p => p.id === id)) return false;
    this.players.push(this._createPlayer(id, name, this.players.length));
    return true;
  }

  removePlayer(id: string): boolean {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx === -1) return false;
    this.players.splice(idx, 1);
    this.players.forEach((p, i) => { p.seatIndex = i; });
    return true;
  }

  // ── Start a new hand ────────────────────────────────

  startHand(): ActionResult {
    if (this.players.length < this.settings.minPlayers) {
      return this._error('Not enough players');
    }
    const events: GameEvent[] = [];
    this.handCount++;
    this.dealerIndex = this._nextActivePlayerIndex(this.dealerIndex);
    for (const p of this.players) {
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBet = 0;
      p.isFolded = false;
      p.isAllIn = false;
    }
    this.players = this.players.filter(p => p.chips > 0 || p.isSittingOut);
    if (this.players.length < this.settings.minPlayers) {
      return this._error('Not enough players after removing busted');
    }
    this.communityCards = [];
    this.pots = [];
    this._resetRoundTracking();
    this.deck = createShuffledDeck(this.settings.gameType);
    for (const p of this.players) {
      p.holeCards = dealCards(this.deck, 2);
      events.push({ type: 'deal_hole', playerId: p.id, cards: [...p.holeCards] });
    }
    this._postBlind(this._playerLeftOf(this.dealerIndex), this.settings.smallBlind);
    this._postBlind(this._playerLeftOf(this._playerLeftOf(this.dealerIndex)), this.settings.bigBlind);
    this.phase = Phase.PREFLOP;
    events.push({ type: 'phase_change', from: Phase.WAITING, to: Phase.PREFLOP });
    const bbIndex = this._playerLeftOf(this._playerLeftOf(this.dealerIndex));
    this.currentPlayerIndex = this._playerLeftOf(bbIndex);
    this._skipBustedOrAllIn();
    return { success: true, gameState: this.getState(), events };
  }

  // ── Handle a player action ─────────────────────────

  handleAction(playerId: string, action: PlayerAction): ActionResult {
    const events: GameEvent[] = [];
    if (this.phase === Phase.WAITING || this.phase === Phase.HAND_OVER) {
      return this._error('Hand is not in progress');
    }
    if (this.phase === Phase.SHOWDOWN) {
      return this._error('Showdown in progress');
    }
    const player = this.players[this.currentPlayerIndex];
    if (!player || player.id !== playerId) {
      return this._error('Not your turn');
    }
    if (player.isFolded || player.isAllIn) {
      return this._error('Player cannot act');
    }
    switch (action.type) {
      case ActionType.FOLD: return this._handleFold(player, events);
      case ActionType.CHECK: return this._handleCheck(player, events);
      case ActionType.CALL: return this._handleCall(player, action, events);
      case ActionType.RAISE: return this._handleRaise(player, action, events);
      case ActionType.ALL_IN: return this._handleAllIn(player, action, events);
      default: return this._error('Invalid action type');
    }
  }

  // ── Internal action handlers ────────────────────────

  private _handleFold(player: PlayerState, events: GameEvent[]): ActionResult {
    player.isFolded = true;
    events.push({ type: 'player_folded', playerId: player.id });
    events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.FOLD, amount: 0 } });
    this.playersActedThisRound.add(player.id);
    const nonFolded = this.players.filter(p => !p.isFolded);
    if (nonFolded.length === 1) {
      return this._endHandEarly(nonFolded[0], events);
    }
    return this._advanceToNextPlayer(events);
  }

  private _handleCheck(player: PlayerState, events: GameEvent[]): ActionResult {
    if (player.currentBet < this.currentBet) {
      return this._error('Cannot check — there is a bet to call');
    }
    events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.CHECK, amount: 0 } });
    this.playersActedThisRound.add(player.id);
    if (this._isBettingRoundOver()) return this._endBettingRound(events);
    return this._advanceToNextPlayer(events);
  }

  private _handleCall(player: PlayerState, action: PlayerAction, events: GameEvent[]): ActionResult {
    if (this.currentBet <= 0) return this._error('Cannot call — no bet to call');
    const callAmount = Math.min(this.currentBet - player.currentBet, player.chips);
    if (callAmount < this.currentBet - player.currentBet && callAmount === player.chips) {
      return this._handleAllIn(player, { type: ActionType.ALL_IN, amount: callAmount }, events);
    }
    player.chips -= callAmount;
    player.currentBet += callAmount;
    player.totalBet += callAmount;
    this.playersActedThisRound.add(player.id);
    events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.CALL, amount: callAmount } });
    if (this._isBettingRoundOver()) return this._endBettingRound(events);
    return this._advanceToNextPlayer(events);
  }

  private _handleRaise(player: PlayerState, action: PlayerAction, events: GameEvent[]): ActionResult {
    const totalNeeded = Math.max(this.currentBet, this.minRaise) + (this.currentBet - player.currentBet);
    const raiseAmount = Math.max(action.amount, this.minRaise);
    if (raiseAmount < this.minRaise && raiseAmount + player.currentBet < player.chips) {
      return this._error(`Minimum raise is ${this.minRaise}`);
    }
    if (raiseAmount > player.chips) return this._error('Not enough chips');
    const totalCost = raiseAmount + (this.currentBet - player.currentBet);
    if (totalCost > player.chips) {
      const allInAmount = player.chips;
      player.chips = 0;
      player.currentBet += allInAmount;
      player.totalBet += allInAmount;
      player.isAllIn = true;
      this.currentBet = player.currentBet;
      this.lastRaiserIndex = this.players.indexOf(player);
      this.playersActedThisRound.add(player.id);
      events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.RAISE, amount: allInAmount } });
      events.push({ type: 'all_in', playerId: player.id });
      if (this._isBettingRoundOver()) return this._endBettingRound(events);
      return this._advanceToNextPlayer(events);
    }
    player.chips -= totalCost;
    player.currentBet += totalCost;
    player.totalBet += totalCost;
    this.currentBet = player.currentBet;
    this.minRaise = raiseAmount;
    this.lastRaiserIndex = this.players.indexOf(player);
    this.playersActedThisRound.add(player.id);
    events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.RAISE, amount: totalCost } });
    if (this._isBettingRoundOver()) return this._endBettingRound(events);
    return this._advanceToNextPlayer(events);
  }

  private _handleAllIn(player: PlayerState, action: PlayerAction, events: GameEvent[]): ActionResult {
    const allInAmount = player.chips;
    player.chips = 0;
    player.currentBet += allInAmount;
    player.totalBet += allInAmount;
    player.isAllIn = true;
    if (player.currentBet > this.currentBet) {
      this.currentBet = player.currentBet;
      const raiseAmount = this.currentBet - (player.currentBet - allInAmount);
      this.minRaise = Math.max(this.minRaise, raiseAmount);
      this.lastRaiserIndex = this.players.indexOf(player);
    }
    this.playersActedThisRound.add(player.id);
    events.push({ type: 'player_action', playerId: player.id, action: { type: ActionType.ALL_IN, amount: allInAmount } });
    events.push({ type: 'all_in', playerId: player.id });
    if (this._isBettingRoundOver()) return this._endBettingRound(events);
    return this._advanceToNextPlayer(events);
  }

  // ── Round / hand transitions ─────────────────────────

  private _advanceToNextPlayer(events: GameEvent[]): ActionResult {
    const nextIdx = this._findNextActivePlayer(this.currentPlayerIndex);
    if (nextIdx === null) return this._error('No next player to act');
    this.currentPlayerIndex = nextIdx;
    return { success: true, gameState: this.getState(), events };
  }

  private _isBettingRoundOver(): boolean {
    const nonFolded = this.players.filter(p => !p.isFolded);
    if (nonFolded.length <= 1) return true;
    const canAct = nonFolded.filter(p => !p.isAllIn);
    if (canAct.length === 0) return true;
    const allMatched = canAct.every(p => p.currentBet === this.currentBet);
    if (!allMatched) return false;
    if (this.lastRaiserIndex === null) {
      return canAct.every(p => this.playersActedThisRound.has(p.id));
    }
    const lastRaiser = this.players[this.lastRaiserIndex];
    if (lastRaiser?.isAllIn) {
      return canAct.every(p => this.playersActedThisRound.has(p.id));
    }
    const nextIdx = this._findNextActivePlayer(this.currentPlayerIndex);
    return nextIdx === null || nextIdx === this.lastRaiserIndex;
  }

  private _resetRoundTracking(): void {
    this.currentBet = 0;
    this.minRaise = this.settings.bigBlind;
    this.lastRaiserIndex = null;
    this.playersActedThisRound = new Set();
    for (const p of this.players) { p.currentBet = 0; }
  }

  private _endBettingRound(events: GameEvent[]): ActionResult {
    this._collectBetsIntoPot();
    const prevPhase = this.phase;

    // Deal next street
    switch (this.phase) {
      case Phase.PREFLOP:
        this.phase = Phase.FLOP;
        this.communityCards.push(...dealCards(this.deck, 3));
        events.push({ type: 'deal_community', cards: [...this.communityCards] });
        break;
      case Phase.FLOP:
        this.phase = Phase.TURN;
        this.communityCards.push(...dealCards(this.deck, 1));
        events.push({ type: 'deal_community', cards: [...this.communityCards] });
        break;
      case Phase.TURN:
        this.phase = Phase.RIVER;
        this.communityCards.push(...dealCards(this.deck, 1));
        events.push({ type: 'deal_community', cards: [...this.communityCards] });
        break;
      case Phase.RIVER:
        return this._goToShowdown(events);
      default:
        return this._error(`Unexpected phase: ${this.phase}`);
    }
    events.push({ type: 'phase_change', from: prevPhase, to: this.phase });
    this._resetRoundTracking();

    // If all active players are all-in, auto-deal through showdown
    const nonFolded = this.players.filter(p => !p.isFolded);
    if (nonFolded.length > 1 && nonFolded.every(p => p.isAllIn)) {
      return this._autoDealToShowdown(events);
    }

    this.currentPlayerIndex = this._findNextActivePlayer(this.dealerIndex) ?? 0;
    this._skipBustedOrAllIn();
    return { success: true, gameState: this.getState(), events };
  }

  /**
   * Auto-deal remaining community cards when everyone is all-in.
   */
  private _autoDealToShowdown(events: GameEvent[]): ActionResult {
    while (this.phase !== Phase.RIVER) {
      const prev = this.phase;
      this._collectBetsIntoPot();
      switch (this.phase) {
        case Phase.FLOP:
          this.phase = Phase.TURN;
          this.communityCards.push(...dealCards(this.deck, 1));
          events.push({ type: 'deal_community', cards: [...this.communityCards] });
          break;
        case Phase.TURN:
          this.phase = Phase.RIVER;
          this.communityCards.push(...dealCards(this.deck, 1));
          events.push({ type: 'deal_community', cards: [...this.communityCards] });
          break;
        default:
          return this._error(`Cannot auto-advance from ${this.phase}`);
      }
      events.push({ type: 'phase_change', from: prev, to: this.phase });
      this._resetRoundTracking();
    }
    // At river: collect and go to showdown
    this._collectBetsIntoPot();
    return this._goToShowdown(events);
  }

  private _collectBetsIntoPot(): void {
    const total = this.players.reduce((sum, p) => sum + p.currentBet, 0);
    if (total > 0) {
      if (this.pots.length === 0) {
        this.pots.push({ amount: total, eligiblePlayerIds: this.players.filter(p => !p.isFolded).map(p => p.id) });
      } else {
        this.pots[0].amount += total;
        this.pots[0].eligiblePlayerIds = this.players.filter(p => !p.isFolded).map(p => p.id);
      }
    }
  }

  private _endHandEarly(winner: PlayerState, events: GameEvent[]): ActionResult {
    this._collectBetsIntoPot();
    const totalPot = this.pots.reduce((s, p) => s + p.amount, 0);
    winner.chips += totalPot;
    events.push({ type: 'pot_won', playerId: winner.id, amount: totalPot, potIndex: 0 });
    events.push({ type: 'hand_over', winnerIds: [winner.id], potAmount: totalPot });
    this.phase = Phase.HAND_OVER;
    this.handHistory.push({ handNumber: this.handCount, winnerIds: [winner.id], handLevel: HandLevel.HIGH_CARD, potAmount: totalPot });
    return { success: true, gameState: this.getState(), events };
  }

  private _goToShowdown(events: GameEvent[]): ActionResult {
    this.phase = Phase.SHOWDOWN;
    this._collectBetsIntoPot();
    this.pots = computeSidePots(this.players);
    const activePlayers = this.players.filter(p => !p.isFolded);
    const ranked = rankPlayersAtShowdown(
      activePlayers.map(p => ({ id: p.id, holeCards: p.holeCards })),
      this.communityCards,
      this.settings.gameType,
    );
    const order = getHandLevelOrder(this.settings.gameType);
    const showdownResults = ranked.map(r => ({
      playerId: r.id,
      handLevel: r.handResult?.level ?? HandLevel.HIGH_CARD,
      primary: r.handResult?.primary ?? 0,
      description: r.handResult ? handLevelName(r.handResult.level) : 'No hand',
      cards: r.handResult?.cards ?? [],
    }));
    events.push({ type: 'showdown', results: showdownResults });
    const handScores = new Map<string, { level: number; primary: number; kickers: number[] }>();
    for (const r of ranked) {
      if (r.handResult) {
        handScores.set(r.id, { level: order[r.handResult.level], primary: r.handResult.primary, kickers: r.handResult.kickers });
      }
    }
    const winnings = this._awardPots(this.pots, handScores);
    const winnerIds: string[] = [];
    let totalWon = 0;
    for (const [playerId, amount] of winnings) {
      const player = this.players.find(p => p.id === playerId);
      if (player) {
        player.chips += amount;
        winnerIds.push(playerId);
        totalWon += amount;
        events.push({ type: 'pot_won', playerId, amount, potIndex: 0 });
      }
    }
    this.phase = Phase.HAND_OVER;
    const winnerHand = ranked[0]?.handResult;
    this.handHistory.push({ handNumber: this.handCount, winnerIds, handLevel: winnerHand?.level ?? HandLevel.HIGH_CARD, potAmount: totalWon });
    events.push({ type: 'hand_over', winnerIds, potAmount: totalWon });
    return { success: true, gameState: this.getState(), events };
  }

  // ── Pot distribution ────────────────────────────────

  private _awardPots(
    pots: Pot[],
    handScores: Map<string, { level: number; primary: number; kickers: number[] }>,
  ): Map<string, number> {
    const winnings = new Map<string, number>();
    for (const pot of pots) {
      let bestScore = -Infinity;
      let bestPlayers: string[] = [];
      for (const id of pot.eligiblePlayerIds) {
        const score = handScores.get(id);
        if (!score) continue;
        const encoded = this._encodeHandScore(score);
        if (encoded > bestScore) { bestScore = encoded; bestPlayers = [id]; }
        else if (encoded === bestScore) { bestPlayers.push(id); }
      }
      if (bestPlayers.length === 0) continue;
      const share = Math.floor(pot.amount / bestPlayers.length);
      const remainder = pot.amount - share * bestPlayers.length;
      for (const id of bestPlayers) winnings.set(id, (winnings.get(id) ?? 0) + share);
      if (remainder > 0) winnings.set(bestPlayers[0], (winnings.get(bestPlayers[0]) ?? 0) + remainder);
    }
    return winnings;
  }

  private _encodeHandScore(hand: { level: number; primary: number; kickers: number[] }): number {
    let score = hand.level * 1_000_000_000;
    score += hand.primary * 10_000_000;
    for (let i = 0; i < Math.min(hand.kickers.length, 3); i++) {
      score += hand.kickers[i] * Math.pow(10, 5 - i * 2);
    }
    return score;
  }

  // ── Helpers ──────────────────────────────────────────

  private _error(message: string): ActionResult {
    return { success: false, error: message, gameState: this.getState(), events: [{ type: 'error', message }] };
  }

  private _createPlayer(id: string, name: string, seatIndex: number): PlayerState {
    return {
      id, name, chips: this.settings.startingChips, holeCards: [],
      currentBet: 0, totalBet: 0, isFolded: false, isAllIn: false,
      isSittingOut: false, seatIndex,
    };
  }

  private _postBlind(index: number, amount: number): void {
    const player = this.players[index];
    if (!player) return;
    const actual = Math.min(amount, player.chips);
    player.chips -= actual;
    player.currentBet += actual;
    player.totalBet += actual;
    if (player.chips === 0) player.isAllIn = true;
    this.currentBet = Math.max(this.currentBet, player.currentBet);
  }

  private _playerLeftOf(index: number): number {
    return (index + 1) % this.players.length;
  }

  private _findNextActivePlayer(fromIndex: number): number | null {
    const count = this.players.length;
    for (let i = 1; i <= count; i++) {
      const idx = (fromIndex + i) % count;
      const p = this.players[idx];
      if (!p.isFolded && !p.isAllIn) return idx;
    }
    return null;
  }

  private _nextActivePlayerIndex(fromIndex: number): number {
    const count = this.players.length;
    for (let i = 1; i <= count; i++) {
      const idx = (fromIndex + i) % count;
      if (!this.players[idx].isFolded) return idx;
    }
    return fromIndex;
  }

  private _skipBustedOrAllIn(): void {
    let attempts = 0;
    while (
      (this.players[this.currentPlayerIndex].isFolded || this.players[this.currentPlayerIndex].isAllIn) &&
      attempts < this.players.length
    ) {
      this.currentPlayerIndex = this._playerLeftOf(this.currentPlayerIndex);
      attempts++;
    }
  }
}

export { handLevelName } from './hand-rank.js';
