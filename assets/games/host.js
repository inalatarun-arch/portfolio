import { DEFAULT_RULES, MAX_PLAYERS, MIN_PLAYERS, arrangeHand, sanitizeRules, declare, discardCard, drawFromDiscard, drawFromStock, dropPlayer, handCards, newGame, nextRound, viewFor, } from './engine.js?v=1';
export const DEFAULT_COINS = 1000;
/** How long a disconnected player's turn is held before the host plays it for them. */
export const ABSENT_TURN_MS = 30_000;
/**
 * The room. Runs in the host's browser and is the only place the real game state exists. Guests send actions;
 * the host validates them and sends each player a view that contains only what they may see.
 */
export class RoomHost {
    absentMs;
    seats = [];
    game = null;
    rules = DEFAULT_RULES;
    nextSeat = 1;
    timer = null;
    listeners = new Set();
    hostId = '';
    constructor(absentMs = ABSENT_TURN_MS) {
        this.absentMs = absentMs;
    }
    /** The host's own seat. Its updates reach the UI through `subscribeLocal`. */
    addLocal(key, name, profile = { pid: key, coins: DEFAULT_COINS }) {
        const seat = this.addSeat(key, name, profile, null, true);
        this.hostId = seat.id;
        return seat.id;
    }
    subscribeLocal(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    /** Latest thing the host's own screen should show. */
    localMessage() {
        return this.messageFor(this.hostId);
    }
    /** A guest sent a join. Returns the seat id, or null if refused (the guest is told why). */
    join(key, name, channel, profile = { pid: key, coins: DEFAULT_COINS }) {
        const cleanName = name.trim().slice(0, 20) || 'Player';
        const existing = this.seats.find((s) => s.key === key);
        if (existing) {
            const old = existing.channel;
            existing.coins = profile.coins;
            existing.channel = channel; // swap first so the old channel's close event no longer matches this seat
            old?.close();
            this.broadcast();
            return existing.id;
        }
        if (this.game) {
            channel.send({ t: 'error', message: 'This game has already started. Ask the host to start a new room.' });
            channel.close();
            return null;
        }
        if (this.seats.length >= MAX_PLAYERS) {
            channel.send({ t: 'error', message: `This room is full (${MAX_PLAYERS} players).` });
            channel.close();
            return null;
        }
        const seat = this.addSeat(key, cleanName, profile, channel, false);
        this.broadcast();
        return seat.id;
    }
    /** A guest's connection dropped. In the lobby the seat is freed; in a game it is held for them to return. */
    disconnect(channel) {
        const seat = this.seats.find((s) => s.channel === channel);
        if (!seat)
            return;
        seat.channel = null;
        if (!this.game)
            this.seats = this.seats.filter((s) => s !== seat);
        this.broadcast();
    }
    /** Handle an action from the seat that owns `key`. */
    act(key, action) {
        const seat = this.seats.find((s) => s.key === key);
        if (!seat)
            return;
        const error = this.apply(seat, action);
        if (error)
            this.tell(seat, { t: 'error', message: error });
        this.broadcast();
    }
    /** The host closed the room. */
    shutdown(message = 'The host closed the room.') {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        for (const s of this.seats) {
            s.channel?.send({ t: 'closed', message });
            s.channel?.close();
        }
    }
    // --------------------------------------------------------------------------------------------------------------
    addSeat(key, name, profile, channel, local) {
        const base = name.trim().slice(0, 20) || 'Player';
        let unique = base;
        for (let n = 2; this.seats.some((s) => s.name === unique); n++)
            unique = `${base} ${n}`;
        const seat = {
            id: `p${this.nextSeat++}`, key, name: unique, pid: String(profile.pid).slice(0, 64),
            coins: Math.max(0, Math.floor(Number(profile.coins)) || 0), channel, local,
        };
        this.seats.push(seat);
        return seat;
    }
    apply(seat, action) {
        const isHost = seat.id === this.hostId;
        const g = this.game;
        const result = (r) => (r.ok ? null : r.error);
        switch (action.a) {
            case 'rules':
                if (!isHost || g)
                    return 'Only the host can change the rules, before the game starts.';
                this.rules = sanitizeRules(action.rules ?? {}, this.rules);
                return null;
            case 'start':
                if (!isHost)
                    return 'Only the host can start the game.';
                if (g)
                    return 'The game has already started.';
                if (this.seats.length < MIN_PLAYERS)
                    return `You need at least ${MIN_PLAYERS} players to start.`;
                if (this.seats.some((s) => !s.local && !s.channel))
                    return 'Wait for everyone to be connected, or remove the player who left.';
                {
                    const broke = this.seats.find((s) => s.coins < this.rules.bet);
                    if (broke)
                        return `${broke.name} does not have enough coins for the ${this.rules.bet}-coin bet. Lower the bet or let them top up.`;
                }
                this.game = newGame(this.seats.map((s) => ({ id: s.id, name: s.name, pid: s.pid })), this.rules);
                return null;
            case 'kick': {
                if (!isHost || g)
                    return 'Players can only be removed from the lobby, by the host.';
                const target = this.seats.find((s) => s.id === action.id);
                if (!target || target.id === this.hostId)
                    return null;
                target.channel?.send({ t: 'closed', message: 'The host removed you from the room.' });
                target.channel?.close();
                this.seats = this.seats.filter((s) => s !== target);
                return null;
            }
        }
        if (!g)
            return 'The game has not started yet.';
        switch (action.a) {
            case 'draw': return result(drawFromStock(g, seat.id));
            case 'take': return result(drawFromDiscard(g, seat.id));
            case 'discard': return result(discardCard(g, seat.id, action.card));
            case 'arrange': return result(arrangeHand(g, seat.id, action.groups));
            case 'declare': return result(declare(g, seat.id, action.card, action.groups));
            case 'drop': return result(dropPlayer(g, seat.id));
            case 'next':
                if (!isHost)
                    return 'Only the host can start the next round.';
                return result(nextRound(g));
            case 'dropAbsent': {
                if (!isHost)
                    return 'Only the host can do that.';
                const current = g.players[g.turn];
                if (g.phase !== 'playing' || this.isConnected(current.id))
                    return 'Everyone is connected.';
                return this.playForAbsent();
            }
        }
        return null;
    }
    isConnected(id) {
        const s = this.seats.find((x) => x.id === id);
        return !!s && (s.local || !!s.channel);
    }
    /** Make the current (disconnected) player's move: drop before drawing, otherwise throw back what they just drew. */
    playForAbsent() {
        const g = this.game;
        if (!g || g.phase !== 'playing')
            return null;
        const p = g.players[g.turn];
        if (g.step === 'draw') {
            const r = dropPlayer(g, p.id, 'auto');
            return r.ok ? null : r.error;
        }
        const cards = handCards(p);
        const r = discardCard(g, p.id, cards[cards.length - 1].id);
        return r.ok ? null : r.error;
    }
    /** If the player whose turn it is has gone, give them a short window to come back, then play for them. */
    watchAbsent() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        const g = this.game;
        if (!g || g.phase !== 'playing')
            return;
        const current = g.players[g.turn];
        if (this.isConnected(current.id))
            return;
        this.timer = setTimeout(() => {
            this.timer = null;
            const cur = this.game?.players[this.game.turn];
            if (cur && !this.isConnected(cur.id)) {
                this.playForAbsent();
                this.broadcast();
            }
        }, this.absentMs);
    }
    lobbyView(forId) {
        return {
            you: forId,
            host: this.hostId,
            players: this.seats.map((s) => ({ id: s.id, name: s.name, connected: s.local || !!s.channel, coins: s.coins })),
            rules: this.rules,
        };
    }
    /**
     * Always a deep copy: the engine mutates hands in place, and the host's own screen would otherwise hold live
     * references that change under React without it noticing.
     */
    messageFor(id) {
        if (this.game)
            return structuredClone({ t: 'view', view: viewFor(this.game, id, (pid) => this.isConnected(pid)), host: this.hostId });
        return { t: 'lobby', lobby: this.lobbyView(id) };
    }
    tell(seat, msg) {
        if (seat.local) {
            this.localError = msg.t === 'error' ? msg.message : this.localError;
            return;
        }
        seat.channel?.send(msg);
    }
    /** Last error for the host's own seat, read once by the UI. */
    localError = null;
    takeLocalError() {
        const e = this.localError;
        this.localError = null;
        return e;
    }
    broadcast() {
        this.watchAbsent();
        for (const s of this.seats)
            if (s.channel)
                s.channel.send(this.messageFor(s.id));
        for (const fn of this.listeners)
            fn();
    }
}
