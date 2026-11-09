/**
 * 13-card Indian Rummy (Points Rummy) rules engine. Pure functions only: no UI, no network, no randomness
 * except the injectable `rng`, so every rule can be unit tested.
 *
 * Rules implemented
 * - 3 to 6 players, two 52-card decks plus 4 printed jokers (108 cards), 13 cards each.
 * - One card is cut from the stock as the "wild joker" rank. Every card of that rank plus the printed jokers are jokers.
 * - On your turn: draw from the stock or take the top of the discard pile, then discard one card.
 * - To declare: discard one finishing card and arrange the other 13 into groups. You need at least two sequences,
 *   and at least one of them must be pure (no joker). Remaining groups can be sequences or sets.
 * - A wrong declaration is penalised and you are out of the round.
 * - Drop: a smaller penalty before your first draw, a larger one after that. A drop takes you out of the round.
 * - Losers score the value of their cards that are not in valid groups, capped. The lowest total after the
 *   chosen number of rounds wins.
 * - The host can change the table rules (see `Rules`): open or closed joker, allowed hand shapes, joker limit,
 *   penalties and an entry bet in virtual coins.
 */
export const SUITS = ['S', 'H', 'D', 'C'];
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 6;
export const HAND_SIZE = 13;
export const LAYOUTS = [
    { id: 'any', label: 'Any valid groups', shapes: null },
    { id: '4333', label: '4 + 3 + 3 + 3', shapes: ['4-3-3-3'] },
    { id: '544', label: '5 + 4 + 4', shapes: ['5-4-4'] },
    { id: '4333-544', label: '4 + 3 + 3 + 3  or  5 + 4 + 4', shapes: ['4-3-3-3', '5-4-4'] },
    { id: '553', label: '5 + 5 + 3', shapes: ['5-5-3'] },
    { id: '643', label: '6 + 4 + 3', shapes: ['6-4-3'] },
];
export const BET_OPTIONS = [0, 10, 25, 50, 100, 250, 500];
export const ROUND_OPTIONS = [1, 2, 3, 5, 7, 10];
export const DEFAULT_RULES = {
    rounds: 3,
    jokerMode: 'open',
    layout: 'any',
    maxJokers: 0,
    firstDrop: 20,
    middleDrop: 40,
    wrongDeclare: 80,
    maxPoints: 80,
    bet: 0,
};
const clampInt = (v, lo, hi, fallback) => {
    const n = typeof v === 'number' ? Math.floor(v) : Number.NaN;
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};
/** Merge a partial change into a rule set, clamping everything so a bad client message cannot break the game. */
export function sanitizeRules(raw, base = DEFAULT_RULES) {
    const r = { ...base };
    if (raw.rounds !== undefined)
        r.rounds = clampInt(raw.rounds, 1, 10, base.rounds);
    if (raw.jokerMode === 'open' || raw.jokerMode === 'closed')
        r.jokerMode = raw.jokerMode;
    if (typeof raw.layout === 'string' && LAYOUTS.some((l) => l.id === raw.layout))
        r.layout = raw.layout;
    if (raw.maxJokers !== undefined)
        r.maxJokers = clampInt(raw.maxJokers, 0, 4, base.maxJokers);
    if (raw.firstDrop !== undefined)
        r.firstDrop = clampInt(raw.firstDrop, 0, 100, base.firstDrop);
    if (raw.middleDrop !== undefined)
        r.middleDrop = clampInt(raw.middleDrop, 0, 100, base.middleDrop);
    if (raw.wrongDeclare !== undefined)
        r.wrongDeclare = clampInt(raw.wrongDeclare, 0, 200, base.wrongDeclare);
    if (raw.maxPoints !== undefined)
        r.maxPoints = clampInt(raw.maxPoints, 20, 200, base.maxPoints);
    if (raw.bet !== undefined && BET_OPTIONS.includes(raw.bet))
        r.bet = raw.bet;
    // A middle drop is never cheaper than a first drop.
    if (r.middleDrop < r.firstDrop)
        r.middleDrop = r.firstDrop;
    return r;
}
export function layoutOf(rules) {
    return LAYOUTS.find((l) => l.id === rules.layout) ?? LAYOUTS[0];
}
/** "4-3-3-3": the group sizes of an arrangement, largest first. */
export function shapeOf(groups) {
    return groups.map((g) => g.length).sort((a, b) => b - a).join('-');
}
export function shapeAllowed(groups, rules) {
    const { shapes } = layoutOf(rules);
    return shapes === null || shapes.includes(shapeOf(groups));
}
export function buildShoe() {
    const cards = [];
    let id = 0;
    for (let deck = 0; deck < 2; deck++) {
        for (const suit of SUITS)
            for (let rank = 1; rank <= 13; rank++)
                cards.push({ id: id++, rank, suit });
        cards.push({ id: id++, rank: 0, suit: null }, { id: id++, rank: 0, suit: null });
    }
    return cards;
}
/**
 * A uniform random number in [0, 1) from the browser's cryptographic generator. Every shuffle uses this, so the
 * order of the stock is unpredictable and independent of who is playing, human or computer. (Tests pass a seeded
 * generator instead.)
 */
