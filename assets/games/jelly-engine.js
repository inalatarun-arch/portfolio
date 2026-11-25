/**
 * Sticky Jelly rules. Pure functions, no DOM, so the browser, the tests and the level generator all share them.
 *
 * The board is a grid of floor, wall and void cells, with goal rings on some floor cells and jellies standing on floor.
 *   orange  (o)  yours. Every orange jelly moves each time you move. Sticky.
 *   ivory   (i)  asleep until it touches something sticky, then it joins that body and moves with it. Sticky.
 *   ink     (k)  slick. Never sticks to anything; it can only be pushed.
 *
 * Rules
 *   - Sticky jellies that touch (share an edge) are stuck together for good, so they move and get pushed as one body.
 *   - A move pushes whatever is in the way, as a chain. If anything in the chain meets a wall, the pusher stays put.
 *   - A move that moves nothing does not count.
 *   - You win when every ring has a jelly on it.
 *
 * Because stuck jellies can never come apart, "who is stuck to whom" is always just "who is touching", so the whole
 * state is the list of jelly positions. That is what lets the solver (and the in-game hint) stay small.
 */

export const DIRS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
export const DIR_NAMES = Object.freeze(['up', 'right', 'down', 'left']);
export const KIND = Object.freeze({ ORANGE: 'o', IVORY: 'i', INK: 'k' });

const FLOOR = 1;
const WALL = 2; // void is 0

/** Parse ASCII rows. '#' wall, '.' floor, ' ' void (outside the board), '*' ring, o/i/k jelly, O/I/K jelly on a ring. */
export function parseLevel(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells = new Uint8Array(w * h);
  const goals = [];
  const kinds = [];
  const start = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] || ' ';
      const at = y * w + x;
      if (ch === ' ') continue;
      if (ch === '#') { cells[at] = WALL; continue; }
      cells[at] = FLOOR;
      const low = ch.toLowerCase();
      if (ch === '*' || (ch !== low && 'oik'.includes(low))) goals.push(at);
      if ('oik'.includes(low) && low.length === 1 && /[a-z]/i.test(ch)) { kinds.push(low); start.push(at); }
    }
  }
  return { w, h, cells, goals, kinds, start: Uint8Array.from(start) };
}

const sticky = (kind) => kind !== KIND.INK;
const isFloor = (lv, x, y) => x >= 0 && y >= 0 && x < lv.w && y < lv.h && lv.cells[y * lv.w + x] === FLOOR;

/** Which body each jelly belongs to (index of the lowest jelly in the body), from positions alone. */
export function bodies(lv, pos) {
  const n = pos.length;
  const body = Array.from({ length: n }, (_, i) => i);
  const find = (a) => { while (body[a] !== a) { body[a] = body[body[a]]; a = body[a]; } return a; };
  const occ = new Map();
  for (let i = 0; i < n; i++) occ.set(pos[i], i);
  for (let i = 0; i < n; i++) {
    if (!sticky(lv.kinds[i])) continue;
    const x = pos[i] % lv.w;
    const y = (pos[i] / lv.w) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= lv.w || ny >= lv.h) continue;
      const j = occ.get(ny * lv.w + nx);
      if (j !== undefined && sticky(lv.kinds[j])) {
        const a = find(i);
        const b = find(j);
        if (a !== b) body[Math.max(a, b)] = Math.min(a, b);
      }
    }
  }
  return body.map((_, i) => find(i));
}

/** The jellies that you drive: every body that has an orange jelly in it. */
export function driven(lv, pos, body = bodies(lv, pos)) {
  const on = new Set();
  for (let i = 0; i < pos.length; i++) if (lv.kinds[i] === KIND.ORANGE) on.add(body[i]);
  return Array.from(pos, (_, i) => on.has(body[i]));
}

/**
 * Try one move. Returns { pos, moved } (moved = indices of the jellies that moved) or null when nothing can move.
 * `pos` is never mutated.
 */
