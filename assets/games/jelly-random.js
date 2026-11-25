/**
 * Sticky Jelly, the levels after the hand-ordered ones. Each is picked from a pool of boards that a generator found and the
 * solver checked (jelly-pool.js), then flipped or turned at random so a board you have met comes back looking new.
 * The rules do not care which way is up, so a turned board has exactly the same solution (mirrored) and the same par.
 *
 * "Random" here is seeded: the seed is made once per visitor and saved, so level 41 is the same board every time you come
 * back (your best score for it still means something) but it is a different board for the next visitor.
 * Difficulty still climbs: the pool is sorted easy to hard and each level draws from a window that slides up with the number.
 */
import { POOL } from './jelly-pool.js?v=2';

export const SYMMETRIES = 8;

/** Turn/flip ASCII rows. t = 0..7: bit 0 mirrors left-right, then t >> 1 quarter turns clockwise. */
export function transformRows(rows, t) {
  const w = Math.max(...rows.map((r) => r.length));
  let g = rows.map((r) => r.padEnd(w, ' ').split(''));
  if (t & 1) g = g.map((r) => r.slice().reverse());
  for (let q = 0; q < (t >> 1); q++) {
    const h = g.length;
    const n = g[0].length;
    const out = Array.from({ length: n }, () => Array(h).fill(' '));
    for (let y = 0; y < h; y++) for (let x = 0; x < n; x++) out[x][h - 1 - y] = g[y][x];
    g = out;
  }
  return g.map((r) => r.join('').replace(/\s+$/, ''));
}

/** The move that is the same step on a transformed board: what `dir` becomes under symmetry t. */
export function transformDir(dir, t) {
  const turn = { up: 'right', right: 'down', down: 'left', left: 'up' };
  let d = dir;
  if (t & 1) d = d === 'left' ? 'right' : d === 'right' ? 'left' : d;
  for (let q = 0; q < (t >> 1); q++) d = turn[d];
  return d;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Gummy', 'Wobble', 'Squish', 'Goo', 'Jiggle', 'Blob', 'Mochi', 'Custard', 'Bouncy', 'Tangle', 'Syrup', 'Dollop',
  'Plump', 'Snug', 'Gloop', 'Pudding', 'Quiver', 'Marshmallow', 'Splodge', 'Treacle'];

/**
 * @param n     level number counted from the first random level (0 = the first one)
 * @param seed  the visitor's seed
 * @returns {{name, tip, par, rows, sol, random: true}}
 */
export function randomLevel(n, seed) {
  const r = rng((seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  const last = POOL.length - 1;
  const centre = Math.min(1, n / 36) * last * 0.85 + last * 0.1; // slides from the easier tenth up to the top
  const spread = Math.max(2, last * 0.12);
  const i = Math.max(0, Math.min(last, Math.round(centre + (r() * 2 - 1) * spread)));
  const [par, rowStr, sol] = POOL[i];
  const t = Math.floor(r() * SYMMETRIES);
  return {
    name: `${NAMES[(Math.floor(r() * 1000) + n) % NAMES.length]} ${n + 1}`,
    tip: 'A fresh board, shuffled just for you. Same rules, no tips.',
    par,
    rows: transformRows(rowStr.split('/'), t),
    sol: sol.split('').map((c) => ({ u: 'up', d: 'down', l: 'left', r: 'right' })[c]).map((d) => transformDir(d, t)),
    random: true,
  };
}
