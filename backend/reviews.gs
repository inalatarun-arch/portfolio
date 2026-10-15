/**
 * Guestbook backend for inalatarun.co.in — a Google Sheet behind a tiny Apps Script web app.
 *
 * SET UP (about 5 minutes, once):
 *  1. Create a new Google Sheet (name it e.g. "Portfolio guestbook"). Leave it empty.
 *  2. In the Sheet: Extensions > Apps Script. Delete the sample code and paste this whole file. Save.
 *  3. Deploy > New deployment > type "Web app".
 *       Execute as: Me          Who has access: Anyone
 *     Press Deploy, approve the permissions, and copy the "Web app URL" (it ends in /exec).
 *  4. In the repo, open content.json and paste that URL into  "reviews": { "endpoint": "<URL>" }. Commit to main.
 *
 * MODERATION: reviews appear on the site instantly. To remove one, open the "Reviews" sheet and type TRUE in its
 * "hidden" column (or delete the row). It disappears from the site within a minute or two.
 * If you edit this script later, use Deploy > Manage deployments > edit > New version so the URL stays the same.
 */
var SHEET_NAME = 'Reviews';
var MAX_LEN = 400;       // characters per note
var LIST_LIMIT = 120;    // how many notes the site loads
var MIN_FILL_MS = 2500;  // a person needs at least this long to write something
var HOURLY_CAP = 40;     // notes accepted per hour across the whole site (stops a flood)

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['id', 'timestamp', 'name', 'rating', 'text', 'hidden']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var sh = sheet_();
    var n = sh.getLastRow() - 1;
    if (n < 1) return json_({ ok: true, items: [] });
    var rows = sh.getRange(2, 1, n, 6).getValues();
    var items = [];
    for (var i = rows.length - 1; i >= 0 && items.length < LIST_LIMIT; i--) {
      var r = rows[i];
      if (r[5] === true || String(r[5]).toUpperCase() === 'TRUE' || !r[4]) continue;
      items.push({ id: String(r[0]), ts: new Date(r[1]).getTime(), name: String(r[2] || 'A visitor'), rating: Number(r[3]) || 0, text: String(r[4]) });
    }
    return json_({ ok: true, items: items });
  } catch (err) {
    return json_({ ok: false, error: 'list' });
  }
}

function clean_(s, max) {
  return String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')   // control characters (keeps \n and \t)
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}
// Sheets runs a leading = + - @ as a formula. Prefix those so a note can never execute.
function safeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json_({ ok: true, item: { id: 'x', ts: Date.now(), name: 'A visitor', rating: 0, text: '' } }); // honeypot: pretend it worked
    var text = clean_(body.text, MAX_LEN);
    var name = clean_(body.name, 40).replace(/\n/g, ' ') || 'A visitor';
    var rating = Math.max(0, Math.min(5, Math.round(Number(body.rating) || 0)));
    if (text.length < 3) return json_({ ok: false, error: 'short' });
    if (Number(body.t) < MIN_FILL_MS) return json_({ ok: false, error: 'slow' });
    if (/(https?:\/\/|www\.|\.(com|net|org|io|ru|xyz)\b)/i.test(text + ' ' + name)) return json_({ ok: false, error: 'links' });

    lock.waitLock(8000);
    var cache = CacheService.getScriptCache();
    var hour = 'h' + Math.floor(Date.now() / 3600000);
    var count = Number(cache.get(hour) || 0);
    if (count >= HOURLY_CAP) return json_({ ok: false, error: 'slow' });
    var key = 'd' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)).slice(0, 20);
    if (cache.get(key)) return json_({ ok: false, error: 'dup' });
    cache.put(key, '1', 21600);
    cache.put(hour, String(count + 1), 3700);

    var id = Utilities.getUuid().slice(0, 8);
    var ts = new Date();
    sheet_().appendRow([id, ts, safeCell_(name), rating, safeCell_(text), '']);
    return json_({ ok: true, item: { id: id, ts: ts.getTime(), name: name, rating: rating, text: text } });
  } catch (err) {
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
