import { describe, expect, it } from './harness.js';
import { createHash } from 'node:crypto';
import { loadScript } from './apps-script-fakes.js';

const sha10 = (pid) => createHash('sha256').update(pid).digest('hex').slice(0, 10);
let n = 0;
const gid = () => `game-${String(++n).padStart(6, '0')}-abcdefghij`;
const online = (over = {}) => ({
  id: gid(), mode: 'online', rounds: 3,
  players: [
    { pid: 'pid-a', name: 'Asha', total: 20, bot: false, net: 100 },
    { pid: 'pid-b', name: 'Ravi', total: 60, bot: false, net: -50 },
    { pid: 'pid-c', name: 'Meera', total: 75, bot: false, net: -50 },
  ],
  ...over,
});
const vsComputer = (level = 'hard', total = 10, over = {}) => ({
  id: gid(), mode: 'computer', rounds: 3,
  players: [
    { pid: 'pid-a', name: 'Asha', total, bot: false, net: 0 },
    { pid: 'bot:2', name: 'Aarav', total: 40, bot: true, level, net: 0 },
    { pid: 'bot:3', name: 'Diya', total: 55, bot: true, level, net: 0 },
  ],
  ...over,
});
const fresh = () => { const s = loadScript(); s.ctx.setup(); return s; };

describe('games backend: writing', () => {
  it('setup creates the tabs and removes the empty default sheet', () => {
    const s = fresh();
    expect(s.sheets.map((x) => x.name)).toEqual(['Games', 'Results', 'Leaderboard', 'VsComputer']);
  });

  it('stores a finished online game as history plus one result per player', () => {
    const s = fresh();
    expect(s.post({ action: 'submit', game: online() }).ok).toBe(true);
    expect(s.sheet('Games').getLastRow()).toBe(2); // header + 1
    expect(s.sheet('Results').getLastRow()).toBe(4); // header + 3 players
    const hist = JSON.parse(s.sheet('Games').rows[1][6]);
    expect(hist.map((p) => p.name)).toEqual(['Asha', 'Ravi', 'Meera']);
    expect(hist[0].won).toBe(true);
  });

  it('never stores the raw player id, only a short hash', () => {
    const s = fresh();
    s.post({ action: 'submit', game: online() });
    const dump = JSON.stringify([s.sheet('Games').rows, s.sheet('Results').rows]);
    expect(dump.includes('pid-a')).toBe(false);
    expect(s.sheet('Results').rows[1][4]).toBe(sha10('pid-a'));
  });

  it('computes who won itself, ignoring what the client claims', () => {
    const s = fresh();
    const g = online();
    g.players[1].won = true; g.players[0].won = false; // lies
    s.post({ action: 'submit', game: g });
    const rows = s.sheet('Results').rows.slice(1);
    expect(rows.map((r) => r[7])).toEqual([1, 0, 0]); // Asha (20) is the lowest
  });

  it('counts the same game once, however many times it is sent', () => {
    const s = fresh();
    const g = online();
    expect(s.post({ action: 'submit', game: g }).duplicate).toBeUndefined();
    expect(s.post({ action: 'submit', game: g }).duplicate).toBe(true);
    expect(s.sheet('Games').getLastRow()).toBe(2);
    expect(s.sheet('Results').getLastRow()).toBe(4);
  });

  it('rejects results that do not make sense', () => {
    const s = fresh();
    const bad = (mut, why) => { const g = online(); mut(g); const r = s.post({ action: 'submit', game: g }); expect(r.ok).toBe(false); expect(r.error).toBe(why); };
    bad((g) => { g.players[0].net = 500; }, 'coins'); // the pot must add up to zero
    bad((g) => { g.players.pop(); }, 'players'); // fewer than three
    bad((g) => { g.players[0].total = -3; }, 'player');
    bad((g) => { g.players[0].total = 99999; }, 'player');
    bad((g) => { g.rounds = 50; }, 'rounds');
    bad((g) => { g.id = 'short'; }, 'id');
    bad((g) => { g.mode = 'chess'; }, 'mode');
    bad((g) => { g.players[1].pid = g.players[0].pid; }, 'duplicate');
    bad((g) => { g.players[0].name = 'visit http://spam.example'; }, 'links');
    bad((g) => { g.players[0].bot = true; g.players[0].level = 'hard'; }, 'mode'); // online games have only people
    expect(s.sheet('Games').getLastRow()).toBe(1);
  });

  it('accepts a game against the computer only with one person, bots of one level, and no coins', () => {
    const s = fresh();
    expect(s.post({ action: 'submit', game: vsComputer('pro') }).ok).toBe(true);
    const row = s.sheet('Games').rows[1];
    expect(row[2]).toBe('computer');
    expect(row[3]).toBe('pro');
    expect(s.sheet('Results').getLastRow()).toBe(2); // only the person gets a result row
    const g2 = vsComputer('easy'); g2.players[1].level = 'hard';
    expect(s.post({ action: 'submit', game: g2 }).error).toBe('level');
    const g3 = vsComputer('easy'); g3.players[0].net = 40;
    expect(s.post({ action: 'submit', game: g3 }).error).toBe('coins');
    const g4 = vsComputer('easy'); g4.players[1].bot = false;
    expect(s.post({ action: 'submit', game: g4 }).error).toBe('mode');
  });

  it('can never run a name as a spreadsheet formula', () => {
    const s = fresh();
    const g = online(); g.players[0].name = '=HYPERLINK("x")';
    s.post({ action: 'submit', game: g });
    expect(s.sheet('Results').rows[1][5].startsWith("'=")).toBe(true);
  });

  it('stops a flood: a player can only be named in so many games an hour', () => {
    const s = fresh();
    let refused = 0;
    for (let i = 0; i < 40; i++) if (s.post({ action: 'submit', game: online() }).error === 'busy') refused++;
    expect(refused).toBe(10); // 30 allowed per player per hour
  });

  it('ignores bots and honeypot posts', () => {
    const s = fresh();
    expect(s.post({ action: 'submit', website: 'x', game: online() }).ok).toBe(true);
    expect(s.sheet('Games').getLastRow()).toBe(1);
    expect(s.post({ action: 'nope' }).ok).toBe(false);
  });
});

