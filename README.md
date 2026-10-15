# portfolio
my portfolio and website

## Guestbook (typewriter reviews)
Visitors leave a review or comment on a pixel typewriter (section above the footer, plus a floating "Leave a review" button on every page).
Notes are stored in a Google Sheet through Apps Script and appear on the site instantly.

- Setup steps are at the top of `backend/reviews.gs` (create a Sheet, paste the script, deploy as a web app, copy the URL).
- Paste the URL into `content.json` → `"reviews": { "endpoint": "<URL>" }`. Until it is set, the guestbook stays hidden.
- To preview without a backend, open the site with `?reviews=preview` (notes stay on that device only).
- To remove a note, type `TRUE` in its `hidden` column in the Sheet.
