import { describe, expect, it } from './harness.js';
import { DEFAULT_RULES, buildShoe, evaluateHand, shuffle } from '../assets/games/engine.js?v=2';
import { bestArrangement, findWinning, solve } from '../assets/games/meld.js?v=2';

let id = 1;
const c = (rank, suit = 'S') => ({ id: id++, rank, suit });
const joker = () => ({ id: id++, rank: 0, suit: null });
const R = DEFAULT_RULES;

const winning = () => [
  c(4, 'H'), c(5, 'H'), c(6, 'H'),
  c(1, 'S'), c(2, 'S'), c(3, 'S'), c(4, 'S'),
  c(7, 'D'), c(7, 'H'), c(7, 'C'),
  c(11, 'C'), c(12, 'C'), joker(),
];

describe('meld solver', () => {
  it('finds a complete winning hand and costs it at zero', () => {
    const h = winning();
    expect(solve(h, 9, R, { real: true }).cost).toBe(0);
    const groups = findWinning(h, 9, R);
    expect(groups).not.toBeNull();
    expect(groups.flat()).toHaveLength(13);
    expect(evaluateHand(groups, 9, R).complete).toBe(true);
  });

  it('respects the table hand shape', () => {
    const h = winning(); // 3-4-3-3 = 4-3-3-3
    expect(findWinning(h, 9, { ...R, layout: '4333' })).not.toBeNull();
    expect(findWinning(h, 9, { ...R, layout: '544' })).toBeNull();
  });

  it('respects the joker limit', () => {
    // 2H3H4H and JC QC KC are pure; 6D J J 9D needs two jokers in one group; 5S 5H 5C is a set. Wild rank is 8.
    const h = [c(2, 'H'), c(3, 'H'), c(4, 'H'), c(6, 'D'), joker(), joker(), c(9, 'D'), c(5, 'S'), c(5, 'H'), c(5, 'C'), c(11, 'C'), c(12, 'C'), c(13, 'C')];
    expect(findWinning(h, 8, { ...R, maxJokers: 0 })).not.toBeNull(); // no limit
    expect(findWinning(h, 8, { ...R, maxJokers: 2 })).not.toBeNull();
    expect(findWinning(h, 8, { ...R, maxJokers: 1 })).toBeNull(); // 6D J J 9D has two jokers
  });

  it('finds a pure sequence that uses the wild-rank card in its natural place', () => {
    const h = [c(6, 'H'), c(7, 'H'), c(8, 'H'), c(1, 'S'), c(2, 'S'), c(3, 'S'), c(9, 'D'), c(9, 'H'), c(9, 'C'), c(11, 'C'), c(12, 'C'), c(13, 'C'), c(2, 'D')];
    const r = solve(h, 7, R, { real: true });
    expect(r.pure).toBe(true);
    expect(r.cost).toBe(2);
  });

  it('a hand with no possible pure sequence costs the whole hand', () => {
    // no two cards of a suit are neighbours and no rank repeats, so nothing can be grouped
    const h = [c(1, 'S'), c(3, 'S'), c(5, 'S'), c(7, 'S'), c(2, 'H'), c(4, 'H'), c(6, 'H'), c(8, 'H'), c(9, 'D'), c(11, 'D'), c(13, 'D'), c(10, 'C'), c(12, 'C')];
    expect(solve(h, 99, R, { real: true }).cost).toBe(94);
  });

  it('freeSkip takes one card out for free: the best card to discard', () => {
    const h = [...winning(), c(13, 'D')]; // 14 cards: a winning 13 plus a king
    const r = solve(h, 9, R, { freeSkip: true });
    expect(r.cost).toBe(0);
    expect(r.skipped.rank).toBe(13);
  });

  it('its arrangement scores exactly what the rules engine scores (200 random hands)', () => {
    let mismatches = 0;
    for (let i = 0; i < 200; i++) {
      const hand = shuffle(buildShoe()).slice(0, 13);
      const wr = 1 + (i % 13);
      const groups = bestArrangement(hand, wr, R);
      const ev = evaluateHand(groups, wr, R);
      const s = solve(hand, wr, R, { real: true });
      if (groups.flat().length !== 13) mismatches++;
      else if (!(ev.complete && s.cost === 0) && ev.points !== Math.min(R.maxPoints, s.cost)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});