describe('games backend: reading', () => {
  const play = (s, winnerPid, mode = 'online') => {
    const g = online();
    const order = [['pid-a', 'Asha'], ['pid-b', 'Ravi'], ['pid-c', 'Meera']];
    g.players = order.map(([pid, name]) => ({ pid, name, total: pid === winnerPid ? 10 : 70, bot: false, net: pid === winnerPid ? 100 : -50 }));
    s.post({ action: 'submit', game: g });
  };

  it('ranks by wins, then win rate, then average points, and returns hashes not ids', () => {
    const s = fresh();
    play(s, 'pid-a'); play(s, 'pid-a'); play(s, 'pid-b');
    const r = s.get({ action: 'leaderboard' });
    expect(r.ok).toBe(true);
    expect(r.board.map((p) => p.name)).toEqual(['Asha', 'Ravi', 'Meera']);
    expect(r.board[0]).toMatchObject({ games: 3, wins: 2, h: sha10('pid-a') });
    expect(r.board[0].coins).toBe(100 + 100 - 50);
    expect(JSON.stringify(r).includes('pid-a')).toBe(false);
  });

  it('keeps people playing the computer off the online board and ranks them by level', () => {
    const s = fresh();
    s.post({ action: 'submit', game: vsComputer('easy', 5) });
    s.post({ action: 'submit', game: vsComputer('pro', 5) });
    const r = s.get({ action: 'leaderboard' });
    expect(r.board).toHaveLength(0);
    expect(r.computer.map((c) => c.level)).toEqual(['pro', 'easy']); // hardest first
    expect(r.computer[0]).toMatchObject({ games: 1, wins: 1 });
  });

  it('rebuilds the readable Leaderboard and VsComputer tabs after each game', () => {
    const s = fresh();
    play(s, 'pid-b');
    s.post({ action: 'submit', game: vsComputer('hard', 5) });
    expect(s.sheet('Leaderboard').rows[0][1]).toBe('name');
    expect(s.sheet('Leaderboard').rows[1][1]).toBe('Ravi');
    expect(s.sheet('VsComputer').rows[1][0]).toBe('hard');
  });

  it('a hidden row leaves the leaderboard (and the history)', () => {
    const s = fresh();
    play(s, 'pid-a');
    s.cacheStore.clear();
    s.sheet('Results').rows[1][10] = true; // hide Asha's result
    s.sheet('Games').rows[1][7] = 'TRUE';
    const r = s.get({ action: 'leaderboard' });
    expect(r.board.map((p) => p.name).includes('Asha')).toBe(false);
    expect(s.get({ action: 'recent' }).games).toHaveLength(0);
  });

  it('lists recent games newest first, and one player\'s own games by hash', () => {
    const s = fresh();
    play(s, 'pid-a'); play(s, 'pid-b'); play(s, 'pid-b');
    const all = s.get({ action: 'recent', limit: 2 }).games;
    expect(all).toHaveLength(2);
    expect(all[0].players.find((p) => p.won).name).toBe('Ravi');
    const mine = s.get({ action: 'recent', h: sha10('pid-a'), limit: 10 }).games;
    expect(mine).toHaveLength(3); // pid-a played all three
    expect(s.get({ action: 'recent', h: sha10('pid-zzz'), limit: 10 }).games).toHaveLength(0);
    expect(s.get({ action: 'recent', h: 'not-a-hash' }).games).toHaveLength(3); // a malformed filter is ignored
  });

  it('serves the board from cache for a minute, and a new game refreshes it', () => {
    const s = fresh();
    play(s, 'pid-a');
    const a = s.get({ action: 'leaderboard' });
    play(s, 'pid-b');
    const b = s.get({ action: 'leaderboard' });
    expect(b.board.find((p) => p.name === 'Ravi').wins).toBe(1); // cache was cleared by the submit
    expect(a.board.find((p) => p.name === 'Ravi').wins).toBe(0);
  });
});
