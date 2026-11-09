import { describe, expect, it } from './harness.js';
import { DEFAULT_RULES, buildShoe, newGame, viewFor, shuffle, secureRandom } from '../assets/games/engine.js?v=2';
import { LEVELS, chooseAction, createMemory, observe, runBotTurn } from '../assets/games/bot.js?v=2';
import { playRound } from './sim.js';
import { readFileSync } from 'node:fs';

const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const ids = LEVELS.map((l) => l.id);

describe('computer players play legally', () => {
  it('finish every round with no illegal move and no stall, at every level', () => {
    for (let r = 0; r < 8; r++) {
      const { state, stats } = playRound(ids, DEFAULT_RULES);
      expect(stats.illegal).toHaveLength(0);
      expect(stats.stalled).toBe(false);
      expect(state.phase === 'round-over' || state.phase === 'game-over').toBe(true);
    }
  });

  it('also finish under strict table rules (closed joker, 5-4-4 only, one joker per group)', () => {
    const rules = { ...DEFAULT_RULES, jokerMode: 'closed', layout: '4333-544', maxJokers: 1 };
    for (let r = 0; r < 6; r++) {
      const { stats } = playRound(['medium', 'hard', 'pro'], rules);
      expect(stats.illegal).toHaveLength(0);
    }
  });

  it('a computer player that declares always declares a valid hand, except Easy now and then', () => {
    let wrongNonEasy = 0;
    for (let r = 0; r < 12; r++) {
      const { stats, state } = playRound(['medium', 'hard', 'pro', 'medium'], DEFAULT_RULES);
      wrongNonEasy += stats.wrongDeclares.size;
      expect(state.results.length).toBe(1);
    }
    expect(wrongNonEasy).toBe(0);
  });
});

