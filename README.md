# portfolio
my portfolio and website

## Guestbook (typewriter reviews)
Visitors leave a review or comment on a pixel typewriter (section above the footer, plus a floating "Leave a review" button on every page).
Notes are stored in a Google Sheet through Apps Script and appear on the site instantly.

- Setup steps are at the top of `backend/reviews.gs` (create a Sheet, paste the script, deploy as a web app, copy the URL).
- Paste the URL into `content.json` → `"reviews": { "endpoint": "<URL>" }`. Until it is set, the guestbook runs in a labelled preview where notes stay on the visitor's own device.
- To remove a note, type `TRUE` in its `hidden` column in the Sheet.

## Games (Personal > Games)
Card games that visitors can play together in the browser. First game: **Indian Rummy** (13 cards, 3 to 6 players) at `#/games/rummy`.

- **Online, no server of your own.** Play is peer-to-peer (WebRTC through [PeerJS](https://peerjs.com), vendored in `vendor/peerjs.min.js`, loaded only on the Games page). One player creates a room and shares the 5-letter code or invite link (`#/games/rummy?room=CODE`). The host's browser runs the rules and sends each player only their own cards. If the host closes the page the game ends and entry bets are returned; a guest who refreshes rejoins their seat.
- **Table rules the host can change:** open or closed joker (closed = you see the wild joker only after you hold a pure sequence), winning hand shape (any, 4+3+3+3, 5+4+4, 5+5+3, 6+4+3), jokers per group, rounds, drop / wrong-declaration / max points, and an entry bet.
- **Coins and leaderboard** are play money kept in each visitor's own browser (`localStorage`); they cannot be bought or cashed out. The leaderboard lists the people that browser has played with. It is not shared across devices.
- **Strict networks:** PeerJS's free public matchmaking server and Google STUN work for most people; a few networks need a TURN relay. To self-host or add one, put this in `content.json`:
  `"games": { "peer": { "host": "...", "port": 443, "path": "/", "secure": true }, "ice": [ { "urls": "turn:...", "username": "...", "credential": "..." } ] }`

Code: `assets/games/` (plain ES modules: `engine.js` rules, `host.js` room, `session.js` PeerJS glue, `profile.js` wallet and leaderboard, `ui.js` screens), `assets/games.js` (lazy loader), `assets/games.css`. When you change a game file, bump its `?v=` (they are all `?v=1` today).
Tests: `npm test` (Node's built-in runner, no dependencies, 71 tests for the rules, room, wallet and leaderboard).
