/**
 * Games UI (vanilla DOM). `mount(root, opts)` draws the Games hub or the Rummy screens into `root` and returns a
 * cleanup function. All text goes in as text nodes, never as HTML, so player names cannot inject markup.
 *
 * Screens: entry (name, wallet, create/join, leaderboard) -> lobby (players, table rules) -> table -> results.
 */
import {
  BET_OPTIONS, LAYOUTS, MAX_PLAYERS, MIN_PLAYERS, ROUND_OPTIONS, evaluateHand, layoutOf, rankName, shapeAllowed,
} from './engine.js?v=1';
import { autoSort, groupSelected, moveToGroup, reconcile, sortWithinGroups, toIds, ungroup } from './hand.js?v=1';
import { REFILL_BELOW, REFILL_TO, loadBoard, loadProfile, rankBoard, subscribeProfile, topUp } from './profile.js?v=1';
import { configure, normalizeCode } from './session.js?v=1';
import { hostRoom, joinRoom, lastRoom, leaveRoom, savedName, watch } from './store.js?v=1';

// ---------------------------------------------------------------------------------------------------------------
// tiny DOM helpers
// ---------------------------------------------------------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'disabled') el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
function svgEl(viewBox, inner, cls) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = inner; // static markup only, never user text
  return s;
}
/** An icon from the site's sprite (see index.html). */
function icon(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('class', 'ic');
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
}

const SUIT_PATH = {
  H: '<path d="M12 21.3C5.4 16.2 2 12.6 2 8.6 2 5.6 4.3 3.5 7 3.5c2 0 3.8 1.1 5 3 1.2-1.9 3-3 5-3 2.7 0 5 2.1 5 5.1 0 4-3.4 7.6-10 12.7z"/>',
  D: '<path d="M12 1.8c1.6 3.2 5.4 7.2 9 10.2-3.6 3-7.4 7-9 10.2-1.6-3.2-5.4-7.2-9-10.2 3.6-3 7.4-7 9-10.2z"/>',
  S: '<path d="M12 1.8C8 7.4 3 10.4 3 14.6c0 2.5 2 4.4 4.4 4.4 1.8 0 3.2-.9 4.1-2.4-.2 2.4-1 4.2-2.6 5.6h6.2c-1.6-1.4-2.4-3.2-2.6-5.6.9 1.5 2.3 2.4 4.1 2.4 2.4 0 4.4-1.9 4.4-4.4 0-4.2-5-7.2-9-12.8z"/>',
  C: '<circle cx="12" cy="6.9" r="4.4"/><circle cx="6.4" cy="14.4" r="4.4"/><circle cx="17.6" cy="14.4" r="4.4"/><path d="M12 12.5c.1 3.4-.9 6.6-2.9 9.7h5.8c-2-3.1-3-6.3-2.9-9.7z"/>',
  J: '<path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/>',
};
const suitSvg = (suit, cls) => svgEl('0 0 24 24', SUIT_PATH[suit], cls);
const RANK = (r) => (r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const cardLabel = (c) => (c.rank === 0 || !c.suit ? 'Joker' : `${rankName(c.rank)} of ${SUIT_NAME[c.suit]}`);

/**
 * A playing card: ivory paper, ink and orange, with the site's "TI" mark on the back.
 * opts: wild, selected, toggle (aria-pressed), onclick, label, hot, small.
 */
function cardEl(card, o = {}) {
  const joker = card && (card.rank === 0 || !card.suit);
  const red = card && (card.suit === 'H' || card.suit === 'D');
  const cls = ['g-card', !card && 'is-back', joker && 'is-joker', red && 'is-red', o.selected && 'is-sel', o.hot && 'is-hot', o.small && 'is-small'].filter(Boolean).join(' ');
  const label = o.label || (card ? cardLabel(card) : 'Face-down card');
  const el = o.onclick
    ? h('button', { class: cls, type: 'button', 'aria-label': label, 'data-fk': card ? 'c' + card.id : o.fk, 'aria-pressed': o.toggle ? (o.selected ? 'true' : 'false') : null, onclick: o.onclick })
    : h('div', { class: cls, role: 'img', 'aria-label': label });
  if (card) {
    el.append(
      h('span', { class: 'idx' }, h('span', { class: 'rk' }, joker ? 'JK' : RANK(card.rank)), suitSvg(joker ? 'J' : card.suit)),
      suitSvg(joker ? 'J' : card.suit, 'pip'),
    );
    if (o.wild && !joker) el.append(h('span', { class: 'wild', title: 'Wild joker rank', 'aria-hidden': 'true' }, 'W'));
  }
  return el;
}

function confirmDialog({ title, body, confirmLabel, onConfirm }) {
  const dlg = h('dialog', { class: 'g-dlg', 'aria-labelledby': 'g-dlg-t' },
    h('h2', { id: 'g-dlg-t' }, title),
    h('p', {}, body),
    h('div', { class: 'g-row' },
      h('button', { class: 'btn btn-ghost g-btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary g-btn', type: 'button', onclick: () => { dlg.close(); onConfirm(); } }, confirmLabel)));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------------------------------------------------------------------------------------------------------
// shared sections
// ---------------------------------------------------------------------------------------------------------------
function walletEl() {
  const p = loadProfile();
  const broke = p.coins < REFILL_BELOW;
  return h('div', { class: 'g-row' },
    h('span', { class: 'g-wallet' }, h('i', {}, icon('coins')), h('span', {}, `${p.coins} coins`)),
    broke && h('button', { class: 'btn btn-ghost g-btn', type: 'button', 'data-fk': 'topup', onclick: () => topUp() }, `Top up to ${REFILL_TO}`),
    h('span', { class: 'g-hint', style: 'margin:0' }, 'Play money only: it cannot be bought or cashed out.'));
}

function leaderboardEl() {
  const rows = rankBoard(loadBoard());
  const me = loadProfile().pid;
  const panel = h('section', { class: 'g-panel', 'aria-label': 'Leaderboard' }, h('h2', {}, 'Leaderboard'));
  if (!rows.length) {
    panel.append(h('p', {}, 'No games yet. Finish a game and everyone at the table shows up here, so you can see who is winning over time.'));
    return panel;
  }
  const head = ['#', 'Player', 'Played', 'Won', 'Win rate', 'Avg points', 'Coins'];
  panel.append(
    h('div', { class: 'g-scroll' }, h('table', { class: 'g-table' },
      h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: i > 1 ? 'num' : '' }, t)))),
      h('tbody', {}, rows.map((r, i) => h('tr', { class: r.pid === me ? 'is-me' : '' },
        h('td', {}, String(i + 1)),
        h('td', {}, h('b', {}, r.name), r.pid === me ? ' (you)' : ''),
        h('td', { class: 'num' }, String(r.games)),
        h('td', { class: 'num' }, String(r.wins)),
        h('td', { class: 'num' }, Math.round((r.wins / Math.max(1, r.games)) * 100) + '%'),
        h('td', { class: 'num' }, String(Math.round(r.points / Math.max(1, r.games)))),
        h('td', { class: 'num' }, (r.coinsNet > 0 ? '+' : r.coinsNet < 0 ? '−' : '') + Math.abs(r.coinsNet)),
      ))))),
    h('p', { class: 'g-hint' }, 'Stored in this browser. Coins shows net winnings and losses across games you played together.'));
  return panel;
}

