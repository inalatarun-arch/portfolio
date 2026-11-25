import { describe, expect, it } from './harness.js';
import { bodies, bonds, covered, driven, isWon, parseLevel, reachable, solve, stars, step } from '../assets/games/jelly-engine.js?v=1';
import { LEVELS } from '../assets/games/jelly-levels.js?v=2';
import { POOL } from '../assets/games/jelly-pool.js?v=2';
import { SYMMETRIES, randomLevel, transformDir, transformRows } from '../assets/games/jelly-random.js?v=2';

const lvl = (...rows) => parseLevel(rows);
const at = (lv, x, y) => y * lv.w + x;
const play = (lv, pos, ...dirs) => dirs.reduce((p, d) => { const r = step(lv, p, d); return r ? r.pos : p; }, pos);

describe('parsing', () => {
  it('reads walls, floor, void, rings and jellies', () => {
    const lv = lvl('#o.* ', '.i.k#', ' K*I.');
    expect(lv.w).toBe(5);
    expect(lv.h).toBe(3);
    expect(lv.kinds.join('')).toBe('oikki');
  });
  it('counts a jelly standing on a ring as sitting on that ring', () => {
    const lv = lvl('oI*');
    expect(lv.goals).toHaveLength(2);
    expect(covered(lv, lv.start)).toHaveLength(1);
  });
});

describe('moving', () => {
  it('slides one cell and refuses to enter a wall or leave the board', () => {
    const lv = lvl('o.#');
    const a = step(lv, lv.start, 'right');
    expect(a.pos[0]).toBe(1);
    expect(step(lv, a.pos, 'right')).toBeNull();
    expect(step(lv, lv.start, 'left')).toBeNull();
    expect(step(lv, lv.start, 'up')).toBeNull();
  });
  it('never changes the position it was given', () => {
    const lv = lvl('o..');
    const before = [...lv.start];
    step(lv, lv.start, 'right');
    expect([...lv.start]).toEqual(before);
  });
  it('pushes ink, and a chain of ink, but not into a wall', () => {
    const lv = lvl('okk.#');
    const r = step(lv, lv.start, 'right');
    expect([...r.pos]).toEqual([1, 2, 3]);
    expect(step(lv, r.pos, 'right')).toBeNull();
  });
  it('does not count a move that moves nothing', () => {
    const lv = lvl('ok#');
    expect(step(lv, lv.start, 'right')).toBeNull();
  });
});

describe('sticking', () => {
  it('sticky jellies that touch share a body; ink never does', () => {
    const lv = lvl('oik');
    const b = bodies(lv, lv.start);
    expect(b[0]).toBe(b[1]);
    expect(b[2]).not.toBe(b[0]);
    expect(bonds(lv, lv.start)).toEqual(['0-1']);
  });
  it('an ivory jelly sticks the moment you touch it, and then moves with you', () => {
    const lv = lvl('o.i..');
    expect(bonds(lv, lv.start)).toHaveLength(0);
    const r = step(lv, lv.start, 'right');
    expect(bonds(lv, r.pos)).toEqual(['0-1']);
    const r2 = step(lv, r.pos, 'right');
    expect([...r2.pos]).toEqual([2, 3]);
  });
  it('sticking is for good: moving away drags the ivory jelly along', () => {
    const lv = lvl('..o.i..', '.......');
    let p = play(lv, lv.start, 'right'); // touch
    p = play(lv, p, 'down', 'left', 'left');
    expect(bonds(lv, p)).toHaveLength(1);
  });
  it('a stuck body is blocked as a whole when any part meets a wall', () => {
    const lv = lvl('oi', '.#');
    expect(step(lv, lv.start, 'down')).toBeNull(); // the ivory jelly is over a wall, so the orange one cannot go either
    const r = step(lv, lv.start, 'left');
    expect(r).toBeNull();
  });
  it('an ivory jelly that is not touching anything never moves on its own', () => {
    const lv = lvl('o...i');
    const r = step(lv, lv.start, 'right');
    expect(r.moved).toEqual([0]);
  });
  it('ink touching a sticky jelly does not stick to it', () => {
    const lv = lvl('ok...');
    const r = step(lv, lv.start, 'right');
    const r2 = step(lv, r.pos, 'left');
    expect([...r2.pos]).toEqual([0, 2]);
  });
});

