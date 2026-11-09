/**
 * Games backend for inalatarun.co.in: leaderboard and game history in a Google Sheet, behind a tiny Apps Script web app.
 * The site posts one record when a game finishes and reads the leaderboard back. Nothing else is stored.
 *
 * SET UP (about 3 minutes, once). The Sheet already exists ("Rummy: leaderboard and game history"; its ID is SHEET_ID).
 *  1. Open that Sheet: Extensions > Apps Script. Delete the sample code, paste this whole file, Save.
 *  2. Pick the function  setup  in the toolbar and press Run once. Approve the permissions. It creates the tabs.
 *  3. Deploy > New deployment > type "Web app".   Execute as: Me     Who has access: Anyone
 *     Press Deploy and copy the "Web app URL" (it ends in /exec).
 *  4. In the repo, open content.json and set   "games": { "endpoint": "<that URL>" }   (keep any other keys in "games").
 *  If you edit this script later: Deploy > Manage deployments > edit > New version, so the URL stays the same.
 *
 * TABS
 *   Games        one row per finished game (full result as JSON). The history.
 *   Results      one row per human player per game. The leaderboard is built from this.
 *   Leaderboard  rebuilt after every game: online games between people.
 *   VsComputer   rebuilt after every game: results against the computer, per player and level.
 *
 * MODERATION: to remove a game or a player's result, type TRUE in its "hidden" column (or delete the row). It leaves
 * the leaderboard within a minute. Names are shown as typed (20 characters at most, links refused).
 *
 * PRIVACY: a player's random browser id is never stored. Only a short one-way hash of it, so the same person keeps one
 * row across games without the sheet or the website ever holding the id itself.
 *
 * HONEST LIMIT: the site has no accounts, so anyone could send made-up results. The checks below (shapes, scores,
 * coins adding up to zero, one result per game, rate caps) stop casual abuse, not a determined person. Use the hidden
 * column to remove anything odd.
 */
var SHEET_ID = '1uu1M-Cz8hnIihKKSAwJupVwF1DsEi6cNyWw4n_VN41M';
var TAB_GAMES = 'Games';
var TAB_RESULTS = 'Results';
var TAB_BOARD = 'Leaderboard';
var TAB_VS = 'VsComputer';

var LEVELS = ['easy', 'medium', 'hard', 'pro'];
var NAME_MAX = 20;
var HOURLY_CAP = 200;        // games accepted per hour across the whole site
var PER_PLAYER_HOURLY = 30;  // games per hour that name the same player
var BOARD_LIMIT = 100;       // rows on the leaderboard
var RECENT_LIMIT = 30;       // most games the site can ask for at once
var CACHE_SECONDS = 60;

var HEAD_GAMES = ['gameId', 'timestamp', 'mode', 'level', 'rounds', 'players', 'result (json)', 'hidden'];
var HEAD_RESULTS = ['gameId', 'timestamp', 'mode', 'level', 'player', 'name', 'total', 'won', 'rounds', 'net coins', 'hidden'];

// ------------------------------------------------------------------------------------------------ sheets

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function tab_(name, head) {
  var ss = ss_();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (head && sh.getLastRow() === 0) {
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  return sh;
}

/** Run once from the editor: creates the tabs and removes the empty default one. */
function setup() {
  tab_(TAB_GAMES, HEAD_GAMES);
  tab_(TAB_RESULTS, HEAD_RESULTS);
  tab_(TAB_BOARD, null);
  tab_(TAB_VS, null);
  var ss = ss_();
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  return 'ok';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------------------------------------------------------------------------ cleaning

function clean_(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
// Sheets runs a leading = + - @ as a formula. Prefix those so a name can never execute.
function safeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function isHidden_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}
function hash_(pid) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pid));
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += ('0' + ((bytes[i] + 256) % 256).toString(16)).slice(-2);
  return hex.slice(0, 10);
}
function whole_(v, lo, hi) {
  var n = Number(v);
  if (!isFinite(n) || Math.floor(n) !== n || n < lo || n > hi) return null;
  return n;
}

// ------------------------------------------------------------------------------------------------ validation

