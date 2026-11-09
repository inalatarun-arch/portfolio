// Solitaire skill test: node tests/solo.mjs <level> <deals> [offset]
// The same decks for every level (seeded), two filler players who just draw and throw back what they drew, so the
// only difference between runs is how well the level plays its own hand. Prints turns taken to declare (cap 30).
import { DEFAULT_RULES, newGame, viewFor, drawFromStock, discardCard, handCards } from '../assets/games/engine.js?v=2';
import { PRO, createMemory, observe, runBotTurn } from '../assets/games/bot.js?v=2';

Object.assign(PRO, JSON.parse(process.env.PRO || '{}')); // experiments: PRO='{"blend":1}' node tests/solo.mjs pro 80

const level = process.argv[2] || 'hard';
const deals = Number(process.argv[3]) || 60;
const offset = Number(process.argv[4]) || 0;
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const CAP = 30;
const turns = [];
for (let d = 0; d < deals; d++) {
  const seats = [{ id: 'p1', name: 'me', bot: true, level }, { id: 'p2', name: 'f1' }, { id: 'p3', name: 'f2' }];
  const state = newGame(seats, { ...DEFAULT_RULES, rounds: 1 }, { rng: seeded(1000 + offset + d) });
  state.turn = 0; // p1 always starts
  const mem = createMemory();
  let n = 0, done = false;
  let guard = 0;
  while (state.phase === 'playing' && n < CAP && !state.players[0].out && guard++ < 500) {
    const cur = state.players[state.turn];
    if (cur.id === 'p1') {
      n++;
      for (let k = 0; k < 2 && state.players[state.turn].id === 'p1' && state.phase === 'playing'; k++) runBotTurn(state, 'p1', level, mem);
      observe(mem, viewFor(state, 'p1', () => true));
      if (state.phase !== 'playing') done = state.results.length && state.results[0].winnerId === 'p1';
    } else {
      drawFromStock(state, cur.id);
      const cards = handCards(cur);
      discardCard(state, cur.id, cards[cards.length - 1].id);
      observe(mem, viewFor(state, 'p1', () => true));
    }
  }
  turns.push(done ? n : CAP);
}
console.log(JSON.stringify({ level, turns }));