export function ruleLines(r) {
  const layout = layoutOf(r);
  return [
    `${r.rounds} ${r.rounds === 1 ? 'round' : 'rounds'}, lowest total wins`,
    r.jokerMode === 'open' ? 'Open joker: everyone can see the wild joker' : 'Closed joker: you see the wild joker only after you make a pure sequence',
    layout.shapes === null ? 'Any valid groups can win' : `Winning hand must be ${layout.label.replace(/\s+/g, ' ')}`,
    r.maxJokers === 0 ? 'No limit on jokers in a group' : `At most ${r.maxJokers} ${r.maxJokers === 1 ? 'joker' : 'jokers'} in a group`,
    `Drop ${r.firstDrop} before drawing, ${r.middleDrop} after`,
    `Wrong declaration ${r.wrongDeclare}, hands capped at ${r.maxPoints}`,
    r.bet > 0 ? `Entry bet ${r.bet} coins, winner takes the pot` : 'Playing for fun: no coins at stake',
  ];
}
const rulesSummary = (rules) => h('ul', { class: 'g-rules' }, ruleLines(rules).map((l) => h('li', {}, l)));

function field(id, label, value, options, onChange, hint) {
  return h('div', {},
    h('label', { class: 'g-label', for: id }, label),
    h('select', { class: 'g-select', id, 'data-fk': id, onchange: (e) => onChange(e.target.value) },
      options.map(([v, text]) => h('option', { value: String(v), selected: String(v) === String(value) ? true : null }, text))),
    hint && h('p', { class: 'g-hint' }, hint));
}

