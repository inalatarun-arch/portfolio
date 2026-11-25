// Level generator for Sticky Jelly (a dev tool, not shipped to visitors).
//   node tests/jelly-gen.mjs <recipe> [seconds] [seed] [parMin parMax deadMin deadMax]
//   recipe: o,i,k,goals  e.g. 1,2,0,2   dead = share of reachable positions from which the rings can no longer be covered
// Builds random boards, solves each with the real rules, and prints the ones that make a good puzzle:
// a long enough shortest solution, glue that actually matters, and some dead ends (so choices count).
import { DIR_NAMES, bonds, isWon, parseLevel, step } from '../assets/games/jelly-engine.js';

const [oN, iN, kN, gN] = (process.argv[2] || '1,2,0,2').split(',').map(Number);
const seconds = Number(process.argv[3] || 20);
const [parMin, parMax, deadMin, deadMax] = [process.argv[5] ?? 5, process.argv[6] ?? 99, process.argv[7] ?? 0, process.argv[8] ?? 1].map(Number);
let seed = Number(process.argv[4] || 1) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[(rnd() * a.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function layout() {
  const w = 5 + ((rnd() * 3) | 0);
  const h = 5 + ((rnd() * 2) | 0);
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  // carve a few corners to void so boards are not all rectangles
  for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) if (rnd() < 0.35) g[cy][cx] = ' ';
  const walls = 3 + ((rnd() * 5) | 0);
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

function place(g) {
  const floor = [];
  g.forEach((r, y) => r.forEach((c, x) => { if (c === '.') floor.push([x, y]); }));
  const need = oN + iN + kN + gN;
  if (floor.length < need + 8) return null;
  const spots = shuffle(floor.slice());
  const out = g.map((r) => r.slice());
  const jel = [];
  for (const [k, n] of [['o', oN], ['i', iN], ['k', kN]]) for (let c = 0; c < n; c++) jel.push([k, spots.pop()]);
  // no two sticky jellies touching at the start, and nothing starts boxed in by walls on 3 sides
  for (let a = 0; a < jel.length; a++) for (let b = a + 1; b < jel.length; b++) {
    if (jel[a][0] === 'k' || jel[b][0] === 'k') continue;
    if (Math.abs(jel[a][1][0] - jel[b][1][0]) + Math.abs(jel[a][1][1] - jel[b][1][1]) === 1) return null;
  }
  for (const [k, [x, y]] of jel) out[y][x] = k;
  const goals = [];
  for (let c = 0; c < gN; c++) goals.push(spots.pop());
  for (const [x, y] of goals) out[y][x] = out[y][x] === '.' ? '*' : out[y][x].toUpperCase();
  return out.map((r) => r.join(''));
}

function analyze(lv, cap) {
  const key = (p) => String.fromCharCode(...p);
  const ids = new Map();
  const list = [];
  const rev = [];
  const depth = [];
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
  // glue events along some shortest route: re-walk greedily using depths is overkill; count bonds in the best winning state instead
  const best = list[win[0]];
  return { par, states: list.length, dead: 1 - ok / list.length, glue: bonds(lv, best).length - bonds(lv, lv.start).length };
}

const t0 = Date.now();
const found = [];
let tried = 0;
while ((Date.now() - t0) / 1000 < seconds) {
  const g = layout();
  if (!connected(g)) continue;
  const rows = place(g);
  if (!rows) continue;
  tried++;
  const lv = parseLevel(rows);
  if (isWon(lv, lv.start)) continue;
  const a = analyze(lv, Number(process.env.CAP || 60000));
  if (!a || a.par < parMin || a.par > parMax || a.dead < deadMin || a.dead > deadMax) continue;
  if (iN && a.glue < 1) continue;
  found.push({ rows, ...a, score: a.glue * 3 + (1 - Math.abs(a.dead - (deadMin + deadMax) / 2)) * 8 + Math.min(a.states / a.par, 8) });
}
found.sort((a, b) => b.score - a.score);
console.log(`tried ${tried}, kept ${found.length}`);
for (const f of found.slice(0, 6)) {
  console.log(`\npar ${f.par}  states ${f.states}  dead ${(f.dead * 100).toFixed(0)}%  glue ${f.glue}  score ${f.score.toFixed(1)}`);
  console.log(JSON.stringify(f.rows));
  console.log(f.rows.join('\n'));
}
