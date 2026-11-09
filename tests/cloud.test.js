import { beforeEach, describe, expect, it } from './harness.js';
import { buildSubmission, cloudEnabled, configureCloud, fetchBoards, fetchRecent, flushOutbox, pidHash, submitGame } from '../assets/games/cloud.js?v=4';
import { createHash } from 'node:crypto';

// a tiny in-memory localStorage / sessionStorage for these tests
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
beforeEach(() => { globalThis.window = { localStorage: mem(), sessionStorage: mem() }; configureCloud({ endpoint: 'https://script.example/exec' }); });

const reply = (obj) => async () => ({ json: async () => obj });
const game = (id = 'game-000001-abcdefghij') => ({ id, mode: 'online', rounds: 3, players: [] });

describe('cloud: configuration', () => {
  it('is off without an endpoint, and refuses anything that is not https', () => {
    configureCloud({});
    expect(cloudEnabled()).toBe(false);
    configureCloud({ endpoint: 'http://insecure.example/exec' });
    expect(cloudEnabled()).toBe(false);
    configureCloud({ endpoint: 'https://script.example/exec' });
    expect(cloudEnabled()).toBe(true);
    configureCloud({ endpoint: 'http://127.0.0.1:8899/exec' }); // a local test server is fine
    expect(cloudEnabled()).toBe(true);
  });
  it('does nothing when off', async () => {
    configureCloud({});
    let called = false;
    expect(await submitGame(game(), async () => { called = true; })).toBe(false);
    expect(called).toBe(false);
    expect(await fetchBoards(async () => { called = true; })).toBeNull();
    expect(called).toBe(false);
  });
});

describe('cloud: the record sent when a game ends', () => {
  const view = (over = {}) => ({
    gameId: 'g-123456789012345', totalRounds: 3, rules: { bet: 50 }, payouts: { p1: 150, p2: 0, p3: 0 },
    players: [
      { id: 'p1', pid: 'pid-1', name: 'Asha', total: 10, bot: false },
      { id: 'p2', pid: 'pid-2', name: 'Ravi', total: 40, bot: false },
      { id: 'p3', pid: 'pid-3', name: 'Meera', total: 60, bot: false },
    ], ...over,
  });
  it('an online game carries each player net coins, and they add up to zero', () => {
    const s = buildSubmission(view(), { isLocal: false });
    expect(s.mode).toBe('online');
    expect(s.players.map((p) => p.net)).toEqual([100, -50, -50]);
    expect(s.players.reduce((a, p) => a + p.net, 0)).toBe(0);
  });
  it('a game against the computer carries the level and no coins', () => {
    const v = view({
      rules: { bet: 0 }, payouts: { p1: 0, p2: 0, p3: 0 },
      players: [{ id: 'p1', pid: 'pid-1', name: 'Asha', total: 10, bot: false }, { id: 'p2', pid: 'bot:2', name: 'Aarav', total: 40, bot: true, level: 'hard' }, { id: 'p3', pid: 'bot:3', name: 'Diya', total: 60, bot: true, level: 'hard' }],
    });
    const s = buildSubmission(v, { isLocal: true });
    expect(s).toMatchObject({ mode: 'computer', level: 'hard' });
    expect(s.players.every((p) => p.net === 0)).toBe(true);
    expect(s.players[1]).toMatchObject({ bot: true, level: 'hard' });
  });
});

describe('cloud: sending', () => {
  it('sends a game once and remembers it was sent', async () => {
    let calls = 0;
    const f = async () => { calls++; return { json: async () => ({ ok: true }) }; };
    expect(await submitGame(game(), f)).toBe(true);
    expect(await submitGame(game(), f)).toBe(true);
    expect(calls).toBe(1);
  });

  it('sends plain text JSON (no preflight) with the submit action', async () => {
    let seen;
    await submitGame(game(), async (url, init) => { seen = { url, init }; return { json: async () => ({ ok: true }) }; });
    expect(seen.url).toBe('https://script.example/exec');
    expect(seen.init.headers['Content-Type']).toMatch(/text\/plain/);
    expect(JSON.parse(seen.init.body).action).toBe('submit');
  });

  it('keeps a game it could not send, and sends it later', async () => {
    expect(await submitGame(game('game-aaaaaaaa-bbbbbbbbbb'), async () => { throw new Error('offline'); })).toBe(false);
    expect(JSON.parse(globalThis.window.localStorage.getItem('games.outbox.v1'))).toHaveLength(1);
    let sent = 0;
    await flushOutbox(async () => { sent++; return { json: async () => ({ ok: true }) }; });
    expect(sent).toBe(1);
    expect(JSON.parse(globalThis.window.localStorage.getItem('games.outbox.v1'))).toHaveLength(0);
  });

  it('retries when the server is busy, but gives up on a record it refused as invalid', async () => {
    expect(await submitGame(game('game-busy0000-bbbbbbbbbb'), reply({ ok: false, error: 'busy' }))).toBe(false);
    expect(await submitGame(game('game-bad00000-bbbbbbbbbb'), reply({ ok: false, error: 'coins' }))).toBe(true); // final: do not queue
    const box = JSON.parse(globalThis.window.localStorage.getItem('games.outbox.v1'));
    expect(box.map((g) => g.id)).toEqual(['game-busy0000-bbbbbbbbbb']);
  });

  it('survives storage being blocked', async () => {
    globalThis.window = { get localStorage() { throw new Error('blocked'); }, get sessionStorage() { throw new Error('blocked'); } };
    expect(await submitGame(game(), reply({ ok: true }))).toBe(true);
  });
});

describe('cloud: reading', () => {
  it('fetches the board and caches it for a minute', async () => {
    let calls = 0;
    const f = async (url) => { calls++; expect(url).toMatch(/action=leaderboard/); return { json: async () => ({ ok: true, board: [{ name: 'Asha' }], computer: [] }) }; };
    const a = await fetchBoards(f, 1000);
    const b = await fetchBoards(f, 30_000);
    expect(a.board[0].name).toBe('Asha');
    expect(b).toEqual(a);
    expect(calls).toBe(1);
    await fetchBoards(f, 70_000);
    expect(calls).toBe(2);
  });

  it('rejects an error response instead of showing nothing as if it were fine', async () => {
    let failed = false;
    try { await fetchBoards(reply({ ok: false, error: 'read' })); } catch { failed = true; }
    expect(failed).toBe(true);
  });

  it('asks for recent games, optionally for one player', async () => {
    const urls = [];
    const f = async (u) => { urls.push(u); return { json: async () => ({ ok: true, games: [{ id: 'x' }] }) }; };
    expect(await fetchRecent(5, '', f)).toHaveLength(1);
    await fetchRecent(5, 'abc0123456', f);
    expect(urls[0]).toMatch(/action=recent&limit=5$/);
    expect(urls[1]).toMatch(/&h=abc0123456$/);
  });

  it('the player hash matches the one the sheet computes', async () => {
    expect(await pidHash('pid-a')).toBe(createHash('sha256').update('pid-a').digest('hex').slice(0, 10));
  });
});