describe('several orange jellies', () => {
  it('all of them move on every step', () => {
    const lv = lvl('o...', '....', 'o...');
    const r = step(lv, lv.start, 'right');
    expect([...r.pos]).toEqual([1, 9]);
  });
  it('one that is blocked stays put while the other still moves', () => {
    const lv = lvl('o#..', '....', 'o...');
    const r = step(lv, lv.start, 'right');
    expect([...r.pos]).toEqual([0, 9]);
    expect(r.moved).toEqual([1]);
  });
  it('a blocked jelly does not push what is in front of it, and the free one still moves', () => {
    const lv = lvl('o..', '...', 'ok#');
    const r = step(lv, lv.start, 'right');
    expect(r.moved).toEqual([0]);
    expect([...r.pos]).toEqual([1, 6, 7]);
  });
  it('two bodies that shove each other (an orange U around an ink block) still slide together', () => {
    const lv = lvl('oko.', 'ooo.');
    const r = step(lv, lv.start, 'right');
    expect(r).not.toBeNull();
    expect(r.moved).toHaveLength(6);
    expect(new Set(r.pos).size).toBe(6);
    expect(r.pos[1]).toBe(2); // the ink block moved one cell, into the spot the U's right arm just left
  });
});

describe('winning', () => {
  it('is won only when every ring has a jelly on it', () => {
    const lv = lvl('o.*.*');
    expect(isWon(lv, lv.start)).toBe(false);
    expect(driven(lv, lv.start)[0]).toBe(true);
  });
  it('stars follow par', () => {
    expect(stars(8, 8)).toBe(3);
    expect(stars(9, 8)).toBe(2);
    expect(stars(12, 8)).toBe(2);
    expect(stars(13, 8)).toBe(1);
  });
  it('the solver finds a shortest solution, [] when already won, and gives up cleanly on the impossible', () => {
    expect(solve(lvl('o.*'), lvl('o.*').start).moves).toEqual(['right', 'right']);
    expect(solve(lvl('O'), lvl('O').start).moves).toEqual([]);
    const stuck = lvl('o#*');
    expect(solve(stuck, stuck.start).solved).toBe(false);
  });
});

