// Level generator for Sticky Jelly (a dev tool, not shipped to visitors). It builds random boards, solves each one with
// the real rules, and keeps the ones that make a good puzzle: a long enough shortest solution, glue that matters, and some
// dead ends (so choices count).
//
//   node tests/jelly-gen.mjs search <o,i,k,rings> <seconds> <seed> [parMin parMax deadMin deadMax]
//        one recipe, prints the best few boards (this is how the hand-picked levels were found)
//   node tests/jelly-gen.mjs bulk <seconds> <seed> <out.jsonl>
//        random recipes, appends every acceptable board as one JSON line: {rows, sol, par, states, dead, glue, n}
//   CAP=60000 sets how many positions a board may have (the in-game hint searches them in the browser).
//   dead = share of reachable positions from which the rings can no longer be covered.
import { appendFileSync } from 'node:fs';
import { DIR_NAMES, bonds, isWon, parseLevel, solve, step } from '../assets/games/jelly-engine.js';

const mode = process.argv[2] || 'search';
let seed;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CAP = Number(process.env.CAP || 60000);

function layout(big) {
  const w = 5 + ((rnd() * (big ? 3 : 3)) | 0);
  const h = 5 + ((rnd() * (big ? 3 : 2)) | 0);
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) if (rnd() < 0.35) g[cy][cx] = ' ';
  const walls = 3 + ((rnd() * 6) | 0);
  for (let n = 0; n < walls; n++) {
    const x = (rnd() * w) | 0;
    const y = (rnd() * h) | 0;
    if (g[y][x] === '.') g[y][x] = '#';
  }
  return g;
}
const connected = (g) => {
  const cells = [];
  g.forEach((r, y) => r.forEach((c, x) => { if (c === '.') cells.push([x, y]); }));
  if (!cells.length) return false;
  const seen = new Set([cells[0].join()]);
  const q = [cells[0]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (g[y + dy] && g[y + dy][x + dx] === '.' && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
};
function place(g, [oN, iN, kN, gN]) {
  const floor = [];
  g.forEach((r, y) => r.forEach((c, x) => { if (c === '.') floor.push([x, y]); }));
  if (floor.length < oN + iN + kN + gN + 8) return null;
  const spots = shuffle(floor.slice());
  const out = g.map((r) => r.slice());
  const jel = [];
  for (const [k, n] of [['o', oN], ['i', iN], ['k', kN]]) for (let c = 0; c < n; c++) jel.push([k, spots.pop()]);
  for (let a = 0; a < jel.length; a++) for (let b = a + 1; b < jel.length; b++) {
    if (jel[a][0] === 'k' || jel[b][0] === 'k') continue;
    if (Math.abs(jel[a][1][0] - jel[b][1][0]) + Math.abs(jel[a][1][1] - jel[b][1][1]) === 1) return null; // nothing starts stuck
  }
  for (const [k, [x, y]] of jel) out[y][x] = k;
  for (let c = 0; c < gN; c++) { const [x, y] = spots.pop(); out[y][x] = out[y][x] === '.' ? '*' : out[y][x].toUpperCase(); }
  return out.map((r) => r.join(''));
}
function analyze(lv, cap) {
  const key = (p) => String.fromCharCode(...p);
  const ids = new Map(); const list = []; const rev = []; const depth = [];
  const add = (p, d) => { ids.set(key(p), list.length); list.push(p); rev.push([]); depth.push(d); return list.length - 1; };
  add(lv.start, 0);
  let par = -1;
  const win = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (isWon(lv, p)) { if (par < 0) par = depth[i]; win.push(i); continue; }
    for (const d of DIR_NAMES) {
      const r = step(lv, p, d);
      if (!r) continue;
      const k = key(r.pos);
      let j = ids.get(k);
      if (j === undefined) { if (list.length >= cap) return null; j = add(r.pos, depth[i] + 1); }
      rev[j].push(i);
    }
  }
  if (par < 0) return null;
  const can = new Uint8Array(list.length);
  const q = [...win];
  win.forEach((i) => { can[i] = 1; });
  while (q.length) { const j = q.pop(); for (const i of rev[j]) if (!can[i]) { can[i] = 1; q.push(i); } }
  let ok = 0;
  can.forEach((v) => { ok += v; });
  return { par, states: list.length, dead: 1 - ok / list.length, glue: bonds(lv, list[win[0]]).length - bonds(lv, lv.start).length };
}
const randomRecipe = () => {
  const o = rnd() < 0.6 ? 1 : 2;
  const i = 1 + ((rnd() * 4) | 0);
  const k = (rnd() * 3) | 0;
  const total = o + i + k;
  const g = clampN(2 + ((rnd() * 3) | 0), 2, Math.min(4, total));
  return [o, i, k, g];
};
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

if (mode === 'bulk') {
  const seconds = Number(process.argv[3] || 60);
  seed = Number(process.argv[4] || 1) >>> 0;
  const out = process.argv[5];
  const t0 = Date.now();
  let tried = 0; let kept = 0;
  while ((Date.now() - t0) / 1000 < seconds) {
    const g = layout(rnd() < 0.35);
    if (!connected(g)) continue;
    const rows = place(g, randomRecipe());
    if (!rows) continue;
    tried++;
    const lv = parseLevel(rows);
    if (isWon(lv, lv.start)) continue;
    const a = analyze(lv, CAP);
    if (!a || a.par < 8 || a.dead > 0.78 || (lv.kinds.includes('i') && a.glue < 1)) continue;
    const r = solve(lv, lv.start, CAP + 10);
    if (!r.solved || r.moves.length !== a.par) continue;
    kept++;
    appendFileSync(out, JSON.stringify({ rows, sol: r.moves.map((m) => m[0]).join(''), par: a.par, states: a.states, dead: +a.dead.toFixed(3), glue: a.glue, n: lv.kinds.length }) + '\n');
  }
  console.log(`tried ${tried}, kept ${kept}`);
} else {
  const recipe = (process.argv[3] || '1,2,0,2').split(',').map(Number);
  const seconds = Number(process.argv[4] || 20);
  seed = Number(process.argv[5] || 1) >>> 0;
  const [parMin, parMax, deadMin, deadMax] = [process.argv[6] ?? 5, process.argv[7] ?? 99, process.argv[8] ?? 0, process.argv[9] ?? 1].map(Number);
  const t0 = Date.now();
  const found = [];
  let tried = 0;
  while ((Date.now() - t0) / 1000 < seconds) {
    const g = layout(false);
    if (!connected(g)) continue;
    const rows = place(g, recipe);
    if (!rows) continue;
    tried++;
    const lv = parseLevel(rows);
    if (isWon(lv, lv.start)) continue;
    const a = analyze(lv, CAP);
    if (!a || a.par < parMin || a.par > parMax || a.dead < deadMin || a.dead > deadMax) continue;
    if (recipe[1] && a.glue < 1) continue;
    found.push({ rows, ...a, score: a.glue * 3 + (1 - Math.abs(a.dead - (deadMin + deadMax) / 2)) * 8 + Math.min(a.states / a.par, 8) });
  }
  found.sort((a, b) => b.score - a.score);
  console.log(`tried ${tried}, kept ${found.length}`);
  for (const f of found.slice(0, 6)) {
    console.log(`\npar ${f.par}  states ${f.states}  dead ${(f.dead * 100).toFixed(0)}%  glue ${f.glue}  score ${f.score.toFixed(1)}`);
    console.log(JSON.stringify(f.rows));
    console.log(f.rows.join('\n'));
  }
}