export function secureRandom() {
    const c = globalThis.crypto;
    if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    return Math.random();
}
export function shuffle(items, rng = secureRandom) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export function isPrintedJoker(c) {
    return c.rank === 0;
}
/** A joker is a printed joker or any card of the wild rank. `wildRank` 0 means "no wild rank yet". */
export function isJoker(c, wildRank) {
    return c.rank === 0 || (wildRank > 0 && c.rank === wildRank);
}
/** Face value for scoring. Jokers (printed or wild rank) are worth nothing. */
export function cardPoints(c, wildRank) {
    if (isJoker(c, wildRank))
        return 0;
    return c.rank >= 10 || c.rank === 1 ? 10 : c.rank;
}
/** Pure sequence: 3+ cards of one suit in consecutive order, no printed jokers, no substitutions. A can be low or high. */
export function isPureSequence(cards) {
    if (cards.length < 3)
        return false;
    if (cards.some(isPrintedJoker))
        return false;
    const suit = cards[0].suit;
    if (cards.some((c) => c.suit !== suit))
        return false;
    return fitsRun(cards.map((c) => c.rank), cards.length);
}
/** Sequence that may use jokers: 3+ cards, the natural cards share a suit and fit one consecutive run. */
export function isSequence(cards, wildRank, maxJokers = 0) {
    if (cards.length < 3)
        return false;
    if (tooManyJokers(cards, wildRank, maxJokers))
        return false;
    const naturals = cards.filter((c) => !isJoker(c, wildRank));
    if (naturals.length === 0)
        return true;
    const suit = naturals[0].suit;
    if (naturals.some((c) => c.suit !== suit))
        return false;
    return fitsRun(naturals.map((c) => c.rank), cards.length);
}
/** Table rule: at most `max` jokers in one group (0 = no limit). Any wild-rank card counts as a joker here. */
function tooManyJokers(cards, wildRank, max) {
    return max > 0 && cards.filter((c) => isJoker(c, wildRank)).length > max;
}
/**
 * Can these ranks sit inside one run of `length` consecutive positions? Ace is position 1 or 14
 * (A-2-3 and Q-K-A are fine, K-A-2 is not). Each rank may appear once.
 */
