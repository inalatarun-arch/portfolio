/**
 * Computer players for Indian Rummy.
 *
 * FAIRNESS: a computer player decides from `view`, the same GameView a human at that seat receives: its own cards,
 * the top of the discard pile, the visible wild joker (none, if the table is closed and it has no pure sequence yet),
 * counts and scores. It never receives the stock, the order of the deck, or anyone else's hand, and it has no
 * access to the game state object at all, so it cannot peek. The deck is shuffled once, with the browser's
 * cryptographic generator, when the round is dealt, before anyone has acted; difficulty only changes how well a
 * player plays the cards it is dealt and draws.
 *
 * LEVELS (each plays differently, see chooseAction):
 *   easy          plays by feel: ignores what could be, sometimes throws away useful cards, may sit on a winning
 *                 hand for a turn, and now and then declares too early
 *   medium        groups its hand exactly, keeps jokers, takes a card only when it helps right now
 *   hard          also values cards that are one draw from a group, weighs stock against discard by the odds
 *                 (with the odd slip on close calls), and drops the very worst deals before drawing
 *   professional  counts the cards it has seen, calculates the best draw and discard, avoids throwing cards it
 *                 saw you pick up, and folds about a quarter of deals: those with no pure sequence and no joker
 *                 (they average 55 points against 20 for a drop) or one joker and few cards close together
 */
import { SUITS, cardPoints, isJoker, isPrintedJoker, viewFor, discardCard, declare, drawFromDiscard, drawFromStock, dropPlayer, arrangeHand } from './engine.js?v=4';
import { bestArrangement, findWinning, solve } from './meld.js?v=4';

export const LEVELS = [
  { id: 'easy', label: 'Easy', blurb: 'Plays by feel. Forgets to plan ahead, sometimes throws away good cards and can declare too early.', think: 1100 },
  { id: 'medium', label: 'Medium', blurb: 'Groups its hand properly and keeps its jokers, but only takes a card when it helps right now.', think: 900 },
  { id: 'hard', label: 'Hard', blurb: 'Plays the odds: values cards one draw from a group, picks stock or discard on likelihood, drops hopeless hands.', think: 800 },
  { id: 'pro', label: 'Professional', blurb: 'Counts every card it has seen, calculates the best draw and discard, avoids feeding you, and knows when to drop.', think: 800 },
];
export const levelInfo = (id) => LEVELS.find((l) => l.id === id) || LEVELS[1];

/**
 * Professional's tuning. It weighs the exact expected result of the next draw, and (`blend`) also how close its
 * leftover cards are to a group after that, because a card two draws from a group is still worth keeping.
 */
export const PRO = { blend: 0.5, takeBlend: 0.5, finalists: 5, danger: 1.6, margin: 0.5 };

/**
 * Hard plays well but not perfectly: on close calls it sometimes goes with its second choice, the way a strong but
 * hurried player does. Professional never does.
 */
export const HARD_SLIP = { discard: 0.14, take: 0.1 };

const proCost = () => ({});

const typeKey = (c) => (c.rank === 0 ? 'J' : c.rank + c.suit);
const copies = (rank) => (rank === 0 ? 4 : 2);
const ALL_TYPES = [{ rank: 0, suit: null }, ...SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit: s })))];
let fakeId = -1;
const fake = (t) => ({ id: fakeId--, rank: t.rank, suit: t.suit });

// ---------------------------------------------------------------------------------------------------------------
// what a player remembers (only things it has actually seen)
// ---------------------------------------------------------------------------------------------------------------
export function createMemory() {
  return { gameId: null, round: -1, lastCount: 0, lastTop: null, lastStock: 0, lastTurn: null, turns: 0, seen: new Map(), pickups: [] };
}

/** Update memory from a fresh view. Call after every change to the table. */
export function observe(mem, view) {
  if (mem.gameId !== view.gameId || mem.round !== view.round) {
    Object.assign(mem, createMemory(), { gameId: view.gameId, round: view.round });
  }
  const add = (c) => mem.seen.set(typeKey(c), (mem.seen.get(typeKey(c)) || 0) + 1);
  const del = (c) => mem.seen.set(typeKey(c), Math.max(0, (mem.seen.get(typeKey(c)) || 0) - 1));
  if (view.stockCount > mem.lastStock && mem.lastStock > 0) {
    // the discard pile was shuffled back into the stock: what we had seen is mixed in again
    mem.seen = new Map();
    if (view.discardTop.length) add(view.discardTop[view.discardTop.length - 1]);
  } else {
    const diff = view.discardCount - mem.lastCount;
    if (diff > 0) {
      for (const c of view.discardTop.slice(-Math.min(diff, view.discardTop.length))) add(c);
    } else if (diff < 0 && mem.lastTop) {
      del(mem.lastTop); // someone took the top card; if it was not me, remember what they wanted
      if (view.turn !== view.you) mem.pickups.push({ rank: mem.lastTop.rank, suit: mem.lastTop.suit });
    }
  }
  if (view.turn !== mem.lastTurn) mem.turns++;
  mem.lastTurn = view.turn;
  mem.lastCount = view.discardCount;
  mem.lastStock = view.stockCount;
  mem.lastTop = view.discardTop.length ? view.discardTop[view.discardTop.length - 1] : null;
}

