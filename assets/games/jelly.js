/**
 * Sticky Jelly (vanilla DOM + canvas). `mount(root, opts)` draws the game into `root` and returns a cleanup function.
 * Rules live in jelly-engine.js and the levels in jelly-levels.js; this file only draws, animates and listens.
 *
 * Look: the site's three colours only (burnt orange, warm ivory, soft black) and their mixes, in both themes.
 * Feel: every jelly is a pair of springs (where it is, and how squashed it is), so it overshoots, wobbles and settles.
 * Glue: stuck jellies draw as one body; the gap between them closes with its own spring when they touch.
 * Reduced motion: no overshoot, no wobble, no idle breathing, no confetti, and the loop stops when everything is still.
 */
import { DIRS, KIND, bodies, bonds, covered, driven, isWon, parseLevel, solve, stars, step } from './jelly-engine.js?v=1';
import { LEVELS } from './jelly-levels.js?v=2';
import { randomLevel } from './jelly-random.js?v=2';

const SAVE_KEY = 'inala-jelly-v1';
const IVORY = [230, 213, 189];
const INK = [16, 16, 16];
const ORANGE = [213, 54, 12];
const WHITE = [255, 255, 255];
const PAD = 0.07; // gap between neighbouring cells, as a share of the cell, until they stick
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

// ---------------------------------------------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------------------------------------------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const rgb = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
}
function palette(dark) {
  return dark
    ? {
      floorA: rgb(mix(INK, IVORY, 0.12)), floorB: rgb(mix(INK, IVORY, 0.09)), wall: rgb(mix(INK, IVORY, 0.3)), hatch: rgb(IVORY, 0.14),
      shadow: 'rgba(0,0,0,.4)', fg: IVORY, ivory: IVORY, inkOutline: rgb(IVORY, 0.75), ringDash: rgb(IVORY, 0.85),
    }
    : {
      floorA: rgb(mix(IVORY, INK, 0.075)), floorB: rgb(mix(IVORY, INK, 0.115)), wall: rgb(mix(IVORY, INK, 0.34)), hatch: rgb(INK, 0.2),
      shadow: 'rgba(16,16,16,.2)', fg: INK, ivory: mix(IVORY, WHITE, 0.55), inkOutline: rgb(INK), ringDash: rgb(INK, 0.85),
    };
}
function rrPath(ctx, x, y, w, hh, tl, tr, br, bl) {
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + hh - br);
  if (br) ctx.arcTo(x + w, y + hh, x + w - br, y + hh, br); else ctx.lineTo(x + w, y + hh);
  ctx.lineTo(x + bl, y + hh);
  if (bl) ctx.arcTo(x, y + hh, x, y + hh - bl, bl); else ctx.lineTo(x, y + hh);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
  ctx.closePath();
}

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    const seed = Number.isInteger(s && s.seed) ? s.seed : (Math.random() * 4294967296) >>> 0;
    return { best: s && typeof s.best === 'object' && s.best ? s.best : {}, seed };
  } catch (e) { return { best: {}, seed: (Math.random() * 4294967296) >>> 0 }; }
}
function persist(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode: progress lasts this visit only */ }
}
const pips = (n, total = 3) => Array.from({ length: total }, (_, i) => h('i', { class: i < n ? 'on' : '' }));

