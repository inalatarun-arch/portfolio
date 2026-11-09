/**
 * Meld solver for Indian Rummy hands (used by the computer players and for arranging their hands).
 *
 *   solve(cards, wildRank, rules, opts)   best way to group a hand, and what it costs
 *   findWinning(cards, wildRank, rules)   an exact grouping that wins (every card used), or null
 *
 * It only ever looks at the cards it is given, so a computer player can only reason about what it can see.
 * Cards are the engine's {id, rank, suit}. A "joker-class" card is a printed joker or a card of the wild rank.
 */
import { SUITS, cardPoints, classifyGroup, evaluateHand, isJoker, isPrintedJoker, shapeAllowed } from './engine.js?v=4';

const INF = 1e9;
const bit = (i) => 1 << i;
const popcount = (n) => { let c = 0; while (n) { n &= n - 1; c++; } return c; };
const lowestBit = (m) => { let i = 0; while (!((m >> i) & 1)) i++; return i; };

/**
 * Every group that could be formed from these cards, as bit masks over their positions.
 * Naturals are the real cards used; `k` is how many jokers it also needs. Wild-rank cards may be used as naturals
 * in a sequence (so a pure sequence is found), and otherwise act as jokers.
 */
function buildCandidates(cs, wildRank, maxJokers, nNormal) {
  const jokerIdx = [];
  cs.forEach((c, i) => { if (isJoker(c, wildRank)) jokerIdx.push(i); });
  const maxFill = Math.min(jokerIdx.length, 3, maxJokers > 0 ? maxJokers : 3);
  const out = [];
  const seen = new Set();

  const push = (nat, k) => {
    if (!nat.length) return;
    let mask = 0;
    for (const i of nat) mask |= bit(i);
    const low = lowestBit(mask);
    if (low >= nNormal) return; // needs at least one ordinary card
    const fill = [];
    for (const j of jokerIdx) {
      if (fill.length === k) break;
      if (!(mask & bit(j))) fill.push(j);
    }
    if (fill.length < k) return;
    const group = [...nat, ...fill].map((i) => cs[i]);
    let kind = classifyGroup(group, wildRank, maxJokers);
    if (kind === 'invalid') return;
    // A group that needs a joker is never pure, whichever card happened to be picked to test it with: the pure
    // version (the natural card in its place) is its own candidate with k = 0.
    if (k > 0 && kind === 'pure') kind = 'sequence';
    const key = `${mask}:${k}:${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ mask, k, kind, low, nat, pure: kind === 'pure', seq: kind === 'pure' || kind === 'sequence', size: group.length });
  };

  // sequences, suit by suit: a window of consecutive ranks, each spot a real card or a joker
  for (const suit of SUITS) {
    const byRank = new Map();
    cs.forEach((c, i) => {
      if (c.suit === suit && !isPrintedJoker(c)) {
        if (!byRank.has(c.rank)) byRank.set(c.rank, []);
        byRank.get(c.rank).push(i);
      }
    });
    if (!byRank.size) continue;
    for (let a = 1; a <= 12; a++) {
      for (let len = 3; len <= Math.min(13, 15 - a); len++) {
        const end = a + len;
        const pick = (pos, nat, k) => {
          if (pos === end) { push(nat, k); return; }
          const r = pos > 13 ? 1 : pos;
          for (const i of byRank.get(r) || []) pick(pos + 1, [...nat, i], k);
          if (k < maxFill) pick(pos + 1, nat, k + 1);
        };
        pick(a, [], 0);
      }
    }
  }

  // sets: one card from each of 3 or 4 suits of the same rank, jokers filling the gaps
  for (let r = 1; r <= 13; r++) {
    if (r === wildRank) continue;
    const bySuit = SUITS.map((s) => cs.map((c, i) => (c.rank === r && c.suit === s && !isJoker(c, wildRank) ? i : -1)).filter((i) => i >= 0));
    const walk = (si, nat) => {
      if (si === SUITS.length) {
        for (const target of [3, 4]) {
          const k = target - nat.length;
          if (nat.length >= 1 && k >= 0 && k <= maxFill) push(nat, k);
        }
        return;
      }
      walk(si + 1, nat);
      for (const i of bySuit[si]) walk(si + 1, [...nat, i]);
    };
    walk(0, []);
  }
  return out;
}

function order(cards, wildRank) {
  const normal = [], jokers = [];
  cards.forEach((c) => (isJoker(c, wildRank) ? jokers : normal).push(c));
  return { cs: [...normal, ...jokers], nNormal: normal.length };
}

/** Pick which real joker cards fill each chosen group, from those not used as naturals. */
function concretize(cs, chosen, wildRank) {
  let used = 0;
  for (const m of chosen) used |= m.mask;
  const spare = [];
  cs.forEach((c, i) => { if (isJoker(c, wildRank) && !(used & bit(i))) spare.push(i); });
  const groups = [];
  const usedIdx = new Set();
  for (const m of chosen) {
    const g = m.nat.map((i) => cs[i]);
    for (let f = 0; f < m.k; f++) { const j = spare.shift(); g.push(cs[j]); usedIdx.add(j); }
    m.nat.forEach((i) => usedIdx.add(i));
    groups.push(g);
  }
  return { groups, usedIdx };
}

/**
 * Best grouping of `cards`.
 *  opts.freeSkip  one uncovered card is taken out for free (the card you are about to discard)
 *  opts.cardCost  cost of leaving each card out (default: its point value)
 *  opts.real      cost is the true score under the table rules; otherwise a planning cost that also values
 *                 getting a pure sequence and a second sequence, and gives sets partial credit
 * Returns { cost, groups (melds), rest (cards left over), skipped (the free card), pure, seq }.
 */
export function solve(cards, wildRank, rules, opts = {}) {
  const free = !!opts.freeSkip;
  const real = !!opts.real;
  const { cs, nNormal } = order(cards, wildRank);
  const n = cs.length;
  // opts.cardCost(card) can replace the point value as the cost of leaving a card out (a player who is racing to
  // declare cares about how many cards it still needs, not only how heavy they are)
  const pts = cs.map((c) => (opts.cardCost ? opts.cardCost(c) : cardPoints(c, wildRank)));
  const total = pts.reduce((a, b) => a + b, 0);
  const cands = buildCandidates(cs, wildRank, rules.maxJokers, nNormal);
  let jokerBits = 0, jokerCount = 0;
  cs.forEach((c, i) => { if (isJoker(c, wildRank)) { jokerBits |= bit(i); jokerCount++; } });

  const runMode = (mode) => {
    const list = cands.filter((m) => (mode === 'B' ? m.kind !== 'set' : true));
    const byLow = Array.from({ length: n }, () => []);
    for (const m of list) byLow[m.low].push(m);
    const memo = new Map();
    const terminal = (pure, seq, setPts) => {
      if (mode === 'A') return pure && seq >= 2 ? 0 : INF;
      if (real) return pure ? 0 : INF; // with no pure sequence the whole hand counts: handled after the search
      if (mode === 'B') return (pure ? 0 : 25) + (seq >= 2 ? 0 : 12);
      return (pure ? 0 : 25) + (seq >= 2 ? 0 : 12) + 0.35 * setPts; // C: sets count partly while sequences are missing
    };
    const go = (mask, fill, pure, seq, skip, setPts) => {
      let i = 0;
      while (i < nNormal && (mask >> i) & 1) i++;
      if (i >= nNormal) return terminal(pure, seq, setPts);
      const key = ((((mask * 8 + fill) * 2 + pure) * 3 + seq) * 2 + skip) * 400 + (mode === 'C' ? Math.round(setPts) : 0);
      const hit = memo.get(key);
      if (hit !== undefined) return hit.c;
      let best = pts[i] + go(mask | bit(i), fill, pure, seq, skip, setPts);
      let ch = { t: 0 };
      if (free && !skip) {
        const c = go(mask | bit(i), fill, pure, seq, 1, setPts);
        if (c < best) { best = c; ch = { t: 1 }; }
      }
      for (const m of byLow[i]) {
        if (m.mask & mask) continue;
        const nm = mask | m.mask;
        if (fill + m.k > jokerCount - popcount(nm & jokerBits)) continue;
        let add = 0;
        if (mode === 'C' && m.kind === 'set') for (const x of m.nat) add += pts[x];
        const c = go(nm, fill + m.k, pure || m.pure ? 1 : 0, Math.min(2, seq + (m.seq ? 1 : 0)), skip, setPts + add);
        if (c < best) { best = c; ch = { t: 2, m }; }
      }
      memo.set(key, { c: best, ch });
      return best;
    };
    const cost = go(0, 0, 0, 0, 0, 0);
    // walk the choices back out
    const chosen = [];
    let mask = 0, fill = 0, pure = 0, seq = 0, skip = 0, setPts = 0, skippedIdx = -1;
    const uncovered = [];
    for (;;) {
      let i = 0;
      while (i < nNormal && (mask >> i) & 1) i++;
      if (i >= nNormal) break;
      const key = ((((mask * 8 + fill) * 2 + pure) * 3 + seq) * 2 + skip) * 400 + (mode === 'C' ? Math.round(setPts) : 0);
      const { ch } = memo.get(key);
      if (ch.t === 0) { uncovered.push(i); mask |= bit(i); }
      else if (ch.t === 1) { skippedIdx = i; skip = 1; mask |= bit(i); }
      else {
        const m = ch.m;
        chosen.push(m);
        mask |= m.mask; fill += m.k; pure = pure || m.pure ? 1 : 0; seq = Math.min(2, seq + (m.seq ? 1 : 0));
        if (mode === 'C' && m.kind === 'set') for (const x of m.nat) setPts += pts[x];
      }
    }
    return { cost, chosen, uncovered, skippedIdx, pure, seq };
  };

  const modes = real ? ['A', 'B'] : ['A', 'B', 'C'];
  let best = null;
  for (const mode of modes) {
    const r = runMode(mode);
    if (!best || r.cost < best.cost) best = r;
  }
  if (real && best.cost >= total) {
    // No way to score less than the whole hand (no pure sequence is possible): lay it out for show, cost = everything.
    const plan = solve(cards, wildRank, rules, { freeSkip: free });
    return { ...plan, cost: total };
  }
  const { groups, usedIdx } = concretize(cs, best.chosen, wildRank);
  const rest = [];
  cs.forEach((c, i) => { if (!usedIdx.has(i) && i !== best.skippedIdx) rest.push(c); });
  return { cost: best.cost, groups, rest, skipped: best.skippedIdx >= 0 ? cs[best.skippedIdx] : null, pure: !!best.pure, seq: best.seq };
}

/** The hand laid out as the groups that score best, then the leftover cards each on their own. */
export function bestArrangement(cards, wildRank, rules) {
  const r = solve(cards, wildRank, rules, { real: true });
  return [...r.groups, ...r.rest.map((c) => [c])];
}

/**
 * An exact way to win with exactly these cards (13 normally): every card in a valid group, at least two
 * sequences with one pure, and a hand shape the table allows. Returns the groups or null.
 */
export function findWinning(cards, wildRank, rules) {
  const { cs, nNormal } = order(cards, wildRank);
  const cands = buildCandidates(cs, wildRank, rules.maxJokers, nNormal);
  const byLow = Array.from({ length: cs.length }, () => []);
  for (const m of cands) byLow[m.low].push(m);
  let jokerBits = 0, jokerCount = 0;
  cs.forEach((c, i) => { if (isJoker(c, wildRank)) { jokerBits |= bit(i); jokerCount++; } });

  let found = null;
  const attach = (groups, spare) => {
    // leftover jokers must join a group (or form their own group of three or more)
    if (!spare.length) {
      const ev = evaluateHand(groups, wildRank, rules);
      return ev.complete && shapeAllowed(groups, rules) ? groups : null;
    }
    const [j, ...more] = spare;
    for (let g = 0; g < groups.length; g++) {
      const grown = groups.map((x, i) => (i === g ? [...x, j] : x));
      if (classifyGroup(grown[g], wildRank, rules.maxJokers) === 'invalid') continue;
      const res = attach(grown, more);
      if (res) return res;
    }
    if (spare.length >= 3 && classifyGroup(spare, wildRank, rules.maxJokers) !== 'invalid') {
      const res = attach([...groups, spare], []);
      if (res) return res;
    }
    return null;
  };
  const dfs = (mask, fill, chosen) => {
    if (found) return;
    let i = 0;
    while (i < nNormal && (mask >> i) & 1) i++;
    if (i >= nNormal) {
      const { groups, usedIdx } = concretize(cs, chosen, wildRank);
      const spare = [];
      cs.forEach((c, x) => { if (isJoker(c, wildRank) && !usedIdx.has(x)) spare.push(c); });
      found = attach(groups, spare);
      return;
    }
    for (const m of byLow[i]) {
      if (m.mask & mask) continue;
      const nm = mask | m.mask;
      if (fill + m.k > jokerCount - popcount(nm & jokerBits)) continue;
      dfs(nm, fill + m.k, [...chosen, m]);
      if (found) return;
    }
  };
  dfs(0, 0, []);
  return found;
}