export function step(lv, pos, dir) {
  const [dx, dy] = DIRS[dir];
  const n = pos.length;
  const body = bodies(lv, pos);
  const members = new Map();
  for (let i = 0; i < n; i++) {
    if (!members.has(body[i])) members.set(body[i], []);
    members.get(body[i]).push(i);
  }
  const occ = new Map();
  for (let i = 0; i < n; i++) occ.set(pos[i], i);

  // which bodies each body would push, and which hit a wall
  const pushes = new Map();
  const wall = new Set();
  const want = [];
  for (const b of members.keys()) if (members.get(b).some((i) => lv.kinds[i] === KIND.ORANGE)) want.push(b);
  const seen = new Set(want);
  const queue = [...want];
  while (queue.length) {
    const b = queue.pop();
    const out = new Set();
    for (const i of members.get(b)) {
      const x = pos[i] % lv.w + dx;
      const y = ((pos[i] / lv.w) | 0) + dy;
      if (!isFloor(lv, x, y)) { wall.add(b); continue; }
      const j = occ.get(y * lv.w + x);
      if (j === undefined || body[j] === b) continue;
      out.add(body[j]);
      if (!seen.has(body[j])) { seen.add(body[j]); queue.push(body[j]); }
    }
    pushes.set(b, out);
  }

  // blocked = a wall ahead, or a blocked body ahead (least fixed point, so two bodies that shove each other still slide)
  const blocked = new Set(wall);
  for (let changed = true; changed;) {
    changed = false;
    for (const [b, out] of pushes) {
      if (blocked.has(b)) continue;
      for (const c of out) if (blocked.has(c)) { blocked.add(b); changed = true; break; }
    }
  }

  const go = new Set();
  const todo = want.filter((b) => !blocked.has(b));
  while (todo.length) {
    const b = todo.pop();
    if (go.has(b)) continue;
    go.add(b);
    for (const c of pushes.get(b) || []) todo.push(c);
  }
  if (!go.size) return null;

  const next = Uint8Array.from(pos);
  const moved = [];
  for (const b of go) {
    for (const i of members.get(b)) {
      next[i] = pos[i] + dy * lv.w + dx;
      moved.push(i);
    }
  }
  moved.sort((a, b) => a - b);
  return { pos: next, moved };
}

export function covered(lv, pos) {
  const on = new Set(pos);
  return lv.goals.filter((g) => on.has(g));
}
export function isWon(lv, pos) {
  return covered(lv, pos).length === lv.goals.length;
}

/** Pairs of touching sticky jellies, as "i-j" strings with i < j (for drawing the glue and spotting new bonds). */
export function bonds(lv, pos) {
  const out = [];
  for (let i = 0; i < pos.length; i++) {
    if (!sticky(lv.kinds[i])) continue;
    for (let j = i + 1; j < pos.length; j++) {
      if (!sticky(lv.kinds[j])) continue;
      const a = pos[i];
      const b = pos[j];
      const same = (a / lv.w | 0) === (b / lv.w | 0);
      if ((same && Math.abs(a - b) === 1) || Math.abs(a - b) === lv.w) out.push(`${i}-${j}`);
    }
  }
  return out;
}

const keyOf = (pos) => String.fromCharCode(...pos);

/**
 * Breadth-first search from `pos`. Returns { moves, states, solved } where `moves` is a shortest list of directions
 * ([] when already won). `solved` is false when the search used up `cap` states or ran out of states.
 */
export function solve(lv, pos, cap = 250000) {
  if (isWon(lv, pos)) return { moves: [], states: 1, solved: true };
  const seen = new Map([[keyOf(pos), null]]);
  let frontier = [pos];
  let states = 1;
  while (frontier.length) {
    const nextFrontier = [];
    for (const p of frontier) {
      const from = keyOf(p);
      for (const d of DIR_NAMES) {
        const r = step(lv, p, d);
        if (!r) continue;
        const k = keyOf(r.pos);
        if (seen.has(k)) continue;
        seen.set(k, [from, d]);
        states++;
        if (isWon(lv, r.pos)) {
          const moves = [];
          for (let at = k; seen.get(at);) { const [prev, dir] = seen.get(at); moves.push(dir); at = prev; }
          return { moves: moves.reverse(), states, solved: true };
        }
        if (states >= cap) return { moves: null, states, solved: false };
        nextFrontier.push(r.pos);
      }
    }
    frontier = nextFrontier;
  }
  return { moves: null, states, solved: false };
}

/** Every position reachable from `pos` (for the generator's dead-end measure). */
export function reachable(lv, pos, cap = 250000) {
  const seen = new Map([[keyOf(pos), pos]]);
  const queue = [pos];
  while (queue.length && seen.size < cap) {
    const p = queue.pop();
    for (const d of DIR_NAMES) {
      const r = step(lv, p, d);
      if (!r) continue;
      const k = keyOf(r.pos);
      if (!seen.has(k)) { seen.set(k, r.pos); queue.push(r.pos); }
    }
  }
  return seen;
}

/** Star rating from moves against the shortest solution. */
export function stars(moves, par) {
  if (moves <= par) return 3;
  if (moves <= Math.ceil(par * 1.5)) return 2;
  return 1;
}
