import { GuestSession, HostSession, normalizeCode } from './session.js?v=1';
import { loadProfile, refund, settle } from './profile.js?v=1';

/**
 * The one live room for this browser tab. It lives outside any page, so moving to another page of the site and
 * back does not drop the connection or end the game.
 */
let active = null;
let stopTracking = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const LAST_ROOM = 'rummy.lastRoom';
const NAME_KEY = 'games.playerName';

export function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode: fine */ }
}
function rememberRoom(code) {
  try {
    if (code) sessionStorage.setItem(LAST_ROOM, code); else sessionStorage.removeItem(LAST_ROOM);
  } catch { /* ignore */ }
}
export function lastRoom() {
  try { return sessionStorage.getItem(LAST_ROOM); } catch { return null; }
}

export function activeSession() {
  return active;
}

/**
 * Money follows the session itself (not a screen), so it keeps working while someone browses elsewhere on the
 * site: the entry bet is taken when a game is first seen, winnings are paid when it ends, and the bet is returned
 * if the host's room dies before a result.
 */
function trackMoney(session) {
  let last = null;
  return session.subscribe(() => {
    const st = session.getState();
    if (st.status === 'game') {
      last = st.view;
      settle(st.view);
    } else if (st.status === 'closed' && st.kind === 'host' && last && last.phase !== 'game-over') {
      refund(last.gameId, last.rules.bet);
      last = null;
    }
  });
}

function install(session) {
  if (active) active.leave();
  if (stopTracking) stopTracking();
  active = session;
  stopTracking = trackMoney(session);
  notify();
}

export async function hostRoom(name) {
  saveName(name);
  const me = loadProfile();
  install(await HostSession.create(name, { pid: me.pid, coins: me.coins }));
  rememberRoom(null); // hosts cannot rejoin after a refresh: the room lives in their browser
}

export async function joinRoom(rawCode, name) {
  const code = normalizeCode(rawCode);
  if (code.length !== 5) throw new Error('Room codes are 5 letters or numbers.');
  saveName(name);
  const me = loadProfile();
  install(await GuestSession.join(code, name, { pid: me.pid, coins: me.coins }));
  rememberRoom(code);
}

export function leaveRoom() {
  if (active) active.leave();
  active = null;
  if (stopTracking) stopTracking();
  stopTracking = null;
  rememberRoom(null);
  notify();
}

/**
 * Call `fn` now and whenever the room (or the live session inside it) changes. Returns an unsubscribe function.
 * `fn` receives the session (or null).
 */
export function watch(fn) {
  let off = null;
  const attach = () => {
    if (off) off();
    off = active ? active.subscribe(() => fn(active)) : null;
    fn(active);
  };
  listeners.add(attach);
  attach();
  return () => {
    listeners.delete(attach);
    if (off) off();
  };
}

// Warn before a refresh or tab close would end a game in progress (a refresh drops the host's room).
window.addEventListener('beforeunload', (e) => {
  const st = active && active.getState();
  if (st && (st.status === 'game' || st.status === 'lobby')) { e.preventDefault(); e.returnValue = ''; }
});