function rulesEditor(rules, change) {
  const n = (v) => Number(v);
  const joker = [
    ['open', 'Open joker', 'The wild joker is visible to everyone from the start.'],
    ['closed', 'Closed joker', 'Hidden until you make a pure sequence. Only then can you see it.'],
  ];
  return h('div', {},
    h('div', { role: 'radiogroup', 'aria-label': 'Joker' },
      h('span', { class: 'g-label' }, 'Joker'),
      h('div', { class: 'g-choice' }, joker.map(([id, title, text]) =>
        h('button', { type: 'button', role: 'radio', class: 'g-opt', 'aria-checked': String(rules.jokerMode === id), 'data-fk': 'joker-' + id, onclick: () => change({ jokerMode: id }) },
          h('b', {}, title), h('span', {}, text))))),
    h('div', { class: 'g-fields' },
      field('rule-layout', 'Winning hand shape', rules.layout, LAYOUTS.map((l) => [l.id, l.label]), (v) => change({ layout: v }), 'How the 13 cards must be split into groups to declare.'),
      field('rule-jokers', 'Jokers per group', rules.maxJokers, [[0, 'No limit'], [1, 'At most 1'], [2, 'At most 2']], (v) => change({ maxJokers: n(v) }), 'Limits jokers in impure sequences and sets.'),
      field('rule-rounds', 'Rounds', rules.rounds, ROUND_OPTIONS.map((r) => [r, `${r} ${r === 1 ? 'round' : 'rounds'}`]), (v) => change({ rounds: n(v) })),
      field('rule-bet', 'Entry bet (virtual coins)', rules.bet, BET_OPTIONS.map((b) => [b, b === 0 ? 'No bet, just for fun' : `${b} coins each`]), (v) => change({ bet: n(v) }), 'Everyone pays in; the winner takes the pot.'),
      field('rule-first', 'First drop', rules.firstDrop, [0, 10, 20, 25, 30].map((v) => [v, `${v} points`]), (v) => change({ firstDrop: n(v) }), 'Leaving before your first draw.'),
      field('rule-middle', 'Middle drop', rules.middleDrop, [20, 30, 40, 50, 60].map((v) => [v, `${v} points`]), (v) => change({ middleDrop: n(v) }), 'Leaving after you have drawn.'),
      field('rule-wrong', 'Wrong declaration', rules.wrongDeclare, [40, 60, 80, 100, 120].map((v) => [v, `${v} points`]), (v) => change({ wrongDeclare: n(v) })),
      field('rule-max', 'Max points per hand', rules.maxPoints, [40, 60, 80, 100, 120].map((v) => [v, `${v} points`]), (v) => change({ maxPoints: n(v) }))));
}

function howToPlay() {
  const p = (...k) => h('p', {}, ...k);
  const b = (t) => h('strong', {}, t);
  return h('details', { class: 'g-panel g-details', style: 'margin-top:1rem' },
    h('summary', {}, 'How to play'),
    h('div', { class: 'g-hint', style: 'display:grid;gap:.625rem;font-size:.9375rem' },
      p('Everyone gets 13 cards. A random card is cut as the ', b('wild joker'), ': every card of that rank, plus the printed jokers, can stand in for any card. With an ', b('open joker'), ' everyone sees it. With a ', b('closed joker'), ' you only see it once you hold a pure sequence.'),
      p('On your turn, draw one card from the stock or the top of the discard pile, then discard one card.'),
      p('To win, arrange all 13 cards into groups and ', b('declare'), ': select one card as your finishing discard, then press Declare. You need at least ', b('two sequences'), ', and at least one must be ', b('pure'), ' (no joker). Other groups can be sets (3 or 4 cards of one rank, different suits) or sequences. The host can also require a hand shape such as 4+3+3+3 or 5+4+4, and limit jokers per group.'),
      p('Tap cards to select them, then ', h('em', {}, 'Group selected'), '. Use ', h('em', {}, '+ add here'), ' to move selected cards into an existing group. Your groups are labelled so you can see what is valid.'),
      p(b('Scoring:'), " the winner scores 0. Everyone else scores the face value of cards outside valid groups (A, K, Q, J, 10 = 10; jokers = 0), up to the table's cap. No pure sequence means the whole hand counts. Dropping and wrong declarations cost the points the host set. Lowest total after the last round wins."),
      p(b('Coins:'), ' if the host sets an entry bet, everyone pays it in and the winner takes the pot (ties split it). Coins are play money kept in your browser: they cannot be bought or cashed out.'),
      p("The host's browser runs the game. If the host closes the page the game ends and entry bets are returned. Players who refresh can rejoin.")));
}

// ---------------------------------------------------------------------------------------------------------------
// the mount
// ---------------------------------------------------------------------------------------------------------------
let resumeTried = false;

