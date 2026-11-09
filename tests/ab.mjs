// Head-to-head helper: node tests/ab.mjs <rounds> <levelA> <levelB>  (two seats of each, rotated)
import { DEFAULT_RULES } from '../assets/games/engine.js?v=2';
import { tournament } from './sim.js';
const [rounds, a, b] = [Number(process.argv[2]) || 100, process.argv[3] || 'hard', process.argv[4] || 'pro'];
const r = tournament([a, b, a, b], rounds, DEFAULT_RULES);
const out = {};
for (const l of [a, b]) out[l] = { seats: r.table[l].seats, wins: r.table[l].wins, points: r.table[l].points };
console.log(JSON.stringify(out));