// ---------------------------------------------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------------------------------------------
export function mount(root, opts = {}) {
  const save = loadSave();
  const params = opts.params || new URLSearchParams();
  persist(save); // keeps this visitor's seed, so their shuffled levels are the same boards next time
  const reduced = reducedMotion();
  let dead = false;

  // game state
  let view = 'play';
  let li = 0;
  let lv = null;
  let pos = null;
  let history = [];
  let moves = 0;
  let won = false;
  let hint = null; // { dir, path } shown until the next move
  let full = false; // false | 'native' | 'overlay'
  let thinking = false;
  let flags = []; // per jelly: [left, right, up, down] bonded
  let anim = [];
  let particles = [];
  let notice = '';
  let cs = 48; // css px per cell
  let mg = 14; // board margin in css px
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let visible = true;
  let winTimer = 0;
  let noticeTimer = 0;

  // Levels 1..LEVELS.length are hand-ordered; after that each is picked at random from a checked pool (jelly-random.js),
  // seeded per visitor so a level stays the same board when you come back. The list always has room to keep going.
  const MIN_TOTAL = 60;
  const made = new Map();
  const levelData = (i) => {
    if (i < LEVELS.length) return LEVELS[i];
    if (!made.has(i)) made.set(i, randomLevel(i - LEVELS.length, save.seed));
    return made.get(i);
  };
  const furthest = () => Object.keys(save.best).reduce((m, k) => Math.max(m, Number(k)), -1);
  const total = () => Math.max(MIN_TOTAL, furthest() + 7);
  let first = 0;
  while (save.best[first] !== undefined) first++;
  li = first;
  const fromUrl = parseInt(params.get('level') || '', 10);
  if (fromUrl >= 1 && fromUrl <= 999) li = fromUrl - 1;

  // ---- DOM ----
  const live = h('p', { class: 'sr', role: 'status', 'aria-live': 'polite' });
  const canvas = h('canvas', { class: 'j-canvas', tabindex: '0', role: 'img', 'aria-label': 'Sticky Jelly board' });
  const ctx = canvas.getContext('2d');
  const stage = h('div', { class: 'j-stage' }, canvas);
  const chipOf = h('small', { class: 'j-of' });
  const chipLevel = h('b'); const chipMoves = h('b'); const chipPar = h('small'); const chipRings = h('b');
  const chips = h('div', { class: 'j-chips' },
    h('span', { class: 'g-chip' }, h('small', {}, 'Level'), chipLevel, chipOf),
    h('span', { class: 'g-chip' }, h('small', {}, 'Moves'), chipMoves, chipPar),
    h('span', { class: 'g-chip' }, h('small', {}, 'Rings'), chipRings));
  const caption = h('p', { class: 'j-caption' });
  const btn = (label, fn, cls = 'btn-ghost', extra = {}) => h('button', { class: `btn ${cls} g-btn`, type: 'button', onclick: fn, ...extra }, label);
  const undoBtn = btn('Undo', () => undo(), 'btn-ghost', { 'aria-keyshortcuts': 'Z' });
  const restartBtn = btn('Restart', () => restart(), 'btn-ghost', { 'aria-keyshortcuts': 'R' });
  const hintBtn = btn('Hint', () => showHint(), 'btn-ghost', { 'aria-keyshortcuts': 'H', title: 'Show the next move (press again for the whole route)' });
  const fullBtn = btn('Full screen', () => toggleFull(), 'btn-ghost', { 'aria-keyshortcuts': 'F', 'aria-pressed': 'false' });
  const levelsBtn = btn('Levels', () => openLevels(), 'btn-ghost');
  const tools = h('div', { class: 'j-tools' }, undoBtn, restartBtn, hintBtn, levelsBtn, fullBtn);
  const padBtn = (dir, label, glyph) => h('button', { class: `j-pb j-pb-${dir}`, type: 'button', 'aria-label': label, onclick: () => move(dir) }, glyph);
  const pad = h('div', { class: 'j-pad' }, padBtn('up', 'Slide up', '↑'), padBtn('left', 'Slide left', '←'), padBtn('down', 'Slide down', '↓'), padBtn('right', 'Slide right', '→'));
  const note = h('p', { class: 'j-note', role: 'status' });
  const route = h('p', { class: 'j-route', 'aria-hidden': 'true', hidden: true });
  const winCard = h('div', { class: 'j-win', role: 'dialog', 'aria-label': 'Level cleared', hidden: true });
  const playView = h('div', { class: 'j-play' }, chips, caption, stage, note, route, winCard, pad, tools);
  const levelsView = h('div', { class: 'j-levels', hidden: true });
  const legend = h('ul', { class: 'j-legend' },
    h('li', {}, h('span', { class: 'j-sw is-orange', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, 'You. '), 'Every orange jelly slides each time you move.')),
    h('li', {}, h('span', { class: 'j-sw is-ivory', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, 'Sleepy. '), 'Touch it and it sticks to you for good.')),
    h('li', {}, h('span', { class: 'j-sw is-ink', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, 'Slick. '), 'Never sticks. Push it where you need it.')),
    h('li', {}, h('span', { class: 'j-sw is-ring', 'aria-hidden': 'true' }), h('span', {}, h('b', {}, 'Rings. '), 'Cover every one with any jelly.')));
  const help = h('div', { class: 'j-help' },
    legend,
    h('p', { class: 'g-hint' }, 'Arrow keys or WASD slide the jelly. Z undoes, R restarts, H gives a hint (press it twice for the whole route), F goes full screen. On a phone, swipe on the board.'));
  const app = h('div', { class: 'j-app' }, live, playView, levelsView, help);
  root.replaceChildren(app);
  document.body.classList.add('g-jelly'); // on small screens the floating review button would sit on the controls

  // ---- level loading ----
  function load(i, { silent = false } = {}) {
    li = Math.max(0, i);
    lv = parseLevel(levelData(li).rows);
    pos = lv.start;
    history = [];
    moves = 0;
    won = false;
    clearHint();
    particles = [];
    clearTimeout(winTimer);
    winCard.hidden = true;
    recompute();
    anim = Array.from(pos, (p, k) => ({
      x: p % lv.w, y: (p / lv.w) | 0, vx: 0, vy: 0,
      wx: reduced ? 0 : -0.85, wy: reduced ? 0 : -0.85, wvx: 0, wvy: 0,
      p: flags[k].map((b) => (b ? 0 : PAD)), pv: [0, 0, 0, 0],
      lx: 0, ly: 1, phase: Math.random() * 6,
    }));
    fit();
    paintHud();
    if (!silent) say(`Level ${li + 1}: ${levelData(li).name}. ${levelData(li).tip}`);
    kick();
  }
  function recompute() {
    const occ = new Map();
    pos.forEach((p, i) => occ.set(p, i));
    const sticky = (i) => lv.kinds[i] !== KIND.INK;
    flags = Array.from(pos, (p, i) => {
      if (!sticky(i)) return [false, false, false, false];
      const x = p % lv.w;
      const y = (p / lv.w) | 0;
      const at = (nx, ny) => { if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h) return false; const j = occ.get(ny * lv.w + nx); return j !== undefined && sticky(j); };
      return [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
    });
  }

  // ---- moves ----
  function move(dir) {
    if (dead || view !== 'play' || !lv) return;
    if (won) return;
    const r = step(lv, pos, dir);
    const [dx, dy] = DIRS[dir];
    const dr = driven(lv, pos);
    if (!r) {
      pos.forEach((_, i) => { if (dr[i]) bump(i, dx, dy); });
      anim.forEach((a, i) => { if (lv.kinds[i] === KIND.ORANGE) { a.lx = dx; a.ly = dy; } });
      tell('Blocked.', 900);
      kick();
      return;
    }
    const before = new Set(bonds(lv, pos));
    history.push(pos);
    pos = r.pos;
    moves++;
    clearHint();
    recompute();
    r.moved.forEach((i) => {
      const a = anim[i];
      if (!reduced) {
        if (dx) { a.wvx += 2.4; a.wvy -= 1.6; } else { a.wvy += 2.4; a.wvx -= 1.6; }
      }
    });
    anim.forEach((a, i) => { if (lv.kinds[i] === KIND.ORANGE || dr[i]) { a.lx = dx; a.ly = dy; } });
    const fresh = bonds(lv, pos).filter((b) => !before.has(b));
    if (fresh.length) {
      const ids = new Set(fresh.flatMap((b) => b.split('-').map(Number)));
      ids.forEach((i) => { if (!reduced) { anim[i].wvx += 3.2; anim[i].wvy += 3.2; } });
      tell(fresh.length > 1 ? 'Stuck together.' : 'Stuck!', 1200);
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* not supported */ }
    }
    paintHud();
    if (isWon(lv, pos)) finish(); else announceRings();
    kick();
  }
  function bump(i, dx, dy) {
    if (reduced) return;
    const a = anim[i];
    if (dx) { a.wvx -= 2.6; a.wvy += 1.6; } else { a.wvy -= 2.6; a.wvx += 1.6; }
  }
  function undo() {
    if (dead || view !== 'play' || !history.length) return;
    pos = history.pop();
    moves--;
    if (won) { won = false; winCard.hidden = true; clearTimeout(winTimer); particles = []; }
    clearHint();
    recompute();
    anim.forEach((a) => { if (!reduced) { a.wvx += 1.2; a.wvy += 1.2; } });
    paintHud();
    kick();
  }
  function restart() {
    if (dead || view !== 'play') return;
    if (!history.length && !won) return;
    load(li, { silent: true });
    say(`Level ${li + 1} restarted.`);
    focusBoard();
  }
  const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
  function clearHint() {
    hint = null;
    thinking = false;
    if (route && !route.hidden) { route.hidden = true; route.textContent = ''; if (full && lv) fit(); }
  }
  function showHint() {
    if (dead || view !== 'play' || won || thinking) return;
    if (hint) {
      // second press: spell out the whole route
      route.hidden = false;
      route.textContent = hint.path.map((d) => ARROW[d]).join(' ');
      if (full) fit();
      tell(`The whole route: ${hint.path.length} ${hint.path.length === 1 ? 'move' : 'moves'}.`, 5000);
      say(`Route: ${hint.path.join(', ')}.`);
      return;
    }
    thinking = true;
    hintBtn.disabled = true;
    tell('Thinking…', 4000);
    const at = pos;
    setTimeout(() => {
      thinking = false;
      if (dead) return;
      hintBtn.disabled = won;
      if (at !== pos || won || view !== 'play') return; // they moved while it was thinking
      const r = solve(lv, pos, 150000);
      if (!r.solved || !r.moves.length) {
        tell('This one cannot be finished from here. Undo a few moves, or restart.', 4200);
        say('This level cannot be finished from here. Undo or restart.');
        return;
      }
      hint = { dir: r.moves[0], path: r.moves };
      tell(`Hint: slide ${r.moves[0]}. ${r.moves.length} ${r.moves.length === 1 ? 'move' : 'moves'} to go at best. Press Hint again for the whole route.`, 6000);
      say(`Hint: slide ${r.moves[0]}.`);
      kick();
    }, 30);
  }

  // ---- full screen ----
  // The Fullscreen API where it exists (not on iPhone Safari); otherwise the game covers the page by itself.
  function setFull(mode) {
    full = mode;
    app.classList.toggle('is-full', !!mode);
    document.documentElement.classList.toggle('j-fs', mode === 'overlay');
    fullBtn.textContent = mode ? 'Exit full screen' : 'Full screen';
    fullBtn.setAttribute('aria-pressed', mode ? 'true' : 'false');
    say(mode ? 'Full screen.' : 'Left full screen.');
    fit();
    if (mode) { window.scrollTo(0, 0); app.scrollTop = 0; }
    focusBoard();
  }
  function toggleFull() {
    if (dead) return;
    if (full) { exitFull(); return; }
    const req = app.requestFullscreen || app.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(app);
        if (p && p.catch) p.catch(() => setFull('overlay'));
        return;
      } catch (e) { /* fall through to the overlay */ }
    }
    setFull('overlay');
  }
  function exitFull() {
    if (full === 'native') {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { setFull(false); }
    } else if (full) setFull(false);
  }
  function onFullChange() {
    const el = document.fullscreenElement || document.webkitFullscreenElement;
    if (el === app && full !== 'native') setFull('native');
    else if (el !== app && full === 'native') setFull(false);
  }
  function finish() {
    won = true;
    const par = levelData(li).par;
    const s = stars(moves, par);
    const prev = save.best[li];
    const improved = prev !== undefined && moves < prev;
    if (prev === undefined || moves < prev) { save.best[li] = moves; persist(save); }
    if (!reduced) {
      anim.forEach((a, i) => { a.wvx += 3.2 + (i % 3) * 0.4; a.wvy += 3.2 + (i % 3) * 0.4; });
      const sx = [ORANGE, IVORY, ORANGE, INK];
      lv.goals.forEach((g) => {
        for (let n = 0; n < 12; n++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
          const sp = 2.2 + Math.random() * 3.2;
          particles.push({ x: (g % lv.w) + 0.5, y: ((g / lv.w) | 0) + 0.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.1 + Math.random() * 0.5, age: 0, c: sx[n % sx.length], r: 0.05 + Math.random() * 0.05 });
        }
      });
    }
    say(`Level ${li + 1} cleared in ${moves} moves. ${s} of 3 stars.`);
    clearTimeout(winTimer);
    winTimer = setTimeout(() => showWin(s, improved, par), reduced ? 0 : 700);
  }
  function showWin(s, improved, par) {
    if (dead || !won) return;
    const shuffleNext = li === LEVELS.length - 1;
    winCard.replaceChildren(...[
      h('p', { class: 'g-eyebrow' }, `Level ${li + 1} cleared`),
      h('h3', {}, s === 3 ? 'Perfectly sticky.' : s === 2 ? 'Nicely stuck.' : 'Stuck it out.'),
      h('p', { class: 'j-win-meta' }, h('span', { class: 'j-pips', role: 'img', 'aria-label': `${s} of 3` }, pips(s)),
        h('span', {}, `${moves} ${moves === 1 ? 'move' : 'moves'}`), h('span', {}, `par ${par}`), improved ? h('span', {}, 'new best') : null),
      shuffleNext ? h('p', { class: 'j-win-sub' }, 'That is the last of the hand-ordered levels. From here every board is shuffled just for you, and they keep coming.') : null,
      h('div', { class: 'j-win-row' },
        btn('Next level', () => { load(li + 1); focusBoard(); }, 'btn-primary', { 'data-j-main': '' }),
        btn(moves > par ? 'Beat par' : 'Replay', () => { load(li, { silent: true }); focusBoard(); }, 'btn-ghost'),
        btn('Levels', () => openLevels(), 'btn-ghost')),
    ].filter(Boolean));
    winCard.hidden = false;
    const main = winCard.querySelector('[data-j-main]');
    if (main) main.focus({ preventScroll: true });
    // the card sits under the board, which can be below the fold: bring it just into view
    try { winCard.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
  }

  // ---- text ----
  function say(t) { live.textContent = ''; live.textContent = t; }
  function tell(t, ms) {
    note.textContent = t;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { note.textContent = notice; }, ms);
  }
  let lastRings = 0;
  function announceRings() {
    const c = covered(lv, pos).length;
    if (c !== lastRings) say(`${c} of ${lv.goals.length} rings covered.`);
    lastRings = c;
  }
  function paintHud() {
    const par = levelData(li).par;
    const c = covered(lv, pos).length;
    chipLevel.textContent = String(li + 1);
    chipOf.textContent = `of ${total()}`;
    chipMoves.textContent = String(moves);
    chipPar.textContent = `par ${par}`;
    chipRings.textContent = `${c}/${lv.goals.length}`;
    caption.replaceChildren(h('b', {}, levelData(li).name), ` ${levelData(li).tip}`);
    undoBtn.disabled = !history.length;
    restartBtn.disabled = !history.length && !won;
    hintBtn.disabled = won || thinking;
    lastRings = c;
    canvas.setAttribute('aria-label', `Sticky Jelly board. Level ${li + 1}, ${levelData(li).name}. ${moves} ${moves === 1 ? 'move' : 'moves'}. ${c} of ${lv.goals.length} rings covered. Use the arrow keys to slide the orange jelly.`);
  }
  function focusBoard() {
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    // Only ever called after the visitor does something: if the board is cut off, scroll so the chips and board are in view.
    const r = stage.getBoundingClientRect();
    const top = chips.getBoundingClientRect().top;
    if (r.bottom > window.innerHeight - 8 || top < 80) window.scrollTo({ top: window.scrollY + top - 84, behavior: reduced ? 'auto' : 'smooth' });
  }

  // ---- level picker ----
  function openLevels() {
    view = 'levels';
    clearTimeout(winTimer);
    playView.hidden = true;
    levelsView.hidden = false;
    levelsView.replaceChildren(
      h('div', { class: 'j-lv-head' },
        h('h2', {}, 'Levels'),
        h('span', { class: 'g-chip' }, h('b', {}, String(Object.keys(save.best).length)), h('small', {}, `of ${total()} cleared`))),
      h('div', { class: 'j-lv-grid' }, Array.from({ length: total() }, (_, i) => {
        const L = levelData(i);
        const b = save.best[i];
        const s = b === undefined ? 0 : stars(b, L.par);
        return h('button', { class: `j-lv${L.random ? ' is-random' : ''}${i === li ? ' is-now' : ''}${b === undefined ? '' : ' is-done'}`, type: 'button', 'data-j-lv': String(i), onclick: () => { view = 'play'; levelsView.hidden = true; playView.hidden = false; load(i); focusBoard(); } },
          h('span', { class: 'n' }, String(i + 1)),
          h('span', { class: 'nm' }, L.name),
          h('span', { class: 'j-pips', role: 'img', 'aria-label': b === undefined ? 'not cleared' : `${s} of 3` }, pips(s)));
      })),
      h('div', { class: 'j-lv-foot' }, btn('Back to the board', () => closeLevels(), 'btn-primary')));
    const cur = levelsView.querySelector('.is-now');
    if (cur) cur.focus({ preventScroll: true });
    const top = levelsView.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight - 120) window.scrollTo({ top: window.scrollY + top - 84, behavior: reduced ? 'auto' : 'smooth' });
  }
  function closeLevels() {
    view = 'play';
    levelsView.hidden = true;
    playView.hidden = false;
    fit();
    paintHud();
    if (won && winCard.hidden) showWin(stars(moves, levelData(li).par), false, levelData(li).par);
    focusBoard();
    kick();
  }

  // ---- layout ----
  function fit() {
    if (!lv || !stage.isConnected) return;
    const availW = Math.max(220, stage.clientWidth || root.clientWidth || 320);
    let availH = clamp(window.innerHeight - 300, 280, 640); // leaves room for the header, the chips and the buttons
    let top = 92;
    if (full) {
      // everything in the play view that is not the board, measured, so the board takes the rest of the screen
      const chrome = playView.offsetHeight - stage.offsetHeight + 8;
      availH = Math.max(220, window.innerHeight - chrome - 56);
      top = 150;
    }
    cs = clamp(Math.floor(Math.min(availW / (lv.w + 0.7), availH / (lv.h + 0.7))), 30, top);
    mg = Math.round(cs * 0.35);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = lv.w * cs + mg * 2;
    const hh = lv.h * cs + mg * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hh}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    kick();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => fit()) : null;
  if (ro) ro.observe(stage);
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) kick(); }) : null;
  if (io) io.observe(stage);

  // ---- animation ----
  function settled() {
    if (particles.length || hint) return false;
    return anim.every((a, i) => {
      const tx = pos[i] % lv.w;
      const ty = (pos[i] / lv.w) | 0;
      return Math.abs(a.x - tx) + Math.abs(a.y - ty) < 0.002 && Math.abs(a.vx) + Math.abs(a.vy) < 0.01 && Math.abs(a.wx) + Math.abs(a.wy) + Math.abs(a.wvx) + Math.abs(a.wvy) < 0.004
        && a.p.every((p, k) => Math.abs(p - (flags[i][k] ? 0 : PAD)) < 0.002);
    });
  }
  function integrate(dt) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const d = dt / n;
    const K = reduced ? 420 : 320;
    const C = reduced ? 2 * Math.sqrt(420) : 21;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < anim.length; i++) {
        const a = anim[i];
        const tx = pos[i] % lv.w;
        const ty = (pos[i] / lv.w) | 0;
        a.vx += (-K * (a.x - tx) - C * a.vx) * d; a.x += a.vx * d;
        a.vy += (-K * (a.y - ty) - C * a.vy) * d; a.y += a.vy * d;
        a.wvx += (-560 * a.wx - 8.5 * a.wvx) * d; a.wx += a.wvx * d;
        a.wvy += (-560 * a.wy - 8.5 * a.wvy) * d; a.wy += a.wvy * d;
        for (let k = 0; k < 4; k++) {
          const target = flags[i][k] ? 0 : PAD;
          a.pv[k] += (-520 * (a.p[k] - target) - 34 * a.pv[k]) * d; a.p[k] += a.pv[k] * d;
        }
      }
    }
    for (const p of particles) { p.age += dt; p.vy += 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    particles = particles.filter((p) => p.age < p.life);
  }
  function kick() {
    if (raf || dead || !visible) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    raf = 0;
    if (dead) return;
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    clock += dt;
    if (lv && view === 'play') {
      integrate(dt);
      draw();
    }
    if (!visible || document.hidden) return;
    if (reduced && view === 'play' && lv && settled()) return;
    if (view !== 'play') return;
    raf = requestAnimationFrame(frame);
  }

  // ---- drawing ----
  function draw() {
    const P = palette(isDark());
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const X = (cx) => mg + cx * cs;
    const Y = (cy) => mg + cy * cs;

    // floor and walls
    for (let y = 0; y < lv.h; y++) {
      for (let x = 0; x < lv.w; x++) {
        const c = lv.cells[y * lv.w + x];
        if (!c) continue;
        const px = X(x);
        const py = Y(y);
        if (c === 1) {
          ctx.fillStyle = (x + y) % 2 ? P.floorA : P.floorB;
          ctx.beginPath(); rrPath(ctx, px + 1, py + 1, cs - 2, cs - 2, cs * 0.13, cs * 0.13, cs * 0.13, cs * 0.13); ctx.fill();
        } else {
          ctx.fillStyle = P.wall;
          ctx.fillRect(px, py, cs, cs);
          ctx.save();
          ctx.beginPath(); ctx.rect(px, py, cs, cs); ctx.clip();
          ctx.strokeStyle = P.hatch; ctx.lineWidth = Math.max(1, cs * 0.04);
          ctx.beginPath();
          for (let o = -cs; o < cs * 2; o += cs * 0.22) { ctx.moveTo(px + o, py + cs); ctx.lineTo(px + o + cs, py); }
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // rings
    const on = new Set(pos);
    ctx.lineWidth = Math.max(2, cs * 0.05);
    for (const g of lv.goals) {
      if (on.has(g)) continue;
      const cx = X((g % lv.w) + 0.5);
      const cy = Y(((g / lv.w) | 0) + 0.5);
      ctx.strokeStyle = P.ringDash;
      ctx.setLineDash([cs * 0.09, cs * 0.075]);
      ctx.lineDashOffset = reduced ? 0 : -clock * cs * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy, cs * 0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgb(ORANGE);
      ctx.beginPath(); ctx.arc(cx, cy, cs * 0.075, 0, Math.PI * 2); ctx.fill();
    }

    // bodies
    const body = bodies(lv, pos);
    const dr = driven(lv, pos, body);
    const groups = new Map();
    body.forEach((b, i) => { if (!groups.has(b)) groups.set(b, []); groups.get(b).push(i); });
    const list = [...groups.values()].map((ids) => {
      let cx = 0; let cy = 0; let sx = 0; let sy = 0;
      for (const i of ids) { const a = anim[i]; cx += X(a.x + 0.5); cy += Y(a.y + 0.5); sx += a.wx; sy += a.wy; }
      const n = ids.length;
      const breathe = reduced ? 0 : Math.sin(clock * 2.1 + anim[ids[0]].phase) * 0.011;
      return { ids, cx: cx / n, cy: cy / n, sx: 1 + sx / n - breathe, sy: 1 + sy / n + breathe };
    });
    const shape = (i) => {
      const a = anim[i];
      const f = flags[i];
      const r = cs * 0.29;
      const x0 = X(a.x) + a.p[0] * cs;
      const x1 = X(a.x + 1) - a.p[1] * cs;
      const y0 = Y(a.y) + a.p[2] * cs;
      const y1 = Y(a.y + 1) - a.p[3] * cs;
      ctx.beginPath();
      rrPath(ctx, x0, y0, x1 - x0, y1 - y0, f[0] || f[2] ? 0 : r, f[1] || f[2] ? 0 : r, f[1] || f[3] ? 0 : r, f[0] || f[3] ? 0 : r);
      return [x0, y0, x1, y1];
    };
    const wrap = (B, fn) => {
      ctx.save();
      ctx.translate(B.cx, B.cy); ctx.scale(clamp(B.sx, 0.5, 1.6), clamp(B.sy, 0.5, 1.6)); ctx.translate(-B.cx, -B.cy);
      fn();
      ctx.restore();
    };
    // shadows first, so a body never lies under another body's shadow
    ctx.fillStyle = P.shadow;
    for (const B of list) wrap(B, () => { ctx.save(); ctx.translate(0, cs * 0.08); for (const i of B.ids) { shape(i); ctx.fill(); } ctx.restore(); });

    const ow = Math.max(2, cs * 0.05);
    for (const B of list) {
      wrap(B, () => {
        const fillOf = (i) => (lv.kinds[i] === KIND.ORANGE ? rgb(ORANGE) : lv.kinds[i] === KIND.IVORY ? rgb(P.ivory) : rgb(INK));
        const lineOf = (i) => (lv.kinds[i] === KIND.INK ? P.inkOutline : rgb(INK));
        // outline pass (round joins), then fill pass: the seam between stuck cells is covered by the fills
        ctx.lineJoin = 'round'; ctx.lineWidth = ow * 2;
        for (const i of B.ids) { ctx.strokeStyle = lineOf(i); shape(i); ctx.stroke(); }
        for (const i of B.ids) { ctx.fillStyle = fillOf(i); shape(i); ctx.fill(); }
        for (const i of B.ids) {
          const a = anim[i];
          const kind = lv.kinds[i];
          const [x0, y0, x1, y1] = shape(i);
          ctx.save(); ctx.clip();
          const gr = ctx.createLinearGradient(0, y0, 0, y1);
          gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, kind === KIND.IVORY ? 'rgba(16,16,16,.1)' : 'rgba(0,0,0,.22)');
          ctx.fillStyle = gr; ctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
          ctx.restore();
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          // gloss
          if (!(flags[i][0] || flags[i][2])) {
            ctx.strokeStyle = kind === KIND.IVORY ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.5)';
            ctx.lineWidth = cs * 0.05; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(x0 + cs * 0.27, y0 + cs * 0.27, cs * 0.14, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
            ctx.lineCap = 'butt';
          }
          drawFace(i, kind, dr[i], cx, cy, a);
          if (lv.goals.includes(pos[i])) drawBadge(x1, y0);
        }
      });
    }

    // hint
    if (hint) {
      const [dx, dy] = DIRS[hint.dir];
      const t = (clock * 2.4) % 1;
      ctx.fillStyle = rgb(P.fg, 0.9);
      for (let i = 0; i < pos.length; i++) {
        if (lv.kinds[i] !== KIND.ORANGE) continue;
        const a = anim[i];
        const cx = X(a.x + 0.5) + dx * cs * (0.62 + t * 0.2);
        const cy = Y(a.y + 0.5) + dy * cs * (0.62 + t * 0.2);
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(dy, dx)); ctx.globalAlpha = 1 - t * 0.6;
        ctx.beginPath(); ctx.moveTo(cs * 0.15, 0); ctx.lineTo(-cs * 0.1, -cs * 0.17); ctx.lineTo(-cs * 0.1, cs * 0.17); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    // confetti
    for (const p of particles) {
      const k = 1 - p.age / p.life;
      ctx.fillStyle = rgb(p.c === INK && isDark() ? IVORY : p.c, clamp(k * 1.6, 0, 1));
      const s = cs * p.r * 2;
      ctx.fillRect(X(p.x) - s / 2, Y(p.y) - s / 2, s, s);
    }
  }
  function drawFace(i, kind, isDriven, cx, cy, a) {
    if (kind === KIND.INK) {
      ctx.strokeStyle = rgb(IVORY, 0.55); ctx.lineWidth = cs * 0.04; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - cs * 0.05, cy + cs * 0.02); ctx.lineTo(cx + cs * 0.07, cy - cs * 0.1); ctx.moveTo(cx + cs * 0.01, cy + cs * 0.14); ctx.lineTo(cx + cs * 0.17, cy - cs * 0.04); ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    const ex = cs * 0.15;
    const ey = cy - cs * 0.04;
    if (kind === KIND.IVORY && !isDriven) {
      ctx.strokeStyle = rgb(INK); ctx.lineWidth = cs * 0.045; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx - ex, ey, cs * 0.065, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + ex, ey, cs * 0.065, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + cs * 0.15, cs * 0.03, 0, Math.PI * 2); ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    const blink = !reduced && ((clock + a.phase) % 4.3) < 0.13;
    const lookX = clamp(a.lx, -1, 1) * cs * 0.035;
    const lookY = clamp(a.ly, -1, 1) * cs * 0.03;
    for (const s of [-1, 1]) {
      const x = cx + s * ex;
      if (blink) {
        ctx.strokeStyle = rgb(INK); ctx.lineWidth = cs * 0.045; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - cs * 0.06, ey); ctx.lineTo(x + cs * 0.06, ey); ctx.stroke(); ctx.lineCap = 'butt';
        continue;
      }
      ctx.fillStyle = rgb(kind === KIND.ORANGE ? IVORY : WHITE);
      ctx.beginPath(); ctx.ellipse(x, ey, cs * 0.095, cs * 0.11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb(INK);
      ctx.beginPath(); ctx.arc(x + lookX, ey + lookY, cs * 0.053, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = rgb(INK); ctx.lineWidth = cs * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx + lookX * 0.6, cy + cs * 0.1, cs * 0.075, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function drawBadge(x1, y0) {
    const r = cs * 0.14;
    const bx = x1 - r * 1.15;
    const by = y0 + r * 1.15;
    ctx.fillStyle = rgb(INK); ctx.strokeStyle = rgb(IVORY); ctx.lineWidth = Math.max(1.5, cs * 0.03);
    ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgb(IVORY); ctx.lineWidth = Math.max(1.5, cs * 0.04); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(bx - r * 0.45, by + r * 0.02); ctx.lineTo(bx - r * 0.1, by + r * 0.38); ctx.lineTo(bx + r * 0.5, by - r * 0.32); ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // ---- input ----
  let heldAt = 0;
  function boardInView() {
    if (full) return true;
    const r = stage.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }
  // Listens on the document, not on the game: after a page change the site puts focus on <main>, which is outside the
  // game, so a listener on the game alone never hears the first keys. Keys are only taken while the board is on screen.
  function onKey(e) {
    if (dead || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && t.nodeType === 1 && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    if (view === 'levels') {
      if (e.key === 'Escape' && app.isConnected) { e.preventDefault(); closeLevels(); }
      return;
    }
    if (!boardInView()) return;
    const dir = KEYS[e.key];
    if (dir) {
      e.preventDefault();
      const now = performance.now();
      if (e.repeat && now - heldAt < 95) return;
      heldAt = now;
      if (!full) { const r = stage.getBoundingClientRect(); if (r.bottom > window.innerHeight - 4 || r.top < 60) stage.scrollIntoView({ block: 'nearest' }); }
      move(dir);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'u' || e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (k === 'r') { e.preventDefault(); restart(); }
    else if (k === 'h') { e.preventDefault(); showHint(); }
    else if (k === 'f') { e.preventDefault(); toggleFull(); }
    else if (e.key === 'Escape') { if (full === 'overlay') { e.preventDefault(); exitFull(); } else if (!full) { e.preventDefault(); openLevels(); } }
    else if (k === 'l') { e.preventDefault(); openLevels(); }
    else if ((k === 'n') && won) { e.preventDefault(); load(li + 1); focusBoard(); }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFullChange);
  document.addEventListener('webkitfullscreenchange', onFullChange);

  let sx = 0; let sy = 0; let down = false;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    down = true; sx = e.clientX; sy = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    focusBoard();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    const th = Math.max(20, cs * 0.45);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    sx = e.clientX; sy = e.clientY;
  });
  const up = () => { down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const onTheme = () => kick();
  window.addEventListener('themechange', onTheme);
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', onTheme);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);
  const onResize = () => fit();
  window.addEventListener('resize', onResize);

  load(li, { silent: true });
  // the page is not scrolled or focused for the visitor: they click the board (or tab to it) to start
  say(`Sticky Jelly, level ${li + 1} of ${total()}.`);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    clearTimeout(winTimer);
    clearTimeout(noticeTimer);
    document.body.classList.remove('g-jelly');
    document.documentElement.classList.remove('j-fs');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullChange);
    document.removeEventListener('webkitfullscreenchange', onFullChange);
    try { if ((document.fullscreenElement || document.webkitFullscreenElement) === app) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ }
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    window.removeEventListener('themechange', onTheme);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    if (mq && mq.removeEventListener) mq.removeEventListener('change', onTheme);
  };
}