describe('the levels', () => {
  LEVELS.forEach((L, n) => {
    it(`level ${n + 1} (${L.name}) is well formed and its par is the true shortest solution`, () => {
      expect(typeof L.name).toBe('string');
      expect(L.tip.length).toBeGreaterThan(10);
      for (const row of L.rows) expect(/^[#. *oikOIK]*$/.test(row)).toBe(true);
      const lv = parseLevel(L.rows);
      expect(lv.kinds.includes('o')).toBe(true);
      expect(lv.goals.length).toBeGreaterThan(0);
      expect(new Set(lv.start).size).toBe(lv.start.length);
      expect(isWon(lv, lv.start)).toBe(false);
      const r = solve(lv, lv.start, 150000);
      expect(r.solved).toBe(true);
      expect(r.moves).toHaveLength(L.par);
      // replaying the solution through the real rules wins, and every step is a legal move
      let pos = lv.start;
      for (const d of r.moves) { const s = step(lv, pos, d); expect(s).not.toBeNull(); pos = s.pos; expect(new Set(pos).size).toBe(pos.length); }
      expect(isWon(lv, pos)).toBe(true);
    });
  });
  it('every level is small enough for the in-game hint to answer at once', () => {
    for (const L of LEVELS) {
      const lv = parseLevel(L.rows);
      expect(reachable(lv, lv.start, 150000).size).toBeLessThanOrEqual(100000);
    }
  });
  it('there are at least 50 levels, and they get harder', () => {
    expect(LEVELS.length + POOL.length).toBeGreaterThanOrEqual(50);
    expect(LEVELS.length).toBe(40);
    const avg = (a) => a.reduce((x, y) => x + y.par, 0) / a.length;
    expect(avg(LEVELS.slice(0, 12))).toBeLessThan(avg(LEVELS.slice(12, 26)));
    expect(avg(LEVELS.slice(12, 26))).toBeLessThan(avg(LEVELS.slice(26)));
  });
  it('the first twelve are unchanged, because saved progress points at them', () => {
    expect(LEVELS.slice(0, 12).map((L) => L.name).join('|')).toBe('Say hello|Stick|Slick|Pair up|Slippery|Three of a kind|Twins|Crowded|Squeeze|Pile up|The knot|Sticky situation');
    expect(LEVELS.slice(0, 12).map((L) => L.par).join(',')).toBe('6,4,4,9,8,10,8,11,11,12,12,16');
  });
});

const word = { u: 'up', d: 'down', l: 'left', r: 'right' };
describe('the random pool', () => {
  const sorted = (a) => a.slice().sort().join('/');
  POOL.forEach(([par, rowStr, sol], n) => {
    it(`pool board ${n + 1}: the stored solution wins in exactly par moves`, () => {
      const lv = parseLevel(rowStr.split('/'));
      expect(sol).toHaveLength(par);
      let pos = lv.start;
      for (const c of sol) { const s = step(lv, pos, word[c]); expect(s).not.toBeNull(); pos = s.pos; }
      expect(isWon(lv, pos)).toBe(true);
    });
  });
  it('pool pars never decrease by much from start to end (sorted easy to hard)', () => {
    expect(POOL[0][0]).toBeLessThan(POOL[POOL.length - 1][0]);
  });
  it('turning or mirroring a board gives a board with the same shortest solution, mirrored the same way', () => {
    for (const idx of [0, 7, 30]) {
      const [par, rowStr, sol] = POOL[idx];
      for (let t = 0; t < SYMMETRIES; t++) {
        const rows = transformRows(rowStr.split('/'), t);
        const lv = parseLevel(rows);
        let pos = lv.start;
        for (const c of sol) { const s = step(lv, pos, transformDir(word[c], t)); expect(s).not.toBeNull(); pos = s.pos; }
        expect(isWon(lv, pos)).toBe(true);
        expect(sorted(rows.join('').split('').filter((c) => c !== ' '))).toBe(sorted(rowStr.split('/').join('').split('').filter((c) => c !== ' ')));
      }
    }
  });
  it('random levels are repeatable per seed, differ between seeds, and are solvable at par', () => {
    const a = randomLevel(3, 12345);
    expect(randomLevel(3, 12345).rows.join('/')).toBe(a.rows.join('/'));
    const seeds = new Set([1, 2, 3, 4, 5, 6].map((sd) => randomLevel(3, sd).rows.join('/')));
    expect(seeds.size).toBeGreaterThan(2);
    for (const n of [0, 1, 5, 12, 30, 80, 200]) {
      const L = randomLevel(n, 777 + n);
      const lv = parseLevel(L.rows);
      const r = solve(lv, lv.start, 150000);
      expect(r.solved).toBe(true);
      expect(r.moves).toHaveLength(L.par);
    }
  });
  it('random levels get harder as the number goes up', () => {
    const avg = (from, to) => { let t = 0; let c = 0; for (let n = from; n < to; n++) for (let sd = 1; sd <= 20; sd++) { t += randomLevel(n, sd * 7919).par; c++; } return t / c; };
    expect(avg(0, 6)).toBeLessThan(avg(20, 26));
    expect(avg(20, 26)).toBeLessThan(avg(50, 56) + 1);
  });
});