export function mount(root, opts = {}) {
  configure(opts.config || {});
  const sub = opts.sub || 'hub';
  const params = opts.params || new URLSearchParams();
  const form = { name: savedName(), code: normalizeCode(params.get('room') || ''), error: null, busy: null };
  const local = { gameId: null, round: 0, groups: [], selected: new Set(), notice: null, noticeTimer: 0, copied: null };
  let session = null;
  let dead = false;

  const live = () => session && ['lobby', 'game'].includes(session.getState().status);

  function setNotice(text) {
    local.notice = text;
    clearTimeout(local.noticeTimer);
    local.noticeTimer = setTimeout(() => { local.notice = null; render(); }, 4000);
  }

  // ---- arrangement kept on this device; the host only needs to know it for scoring ----
  function syncLocal(view) {
    const fresh = local.gameId !== view.gameId || local.round !== view.round;
    if (fresh) {
      local.gameId = view.gameId;
      local.round = view.round;
      local.groups = autoSort(view.myGroups);
      local.selected = new Set();
      announce();
    } else {
      local.groups = reconcile(local.groups, view.myGroups);
      const ids = new Set(view.myGroups.flat().map((c) => c.id));
      for (const id of [...local.selected]) if (!ids.has(id)) local.selected.delete(id);
    }
  }
  function announce() {
    const s = session;
    const groups = toIds(local.groups);
    setTimeout(() => { if (s && !dead) s.act({ a: 'arrange', groups }); }, 0);
  }
  function update(next) {
    local.groups = next;
    local.selected = new Set();
    session.act({ a: 'arrange', groups: toIds(next) });
    render();
  }

  // ---- screens ----
  function entryView() {
    const wrap = h('div', {});
    const nameInput = h('input', { class: 'g-input', id: 'g-name', 'data-fk': 'name', maxlength: '20', placeholder: 'e.g. Priya', autocomplete: 'nickname', value: form.name,
      oninput: (e) => { form.name = e.target.value; } });
    const codeInput = h('input', { class: 'g-input g-code', id: 'g-code', 'data-fk': 'code', maxlength: '5', placeholder: 'ABCDE', autocapitalize: 'characters', value: form.code,
      oninput: (e) => {
        form.code = normalizeCode(e.target.value);
        e.target.value = form.code;
        joinBtn.disabled = form.busy !== null || form.code.length !== 5;
      } });
    const go = async (kind) => {
      if (!form.name.trim()) { form.error = 'Enter your name first.'; render(); return; }
      form.busy = kind;
      form.error = null;
      render();
      try {
        if (kind === 'host') await hostRoom(form.name.trim());
        else await joinRoom(form.code, form.name.trim());
        try { history.replaceState(null, '', '#/games/rummy'); } catch { /* ignore */ }
      } catch (e) {
        form.error = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      } finally {
        form.busy = null;
        render();
      }
    };
    const createBtn = h('button', { class: 'btn btn-primary g-btn', type: 'button', 'data-fk': 'create', disabled: form.busy !== null, onclick: () => go('host') }, form.busy === 'host' ? 'Opening…' : 'Create room');
    const joinBtn = h('button', { class: 'btn btn-ghost g-btn', type: 'submit', 'data-fk': 'join', disabled: form.busy !== null || form.code.length !== 5 }, form.busy === 'join' ? 'Joining…' : 'Join room');

    wrap.append(
      h('div', { class: 'g-grid two' },
        h('div', { class: 'g-panel g-span' },
          h('label', { class: 'g-label', for: 'g-name' }, 'Your name'), h('div', { style: 'max-width:22rem' }, nameInput),
          h('p', { class: 'g-hint' }, 'Shown to the other players at the table.'),
          h('div', { style: 'margin-top:1rem' }, walletEl())),
        h('div', { class: 'g-panel', style: 'display:flex;flex-direction:column' },
          h('h2', {}, 'Start a game'),
          h('p', { style: 'flex:1' }, 'Open a room and share the code or link with your friends. You need at least 3 players, up to 6. You choose the rules.'),
          h('div', { style: 'margin-top:1.25rem' }, createBtn)),
        h('form', { class: 'g-panel', onsubmit: (e) => { e.preventDefault(); go('join'); } },
          h('h2', {}, 'Join a game'),
          h('label', { class: 'g-label', for: 'g-code', style: 'margin-top:.75rem' }, 'Room code'), codeInput,
          h('div', { style: 'margin-top:1.25rem' }, joinBtn)),
        form.error && h('p', { class: 'g-alert g-span', role: 'alert', style: 'margin:0' }, form.error),
        h('div', { class: 'g-span' }, leaderboardEl())),
      howToPlay());
    return wrap;
  }

  function lobbyView(st) {
    const lobby = st.lobby;
    const { rules } = lobby;
    const isHost = session.isHost;
    const broke = lobby.players.filter((p) => p.coins < rules.bet);
    const ready = lobby.players.length >= MIN_PLAYERS && broke.length === 0;
    const link = `${location.origin}${location.pathname}#/games/rummy?room=${st.code}`;
    const copy = async (what) => {
      try {
        await navigator.clipboard.writeText(what === 'code' ? st.code : link);
        local.copied = what;
        render();
        setTimeout(() => { local.copied = null; render(); }, 1800);
      } catch { /* clipboard blocked: the code is on screen anyway */ }
    };
    const missing = MIN_PLAYERS - lobby.players.length;
    return h('div', { class: 'g-grid lobby' },
      h('section', { class: 'g-panel' },
        h('span', { class: 'g-eyebrow' }, 'Room code'),
        h('p', { class: 'g-codebig', 'aria-label': 'Room code ' + st.code.split('').join(' '), }, st.code),
        h('div', { class: 'g-row', style: 'margin-top:1rem' },
          h('button', { class: 'btn btn-ghost g-btn', type: 'button', 'data-fk': 'copy-code', onclick: () => copy('code') }, icon(local.copied === 'code' ? 'check' : 'copy'), 'Copy code'),
          h('button', { class: 'btn btn-ghost g-btn', type: 'button', 'data-fk': 'copy-link', onclick: () => copy('link') }, icon(local.copied === 'link' ? 'check' : 'copy'), 'Copy invite link')),
        h('p', { class: 'g-hint' }, 'Friends open the link, or go to Games, Rummy and type the code.')),
      h('section', { class: 'g-panel' },
        h('h2', {}, `Players (${lobby.players.length}/${MAX_PLAYERS})`),
        h('ul', { class: 'g-players' }, lobby.players.map((p) => h('li', {},
          h('span', { class: 'nm' }, p.name, p.id === lobby.you ? h('small', {}, ' (you)') : null),
          rules.bet > 0 && h('span', { class: 'co' + (p.coins < rules.bet ? ' is-short' : '') }, icon('coins'), String(p.coins)),
          p.id === lobby.host && h('span', { class: 'g-tag' }, 'Host'),
          isHost && p.id !== lobby.host && h('button', { class: 'g-link', type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => session.act({ a: 'kick', id: p.id }) }, 'Remove')))),
        isHost
          ? h('div', { style: 'margin-top:1rem' },
            h('button', { class: 'btn btn-primary g-btn', type: 'button', 'data-fk': 'start', disabled: !ready, onclick: () => session.act({ a: 'start' }) }, 'Start game'),
            missing > 0 && h('p', { class: 'g-hint' }, `Waiting for ${missing} more ${missing === 1 ? 'player' : 'players'} (minimum ${MIN_PLAYERS}).`),
            broke.length > 0 && h('p', { class: 'g-hint', role: 'alert', style: 'color:var(--fg);font-weight:600' },
              `${broke.map((p) => p.name).join(', ')} ${broke.length === 1 ? 'does' : 'do'} not have ${rules.bet} coins. Lower the bet, or ask them to top up and rejoin.`))
          : h('p', {}, 'Waiting for the host to start the game.')),
      h('section', { class: 'g-panel g-span' },
        h('h2', {}, isHost ? 'Table rules' : 'Rules for this table'),
        h('p', { style: 'margin-bottom:1rem' }, isHost ? 'Choose how you want to play. Everyone sees these before the game starts.' : 'Set by the host.'),
        isHost ? rulesEditor(rules, (patch) => session.act({ a: 'rules', rules: patch })) : rulesSummary(rules)));
  }

  function tableView(view) {
    syncLocal(view);
    const me = view.players.find((p) => p.id === view.you);
    const current = view.players.find((p) => p.id === view.turn);
    const myTurn = view.phase === 'playing' && view.turn === view.you && !(me && me.out);
    const canDraw = myTurn && view.step === 'draw';
    const canDiscard = myTurn && view.step === 'discard';
    const sel = local.selected;
    const evaluation = evaluateHand(local.groups, view.wildRank, view.rules);
    const finishGroups = sel.size === 1 ? local.groups.map((g) => g.filter((c) => !sel.has(c.id))).filter((g) => g.length) : null;
    const finishEval = finishGroups ? evaluateHand(finishGroups, view.wildRank, view.rules) : null;
    const shapeOk = finishGroups ? shapeAllowed(finishGroups, view.rules) : false;
    const declareReady = !!finishEval && finishEval.complete && shapeOk;
    const shapeLabel = layoutOf(view.rules).label.replace(/\s+/g, ' ');
    const topDiscard = view.discardTop[view.discardTop.length - 1];

    const status = view.phase !== 'playing' ? ''
      : me && me.out ? 'You are out of this round. Watch the others finish.'
        : myTurn ? (view.step === 'draw' ? 'Your turn: draw from the stock or take the top discard.' : 'Select a card to discard, or one finishing card to declare.')
          : `Waiting for ${current ? current.name : 'the next player'}${current && !current.connected ? ' (disconnected)' : ''}…`;
    const absentTurn = session.isHost && view.phase === 'playing' && current && !current.connected;

    const doDiscard = () => { const [id] = [...sel]; local.selected = new Set(); session.act({ a: 'discard', card: id }); render(); };
    const doDeclare = () => { const [card] = [...sel]; const groups = toIds(finishGroups); local.selected = new Set(); session.act({ a: 'declare', card, groups }); render(); };
    const toggle = (id) => { if (sel.has(id)) sel.delete(id); else sel.add(id); render(); };

    const out = h('div', {});
    // players
    out.append(h('div', { class: 'g-bar', role: 'group', 'aria-label': 'Players' },
      view.players.map((p) => h('div', { class: 'g-chip' + (p.id === view.turn && view.phase === 'playing' ? ' is-turn' : '') + (p.out ? ' is-out' : '') },
        h('span', { class: p.connected ? 'on' : 'off', title: p.connected ? 'Connected' : 'Disconnected' }),
        h('b', {}, p.name + (p.id === view.you ? ' (you)' : '')),
        h('small', {}, `${p.out ? (p.outReason === 'wrong-declare' ? 'wrong declare' : 'dropped') : p.cards + ' cards'} · ${p.total} pts`))),
      h('div', { class: 'g-meta' }, view.rules.bet > 0 && h('span', {}, 'Pot ', h('b', {}, String(view.pot))), `Round ${view.round} of ${view.totalRounds}`)));

    // table
    out.append(h('section', { class: 'g-felt', 'aria-label': 'Table' },
      h('div', { class: 'g-piles' },
        h('div', { class: 'g-pile' }, h('h3', {}, 'Wild joker'),
          view.wildHidden
            ? [cardEl(null, { label: 'Closed joker, hidden until you make a pure sequence' }), h('p', {}, 'Closed')]
            : [view.wildCard && cardEl(view.wildCard, { wild: true }), h('p', {}, `All ${rankName(view.wildRank)}s`)]),
        h('div', { class: 'g-pile' }, h('h3', {}, `Stock · ${view.stockCount}`),
          cardEl(null, { label: 'Draw from the stock', hot: canDraw, fk: 'stock', onclick: canDraw ? () => session.act({ a: 'draw' }) : null })),
        h('div', { class: 'g-pile' }, h('h3', {}, `Discard · ${view.discardCount}`),
          topDiscard
            ? cardEl(topDiscard, { wild: topDiscard.rank === view.wildRank, hot: canDraw, label: canDraw ? `Take ${cardLabel(topDiscard)} from the discard pile` : `Top discard: ${cardLabel(topDiscard)}`, onclick: canDraw ? () => session.act({ a: 'take' }) : null })
            : h('div', { class: 'g-card is-ghost', role: 'img', 'aria-label': 'Empty discard pile' }))),
      view.wildHidden && view.phase === 'playing' && h('p', { class: 'g-note' }, 'Closed joker: make a pure sequence (3+ cards, one suit, in order, no jokers) to see the wild joker.'),
      h('p', { class: 'g-status' + (myTurn ? ' is-me' : ''), role: 'status', 'aria-live': 'polite' }, status),
      absentTurn && h('p', { style: 'margin-top:.75rem' }, h('button', { class: 'btn btn-ghost g-btn', type: 'button', onclick: () => session.act({ a: 'dropAbsent' }) }, `Skip ${current.name} now`))));

    // hand
    if (me && !me.out && view.phase !== 'game-over') {
      const summary = evaluation.complete
        ? (shapeAllowed(local.groups, view.rules) ? 'All groups valid' : `Groups valid, but this table needs ${shapeLabel}`)
        : `${evaluation.points} points if the round ended now`;
      out.append(h('section', { class: 'g-panel g-hand', 'aria-label': 'Your hand' },
        h('div', { class: 'g-hand-head' }, h('h2', {}, 'Your hand'), h('span', {}, summary)),
        h('div', { class: 'g-groups' }, local.groups.map((g, i) => {
          const kind = g.length >= 3 ? evaluation.kinds[i] : null;
          const showAdd = sel.size > 0 && !g.every((c) => sel.has(c.id));
          return h('div', {},
            h('div', { class: 'g-grp-top' },
              kind && h('span', { class: 'g-kind k-' + kind }, { pure: 'Pure sequence', sequence: 'Sequence', set: 'Set', invalid: 'Not a set or sequence' }[kind]),
              showAdd && h('button', { class: 'g-add', type: 'button', onclick: () => update(moveToGroup(local.groups, sel, g[0].id)) }, '+ add here')),
            h('div', { class: 'g-cards' }, g.map((c) => cardEl(c, { wild: c.rank === view.wildRank, selected: sel.has(c.id), toggle: true, onclick: () => toggle(c.id) }))));
        })),
        h('div', { class: 'g-actions' },
          h('button', { class: 'btn btn-ghost g-btn', type: 'button', disabled: sel.size < 2, 'data-fk': 'a-group', onclick: () => update(groupSelected(local.groups, sel)) }, 'Group selected'),
          h('button', { class: 'btn btn-ghost g-btn', type: 'button', 'data-fk': 'a-ungroup', onclick: () => update(ungroup(local.groups, sel)) }, sel.size ? 'Ungroup selected' : 'Ungroup all'),
          h('button', { class: 'btn btn-ghost g-btn', type: 'button', 'data-fk': 'a-sort', onclick: () => update(sel.size ? sortWithinGroups(local.groups) : autoSort(local.groups)) }, sel.size ? 'Sort groups' : 'Sort by suit'),
          h('button', { class: 'btn btn-primary g-btn', type: 'button', 'data-fk': 'a-discard', disabled: !canDiscard || sel.size !== 1, onclick: doDiscard }, 'Discard'),
          h('button', {
            class: 'btn g-btn is-go', type: 'button', 'data-fk': 'a-declare', disabled: !canDiscard || sel.size !== 1, title: 'Select one finishing card, with the other 13 grouped',
            onclick: () => {
              if (declareReady) { doDeclare(); return; }
              confirmDialog({
                title: 'This hand is not valid yet',
                confirmLabel: `Declare anyway (${view.rules.wrongDeclare} points)`,
                body: finishEval && finishEval.complete && !shapeOk
                  ? `Your groups are valid, but this table only accepts hands shaped ${shapeLabel}. A wrong declaration costs ${view.rules.wrongDeclare} points and puts you out of the round.`
                  : `You need at least two sequences, one of them pure (no joker), and every other group must be a set or sequence. A wrong declaration costs ${view.rules.wrongDeclare} points and puts you out of the round.`,
                onConfirm: doDeclare,
              });
            },
          }, declareReady && canDiscard ? 'Declare: hand is valid' : 'Declare'),
          h('button', {
            class: 'btn btn-ghost g-btn push', type: 'button', 'data-fk': 'a-drop', disabled: !canDraw,
            onclick: () => confirmDialog({ title: 'Drop this round?', confirmLabel: 'Drop', body: `You leave this round and score ${view.iHaveDrawn ? view.rules.middleDrop : view.rules.firstDrop} points. Nobody can undo it.`, onConfirm: () => session.act({ a: 'drop' }) }),
          }, 'Drop'))));
    }

    out.append(h('details', { class: 'g-details' }, h('summary', {}, 'Table rules'), rulesSummary(view.rules)));
    if (view.log.length && view.phase === 'playing') out.append(h('ul', { class: 'g-log', 'aria-label': 'Recent events' }, view.log.slice(-4).map((l) => h('li', {}, l))));
    if (view.phase !== 'playing') out.append(resultsView(view));
    return out;
  }

  function resultsView(view) {
    const last = view.results[view.results.length - 1];
    if (!last) return h('div', {});
    const over = view.phase === 'game-over';
    const standing = view.players.slice().sort((a, b) => a.total - b.total);
    const champ = standing[0];
    const tied = standing.filter((p) => p.total === champ.total);
    const money = over && view.pot > 0 && view.payouts;
    const panel = h('section', { class: 'g-panel', style: 'margin-top:1rem', 'aria-label': over ? 'Final results' : `Round ${last.round} results` });
    if (over) {
      panel.append(h('div', { class: 'g-win', style: 'margin-bottom:1.25rem' }, icon('medal'),
        h('div', {},
          h('h2', {}, tied.length > 1 ? `Tie between ${tied.map((p) => p.name).join(' and ')}` : `${champ.name} wins the game!`),
          h('p', {}, `Lowest total with ${champ.total} points.`),
          money && h('p', { style: 'font-weight:700' }, tied.map((p) => `${p.name} wins ${view.payouts[p.id]} coins`).join(' · ') + ` (pot ${view.pot})`))));
    }
    panel.append(
      h('h2', {}, `Round ${last.round} result`),
      h('div', { class: 'g-scroll' }, h('table', { class: 'g-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Player'), h('th', {}, 'Result'), h('th', { class: 'num' }, 'Round'), h('th', { class: 'num' }, 'Total'), over && view.pot > 0 && h('th', { class: 'num' }, 'Coins'))),
        h('tbody', {}, last.scores.map((s) => {
          const p = view.players.find((x) => x.id === s.id);
          const net = (view.payouts && view.payouts[s.id] || 0) - view.rules.bet;
          return h('tr', { class: s.id === view.you ? 'is-me' : '' },
            h('td', {}, h('b', {}, s.name), s.id === view.you ? ' (you)' : '', s.id === last.winnerId ? ' ★' : ''),
            h('td', {}, s.reason), h('td', { class: 'num' }, String(s.points)), h('td', { class: 'num' }, h('b', {}, String(p ? p.total : 0))),
            over && view.pot > 0 && h('td', { class: 'num' }, (net > 0 ? '+' : net < 0 ? '−' : '') + Math.abs(net)));
        })))),
      h('details', { class: 'g-details' }, h('summary', {}, "Show everyone's cards"),
        h('div', { class: 'g-reveal' }, last.scores.map((s) => h('div', {},
          h('span', { class: 'g-eyebrow' }, s.name),
          h('div', { class: 'g-row', style: 'gap:.75rem 1.25rem;margin-top:.375rem' },
            s.groups.map((g) => h('div', { class: 'g-cards' }, g.map((c) => cardEl(c, { wild: c.rank === view.wildRank, small: true}))))))))),
      h('div', { class: 'g-row', style: 'margin-top:1.25rem' },
        !over && session.isHost && h('button', { class: 'btn btn-primary g-btn', type: 'button', 'data-fk': 'next', onclick: () => session.act({ a: 'next' }) }, `Start round ${view.round + 1}`),
        !over && !session.isHost && h('p', { style: 'margin:0;color:var(--muted)' }, `Waiting for the host to start round ${view.round + 1}…`),
        over && h('button', { class: 'btn btn-primary g-btn', type: 'button', 'data-fk': 'back', onclick: () => leaveRoom() }, 'Back to Rummy')));
    return panel;
  }

  // ---- hub ----
  function hubView() {
    const fan = h('div', { class: 'g-fan', 'aria-hidden': 'true' },
      [{ id: 1, rank: 1, suit: 'S' }, { id: 2, rank: 12, suit: 'H' }, { id: 3, rank: 7, suit: 'D' }, { id: 4, rank: 0, suit: null }].map((c) => cardEl(c)));
    return h('div', { class: 'g-games' },
      h('a', { class: 'g-game', href: '#/games/rummy' }, fan,
        h('span', { class: 'g-tag' }, '3 to 6 players · online'),
        h('h2', {}, 'Indian Rummy'),
        h('p', {}, '13-card Points Rummy. Make a pure sequence and a second sequence, group the rest, and declare before your friends do. Open or closed joker, custom hand shapes, and coins to bet.')),
      h('div', { class: 'g-game is-soon', 'aria-disabled': 'true' },
        h('span', { class: 'g-tag' }, 'Coming soon'),
        h('h2', {}, 'More games'),
        h('p', {}, 'More popular card and board games are on the way, all playable with friends in the browser.')));
  }

  // ---- dispatcher ----
  let renderQueued = false;
  function render() {
    if (dead) return;
    const active = document.activeElement;
    const fk = active && root.contains(active) ? active.getAttribute('data-fk') : null;
    const scrollY = window.scrollY;
    const st = session ? session.getState() : null;

    let view;
    if (sub !== 'rummy') view = hubView();
    else if (!st) view = entryView();
    else if (st.status === 'connecting') view = h('p', { class: 'g-hint' }, st.message || 'Connecting…');
    else if (st.status === 'lobby') view = lobbyView(st);
    else if (st.status === 'game') view = tableView(st.view);
    else {
      // The room ended (host left, connection lost, or you left): say why, with the start screen below.
      view = h('div', {},
        h('div', { class: 'g-panel', style: 'margin-bottom:1rem' },
          h('p', { style: 'margin:0;color:var(--fg);font-weight:600' }, st.message),
          h('div', { style: 'margin-top:.875rem' }, h('button', { class: 'btn btn-primary g-btn', type: 'button', onclick: () => leaveRoom() }, 'Back to Rummy'))),
        entryView());
    }

    const wrap = h('div', {}, local.notice && h('p', { class: 'g-alert', role: 'alert' }, local.notice), view);
    root.replaceChildren(wrap);
    document.body.classList.toggle('g-live', !!live());
    if (fk) {
      const again = root.querySelector(`[data-fk="${fk}"]`);
      if (again && !again.disabled) again.focus({ preventScroll: true });
    }
    if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY);
  }
  const schedule = () => {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; render(); });
  };

  const stopWatch = watch((s) => {
    session = s;
    if (s) {
      const err = s.takeError();
      if (err) setNotice(err);
    }
    schedule();
  });
  const stopProfile = subscribeProfile(() => { if (!session) schedule(); });

  // After a refresh, quietly return to the room this tab was in (guests only: a host's room lives in their browser).
  if (sub === 'rummy' && !session && !resumeTried) {
    resumeTried = true;
    const code = lastRoom();
    const name = savedName();
    if (code && name && !form.code) joinRoom(code, name).catch(() => { /* room is gone: show the start screen */ });
  }

  render();

  return () => {
    dead = true;
    clearTimeout(local.noticeTimer);
    stopWatch();
    stopProfile();
    document.body.classList.remove('g-live');
    document.querySelectorAll('dialog.g-dlg').forEach((d) => d.remove());
  };
}
