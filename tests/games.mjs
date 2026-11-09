// Whole games: node tests/games.mjs <games> <rounds> <levelA> <levelB> ...   (default: one of each level)
// Prints per level: games played, games won (lowest total), and total points. Seats rotate every game.
import { LEVELS } from '../assets/games/bot.js?v=2';
import { playGame } from './sim.js';
const games = Number(process.argv[2]) || 40, rounds = Number(process.argv[3]) || 5;
const levels = process.argv.length > 4 ? process.argv.slice(4) : LEVELS.map((l) => l.id);
const out = Object.fromEntries([...new Set(levels)].map((l) => [l, { seats: 0, wins: 0, points: 0 }]));
for (let g = 0; g < games; g++) {
  const rot = g % levels.length;
  const order = [...levels.slice(rot), ...levels.slice(0, rot)];
  for (const p of playGame(order, rounds).players) { const o = out[p.level]; o.seats++; o.points += p.total; if (p.won) o.wins++; }
}
console.log(JSON.stringify(out));
