# portfolio
my portfolio and website

## Guestbook (typewriter reviews)
Visitors leave a review or comment on a pixel typewriter (section above the footer, plus a floating "Leave a review" button on every page).
Notes are stored in a Google Sheet through Apps Script and appear on the site instantly.

- Setup steps are at the top of `backend/reviews.gs` (create a Sheet, paste the script, deploy as a web app, copy the URL).
- Paste the URL into `content.json` → `"reviews": { "endpoint": "<URL>" }`. Until it is set, the guestbook runs in a labelled preview where notes stay on the visitor's own device.
- To remove a note, type `TRUE` in its `hidden` column in the Sheet.

## Games (Personal > Games)
Card games that visitors can play in the browser, with friends online or alone against the computer. First game: **Indian Rummy** (13 cards, 3 to 6 players) at `#/games/rummy`.

- **Online, no server of your own.** Play is peer-to-peer (WebRTC through [PeerJS](https://peerjs.com), vendored in `vendor/peerjs.min.js`, loaded only on the Games page). One player creates a room and shares the 5-letter code or invite link (`#/games/rummy?room=CODE`). The host's browser runs the rules and sends each player only their own cards. If the host closes the page the game ends and entry bets are returned; a guest who refreshes rejoins their seat.
- **Play the computer.** A single player can play against 2 to 5 computer players at **Easy, Medium, Hard or Professional**. They use the same rules (open/closed joker, hand shapes, joker limit, drops) and no coins. Each level plays differently: Easy plays by feel and can sit on a win or declare too early; Medium groups its hand exactly but only takes a card that helps right now; Hard weighs the odds, values cards one draw from a group and drops hopeless hands; Professional counts the cards it has seen, calculates the best draw and discard, avoids feeding you and drops hopeless hands more precisely. A computer game keeps a win record per level (in the browser) and stays off the friends leaderboard.
  Measured over 160 five-round games with one player of each level (lowest total wins; `node tests/games.mjs 40 5`, run in four parallel processes):

  | Level | Games won | Avg points per round |
  |---|---|---|
  | Easy | 0.6% | 53.8 |
  | Medium | 18.1% | 30.2 |
  | Hard | 35.0% | 24.8 |
  | Professional | 47.5% | 19.9 |

  On identical decks played alone (`node tests/solo.mjs <level> 80`), turns to a declarable hand: Easy 18.5 (74% finish), Medium 9.5, Hard 7.8, Professional 7.9. Past Hard, raw speed is mostly luck of the draw, so Professional's edge is strategy: it folds hopeless deals (a first drop is 20 points, a hand dealt with no pure sequence and no joker averages 55), counts the cards it has seen and avoids throwing what you picked up.
- **Fair cards.** The deck is shuffled once, with the browser's cryptographic random generator, when a round is dealt, before anyone acts. A computer player decides only from the same view a human gets (its own cards, the discard pile, the visible wild joker): it never receives the stock, the deck order or anyone's hand, and difficulty changes only how well it plays what it is dealt. `tests/bot.test.js` checks this (identical decisions when the hidden cards are swapped, a source audit of the decision code, a shuffle uniformity test, and equal average stock draws at every level), and `npm run sim` plays tournaments between the levels.
- **Table rules the host can change:** open or closed joker (closed = you see the wild joker only after you hold a pure sequence), winning hand shape (any, 4+3+3+3, 5+4+4, 5+5+3, 6+4+3), jokers per group, rounds, drop / wrong-declaration / max points, and an entry bet.
- **Coins and leaderboard** are play money kept in each visitor's own browser (`localStorage`); they cannot be bought or cashed out. The leaderboard lists the people that browser has played with. It is not shared across devices.
- **Strict networks:** PeerJS's free public matchmaking server and Google STUN work for most people; a few networks need a TURN relay. To self-host or add one, put this in `content.json`:
  (`"games": { "botDelayMs": 900 }` changes how long the computers pause before each move.)
  `"games": { "peer": { "host": "...", "port": 443, "path": "/", "secure": true }, "ice": [ { "urls": "turn:...", "username": "...", "credential": "..." } ] }`

Code: `assets/games/` (plain ES modules: `engine.js` rules, `meld.js` hand solver, `bot.js` computer players, `host.js` room, `session.js` PeerJS and local sessions, `profile.js` wallet and leaderboard, `ui.js` screens), `assets/games.js` (lazy loader), `assets/games.css`. When you change a game file, bump its `?v=` (they are all `?v=2` today).
Tests: `npm test` (Node's built-in runner, no dependencies: rules, solver, computer players and fairness, room, wallet and leaderboard). `npm run sim [rounds]` runs a tournament between the four levels.