function fitsRun(ranks, length) {
    if (new Set(ranks).size !== ranks.length)
        return false;
    const aces = ranks.filter((r) => r === 1).length;
    const others = ranks.filter((r) => r !== 1);
    // At most one ace (distinct ranks), placed low (1) or high (14).
    for (const aceAt of aces ? [1, 14] : [0]) {
        const positions = aces ? [...others, aceAt] : others;
        const lo = Math.min(...positions);
        const hi = Math.max(...positions);
        if (hi - lo + 1 > length)
            continue;
        // Some window of `length` positions inside 1..14 must cover [lo, hi].
        const start = Math.max(1, hi - length + 1);
        if (start <= lo && start + length - 1 <= 14)
            return true;
    }
    return false;
}
/** Set: 3 or 4 cards of one rank, all different suits. Jokers stand in for any missing card. */
export function isSet(cards, wildRank, maxJokers = 0) {
    if (cards.length < 3 || cards.length > 4)
        return false;
    if (tooManyJokers(cards, wildRank, maxJokers))
        return false;
    const naturals = cards.filter((c) => !isJoker(c, wildRank));
    if (naturals.length === 0)
        return true;
    const rank = naturals[0].rank;
    if (naturals.some((c) => c.rank !== rank))
        return false;
    return new Set(naturals.map((c) => c.suit)).size === naturals.length;
}
export function classifyGroup(cards, wildRank, maxJokers = 0) {
    if (isPureSequence(cards))
        return 'pure';
    if (isSequence(cards, wildRank, maxJokers))
        return 'sequence';
    if (isSet(cards, wildRank, maxJokers))
        return 'set';
    return 'invalid';
}
/**
 * Evaluate a set of groups. Sets only count once the hand has a pure sequence and a second sequence; before that
 * they are dead cards. Without a pure sequence the whole hand counts.
 */
