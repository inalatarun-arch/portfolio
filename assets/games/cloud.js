/**
 * Shared leaderboard and game history, stored in a Google Sheet through an Apps Script web app (backend/games.gs).
 * Switched on by "games": { "endpoint": "<web app URL>" } in content.json; without it the games keep working and the
 * leaderboard stays in this browser only.
 *
 * - The player who hosts a game (online) or plays the computer sends ONE record when the game ends. A record that
 *   cannot be sent is kept and retried later, so a dropped connection never loses a result.
 * - The player's random browser id is never sent in a form the sheet keeps: the sheet stores a short one-way hash.
 */
const SUBMITTED_KEY = 'games.submitted.v1';
const OUTBOX_KEY = 'games.outbox.v1';
const CACHE_KEY = 'games.boardCache.v1';
const CACHE_MS = 60_000;
const OUTBOX_LIMIT = 20;

let endpoint = '';
export function configureCloud(cfg) {
  // https only (plain http is accepted just for a local test server)
  endpoint = cfg && typeof cfg.endpoint === 'string' && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(cfg.endpoint) ? cfg.endpoint : '';
}
export const cloudEnabled = () => !!endpoint;

// ---- small storage helpers (every read and write is guarded: private mode must never break a game) ----
function store(kind) {
  try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch { return null; }
}
function readJson(kind, key, fallback) {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(kind, key, value) {
  try { store(kind)?.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** The first 10 hex characters of SHA-256(pid): the same value the sheet stores, so you can find yourself on the board. */
export async function pidHash(pid) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;
  const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(String(pid)));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

/**
 * The record for a finished game, from the final GameView. Online games are between people and carry each player's
 * net coins (what they won less their bet); games against the computer carry no coins.
 */
export function buildSubmission(view, { isLocal }) {
  const bots = view.players.filter((p) => p.bot);
  return {
    id: view.gameId,
    mode: isLocal ? 'computer' : 'online',
    rounds: view.totalRounds,
    players: view.players.map((p) => ({
      pid: p.pid,
      name: p.name,
      total: p.total,
      bot: !!p.bot,
      level: p.bot ? p.level : undefined,
      net: isLocal ? 0 : ((view.payouts && view.payouts[p.id]) || 0) - view.rules.bet,
    })),
    level: bots.length ? bots[0].level : undefined,
  };
}

async function post(game, fetchImpl) {
  const res = await fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'submit', game }) });
  const j = await res.json();
  // a rejected record (bad shape) is final: retrying would only fail again
  return j && (j.ok || (j.error && j.error !== 'busy' && j.error !== 'server')) ? 'done' : 'retry';
}

/** Send a finished game once. Returns true if the sheet has it (or finally refused it), false if it was queued. */
export async function submitGame(game, fetchImpl = globalThis.fetch) {
  if (!endpoint || !game || !game.id) return false;
  const done = readJson('local', SUBMITTED_KEY, []);
  if (done.includes(game.id)) return true;
  let outcome = 'retry';
  try { outcome = await post(game, fetchImpl); } catch { outcome = 'retry'; }
  if (outcome === 'done') {
    writeJson('local', SUBMITTED_KEY, [...done, game.id].slice(-60));
    try { store('session')?.removeItem(CACHE_KEY); } catch { /* ignore */ }
    return true;
  }
  const box = readJson('local', OUTBOX_KEY, []).filter((g) => g.id !== game.id);
  writeJson('local', OUTBOX_KEY, [...box, game].slice(-OUTBOX_LIMIT));
  return false;
}

/** Try the queued records again (call when the games page opens). */
export async function flushOutbox(fetchImpl = globalThis.fetch) {
  if (!endpoint) return;
  for (const g of readJson('local', OUTBOX_KEY, [])) {
    if (await submitGame(g, fetchImpl)) writeJson('local', OUTBOX_KEY, readJson('local', OUTBOX_KEY, []).filter((x) => x.id !== g.id));
  }
}

async function getJson(query, fetchImpl) {
  const url = endpoint + (endpoint.includes('?') ? '&' : '?') + query;
  const res = await fetchImpl(url);
  const j = await res.json();
  if (!j || !j.ok) throw new Error('bad response');
  return j;
}

/** { board, computer, updated } from the sheet, cached for a minute so reopening the page does not refetch (`force` skips the cache). */
export async function fetchBoards(fetchImpl = globalThis.fetch, now = Date.now(), force = false) {
  if (!endpoint) return null;
  const cached = readJson('session', CACHE_KEY, null);
  if (!force && cached && now - cached.at < CACHE_MS) return cached.data;
  const data = await getJson('action=leaderboard', fetchImpl);
  writeJson('session', CACHE_KEY, { at: now, data });
  return data;
}

/** The latest finished games, or one player's own games when `hash` is given. */
export async function fetchRecent(limit = 8, hash = '', fetchImpl = globalThis.fetch) {
  if (!endpoint) return [];
  const j = await getJson(`action=recent&limit=${limit}${hash ? '&h=' + encodeURIComponent(hash) : ''}`, fetchImpl);
  return j.games || [];
}
