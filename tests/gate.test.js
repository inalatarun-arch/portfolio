import { describe, expect, it } from './harness.js';
import { createGate, sha256Hex } from '../assets/games/gate.js?v=4';

// These tests use their own throwaway sequence.
const SALT = 'test-salt';
const SEQ = 'abcd1234';
let hash;
const make = async (extra = {}) => {
  hash ||= await sha256Hex(SALT + SEQ);
  let hits = 0;
  const g = createGate({ hash, salt: SALT, len: SEQ.length, gap: 1000, doc: null, onMatch: () => { hits++; }, ...extra });
  return { g, hits: () => hits };
};
const typeIt = async (g, text, start = 0, step = 50) => { let r = false; for (let i = 0; i < text.length; i++) r = await g.feed(text[i], start + i * step); return r; };

describe('keyboard gate', () => {
  it('matches the right sequence typed at a normal pace', async () => {
    const { g, hits } = await make();
    expect(await typeIt(g, SEQ)).toBe(true);
    expect(hits()).toBe(1);
  });
  it('ignores case, and works after other keys were typed first', async () => {
    const { g, hits } = await make();
    await typeIt(g, 'zzzz' + SEQ.toUpperCase());
    expect(hits()).toBe(1);
  });
  it('does nothing for a wrong or partial sequence', async () => {
    const { g, hits } = await make();
    await typeIt(g, 'abcd1235');
    await typeIt(g, 'abcd123', 10_000);
    expect(hits()).toBe(0);
  });
  it('starts over after a pause, so a slowly typed sequence never matches', async () => {
    const { g, hits } = await make();
    await typeIt(g, SEQ, 0, 1500);
    expect(hits()).toBe(0);
  });
  it('can be triggered again straight afterwards (it toggles)', async () => {
    const { g, hits } = await make();
    await typeIt(g, SEQ, 0);
    await typeIt(g, SEQ, 100_000);
    expect(hits()).toBe(2);
  });
  it('does not keep the sequence in the source (only a salted hash)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../assets/games/gate.js', import.meta.url), 'utf8');
    expect(/const HASH = '[0-9a-f]{64}'/.test(src)).toBe(true);
    expect(/const SALT = '[0-9a-f]{16}'/.test(src)).toBe(true);
  });

  it('listens to the keyboard but ignores text boxes, shortcuts and non-character keys', async () => {
    let handler;
    const doc = { addEventListener: (_, f) => { handler = f; }, removeEventListener: () => { handler = null; } };
    const { g, hits } = await make({ doc });
    g.attach();
    const press = (key, extra = {}) => handler({ key, target: { tagName: 'BODY' }, ...extra });
    for (const ch of SEQ) press(ch, { target: { tagName: 'INPUT' } }); // typing into a field
    await new Promise((r) => setTimeout(r, 30));
    expect(hits()).toBe(0);
    for (const ch of SEQ) press(ch, { ctrlKey: true }); // shortcuts
    for (const ch of SEQ) press(ch, { target: { tagName: 'DIV', isContentEditable: true } });
    for (const k of ['Shift', 'Enter', 'ArrowUp', 'Tab']) press(k);
    await new Promise((r) => setTimeout(r, 30));
    expect(hits()).toBe(0);
    for (const ch of SEQ) press(ch); // on the page
    await new Promise((r) => setTimeout(r, 60));
    expect(hits()).toBe(1);
    g.detach();
    expect(handler).toBe(null);
  });
});