/** Returns { ok: true, game } with a cleaned copy, or { ok: false, error }. */
function validate_(g) {
  if (!g || typeof g !== 'object') return { ok: false, error: 'shape' };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(g.id || ''))) return { ok: false, error: 'id' };
  if (g.mode !== 'online' && g.mode !== 'computer') return { ok: false, error: 'mode' };
  var rounds = whole_(g.rounds, 1, 10);
  if (rounds === null) return { ok: false, error: 'rounds' };
  if (!Array.isArray(g.players) || g.players.length < 3 || g.players.length > 6) return { ok: false, error: 'players' };

  var players = [], seen = {}, humans = 0, level = '', net = 0;
  for (var i = 0; i < g.players.length; i++) {
    var p = g.players[i] || {};
    var name = clean_(p.name, NAME_MAX);
    var total = whole_(p.total, 0, 2000);
    var bot = p.bot === true;
    var coins = whole_(p.net == null ? 0 : p.net, -5000, 5000);
    var pid = String(p.pid == null ? '' : p.pid);
    if (!name || total === null || coins === null || pid.length < 1 || pid.length > 80) return { ok: false, error: 'player' };
    if (/(https?:\/\/|www\.|\.(com|net|org|io|ru|xyz)\b)/i.test(name)) return { ok: false, error: 'links' };
    if (seen[pid]) return { ok: false, error: 'duplicate' };
    seen[pid] = true;
    if (bot) {
      if (LEVELS.indexOf(p.level) < 0) return { ok: false, error: 'level' };
      if (level && level !== p.level) return { ok: false, error: 'level' };
      level = p.level;
    } else humans++;
    net += coins;
    players.push({ pid: pid, name: name, total: total, bot: bot, level: bot ? p.level : '', net: coins });
  }
  if (g.mode === 'computer') {
    if (humans !== 1 || !level) return { ok: false, error: 'mode' };
    for (var c = 0; c < players.length; c++) if (players[c].net !== 0) return { ok: false, error: 'coins' };
  } else {
    if (humans !== players.length) return { ok: false, error: 'mode' };
    if (net !== 0) return { ok: false, error: 'coins' }; // a pot is only ever shared out, never created
  }
  var best = Math.min.apply(null, players.map(function (x) { return x.total; }));
  players.forEach(function (x) { x.won = x.total === best; });
  return { ok: true, game: { id: String(g.id), mode: g.mode, level: level, rounds: rounds, players: players } };
}

// ------------------------------------------------------------------------------------------------ writing

function overCap_(key, cap) {
  var cache = CacheService.getScriptCache();
  var hour = Math.floor(Date.now() / 3600000);
  var k = key + ':' + hour;
  var n = Number(cache.get(k) || 0);
  if (n >= cap) return true;
  cache.put(k, String(n + 1), 3700);
  return false;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true, id: 'x' }); // honeypot: pretend it worked
    if (body.action !== 'submit') return json_({ ok: false, error: 'action' });
    var v = validate_(body.game);
    if (!v.ok) return json_({ ok: false, error: v.error });
    var game = v.game;

    lock.waitLock(8000);
    var games = tab_(TAB_GAMES, HEAD_GAMES);
    var results = tab_(TAB_RESULTS, HEAD_RESULTS);
    var n = games.getLastRow() - 1;
    if (n > 0) {
      var ids = games.getRange(2, 1, n, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === game.id) return json_({ ok: true, id: game.id, duplicate: true });
    }
    if (overCap_('g', HOURLY_CAP)) return json_({ ok: false, error: 'busy' });
    var hashes = game.players.map(function (p) { return p.bot ? '' : hash_(p.pid); });
    for (var h = 0; h < hashes.length; h++) if (hashes[h] && overCap_('p' + hashes[h], PER_PLAYER_HOURLY)) return json_({ ok: false, error: 'busy' });

    var ts = Date.now();
    var summary = game.players.map(function (p, idx) {
      return { name: p.name, total: p.total, won: p.won, bot: p.bot, level: p.level, net: p.net, h: hashes[idx] };
    });
    games.appendRow([game.id, ts, game.mode, game.level, game.rounds, game.players.length, JSON.stringify(summary), '']);
    game.players.forEach(function (p, idx) {
      if (p.bot) return;
      results.appendRow([game.id, ts, game.mode, game.level, hashes[idx], safeCell_(p.name), p.total, p.won ? 1 : 0, game.rounds, p.net, '']);
    });
    rebuild_();
    var cache = CacheService.getScriptCache();
    cache.remove('board');
    cache.remove('recent');
    return json_({ ok: true, id: game.id });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (x) { /* not held */ }
  }
}

// ------------------------------------------------------------------------------------------------ reading

/** All visible rows of the Results tab as objects. */
function resultRows_() {
  var sh = tab_(TAB_RESULTS, HEAD_RESULTS);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var rows = sh.getRange(2, 1, n, HEAD_RESULTS.length).getValues();
  var out = [];
  rows.forEach(function (r) {
    if (isHidden_(r[10])) return;
    out.push({ id: String(r[0]), ts: Number(r[1]) || 0, mode: String(r[2]), level: String(r[3]), h: String(r[4]), name: String(r[5]), total: Number(r[6]) || 0, won: Number(r[7]) === 1, rounds: Number(r[8]) || 1, net: Number(r[9]) || 0 });
  });
  return out;
}