/** How many of this card are not in my hand and not seen in the discards (so could be in the stock or a hand). */
function unseen(mem, hand, t) {
  const own = hand.filter((c) => c.rank === t.rank && c.suit === t.suit).length;
  const gone = mem ? mem.seen.get(typeKey(t)) || 0 : 0;
  return Math.max(0, copies(t.rank) - own - gone);
}

// ---------------------------------------------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------------------------------------------
const handOf = (view) => view.myGroups.flat();
const without = (cards, card) => cards.filter((c) => c.id !== card.id);
const distinctTypes = (cards) => { const seen = new Set(); return cards.filter((c) => (seen.has(typeKey(c)) ? false : seen.add(typeKey(c)))); };
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
const planCost = (cards, wr, rules, free, extra = {}) => solve(cards, wr, rules, { freeSkip: free, ...extra }).cost;

/** Spots within `reach` ranks of a card in the same suit (ace counts at both ends), plus same rank in other suits. */
function neighbours(hand, wr, reach) {
  const set = new Map();
  const add = (rank, suit) => { if (rank >= 1 && rank <= 13) set.set(rank + (suit || ''), { rank, suit }); };
  for (const c of hand) {
    if (isJoker(c, wr)) continue;
    for (let d = -reach; d <= reach; d++) {
      add(c.rank + d, c.suit);
      if (c.rank === 1 && d > 0) add(14 - d, c.suit); // Q K A
      if (c.rank === 13 && d > 0) add(d, c.suit); // not a wrap, but A is reachable via K
    }
    for (const s of SUITS) add(c.rank, s);
  }
  set.set('J', { rank: 0, suit: null });
  if (wr > 0) for (const s of SUITS) add(wr, s);
  return [...set.values()];
}

/**
 * Expected planning cost after drawing one unknown card from the stock into this 13-card hand and then discarding
 * the best card. `mem` null means "assume nothing has been seen" (a weaker player).
 */
function expectedAfterDraw(hand13, wr, rules, mem, reach, extra = {}) {
  const types = neighbours(hand13, wr, reach);
  let total = 0;
  for (const t of ALL_TYPES) total += unseen(mem, hand13, t);
  if (total <= 0) return planCost(hand13, wr, rules, false, extra);
  let e = 0, p = 0;
  for (const t of types) {
    const n = unseen(mem, hand13, t);
    if (!n) continue;
    const prob = n / total;
    p += prob;
    e += prob * solve([...hand13, fake(t)], wr, rules, { freeSkip: true, ...extra }).cost;
  }
  return e + (1 - p) * planCost(hand13, wr, rules, false, extra);
}

/** Cards two apart or adjacent in a suit, and pairs of a rank: how close the leftover cards are to a group. */
function potentialBonus(rest, wr, hand, assumeCopies) {
  const cards = rest.filter((c) => !isJoker(c, wr));
  const pairs = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      let v = 0;
      if (a.suit === b.suit) {
        const d = Math.min(Math.abs(a.rank - b.rank), a.rank === 1 ? Math.abs(14 - b.rank) : 99, b.rank === 1 ? Math.abs(14 - a.rank) : 99);
        if (d === 1) v = 3.4;
        else if (d === 2) v = 1.8;
      } else if (a.rank === b.rank) v = 2.2;
      if (v) pairs.push({ v, i, j });
    }
  }
  pairs.sort((x, y) => y.v - x.v);
  const used = new Set();
  let bonus = 0;
  for (const p of pairs) {
    if (used.has(p.i) || used.has(p.j)) continue;
    used.add(p.i); used.add(p.j);
    bonus += p.v;
  }
  void hand; void assumeCopies;
  return bonus;
}

/** Same-suit neighbours within two ranks: a rough measure of whether a pure sequence can still happen. */
function runPairs(hand, wr) {
  const cards = hand.filter((c) => !isJoker(c, wr));
  let n = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    if (cards[i].suit === cards[j].suit && Math.abs(cards[i].rank - cards[j].rank) <= 2 && cards[i].rank !== cards[j].rank) n++;
  }
  return n;
}

