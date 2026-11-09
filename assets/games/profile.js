export const START_COINS = 1000;
/** A broke player can top up to this many coins so they are never locked out of playing. */
export const REFILL_TO = 500;
export const REFILL_BELOW = 100;
const PROFILE_KEY = 'games.profile.v1';
const BOARD_KEY = 'games.rummy.board.v1';
const LEDGER_LIMIT = 40;
/** Used when the browser blocks storage (private mode): the wallet then lasts for this tab only, but stays consistent. */
const memory = new Map();
const memoryStore = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); } };
function browserStore() {
    try {
        const ls = window.localStorage;
        ls.getItem(PROFILE_KEY); // throws if access is denied
        return ls;
    }
    catch {
        return memoryStore;
    }
}
const listeners = new Set();
export function subscribeProfile(fn) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
/** Cached copy for React (`useSyncExternalStore` needs a stable object between changes). Dropped on every save. */
let snapshot = null;
export function profileSnapshot() {
    return (snapshot ??= loadProfile());
}
const changed = () => {
    snapshot = null;
    listeners.forEach((fn) => fn());
};
export function loadProfile(store = browserStore()) {
    try {
        const raw = store?.getItem(PROFILE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            if (typeof p.pid === 'string' && typeof p.coins === 'number') {
                return { pid: p.pid, coins: Math.max(0, Math.floor(p.coins)), ledger: p.ledger && typeof p.ledger === 'object' ? p.ledger : {} };
            }
        }
    }
    catch { /* corrupt or blocked storage: start fresh */ }
    const fresh = { pid: globalThis.crypto.randomUUID(), coins: START_COINS, ledger: {} };
    saveProfile(fresh, store);
    return fresh;
}
export function saveProfile(p, store = browserStore()) {
    const keys = Object.keys(p.ledger);
    if (keys.length > LEDGER_LIMIT)
        for (const k of keys.slice(0, keys.length - LEDGER_LIMIT))
            delete p.ledger[k];
    try {
        store?.setItem(PROFILE_KEY, JSON.stringify(p));
    }
    catch { /* private mode: wallet lasts this tab only */ }
    changed();
}
/** Free coins for a player who has run out, so nobody is stuck on the sidelines. */
export function topUp(store = browserStore()) {
    const p = loadProfile(store);
    if (p.coins < REFILL_BELOW) {
        p.coins = REFILL_TO;
        saveProfile(p, store);
    }
    return p;
}
export function loadBoard(store = browserStore()) {
    try {
        const raw = store?.getItem(BOARD_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    }
    catch {
        return [];
    }
}
/** Best first: most wins, then best win rate, then fewest average points. */
export function rankBoard(entries) {
    return entries.slice().sort((a, b) => b.wins - a.wins || b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games) || a.points / Math.max(1, a.games) - b.points / Math.max(1, b.games));
}
function recordGame(view, store) {
    const best = Math.min(...view.players.map((p) => p.total));
    const board = loadBoard(store);
    for (const pl of view.players) {
        if (!pl.pid)
            continue;
        let e = board.find((x) => x.pid === pl.pid);
        if (!e) {
            e = { pid: pl.pid, name: pl.name, games: 0, wins: 0, points: 0, coinsNet: 0, lastPlayed: 0 };
            board.push(e);
        }
        e.name = pl.name;
        e.games += 1;
        if (pl.total === best)
            e.wins += 1;
        e.points += pl.total;
        e.coinsNet += (view.payouts?.[pl.id] ?? 0) - view.rules.bet;
        e.lastPlayed = Date.now();
    }
    try {
        store?.setItem(BOARD_KEY, JSON.stringify(board));
    }
    catch { /* ignore */ }
}
/**
 * Apply a game's money to this player's wallet. Safe to call on every update: the entry bet is taken once when the
 * game is first seen, and the winnings (and the leaderboard row) are applied once when it ends.
 */
export function settle(view, store = browserStore()) {
    const p = loadProfile(store);
    const state = p.ledger[view.gameId];
    let dirty = false;
    if (!state) {
        p.coins = Math.max(0, p.coins - view.rules.bet);
        p.ledger[view.gameId] = 'bet';
        dirty = true;
    }
    if (view.phase === 'game-over' && p.ledger[view.gameId] === 'bet') {
        p.coins += view.payouts?.[view.you] ?? 0;
        p.ledger[view.gameId] = 'done';
        recordGame(view, store);
        dirty = true;
    }
    if (dirty)
        saveProfile(p, store);
    return p;
}
/** The room ended because of the host before a result: give the entry bet back. */
export function refund(gameId, bet, store = browserStore()) {
    const p = loadProfile(store);
    if (p.ledger[gameId] === 'bet') {
        p.coins += bet;
        p.ledger[gameId] = 'refund';
        saveProfile(p, store);
    }
    return p;
}
