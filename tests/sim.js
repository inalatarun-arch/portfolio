/**
 * Plays computer-only rounds straight on the rules engine, to check the computer players never make an illegal move
 * or stall, and to measure how the levels compare. Run a tournament from the command line:
 *   node tests/sim.js [rounds] [rules-json]
 * Every round uses the engine's own secure shuffle; the players only ever see their own views.
 */
import { DEFAULT_RULES, newGame, nextRound, viewFor, handCards } from '../assets/games/engine.js?v=4';
import { createMemory, observe, runBotTurn, LEVELS } from '../assets/games/bot.js?v=4';

const MAX_ACTIONS = 900;

/** One round with one bot per entry of `levels` (seat order). Returns per-seat results and a few counters. */
export function playRound(levels, rules = DEFAULT_RULES, opts = {}) {
  const seats = levels.map((level, i) => ({ id: `p${i + 1}`, name: `${level}${i + 1}`, bot: true, level }));
  const state = newGame(seats, { ...rules, rounds: 1 }, opts.rng ? { rng: opts.rng } : {});
  const mems = new Map(seats.map((s) => [s.id, createMemory()]));
  const stats = { actions: 0, stalled: false, illegal: [], drops: new Set(), wrongDeclares: new Set(), draws: [] };
  const watch = () => { for (const s of seats) observe(mems.get(s.id), viewFor(state, s.id, () => true)); };
  watch();
  while (state.phase === 'playing') {
    if (++stats.actions > MAX_ACTIONS) { stats.stalled = true; break; }
    const cur = state.players[state.turn];
    const peek = state.stock[0]; // the harness may look at the stock to audit fairness; the players cannot
    const res = runBotTurn(state, cur.id, cur.level, mems.get(cur.id), opts.botRng || Math.random);
    if (res.ok && res.action.a === 'draw' && peek) stats.draws.push({ level: cur.level, pts: peek.rank === 0 ? 0 : peek.rank >= 10 || peek.rank === 1 ? 10 : peek.rank, joker: peek.rank === 0 });
    if (!res.ok) { stats.illegal.push({ id: cur.id, level: cur.level, action: res.action, error: res.error }); break; }
    if (res.action.a === 'drop') stats.drops.add(cur.id);
    watch();
  }
  for (const p of state.players) if (p.outReason === 'wrong-declare') stats.wrongDeclares.add(p.id);
  return { state, stats };
}

/** Many rounds with a seat rotation so no level always sits in the same chair. */
export function tournament(levels, rounds, rules = DEFAULT_RULES, log = () => {}) {
  const table = Object.fromEntries([...new Set(levels)].map((l) => [l, { level: l, seats: 0, wins: 0, points: 0, drops: 0, wrong: 0, draws: 0, drawPts: 0, drawJokers: 0 }]));
  let stalled = 0, illegal = 0, actions = 0;
  for (let r = 0; r < rounds; r++) {
    const rot = r % levels.length;
    const order = [...levels.slice(rot), ...levels.slice(0, rot)];
    const { state, stats } = playRound(order, rules);
    for (const d of stats.draws) { const t = table[d.level]; t.draws++; t.drawPts += d.pts; t.drawJokers += d.joker ? 1 : 0; }
    stalled += stats.stalled ? 1 : 0;
    illegal += stats.illegal.length;
    actions += stats.actions;
    const winnerId = state.results.length ? state.results[state.results.length - 1].winnerId : null;
    state.players.forEach((p) => {
      const t = table[p.level];
      t.seats++;
      t.points += p.roundPoints;
      if (p.id === winnerId) t.wins++;
      if (stats.drops.has(p.id)) t.drops++;
      if (stats.wrongDeclares.has(p.id)) t.wrong++;
    });
    if ((r + 1) % 50 === 0) log(`  ${r + 1}/${rounds} rounds`);
  }
  return { table, stalled, illegal, avgActions: actions / rounds };
}

// command line
if (process.argv[1] && process.argv[1].endsWith('sim.js')) {
  const rounds = Number(process.argv[2]) || 200;
  const rules = { ...DEFAULT_RULES, ...(process.argv[3] ? JSON.parse(process.argv[3]) : {}) };
  const t0 = Date.now();
  const { table, stalled, illegal, avgActions } = tournament(LEVELS.map((l) => l.id), rounds, rules, console.log);
  console.log('  (an ordinary card is worth 6.96 points on average and 3.7% of cards are printed jokers)');
  console.log(`\n${rounds} rounds, 4 players (one of each level), ${((Date.now() - t0) / 1000).toFixed(0)}s, ${stalled} stalled, ${illegal} illegal, avg ${avgActions.toFixed(0)} actions/round\n`);
  console.log('level'.padEnd(14) + 'wins'.padStart(6) + 'win%'.padStart(7) + 'avg pts'.padStart(9) + 'drops'.padStart(7) + 'wrong decl'.padStart(12) + 'stock draws'.padStart(13) + 'avg pts drawn'.padStart(15) + 'jokers drawn'.padStart(14));
  for (const l of LEVELS) {
    const t = table[l.id];
    console.log(l.label.padEnd(14) + String(t.wins).padStart(6) + (((t.wins / t.seats) * 100).toFixed(1) + '%').padStart(7) + (t.points / t.seats).toFixed(1).padStart(9) + String(t.drops).padStart(7) + String(t.wrong).padStart(12) + String(t.draws).padStart(13) + (t.drawPts / Math.max(1, t.draws)).toFixed(2).padStart(15) + (((t.drawJokers / Math.max(1, t.draws)) * 100).toFixed(1) + '%').padStart(14));
  }
}
void handCards;


/**
 * A whole game of several rounds (lowest total wins), one bot per entry of `levels`.
 * Returns the final totals per seat and who won (ties share it).
 */
export function playGame(levels, rounds, rules = DEFAULT_RULES) {
  const seats = levels.map((level, i) => ({ id: `p${i + 1}`, name: `${level}${i + 1}`, bot: true, level }));
  const state = newGame(seats, { ...rules, rounds });
  const mems = new Map(seats.map((s) => [s.id, createMemory()]));
  let guard = 0;
  while (guard++ < 5000) {
    while (state.phase === 'playing' && guard++ < 5000) {
      const cur = state.players[state.turn];
      const res = runBotTurn(state, cur.id, cur.level, mems.get(cur.id));
      if (!res.ok) throw new Error('illegal bot move: ' + res.error);
      for (const s of seats) observe(mems.get(s.id), viewFor(state, s.id, () => true));
    }
    if (state.phase === 'game-over') break;
    nextRound(state);
  }
  const best = Math.min(...state.players.map((p) => p.total));
  return { players: state.players.map((p) => ({ level: p.level, total: p.total, won: p.total === best })) };
}
