import { RoomHost } from './host.js?v=1';
const PREFIX = 'inalatarun-rummy-';
// No 0/O/1/I so a code read aloud or typed from a phone is unambiguous.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CONNECT_TIMEOUT_MS = 15_000;
/**
 * Connection settings. By default PeerJS uses its free public matchmaking server and Google's STUN server, which
 * is enough for most home and mobile networks. The site can override them in content.json under "games":
 *   "games": { "peer": { "host": "...", "port": 443, "path": "/", "secure": true },
 *              "ice": [ { "urls": "turn:turn.example.com", "username": "u", "credential": "p" } ] }
 * Use this to self-host the matchmaking server or to add a TURN relay for strict networks.
 */
let settings = {};
export function configure(cfg) { settings = cfg || {}; }

function peerOptions() {
    const opts = { debug: 0 };
    const p = settings.peer;
    if (p && p.host) {
        opts.host = p.host;
        if (p.port) opts.port = Number(p.port);
        if (p.path) opts.path = p.path;
        opts.secure = p.secure !== false;
    }
    if (Array.isArray(settings.ice) && settings.ice.length) opts.config = { iceServers: settings.ice };
    return opts;
}
export function makeCode(len = 5) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
export function normalizeCode(raw) {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}
/** A private token that lets this browser tab reclaim its seat after a refresh. Stays out of the shared view. */
function seatKey(code) {
    const k = `rummy.key.${code}`;
    try {
        const found = sessionStorage.getItem(k);
        if (found)
            return found;
        const fresh = crypto.randomUUID();
        sessionStorage.setItem(k, fresh);
        return fresh;
    }
    catch {
        return crypto.randomUUID();
    }
}
/** Listeners and last-state bookkeeping shared by both session kinds. */
class Base {
    code;
    state = { status: 'connecting', message: 'Connecting…' };
    listeners = new Set();
    error = null;
    constructor(code) {
        this.code = code;
    }
    getState() { return this.state; }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    takeError() {
        const e = this.error;
        this.error = null;
        return e;
    }
    set(state) {
        this.state = state;
        this.emit();
    }
    emit() { for (const fn of this.listeners)
        fn(); }
    apply(msg) {
        if (this.state.status === 'closed')
            return;
        if (msg.t === 'lobby')
            this.set({ status: 'lobby', code: this.code, lobby: msg.lobby });
        else if (msg.t === 'view')
            this.set({ status: 'game', code: this.code, view: msg.view, host: msg.host });
        else if (msg.t === 'error') {
            this.error = msg.message;
            this.emit();
        }
        else
            this.set({ status: 'closed', message: msg.message, kind: 'host' });
    }
}
export class HostSession extends Base {
    name;
    profile;
    isHost = true;
    room = new RoomHost();
    peer = null;
    key;
    connections = new Map();
    constructor(code, name, profile) {
        super(code);
        this.name = name;
        this.profile = profile;
        this.key = seatKey(code);
    }
    /** Register a room with the PeerJS broker. Retries with a fresh code if the one picked is taken. */
    static create(name, profile) {
        return new Promise((resolve, reject) => {
            const attempt = (left) => {
                const code = makeCode();
                const session = new HostSession(code, name, profile);
                const peer = new window.Peer(PREFIX + code, peerOptions());
                const timeout = setTimeout(() => {
                    peer.destroy();
                    reject(new Error('Could not reach the matchmaking service. Check your connection and try again.'));
                }, CONNECT_TIMEOUT_MS);
                peer.on('open', () => {
                    clearTimeout(timeout);
                    session.start(peer);
                    resolve(session);
                });
                peer.on('error', (err) => {
                    clearTimeout(timeout);
                    peer.destroy();
                    if (err.type === 'unavailable-id' && left > 0)
                        attempt(left - 1);
                    else
                        reject(new Error('Could not create a room. Check your connection and try again.'));
                });
            };
            attempt(4);
        });
    }
    start(peer) {
        this.peer = peer;
        this.room.addLocal(this.key, this.name, this.profile);
        this.room.subscribeLocal(() => this.refresh());
        this.refresh();
        peer.on('connection', (conn) => this.accept(conn));
        peer.on('disconnected', () => {
            // Lost the broker, not the players: existing connections keep working, new joins need the broker back.
            if (!peer.destroyed)
                peer.reconnect();
        });
        peer.on('error', () => { });
    }
    accept(conn) {
        const channel = {
            send: (msg) => { if (conn.open)
                conn.send(msg); },
            close: () => conn.close(),
        };
        this.connections.set(conn, channel);
        conn.on('data', (raw) => {
            const msg = raw;
            if (msg.t === 'join') {
                const id = this.room.join(String(msg.key), String(msg.name), channel, { pid: String(msg.pid), coins: Number(msg.coins) });
                if (id)
                    guestKeys.set(channel, String(msg.key));
            }
            else if (msg.t === 'act') {
                const key = guestKeys.get(channel);
                if (key)
                    this.room.act(key, msg.act);
            }
        });
        const gone = () => {
            this.connections.delete(conn);
            this.room.disconnect(channel);
        };
        conn.on('close', gone);
        conn.on('error', gone);
    }
    refresh() {
        const err = this.room.takeLocalError();
        if (err)
            this.error = err;
        this.apply(this.room.localMessage());
    }
    act(action) { this.room.act(this.key, action); }
    leave() {
        this.room.shutdown();
        this.peer?.destroy();
        this.set({ status: 'closed', message: 'You closed the room.', kind: 'self' });
    }
}
/** Remembers which key each guest channel joined with, so later actions cannot claim another seat. */
const guestKeys = new WeakMap();
export class GuestSession extends Base {
    name;
    profile;
    isHost = false;
    peer = null;
    conn = null;
    key;
    constructor(code, name, profile) {
        super(code);
        this.name = name;
        this.profile = profile;
        this.key = seatKey(code);
    }
    static join(code, name, profile) {
        const session = new GuestSession(code, name, profile);
        return new Promise((resolve, reject) => {
            const peer = new window.Peer(peerOptions());
            session.peer = peer;
            const fail = (message) => {
                clearTimeout(timeout);
                peer.destroy();
                reject(new Error(message));
            };
            const timeout = setTimeout(() => fail('Could not connect to that room. It may be closed, or your network blocks direct connections.'), CONNECT_TIMEOUT_MS);
            peer.on('error', (err) => fail(err.type === 'peer-unavailable' ? `No room found with code ${code}. Check the code and ask the host if it is still open.` : 'Could not reach the matchmaking service. Try again.'));
            peer.on('open', () => {
                const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
                conn.on('open', () => {
                    clearTimeout(timeout);
                    session.conn = conn;
                    conn.send({ t: 'join', key: session.key, name: session.name, pid: session.profile.pid, coins: session.profile.coins });
                    resolve(session);
                });
                conn.on('data', (raw) => session.apply(raw));
                conn.on('close', () => {
                    if (session.state.status !== 'closed')
                        session.set({ status: 'closed', message: 'The connection to the host was lost.', kind: 'host' });
                });
                conn.on('error', () => fail('The connection to the host failed.'));
            });
        });
    }
    act(action) {
        if (this.conn?.open)
            this.conn.send({ t: 'act', act: action });
    }
    leave() {
        this.conn?.close();
        this.peer?.destroy();
        this.set({ status: 'closed', message: 'You left the room.', kind: 'self' });
    }
}
