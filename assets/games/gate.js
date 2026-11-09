/**
 * Keyboard sequence detector. It watches for a short sequence typed quickly (outside of any text box) and calls back
 * when it matches. Only a salted SHA-256 of the sequence is stored here, never the sequence itself.
 */
const SALT = '012711429eae90d8';
const HASH = 'c9574b3448f0bda4473e4959ddec0242e677c3c10dffd911a070a73f8d2bbfcc';
const LEN = 10;
const GAP_MS = 1500; // a pause longer than this starts the sequence over

export async function sha256Hex(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `feed(char, now)` is exposed so the matcher can be tested without a keyboard. */
export function createGate({ onMatch, hash = HASH, salt = SALT, len = LEN, gap = GAP_MS, doc = typeof document !== 'undefined' ? document : null }) {
  let buffer = '';
  let last = 0;
  let version = 0;

  async function feed(ch, now = Date.now()) {
    if (now - last > gap) buffer = '';
    last = now;
    buffer = (buffer + ch.toLowerCase()).slice(-len);
    if (buffer.length < len) return false;
    const mine = ++version;
    const digest = await sha256Hex(salt + buffer);
    if (mine === version && digest === hash) { buffer = ''; onMatch(); return true; }
    return false;
  }

  const typing = (t) => !!t && (/^(input|textarea|select)$/i.test(t.tagName || '') || t.isContentEditable);
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || typing(e.target) || !e.key || e.key.length !== 1) return;
    void feed(e.key);
  }
  return {
    feed,
    attach() { if (doc) doc.addEventListener('keydown', onKey); },
    detach() { if (doc) doc.removeEventListener('keydown', onKey); },
  };
}
