# ADR-0004 — Reading a publisher's pages for availability

- **Status:** accepted
- **Date:** 2026-09-14
- **Context source:** blueprint decision D5 ("no scraping at all"), slice 9.4

## Context

`players.status` has been `active | injured | doubtful | left` since 2.1 and
**nothing has ever written `injured`**. `normalizeApiRow` says so in a comment —
"the API's `active` flag is about a contract window, not an injury" — and
`diffRosters` carries a `LOCAL_STATUSES` guard specifically so that a nightly
sync cannot heal a flag that a human set by hand. The guard has been protecting
a field nobody fills in.

That matters on draft night and on every lineup deadline after it. Somebody
picking eighth cannot be expected to know that a center had elbow surgery in
July, and the app currently has no way to tell them.

The official feed cannot help. Verified 2026-09-14:

- `GET /v2/competitions/E/seasons/E2026/injuries` → 404.
- `GET /v2/competitions/E/seasons/E2026/news` → 404.
- RotoWire publishes **no** Euroleague RSS: `.../rss/news.php?sport=EURO`
  answers 200 with an empty body, while `sport=NBA` returns a full feed.
- `euroleaguebasketball.net` answers **429** to an unauthenticated fetch.

So the only machine-readable statement about availability is a publisher's HTML.

## The decision D5 actually made

D5 reads "no scraping at all", and it was a decision about **stats**: the
official API serves box scores completely and exactly, so a parsed table would
have been a second and worse answer to a question already answered well. That
reasoning does not transfer to a question the API does not answer at all.

## Decision

**Read RotoWire's two Euroleague pages, store the facts, and link out for the
prose.** D5 stands for stats and is narrowed in writing to what it was about.

Five constraints, all of which are code rather than intent:

1. **Facts only.** Player, club as published, position, body part, what the item
   asserts about availability, the date, the publisher's headline and the URL.
   `news-update__news` — their paragraph — is parsed by nothing, and
   `rotowire.test.ts` asserts that no stored field contains it. A private
   ten-person app mirroring a subscription publisher's copy is the one real
   risk here, and it is designed away rather than promised away.
2. **Every surface links back.** The board, the player profile and the mapping
   queue all carry the publisher's link on the item.
3. **Politeness is shared, not re-invented.** The pass uses the same
   `fetchWithRetry` the Euroleague importers use — four attempts, `Retry-After`
   honoured, 429 backed off — and runs **hourly**, two requests a pass, on the
   worker's own third in-flight guard. `NEWS_FETCH=off` stops it without
   stopping the worker, which still enforces pick deadlines.
4. **The page's own marking is the only classifier.** An item is an injury item
   because the page says `is-injured`, never because a headline contained a
   word. "Jumps to Partizan" and "Taking part in workouts" are both on the
   injuries page; a keyword rule would get both wrong in opposite directions.
5. **It can only ever raise a flag, never clear one.** Both views return the
   latest 25 *updates* rather than a census of who is hurt, so absence from
   them proves nothing. Recovery is a person's statement, made on
   `/players/news`.

## Consequences

**Good**

- The draft pool prints "injured" beside a player a publisher says is hurt,
  through a field and a UI that already existed.
- `LOCAL_STATUSES` now protects something real: a scraped flag survives the
  nightly roster sync with no change to `diffRosters` at all.
- An unmatched name becomes a mapping-queue question rather than a dropped item,
  so 4.2's doorbell covers the third direction too.

**Costs, accepted**

- **The source can change shape without telling us.** A class rename makes the
  pass parse zero items; it says so in the worker log and in `--dry`, and the
  saved markup in `src/lib/news/fixtures/` is what a fix is written against.
- **A flag does not expire on its own.** Because nothing here may heal anybody,
  a player who recovers quietly stays marked until somebody presses "Available
  again". Recorded as debt in STATUS.md, with the two candidate fixes
  (an age-out, or a second source that publishes a current injury list).
- **Only items published within 21 days may move a status**, so a cold first
  pass does not flag a squad from June's news. An injury older than that is
  stored, shown and dated, but does not touch the pool.
- **We depend on somebody else's site being up.** A failed pass is logged and
  the next one is an hour later; nothing else in the app waits on it.

## Alternatives considered

- **basketnews.com's injury report** — a single article, re-edited daily, with
  no per-item markup. It would have to be parsed as prose, which is both more
  fragile and much closer to reproducing somebody's writing.
- **euroleaguebasketball.net news** — 429 unauthenticated. Worth revisiting if
  an official availability resource ever appears, which would make this record
  superseded rather than amended.
- **Typing injuries in by hand.** Honest, and it is still the fallback — the
  status field and the manual lock have always allowed it. It does not survive
  contact with a Tuesday night.
