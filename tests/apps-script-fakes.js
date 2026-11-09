/**
 * Just enough of Google Apps Script (Sheets, cache, lock, hashing, content output) to run backend/games.gs in Node.
 * `loadScript()` returns the script's functions (doGet, doPost, setup...) running against an in-memory spreadsheet.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.rows[this.r - 1 + i]?.[this.c - 1 + j] ?? '')); }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { (this.sheet.rows[this.r - 1 + i] ||= [])[this.c - 1 + j] = x; })); return this; }
  setFontWeight() { return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getLastRow() { return this.rows.length; }
  appendRow(r) { this.rows.push(r.slice()); }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {}
  clear() { this.rows = []; }
}
export function loadScript(path = new URL('../backend/games.gs', import.meta.url)) {
  const sheets = [new Sheet('Sheet1')];
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: (s) => { sheets.splice(sheets.indexOf(s), 1); },
  };
  const store = new Map();
  const out = (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } });
  const ctx = {
    SpreadsheetApp: { openById: () => ss },
    CacheService: { getScriptCache: () => ({ get: (k) => store.get(k) ?? null, put: (k, v) => { store.set(k, v); }, remove: (k) => { store.delete(k); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: out, MimeType: { JSON: 'json' } },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, s) => Array.from(createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)), // Apps Script returns signed bytes
    },
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path, 'utf8'), ctx);
  const api = {
    sheets, ctx, cacheStore: store,
    sheet: (n) => ss.getSheetByName(n),
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()),
    get: (params) => JSON.parse(ctx.doGet({ parameter: params }).getContent()),
  };
  return api;
}
