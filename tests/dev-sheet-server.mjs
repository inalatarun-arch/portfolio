// A local stand-in for the deployed Apps Script web app, for trying the shared leaderboard without Google:
//   node tests/dev-sheet-server.mjs [port]      then set  "games": { "endpoint": "http://127.0.0.1:8899/exec" }
// It runs backend/games.gs itself against an in-memory spreadsheet (see tests/apps-script-fakes.js).
import http from 'node:http';
import { loadScript } from './apps-script-fakes.js';

const port = Number(process.argv[2]) || 8899;
const sheet = loadScript();
sheet.ctx.setup();
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname === '/dump') { res.writeHead(200, cors); res.end(JSON.stringify({ games: sheet.sheet('Games').rows, results: sheet.sheet('Results').rows, board: sheet.sheet('Leaderboard').rows })); return; }
  if (req.method === 'GET') { res.writeHead(200, cors); res.end(JSON.stringify(sheet.get(Object.fromEntries(url.searchParams)))); return; }
  let body = '';
  req.on('data', (d) => { body += d; }).on('end', () => {
    let out;
    try { out = sheet.post(JSON.parse(body)); } catch { out = { ok: false, error: 'shape' }; }
    res.writeHead(200, cors); res.end(JSON.stringify(out));
  });
}).listen(port, '127.0.0.1', () => console.log(`dev sheet endpoint on http://127.0.0.1:${port}/exec`));