/** A winning declaration from a 14-card hand, if there is one: { card, groups } or null. */
function findDeclaration(h14, wr, rules) {
  const plan = solve(h14, wr, rules, { freeSkip: true });
  if (plan.cost !== 0) return null;
  const order = [];
  if (plan.skipped) order.push(plan.skipped);
  for (const c of distinctTypes(h14).sort((a, b) => cardPoints(b, wr) - cardPoints(a, wr))) if (!plan.skipped || typeKey(c) !== typeKey(plan.skipped)) order.push(c);
  for (const card of order) {
    const rest = without(h14, card);
    const groups = findWinning(rest, wr, rules);
    if (groups) return { card, groups };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// the decision
// ---------------------------------------------------------------------------------------------------------------
/**
 * Choose the next action for the player this `view` belongs to. `rng` (0..1) only drives the computer's own
 * behaviour (mistakes, tie-breaks); it has nothing to do with the deck.
 * Returns {a:'drop'} | {a:'draw'} | {a:'take'} | {a:'discard', card} | {a:'declare', card, groups}.
 */
export function chooseAction(view, level, mem, rng = Math.random) {
  const wr = view.wildRank;
  const rules = view.rules;
  const hand = handOf(view);
  const top = view.discardTop.length ? view.discardTop[view.discardTop.length - 1] : null;

  if (view.step === 'draw') {
    // --- before drawing: maybe leave a hand that is very unlikely to win ---
    // Measured over thousands of simulated deals: a hand dealt with no pure sequence and no joker finishes with
    // about 55 points on average, against 20 for a first drop. Professional folds those; Hard only folds the worst
    // of them (few cards near each other); Professional also folds one-joker hands with few near cards. Easy and
    // Medium never drop.
    if ((level === 'hard' || level === 'pro') && !view.iHaveDrawn && rules.firstDrop <= 30) {
      const r = solve(hand, wr, rules);
      const jokers = hand.filter((c) => isJoker(c, wr)).length;
      const pairs = runPairs(hand, wr);
      const noJoker = !r.pure && jokers === 0;
      const oneJoker = !r.pure && jokers === 1 && pairs <= 3; // about 41 points on average: still worth folding
      if (level === 'pro' ? noJoker || oneJoker : noJoker && pairs <= 3) return { a: 'drop' };
    }
    if (!top) return { a: 'draw' };
    const topIsJoker = isJoker(top, wr);

    if (level === 'easy') {
      if (topIsJoker && rng() < 0.6) return { a: 'take' };
      const friendly = hand.some((c) => (c.suit === top.suit && Math.abs(c.rank - top.rank) <= 1) || c.rank === top.rank);
      return { a: friendly && rng() < 0.3 ? 'take' : 'draw' };
    }
    const base = planCost(hand, wr, rules, false);
    const takeCost = solve([...hand, top], wr, rules, { freeSkip: true }).cost;
    if (level === 'medium') return { a: topIsJoker || takeCost < base ? 'take' : 'draw' };
    if (topIsJoker) return { a: 'take' };
    if (level === 'pro') {
      // compare like with like: expected cost of drawing, against the cost of taking, each less its closeness to a group
      const x = proCost(wr);
      const expectedP = expectedAfterDraw(hand, wr, rules, mem, 2, x);
      const took = solve([...hand, top], wr, rules, { freeSkip: true, ...x });
      const nowRest = solve(hand, wr, rules, x).rest;
      const takeScore = took.cost - PRO.takeBlend * potentialBonus(took.rest, wr, hand);
      const drawScore = expectedP - PRO.takeBlend * potentialBonus(nowRest, wr, hand);
      return { a: takeScore < drawScore - PRO.margin ? 'take' : 'draw' };
    }
    const expected = expectedAfterDraw(hand, wr, rules, null, 1);
    const gap = expected - takeCost;
    const wantTake = gap > 0.5;
    // a close call can go either way for Hard
    if (Math.abs(gap) < 3 && rng() < HARD_SLIP.take) return { a: wantTake ? 'draw' : 'take' };
    return { a: wantTake ? 'take' : 'draw' };
  }

  // --- holding 14 cards: declare, or discard one ---
  const decl = findDeclaration(hand, wr, rules);
  if (decl) {
    if (level !== 'easy' || rng() < 0.85) return { a: 'declare', card: decl.card.id, groups: decl.groups.map((g) => g.map((c) => c.id)) };
  }
  const plan = solve(hand, wr, rules, { freeSkip: true });

  if (level === 'easy') {
    // a hasty declaration now and then, on a hand that is close but not there
    if (plan.cost > 0 && plan.cost <= 12 && plan.pure && rng() < 0.03 && plan.skipped) {
      const rest = without(hand, plan.skipped);
      return { a: 'declare', card: plan.skipped.id, groups: bestArrangement(rest, wr, rules).map((g) => g.map((c) => c.id)) };
    }
    if (rng() < 0.35) return { a: 'discard', card: pick(hand, rng).id };
    const plain = solve(hand, wr, rules, { freeSkip: true, real: true });
    const loose = plain.rest.length ? plain.rest : hand;
    return { a: 'discard', card: loose.reduce((m, c) => (cardPoints(c, wr) > cardPoints(m, wr) ? c : m)).id };
  }

  if (decl === null && plan.cost === 0 && plan.skipped) {
    // a complete hand the table's hand shape will not accept: break a big group and try again
    const big = plan.groups.filter((g) => g.length >= 4);
    const from = (big.length ? pick(big, rng) : pick(plan.groups, rng)) || hand;
    return { a: 'discard', card: pick(from.filter((c) => !isJoker(c, wr)).length ? from.filter((c) => !isJoker(c, wr)) : from, rng).id };
  }

  if (level === 'medium') {
    const card = plan.skipped || hand.reduce((m, c) => (cardPoints(c, wr) > cardPoints(m, wr) ? c : m));
    return { a: 'discard', card: card.id };
  }

  // hard and professional: look at every distinct card we could let go
  const candidates = distinctTypes(hand).filter((c) => !isJoker(c, wr));
  if (!candidates.length) return { a: 'discard', card: hand[0].id };
  const scored = candidates.map((d) => {
    const left = without(hand, d);
    const r = solve(left, wr, rules);
    return { d, left, score: r.cost - potentialBonus(r.rest, wr, left) };
  }).sort((a, b) => a.score - b.score);
  if (level === 'hard') {
    const second = scored[1] && scored[1].score - scored[0].score < 2.5 && rng() < HARD_SLIP.discard;
    return { a: 'discard', card: (second ? scored[1] : scored[0]).d.id };
  }

  // professional: calculate the expected cost after the next draw for the best few, and avoid feeding opponents
  const finalists = scored.slice(0, PRO.finalists).map((s) => {
    const x = proCost(wr);
    const r = solve(s.left, wr, rules, x);
    let cost = expectedAfterDraw(s.left, wr, rules, mem, 2, x) - PRO.blend * potentialBonus(r.rest, wr, s.left);
    for (const p of mem.pickups.slice(-6)) {
      const feeds = (p.suit === s.d.suit && Math.abs(p.rank - s.d.rank) <= 2) || p.rank === s.d.rank;
      if (feeds) cost += PRO.danger;
    }
    return { d: s.d, cost };
  }).sort((a, b) => a.cost - b.cost);
  return { a: 'discard', card: finalists[0].d.id };
}

// ---------------------------------------------------------------------------------------------------------------
// taking a turn
// ---------------------------------------------------------------------------------------------------------------
/** Lay a computer player's hand out the way that scores best, so a lost round costs it only what it must. */
export function arrangeBot(state, seatId) {
  const p = state.players.find((x) => x.id === seatId);
  if (!p) return;
  const view = viewFor(state, seatId, () => true);
  const cards = p.groups.flat();
  const groups = bestArrangement(cards, view.wildRank, state.rules);
  arrangeHand(state, seatId, groups.map((g) => g.map((c) => c.id)));
}

/**
 * Play one action for a computer player: draw, take, discard, declare or drop. The decision is made from that
 * seat's own view only (see the note at the top). Returns the engine's result.
 */
export function runBotTurn(state, seatId, level, mem, rng = Math.random) {
  const view = viewFor(state, seatId, () => true);
  observe(mem, view);
  const act = chooseAction(view, level, mem, rng);
  let result;
  switch (act.a) {
    case 'drop': result = dropPlayer(state, seatId); break;
    case 'draw': result = drawFromStock(state, seatId); break; // the engine shuffles with secureRandom
    case 'take': result = drawFromDiscard(state, seatId); break;
    case 'discard': result = discardCard(state, seatId, act.card); break;
    case 'declare': result = declare(state, seatId, act.card, act.groups); break;
    default: result = { ok: false, error: 'unknown action' };
  }
  if (result.ok && (act.a === 'discard' || act.a === 'take' || act.a === 'draw')) {
    const p = state.players.find((x) => x.id === seatId);
    if (p && !p.out && state.phase === 'playing') arrangeBot(state, seatId);
  }
  return { ...result, action: act };
}

export { isPrintedJoker };
