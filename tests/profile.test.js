import { describe, expect, it } from './harness.js';
import { DEFAULT_RULES } from '../assets/games/engine.js?v=2';
import { loadBoard, loadVsComputer, loadProfile, profileSnapshot, subscribeProfile, rankBoard, refund, settle, topUp, START_COINS, REFILL_TO } from '../assets/games/profile.js?v=2';
const mem = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
};
function view(over = {}) {
    const { bet = 50, ...rest } = over;
    return {
        gameId: 'g1',
        rules: { ...DEFAULT_RULES, bet },
        pot: bet * 3,
        payouts: null,
        wildHidden: false,
        phase: 'playing',
        round: 1,
        totalRounds: 1,
        you: 'p1',
        players: [
            { id: 'p1', pid: 'pid-me', name: 'Me', cards: 13, out: false, total: 0, connected: true },
            { id: 'p2', pid: 'pid-ravi', name: 'Ravi', cards: 13, out: false, total: 40, connected: true },
            { id: 'p3', pid: 'pid-meera', name: 'Meera', cards: 13, out: false, total: 60, connected: true },
        ],
        turn: 'p1', step: 'draw', stockCount: 0, discardTop: [], discardCount: 0, wildCard: null, wildRank: 0,
        myGroups: [], myKinds: [], myPoints: 0, iHaveDrawn: false, log: [], results: [],
        ...rest,
    };
}
describe('wallet', () => {
    it('creates a profile once and keeps it', () => {
        const s = mem();
        const a = loadProfile(s);
        expect(a.coins).toBe(START_COINS);
        expect(loadProfile(s).pid).toBe(a.pid);
    });
    it('takes the bet once, however many updates arrive', () => {
        const s = mem();
        settle(view(), s);
        settle(view(), s);
        settle(view({ round: 2 }), s);
        expect(loadProfile(s).coins).toBe(START_COINS - 50);
    });
    it('pays the winner once at game over and records the leaderboard', () => {
        const s = mem();
        const over = view({ phase: 'game-over', payouts: { p1: 150, p2: 0, p3: 0 } });
        settle(view(), s);
        settle(over, s);
        settle(over, s);
        expect(loadProfile(s).coins).toBe(START_COINS - 50 + 150);
        const board = loadBoard(s);
        expect(board).toHaveLength(3);
        const me = board.find((e) => e.pid === 'pid-me');
        expect(me).toMatchObject({ games: 1, wins: 1, points: 0, coinsNet: 100 });
        expect(board.find((e) => e.pid === 'pid-ravi')).toMatchObject({ wins: 0, coinsNet: -50 });
    });
    it('a player who joins late still pays and is paid correctly', () => {
        const s = mem();
        settle(view({ phase: 'game-over', payouts: { p1: 0, p2: 150, p3: 0 } }), s);
        expect(loadProfile(s).coins).toBe(START_COINS - 50);
    });
    it('refunds the bet if the room dies before a result, but not after a payout', () => {
        const s = mem();
        settle(view(), s);
        refund('g1', 50, s);
        expect(loadProfile(s).coins).toBe(START_COINS);
        refund('g1', 50, s); // second refund does nothing
        expect(loadProfile(s).coins).toBe(START_COINS);
        settle(view({ gameId: 'g2', phase: 'game-over', payouts: { p1: 150, p2: 0, p3: 0 } }), s);
        refund('g2', 50, s);
        expect(loadProfile(s).coins).toBe(START_COINS + 100);
    });
    it('never goes below zero, and a broke player can top up', () => {
        const s = mem();
        const p = loadProfile(s);
        p.coins = 20;
        s.setItem('games.profile.v1', JSON.stringify(p));
        settle(view({ bet: 500 }), s);
        expect(loadProfile(s).coins).toBe(0);
        expect(topUp(s).coins).toBe(REFILL_TO);
        expect(topUp(s).coins).toBe(REFILL_TO); // not broke any more: unchanged
    });
    it('a free game (no bet) still counts on the leaderboard', () => {
        const s = mem();
        settle(view({ bet: 0, phase: 'game-over', payouts: { p1: 0, p2: 0, p3: 0 } }), s);
        expect(loadProfile(s).coins).toBe(START_COINS);
        expect(loadBoard(s).find((e) => e.pid === 'pid-me').wins).toBe(1);
    });
});
describe('without browser storage', () => {
    it('keeps one consistent profile for the session instead of making a new one each call', () => {
        const a = loadProfile();
        expect(loadProfile().pid).toBe(a.pid);
        settle(view({ gameId: 'private-mode', bet: 50 }));
        expect(loadProfile().coins).toBe(a.coins - 50);
    });
});
describe('wallet snapshot for the UI', () => {
    it('is stable between changes and refreshes after a save, even with nobody subscribed', () => {
        // Tests have no browser storage, so this exercises the in-memory fallback used in private browsing.
        const a = profileSnapshot();
        expect(profileSnapshot()).toBe(a);
        let calls = 0;
        const off = subscribeProfile(() => { calls++; });
        topUp(); // not broke: no change, no notification
        expect(calls).toBe(0);
        off();
        // A change made while nothing is subscribed must still invalidate the cache.
        const s = mem();
        settle(view({ bet: 0, gameId: 'snap' }), s);
        expect(profileSnapshot()).not.toBe(a);
    });
});
describe('leaderboard ranking', () => {
    it('orders by wins, then win rate, then average points', () => {
        const e = (pid, games, wins, points) => ({ pid, name: pid, games, wins, points, coinsNet: 0, lastPlayed: 0 });
        const ranked = rankBoard([e('a', 4, 1, 100), e('b', 2, 2, 50), e('c', 2, 1, 10), e('d', 4, 2, 100)]).map((x) => x.pid);
        expect(ranked).toEqual(['b', 'd', 'c', 'a']);
    });
});

describe('games against the computer', () => {
  const botView = (over = {}) => view({
    bet: 0, phase: 'game-over', payouts: { p1: 0, p2: 0, p3: 0 },
    players: [
      { id: 'p1', pid: 'pid-me', name: 'Me', cards: 13, out: false, total: 0, connected: true },
      { id: 'p2', pid: 'bot:2', name: 'Aarav', cards: 13, out: false, total: 40, connected: true, bot: true, level: 'hard' },
      { id: 'p3', pid: 'bot:3', name: 'Diya', cards: 13, out: false, total: 60, connected: true, bot: true, level: 'hard' },
    ],
    ...over,
  });

  it('are not added to the friends leaderboard, and keep a record per level instead', () => {
    const s = mem();
    settle(botView({ gameId: 'c1' }), s);
    expect(loadBoard(s)).toHaveLength(0);
    expect(loadVsComputer(s)).toEqual({ hard: { games: 1, wins: 1 } });
  });

  it('record a loss too, once per game however many updates arrive', () => {
    const s = mem();
    const lost = botView({ gameId: 'c2', players: botView().players.map((p) => (p.id === 'p1' ? { ...p, total: 90 } : p)) });
    settle(lost, s); settle(lost, s);
    expect(loadVsComputer(s)).toEqual({ hard: { games: 1, wins: 0 } });
  });

  it('never touch the wallet', () => {
    const s = mem();
    settle(botView({ gameId: 'c3' }), s);
    expect(loadProfile(s).coins).toBe(START_COINS);
  });
});
