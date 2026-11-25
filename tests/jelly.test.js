import { describe, expect, it } from './harness.js';
import { bodies, bonds, covered, driven, isWon, parseLevel, reachable, solve, stars, step } from '../assets/games/jelly-engine.js?v=1';
import { LEVELS } from '../assets/games/jelly-levels.js?v=1';

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
  it('pars rise from the first level to the last, roughly', () => {
    expect(LEVELS[0].par).toBeLessThanOrEqual(LEVELS[LEVELS.length - 1].par);
    expect(LEVELS).toHaveLength(12);
  });
});