/** The two boards, from the visible results. */
function boards_() {
  var rows = resultRows_();
  var online = {}, vs = {};
  rows.forEach(function (r) {
    if (r.mode === 'online') {
      var o = online[r.h] || (online[r.h] = { h: r.h, name: r.name, games: 0, wins: 0, points: 0, rounds: 0, coins: 0, last: 0 });
      o.games++; o.wins += r.won ? 1 : 0; o.points += r.total; o.rounds += r.rounds; o.coins += r.net;
      if (r.ts >= o.last) { o.last = r.ts; o.name = r.name; }
    } else if (r.mode === 'computer') {
      var k = r.h + '|' + r.level;
      var c = vs[k] || (vs[k] = { h: r.h, name: r.name, level: r.level, games: 0, wins: 0, last: 0 });
      c.games++; c.wins += r.won ? 1 : 0;
      if (r.ts >= c.last) { c.last = r.ts; c.name = r.name; }
    }
  });
  var board = Object.keys(online).map(function (k) { return online[k]; });
  board.sort(function (a, b) {
    return b.wins - a.wins || (b.wins / b.games) - (a.wins / a.games) || (a.points / a.rounds) - (b.points / b.rounds);
  });
  var computer = Object.keys(vs).map(function (k) { return vs[k]; });
  computer.sort(function (a, b) {
    return LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || b.wins - a.wins || (b.wins / b.games) - (a.wins / a.games);
  });
  return { board: board.slice(0, BOARD_LIMIT), computer: computer.slice(0, BOARD_LIMIT) };
}

/** Rewrite the two leaderboard tabs so the sheet itself is readable. */
function rebuild_() {
  var b = boards_();
  var head1 = ['rank', 'name', 'games', 'wins', 'win %', 'avg points / round', 'net coins', 'last played', 'player'];
  var sh = tab_(TAB_BOARD, null);
  sh.clear();
  var rows1 = b.board.map(function (p, i) {
    return [i + 1, safeCell_(p.name), p.games, p.wins, Math.round(100 * p.wins / p.games), Math.round(10 * p.points / p.rounds) / 10, p.coins, new Date(p.last), p.h];
  });
  sh.getRange(1, 1, 1, head1.length).setValues([head1]).setFontWeight('bold');
  if (rows1.length) sh.getRange(2, 1, rows1.length, head1.length).setValues(rows1);
  sh.setFrozenRows(1);

  var head2 = ['level', 'name', 'games', 'wins', 'win %', 'last played', 'player'];
  var sv = tab_(TAB_VS, null);
  sv.clear();
  var rows2 = b.computer.map(function (p) {
    return [p.level, safeCell_(p.name), p.games, p.wins, Math.round(100 * p.wins / p.games), new Date(p.last), p.h];
  });
  sv.getRange(1, 1, 1, head2.length).setValues([head2]).setFontWeight('bold');
  if (rows2.length) sv.getRange(2, 1, rows2.length, head2.length).setValues(rows2);
  sv.setFrozenRows(1);
}

function recent_(limit, who) {
  var sh = tab_(TAB_GAMES, HEAD_GAMES);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var rows = sh.getRange(2, 1, n, HEAD_GAMES.length).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0 && out.length < limit; i--) {
    var r = rows[i];
    if (isHidden_(r[7])) continue;
    var players = [];
    try { players = JSON.parse(String(r[6])); } catch (err) { continue; }
    if (who && !players.some(function (p) { return p.h === who; })) continue;
    out.push({ id: String(r[0]), ts: Number(r[1]) || 0, mode: String(r[2]), level: String(r[3]), rounds: Number(r[4]) || 1, players: players.map(function (p) { return { name: p.name, total: p.total, won: !!p.won, bot: !!p.bot, level: p.level || '', net: p.net || 0, h: p.h || '' }; }) });
  }
  return out;
}

function doGet(e) {
  try {
    var action = String((e && e.parameter && e.parameter.action) || 'leaderboard');
    var cache = CacheService.getScriptCache();
    if (action === 'leaderboard') {
      var hit = cache.get('board');
      if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
      var b = boards_();
      var payload = JSON.stringify({ ok: true, board: b.board, computer: b.computer, updated: Date.now() });
      cache.put('board', payload, CACHE_SECONDS);
      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'recent') {
      var limit = Math.max(1, Math.min(RECENT_LIMIT, Number(e.parameter.limit) || 10));
      var who = /^[0-9a-f]{10}$/.test(String(e.parameter.h || '')) ? String(e.parameter.h) : '';
      return json_({ ok: true, games: recent_(limit, who) });
    }
    return json_({ ok: false, error: 'action' });
  } catch (err) {
    return json_({ ok: false, error: 'read' });
  }
}