export function evaluateHand(groups, wildRank, rules = DEFAULT_RULES) {
    const kinds = groups.map((g) => classifyGroup(g, wildRank, rules.maxJokers));
    const pureCount = kinds.filter((k) => k === 'pure').length;
    const sequenceCount = pureCount + kinds.filter((k) => k === 'sequence').length;
    const setsCount = sequenceCount >= 2 && pureCount >= 1;
    let points = 0;
    groups.forEach((g, i) => {
        const k = kinds[i];
        let live = false;
        if (pureCount >= 1)
            live = k === 'pure' || k === 'sequence' || (k === 'set' && setsCount);
        if (!live)
            points += g.reduce((s, c) => s + cardPoints(c, wildRank), 0);
    });
    const complete = pureCount >= 1 && sequenceCount >= 2 && kinds.every((k) => k !== 'invalid');
    return { kinds, pureCount, sequenceCount, complete, points: complete ? 0 : Math.min(points, rules.maxPoints) };
}
function note(state, text) {
    state.log.push(text);
    if (state.log.length > 40)
        state.log.splice(0, state.log.length - 40);
}
export function newGame(seats, rules = DEFAULT_RULES, opts = {}) {
    const rng = opts.rng ?? secureRandom;
    if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) {
        throw new Error(`Rummy needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`);
    }
    const clean = sanitizeRules(rules, DEFAULT_RULES);
    const state = {
        gameId: opts.gameId ?? globalThis.crypto.randomUUID(),
        rules: clean,
        phase: 'playing',
        round: 0,
        totalRounds: clean.rounds,
        pot: clean.bet * seats.length,
        payouts: null,
        players: seats.map((s) => ({
            id: s.id, name: s.name, pid: s.pid ?? s.id, bot: !!s.bot, level: s.level, sawWild: false, groups: [], out: false, hasDrawn: false, roundPoints: 0, total: 0,
        })),
        dealerIndex: -1,
        turn: 0,
        step: 'draw',
        stock: [],
        discard: [],
        wildCard: null,
        wildRank: 0,
        log: [],
        results: [],
    };
    dealRound(state, rng);
    return state;
}
/** Shuffle, deal 13 each, cut the wild joker and open the first discard. Dealer rotates each round. */
export function dealRound(state, rng = secureRandom) {
    const n = state.players.length;
    state.round += 1;
    state.phase = 'playing';
    state.dealerIndex = (state.dealerIndex + 1) % n;
    let stock = shuffle(buildShoe(), rng);
    for (const p of state.players) {
        p.groups = [];
        p.out = false;
        p.outReason = undefined;
        p.hasDrawn = false;
        p.sawWild = false;
        p.roundPoints = 0;
    }
    for (const p of state.players)
        p.groups = [stock.splice(0, HAND_SIZE)];
    // The cut joker cannot be a printed joker: slide those to the bottom until a normal card is on top.
    while (stock[0].rank === 0)
        stock = [...stock.slice(1), stock[0]];
    const wildCard = stock.shift();
    state.wildCard = wildCard;
    state.wildRank = wildCard.rank;
    state.discard = [stock.shift()];
    state.stock = stock;
    state.turn = (state.dealerIndex + 1) % n;
    state.step = 'draw';
    state.log = [];
    note(state, state.rules.jokerMode === 'open'
        ? `Round ${state.round} dealt. Wild joker is ${rankName(wildCard.rank)}.`
        : `Round ${state.round} dealt. The wild joker is hidden: make a pure sequence to see it.`);
}
export function rankName(rank) {
    return rank === 0 ? 'Joker' : rank === 1 ? 'Ace' : rank === 11 ? 'Jack' : rank === 12 ? 'Queen' : rank === 13 ? 'King' : String(rank);
}
export function handCards(p) {
    return p.groups.flat();
}
const fail = (error) => ({ ok: false, error });
const OK = { ok: true };
function playerIndex(state, id) {
    return state.players.findIndex((p) => p.id === id);
}
function activeCount(state) {
    return state.players.filter((p) => !p.out).length;
}
/** Index of the next player still in the round after `from`. */
function nextActive(state, from) {
    const n = state.players.length;
    for (let i = 1; i <= n; i++) {
        const idx = (from + i) % n;
        if (!state.players[idx].out)
            return idx;
    }
    return from;
}
function checkTurn(state, id, step) {
    if (state.phase !== 'playing')
        return fail('The round is not in progress.');
    const idx = playerIndex(state, id);
    if (idx < 0)
        return fail('You are not in this game.');
    if (state.players[idx].out)
        return fail('You are out of this round.');
    if (idx !== state.turn)
        return fail('It is not your turn.');
    if (state.step !== step)
        return fail(step === 'draw' ? 'Discard a card first.' : 'Draw a card first.');
    return OK;
}
/** Put a freshly drawn card in its own group at the end, so the player can see what they picked up. */
function receive(p, card) {
    p.groups.push([card]);
    p.hasDrawn = true;
}
export function drawFromStock(state, id, rng = secureRandom) {
    const check = checkTurn(state, id, 'draw');
    if (!check.ok)
        return check;
    if (state.stock.length === 0) {
        // Recycle the discard pile (keep its top card showing).
        if (state.discard.length <= 1)
            return fail('No cards left to draw.');
        const top = state.discard[state.discard.length - 1];
        state.stock = shuffle(state.discard.slice(0, -1), rng);
        state.discard = [top];
        note(state, 'The stock ran out and was refilled from the discard pile.');
    }
    const p = state.players[state.turn];
    receive(p, state.stock.shift());
    state.step = 'discard';
    return OK;
}
export function drawFromDiscard(state, id) {
    const check = checkTurn(state, id, 'draw');
    if (!check.ok)
        return check;
    const card = state.discard.pop();
    if (!card)
        return fail('The discard pile is empty.');
    const p = state.players[state.turn];
    receive(p, card);
    state.step = 'discard';
    return OK;
}
export function discardCard(state, id, cardId) {
    const check = checkTurn(state, id, 'discard');
    if (!check.ok)
        return check;
    const p = state.players[state.turn];
    const card = removeCard(p, cardId);
    if (!card)
        return fail('That card is not in your hand.');
    unlockJoker(state, p);
    state.discard.push(card);
    state.turn = nextActive(state, state.turn);
    state.step = 'draw';
    return OK;
}
function removeCard(p, cardId) {
    for (let g = 0; g < p.groups.length; g++) {
        const i = p.groups[g].findIndex((c) => c.id === cardId);
        if (i >= 0) {
            const [card] = p.groups[g].splice(i, 1);
            if (p.groups[g].length === 0)
                p.groups.splice(g, 1);
            return card;
        }
    }
    return null;
}
/** Replace a player's grouping. Must contain exactly the same cards. Allowed any time, including off turn. */
export function arrangeHand(state, id, groups) {
    const idx = playerIndex(state, id);
    if (idx < 0)
        return fail('You are not in this game.');
    const p = state.players[idx];
    if (state.phase === 'game-over')
        return fail('The game is over.');
    const byId = new Map(handCards(p).map((c) => [c.id, c]));
    const seen = new Set();
    const next = [];
    for (const g of groups) {
        const row = [];
        for (const cid of g) {
            const c = byId.get(cid);
            if (!c || seen.has(cid))
                return fail('That arrangement does not match your hand.');
            seen.add(cid);
            row.push(c);
        }
        if (row.length)
            next.push(row);
    }
    if (seen.size !== byId.size)
        return fail('That arrangement does not match your hand.');
    p.groups = next;
    unlockJoker(state, p);
    return OK;
}
/** Closed joker: holding a pure sequence ("a life") lets a player see the wild joker for the rest of the round. */
function unlockJoker(state, p) {
    if (state.rules.jokerMode === 'closed' && !p.sawWild && p.groups.some(isPureSequence))
        p.sawWild = true;
}
/** Whether this player may be told the wild joker right now. Everyone sees it once the round is over. */
export function canSeeWild(state, p) {
    return state.rules.jokerMode === 'open' || p.sawWild || state.phase !== 'playing';
}
export function dropPlayer(state, id, reason = 'manual') {
    const check = checkTurn(state, id, 'draw');
    if (!check.ok)
        return check;
    const idx = state.turn;
    const p = state.players[idx];
    const middle = p.hasDrawn;
    const penalty = middle ? state.rules.middleDrop : state.rules.firstDrop;
    p.out = true;
    p.outReason = middle ? 'middle-drop' : 'drop';
    p.roundPoints = penalty;
    note(state, `${p.name} ${reason === 'auto' ? 'was dropped (disconnected)' : 'dropped'}: ${penalty} points.`);
    return afterPlayerOut(state, idx);
}
/** After someone leaves the round: if one player is left they win by default, otherwise play moves on. */
function afterPlayerOut(state, idx) {
    if (activeCount(state) <= 1) {
        const winner = state.players.find((p) => !p.out);
        finishRound(state, winner.id, null);
    }
    else {
        state.turn = nextActive(state, idx);
        state.step = 'draw';
    }
    return OK;
}
/**
 * Declare: discard `finishCardId` face down, then show the other 13 cards in `groups`. If the arrangement is a
 * valid winning hand the round ends and everyone else is scored on their own grouping. Otherwise the declarer
 * takes the 80 point penalty and is out.
 */
