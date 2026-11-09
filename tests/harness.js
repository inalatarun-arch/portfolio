/**
 * Minimal test harness so the game logic can be tested with Node's built-in runner and no dependencies:
 *   node --test tests/
 * It provides `describe`, `it`, `beforeEach`, `afterEach`, `expect` (the handful of matchers used here) and a
 * fake-timer helper `vi`, with the same shape the tests were written against.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

export { afterEach, beforeEach, describe, it };

const isObj = (v) => v !== null && typeof v === 'object';
function matches(actual, expected) {
  if (!isObj(expected)) return Object.is(actual, expected);
  if (!isObj(actual)) return false;
  return Object.keys(expected).every((k) => matches(actual[k], expected[k]));
}

function build(actual, negate) {
  const check = (pass, message) => {
    if (negate ? pass : !pass) assert.fail((negate ? 'Expected NOT: ' : 'Expected: ') + message);
  };
  const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  return {
    toBe: (e) => check(Object.is(actual, e), `${show(actual)} to be ${show(e)}`),
    toEqual: (e) => {
      let same = true;
      try { assert.deepStrictEqual(actual, e); } catch { same = false; }
      check(same, `${show(actual)} to equal ${show(e)}`);
    },
    toBeNull: () => check(actual === null, `${show(actual)} to be null`),
    toBeDefined: () => check(actual !== undefined, `${show(actual)} to be defined`),
    toBeUndefined: () => check(actual === undefined, `${show(actual)} to be undefined`),
    toBeGreaterThan: (n) => check(actual > n, `${show(actual)} > ${n}`),
    toBeLessThanOrEqual: (n) => check(actual <= n, `${show(actual)} <= ${n}`),
    toHaveLength: (n) => check(actual != null && actual.length === n, `length ${actual && actual.length} to be ${n}`),
    toMatch: (re) => check(re.test(actual), `${show(actual)} to match ${re}`),
    toContain: (x) => check(actual != null && actual.includes(x), `${show(actual).slice(0, 200)} to contain ${show(x)}`),
    toMatchObject: (e) => check(matches(actual, e), `${show(actual)} to match object ${show(e)}`),
    toThrow: () => {
      let threw = false;
      try { actual(); } catch { threw = true; }
      check(threw, 'function to throw');
    },
  };
}

export function expect(actual) {
  const pos = build(actual, false);
  pos.not = build(actual, true);
  return pos;
}

/** Fake timers: only `setTimeout` is faked, which is all the host's absent-player timer needs. */
export const vi = {
  useFakeTimers: () => mock.timers.enable({ apis: ['setTimeout'] }),
  useRealTimers: () => mock.timers.reset(),
  advanceTimersByTime: (ms) => mock.timers.tick(ms),
};