describe('computer players cannot peek', () => {
  /** Two tables that differ only in what the bot cannot see: the stock order and the other players' hands. */
  function twin() {
    const a = newGame([{ id: 'p1', name: 'A', bot: true, level: 'pro' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }], DEFAULT_RULES, { rng: seeded(11) });
    const b = structuredClone(a);
    // reshuffle the stock and swap the opponents' hands with other cards from the same pool
    const pool = [...b.stock, ...b.players[1].groups.flat(), ...b.players[2].groups.flat()];
    const mixed = shuffle(pool, seeded(99));
    b.players[1].groups = [mixed.splice(0, 13)];
    b.players[2].groups = [mixed.splice(0, 13)];
    b.stock = mixed;
    return { a, b };
  }

  it('what the bot is shown is identical whatever the stock and the other hands hold', () => {
    const { a, b } = twin();
    const va = viewFor(a, 'p1', () => true), vb = viewFor(b, 'p1', () => true);
    expect(JSON.stringify(va)).toBe(JSON.stringify(vb));
    expect('stock' in va).toBe(false);
  });

  it('so its decisions are identical too, at every level', () => {
    for (const level of ids) {
      const { a, b } = twin();
      a.turn = b.turn = 0;
      const act = (g) => {
        const view = viewFor(g, 'p1', () => true);
        const mem = createMemory();
        observe(mem, view);
        return JSON.stringify(chooseAction(view, level, mem, seeded(5)));
      };
      expect(act(a)).toBe(act(b));
    }
  });

  it('the decision code never reads the stock, the game state or other players hands (source audit)', () => {
    const src = readFileSync(new URL('../assets/games/bot.js', import.meta.url), 'utf8');
    const decide = src.slice(src.indexOf('export function chooseAction'), src.indexOf('// taking a turn'));
    const helpers = src.slice(src.indexOf('// shared helpers'), src.indexOf('// the decision'));
    for (const part of [decide, helpers]) {
      expect(/\bstate\b/.test(part)).toBe(false);
      expect(/\.stock\b(?!Count)/.test(part)).toBe(false);
      expect(/players\[/.test(part)).toBe(false);
    }
  });
});

describe('the cards come from a fair shuffle', () => {
  it('every position is equally likely for a card (chi-square on 24,000 shuffles)', () => {
    const N = 24000, K = 8;
    const counts = Array(K).fill(0);
    for (let i = 0; i < N; i++) counts[shuffle([0, 1, 2, 3, 4, 5, 6, 7]).indexOf(0)]++;
    const expected = N / K;
    const chi = counts.reduce((s, x) => s + ((x - expected) ** 2) / expected, 0);
    expect(chi).toBeLessThanOrEqual(24.3); // df = 7, p = 0.001
  });

  it('the generator is uniform in [0, 1)', () => {
    let lo = 0, n = 20000;
    for (let i = 0; i < n; i++) { const x = secureRandom(); if (x < 0 || x >= 1) throw new Error('out of range'); if (x < 0.5) lo++; }
    expect(Math.abs(lo / n - 0.5)).toBeLessThanOrEqual(0.02);
  });

  it('the stock a computer player draws from is not better than the one a human draws from', () => {
    // Cards drawn from the stock average the same value at every level: the deck does not know who is playing.
    // (An ordinary card averages about 6.96 points once the printed jokers are counted.)
    const draw = Object.fromEntries(ids.map((l) => [l, { n: 0, pts: 0, sq: 0 }]));
    for (let r = 0; r < 30; r++) {
      const order = [...ids.slice(r % 4), ...ids.slice(0, r % 4)];
      const seats = order.map((level, i) => ({ id: `p${i + 1}`, name: level, bot: true, level }));
      const state = newGame(seats, { ...DEFAULT_RULES, rounds: 1 });
      const mems = new Map(seats.map((s) => [s.id, createMemory()]));
      let guard = 0;
      while (state.phase === 'playing' && guard++ < 600) {
        const cur = state.players[state.turn];
        const peek = state.stock[0]; // the test may look at the stock; the players cannot
        const res = runBotTurn(state, cur.id, cur.level, mems.get(cur.id));
        if (res.action.a === 'draw' && peek) {
          const pts = peek.rank === 0 ? 0 : peek.rank >= 10 || peek.rank === 1 ? 10 : peek.rank;
          draw[cur.level].n++; draw[cur.level].pts += pts; draw[cur.level].sq += pts * pts;
        }
        for (const s of seats) observe(mems.get(s.id), viewFor(state, s.id, () => true));
      }
    }
    for (const l of ids) {
      const d = draw[l];
      const mean = d.pts / d.n;
      const sd = Math.sqrt(d.sq / d.n - mean * mean);
      const z = (mean - 6.96) / (sd / Math.sqrt(d.n));
      expect(d.n).toBeGreaterThan(25);
      expect(Math.abs(z)).toBeLessThanOrEqual(4); // a rigged deck would sit far outside this
    }
  });
});

describe('the four levels behave differently', () => {
  let id = 5000;
  const c = (rank, suit) => ({ id: id++, rank, suit });
  const jk = () => ({ id: id++, rank: 0, suit: null });
  const view = (hand, over = {}) => ({
    you: 'p1', gameId: 'g', round: 1, step: 'draw', iHaveDrawn: false, wildRank: 99, rules: DEFAULT_RULES,
    discardTop: [c(13, 'D')], myGroups: [hand], stockCount: 50, discardCount: 1, turn: 'p1', players: [], ...over,
  });
  // nothing here can ever be grouped: no pure sequence, no joker
  const junk = () => [c(1, 'S'), c(3, 'S'), c(5, 'S'), c(7, 'S'), c(2, 'H'), c(4, 'H'), c(6, 'H'), c(8, 'H'), c(9, 'D'), c(11, 'D'), c(13, 'D'), c(10, 'C'), c(12, 'C')];
  const act = (level, v, rng = () => 0.5) => { const m = createMemory(); observe(m, v); return chooseAction(v, level, m, rng); };

  // no two cards of a suit within two ranks of each other, no repeated rank: nothing to build on at all
  const scattered = () => [c(1, 'S'), c(5, 'S'), c(9, 'S'), c(13, 'S'), c(2, 'H'), c(6, 'H'), c(10, 'H'), c(3, 'D'), c(7, 'D'), c(11, 'D'), c(4, 'C'), c(8, 'C'), c(12, 'C')];
  it('Professional and Hard fold a hopeless deal before drawing; Easy and Medium never do', () => {
    expect(act('pro', view(scattered())).a).toBe('drop');
    expect(act('hard', view(scattered())).a).toBe('drop');
    expect(act('medium', view(scattered())).a).not.toBe('drop');
    expect(act('easy', view(scattered())).a).not.toBe('drop');
  });

  it('Professional folds a deal Hard keeps when it has cards close together', () => {
    expect(act('pro', view(junk())).a).toBe('drop'); // no pure sequence, no joker
    expect(act('hard', view(junk())).a).not.toBe('drop'); // but plenty of near pairs, so Hard plays on
  });

  it('nobody drops after drawing, or with a pure sequence or jokers in hand', () => {
    expect(act('pro', view(junk(), { iHaveDrawn: true })).a).not.toBe('drop');
    const withPure = junk(); withPure.splice(0, 3, c(4, 'H'), c(5, 'H'), c(6, 'H'));
    expect(act('pro', view(withPure)).a).not.toBe('drop');
    const withJokers = junk(); withJokers.splice(0, 2, jk(), jk());
    expect(act('pro', view(withJokers)).a).not.toBe('drop');
  });

  it('over many random deals Professional folds more than Hard, and Easy and Medium never fold', () => {
    const drops = { easy: 0, medium: 0, hard: 0, pro: 0 };
    for (let i = 0; i < 160; i++) {
      const hand = shuffle(buildShoe(), seeded(i + 3)).slice(0, 13);
      const v = view(hand, { wildRank: 1 + (i % 13) });
      for (const l of ids) if (act(l, v, seeded(i + 1)).a === 'drop') drops[l]++;
    }
    expect(drops.easy + drops.medium).toBe(0);
    expect(drops.hard).toBeGreaterThan(0);
    expect(drops.pro).toBeGreaterThan(drops.hard);
    expect(drops.pro).toBeLessThanOrEqual(80); // folds a fraction of deals, not most of them
  });

  const winning14 = () => [
    c(4, 'H'), c(5, 'H'), c(6, 'H'), c(1, 'S'), c(2, 'S'), c(3, 'S'), c(4, 'S'),
    c(7, 'D'), c(7, 'H'), c(7, 'C'), c(11, 'C'), c(12, 'C'), jk(), c(13, 'D'),
  ];
  it('everyone but Easy declares a winning hand at once; Easy sometimes sits on it', () => {
    for (const l of ['medium', 'hard', 'pro']) {
      const a = act(l, view(winning14(), { step: 'discard', iHaveDrawn: true }), () => 0.99);
      expect(a.a).toBe('declare');
      expect(a.groups.flat()).toHaveLength(13);
    }
    expect(act('easy', view(winning14(), { step: 'discard', iHaveDrawn: true }), () => 0.1).a).toBe('declare');
    expect(act('easy', view(winning14(), { step: 'discard', iHaveDrawn: true }), () => 0.99).a).toBe('discard');
  });

  it('the stronger levels hold on to a joker that Easy might throw away', () => {
    const hand = [...junk().slice(0, 12), jk(), c(2, 'C')]; // 14 cards with one joker
    for (const l of ['medium', 'hard', 'pro']) {
      const a = act(l, view(hand, { step: 'discard', iHaveDrawn: true }));
      expect(a.a).toBe('discard');
      expect(a.card === hand[12].id).toBe(false); // never the joker
    }
  });
});