export function declare(state, id, finishCardId, groups) {
    const check = checkTurn(state, id, 'discard');
    if (!check.ok)
        return check;
    const idx = state.turn;
    const p = state.players[idx];
    const all = handCards(p);
    const finish = all.find((c) => c.id === finishCardId);
    if (!finish)
        return fail('Pick one of your cards to finish with.');
    const rest = all.filter((c) => c.id !== finishCardId);
    const byId = new Map(rest.map((c) => [c.id, c]));
    const seen = new Set();
    const arranged = [];
    for (const g of groups) {
        const row = [];
        for (const cid of g) {
            const c = byId.get(cid);
            if (!c || seen.has(cid))
                return fail('Your groups must use each remaining card exactly once.');
            seen.add(cid);
            row.push(c);
        }
        if (row.length)
            arranged.push(row);
    }
    if (seen.size !== rest.length)
        return fail('Your groups must use each remaining card exactly once.');
    const result = evaluateHand(arranged, state.wildRank, state.rules);
    if (result.complete && shapeAllowed(arranged, state.rules)) {
        p.groups = arranged;
        note(state, `${p.name} declared with a valid hand!`);
        finishRound(state, p.id, arranged);
        return OK;
    }
    p.groups = [...arranged, [finish]];
    p.out = true;
    p.outReason = 'wrong-declare';
    p.roundPoints = state.rules.wrongDeclare;
    note(state, `${p.name} declared wrongly: ${state.rules.wrongDeclare} points.`);
    return afterPlayerOut(state, idx);
}
function reasonText(p, isWinner, eval_) {
    if (isWinner)
        return 'Winner';
    if (p.outReason === 'drop')
        return 'Dropped (first drop)';
    if (p.outReason === 'middle-drop')
        return 'Dropped (middle drop)';
    if (p.outReason === 'wrong-declare')
        return 'Wrong declaration';
    if (eval_ && eval_.pureCount === 0)
        return 'No pure sequence';
    if (eval_ && eval_.sequenceCount < 2)
        return 'Needs a second sequence';
    return 'Cards left in hand';
}
function finishRound(state, winnerId, winningGroups) {
    const scores = [];
    for (const p of state.players) {
        const isWinner = p.id === winnerId;
        let eval_ = null;
        if (isWinner) {
            p.roundPoints = 0;
        }
        else if (!p.out) {
            eval_ = evaluateHand(p.groups, state.wildRank, state.rules);
            p.roundPoints = eval_.points;
        }
        p.total += p.roundPoints;
        scores.push({ id: p.id, name: p.name, points: p.roundPoints, reason: reasonText(p, isWinner, eval_), groups: p.groups });
    }
    const winner = state.players.find((p) => p.id === winnerId);
    state.results.push({ round: state.round, winnerId, winningGroups, scores });
    state.phase = state.round >= state.totalRounds ? 'game-over' : 'round-over';
    note(state, `${winner.name} wins round ${state.round}.`);
    if (state.phase === 'game-over')
        state.payouts = settlePot(state);
}
/** Split the pot among the player(s) with the lowest total. Any odd coins go to the earliest seats among them. */
function settlePot(state) {
    const out = Object.fromEntries(state.players.map((p) => [p.id, 0]));
    if (state.pot <= 0)
        return out;
    const best = Math.min(...state.players.map((p) => p.total));
    const winners = state.players.filter((p) => p.total === best);
    const share = Math.floor(state.pot / winners.length);
    let extra = state.pot - share * winners.length;
    for (const w of winners) {
        out[w.id] = share + (extra > 0 ? 1 : 0);
        if (extra > 0)
            extra -= 1;
    }
    return out;
}
/** Start the next round after a round-over screen. */
export function nextRound(state, rng = secureRandom) {
    if (state.phase !== 'round-over')
        return fail('There is no round to start.');
    dealRound(state, rng);
    return OK;
}
/** Standings at the end (or midway): lowest total first. */
export function standings(state) {
    return state.players.slice().sort((a, b) => a.total - b.total);
}
export function viewFor(state, id, connected) {
    const me = state.players.find((p) => p.id === id);
    const groups = me?.groups ?? [];
    const seesWild = me ? canSeeWild(state, me) : state.rules.jokerMode === 'open';
    const wildRank = seesWild ? state.wildRank : 0;
    const evaluated = evaluateHand(groups, wildRank, state.rules);
    return {
        gameId: state.gameId,
        rules: state.rules,
        pot: state.pot,
        payouts: state.payouts,
        wildHidden: !seesWild,
        phase: state.phase,
        round: state.round,
        totalRounds: state.totalRounds,
        you: id,
        players: state.players.map((p) => ({
            id: p.id,
            name: p.name,
            pid: p.pid,
            bot: p.bot,
            level: p.level,
            cards: handCards(p).length,
            out: p.out,
            outReason: p.outReason,
            total: p.total,
            connected: connected(p.id),
        })),
        turn: state.players[state.turn]?.id ?? '',
        step: state.step,
        stockCount: state.stock.length,
        discardTop: state.discard.slice(-6),
        discardCount: state.discard.length,
        wildCard: seesWild ? state.wildCard : null,
        wildRank,
        myGroups: groups,
        myKinds: evaluated.kinds,
        myPoints: evaluated.points,
        iHaveDrawn: me?.hasDrawn ?? false,
        log: state.log.slice(-12),
        results: state.results,
    };
}
