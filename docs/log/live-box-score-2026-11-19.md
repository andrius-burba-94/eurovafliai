# Live box score and the tonight strip, 19 November 2026

A game tapped anywhere it is shown opens its own page: a scoreboard, then
every player's line in a sortable table, for both clubs or one. A strip of
tonight's games runs across the top of every signed-in page on a game day.
Built and checked against E2026 round 13 while it was being played (games
121 ZAL–PAN and 122 TEL–DUB).

## Which source is truest to live

Measured on game 122 during the second quarter:

| Source | What it gives in play | Freshness |
|---|---|---|
| `api-live.euroleague.net/v2/…/games/{code}` and `/stats` | `played: false`, `0 – 0`, no players | Nothing until after the game; `max-age=7200` |
| `feeds.incrowdsports.com/…/v2/…` | Same shape as v2 (its origin) | Same |
| `live.euroleague.net/api/Boxscore` | Every player's full line, `ByQuarter` | CDN `max-age=60` |
| `live.euroleague.net/api/Header` | Period, time left, fouls, timeouts (934 bytes) | CDN `max-age=60` |
| `live.euroleague.net/api/PlaybyPlay` | Every event (58 KB) | `no-store` |
| euroleaguebasketball.net game centre | Not readable: answers 429 to a script | — |

`live.euroleague.net` is the only host that moves in play, as
[the research note](../research/euroleague-api.md) already said. What is new:
its CDN keeps each answer for 60 seconds, and **a query string it has not seen
goes to the origin**. Two reads taken together — cached, then with `&_=<ms>` —
gave Q2 0:48 47–36 and Q2 0:37 47–38. The cached copy was 11 seconds and two
points behind. So every live read now carries the cache-buster.

PlaybyPlay is uncached but 60 times the size of Header and says nothing the
box score needs, so it is not read.

## How it is built

```
worker live pass, every 20 s (was 60 s)
  Boxscore?…&_=now  ──parseLiveBoxscore──▶ players[] with the full line,
                                           detail.quarters, detail.teams
  Header?…&_=now    ──parseLiveHeader────▶ detail.period, detail.clock
                                           (a failed header still publishes)
        └─ upsertLiveSnapshot → live_game_snapshots (+ `detail` json, migration 1791600000)

game page  /games/{code}  and  /l/{league}/games/{code}
  readGameBox: fixture + snapshot + recorded box score + players + league rosters
    played and recorded  → rowsFromStored (the official box score, final)
    otherwise snapshot   → rowsFromLive   (provisional)
  GameFeed: useLiveRefresh on this game's snapshot and fixture → server re-render
  BoxScore (client): sort and club switch are local state, so they survive a re-render;
                     a figure that changed between renders washes once (`stat` moment)

tonight strip (AppShell, every signed-in page)
  readTicker: one league-time game day, an hour before its first tip-off until
  four hours after its last; nothing on other days
  LiveTickerStrip: takes each snapshot record straight from realtime and never
  refreshes the page around it — it sits on the lineup editor and the draft room
```

Pure pieces, all tested: `game-box.ts` (rows from either source, the
column set, sorting, totals, column highs, the clock label, the line-score
heads) and `ticker.ts` (which day, which order, which reading is newer).

### Request budget

Two requests per game in play every 20 seconds. Euroleague staggers tip-offs,
so three overlapping games is a normal night's peak: 18 requests a minute.
The rate limit recorded in the research note was ~100 requests in a few minutes
against `api-live`; this is a different host and well under that. The pass
never overlaps itself (`passes.ts`), and every request still goes through
`fetchWithRetry`.

### Decisions

- **The recorded box score wins once it exists.** A final number comes from
  the finished-game pipeline (DESIGN.md principle 5), so a played game reads
  `player_game_stats`; the last snapshot is only the fallback before the stats
  pass has written it.
- **The page re-renders; the strip does not.** The game page follows the
  realtime convention (`useLiveRefresh`, server stays the authority). The strip
  is on every page, and a refresh every 20 seconds per game under a lineup
  being dragged would be felt, so it reads the score and clock from the record
  itself and re-reads on every reconnect.
- **Sort cycles high → low → low → high → the box score's order.** The box
  score's own order is starters, then minutes, with a Bench divider; a DNP row
  stays at the foot under every sort. Shooting sorts by makes, then by rate.
- **Inside a league** each player carries the crest of the team holding him
  this round, your own rows are on the accent field, and FP counts the
  league's way (BasketNews leagues use BasketNews scoring).
- **Half time.** The header blanks the quarter between periods and stops the
  clock at `00:00`. `withHeader` reads that as the end of the last period
  anyone scored in, so the bug says "Half time" rather than dropping the clock.
- **Club names** come from the roster when it has the club, else from the
  feed's own `Stats[i].Team`, title-cased.
- `games` joins the reserved team slugs, since `/l/{league}/games` is now a page.

## After the first look

Five changes asked for on localhost, the same evening:

- **Arrows on the strip.** A mouse has no sideways swipe and Shift-and-wheel
  is not common knowledge, so each end gets a 44 px arrow while there is more
  that way; it scrolls 80% of the strip, without smoothing under reduced
  motion. The buttons are solid, not a fade: a gradient at a call site is
  refused by `depth-scale.test.ts` (ADR-0011).
- **Crests, not codes.** The club switch shows the crest alone on a phone and
  crest and name from `sm`. The scoreboard drops the lattice and the small
  crests above the names; half of each club's crest bleeds off its own edge
  instead (`ClubCrestMark`), and draws nothing when the image is missing,
  because a club code blown up to that size reads as a word.
- **No score beside a club's table.** The scoreboard already says it.
- **One screen on a desktop.** Measured with the real round-13 game at
  1440×900, 1536×864, 1920×1080 and 2560×1440: the box score ends above the
  fold, and nothing but the tables themselves scrolls sideways. Below a 60rem box (about 1300 px wide with
  the sidebar), the tables stack and scroll as on a tablet. What made it fit:
  - both clubs side by side once the box is 60rem wide (a container query on
    the box, so the sidebar and panel count). Beside each other they keep the
    14 most read columns — MIN, PTS, REB, AST, PIR, FP, FG, 3P, FT, STL, TO,
    BLK, PF, +/− — and fold away 2P, the rebound split, BA and FD; a sorted
    column stays shown; one club alone always shows all 19. A first cut kept
    eight so nothing scrolled; seeing more stats was worth a sideways scroll
    inside each table, so at 1440 each scrolls about 220 px. The page grows
    to 110rem from `2xl` (`measure="broad"`), so at 1920 px all 14 show;
  - rows 26 px under a mouse (`pointer-fine`); 44 px stays for touch;
  - the club switch on the "Box score" heading line (`Bank` gains `toolbar`);
  - the line score beside the score from `lg`;
  - the page title is the scoreboard (an `sr-only` `h1`), not a second
    heading above it.
- **Your players, in every league.** `readYourHoldings` reads the viewer's
  league teams and their roster windows covering the game's round, with the
  viewer's own token; a shirt beside the name opens an `InfoTip` listing each
  league and team, the current league first. The league's own crest still
  marks other members' players; the row field still marks yours here.

## Merged with the broadcast codes (#227)

Main switched on-screen club codes to the feed's `tvCode` through
`clubLabel` while this was open. The codes this slice prints follow it: the
scoreboard's phone codes and line score, the strip's chips and their spoken
labels, the Live line that links to a game, and the club-name fallback in
`readGameBox`. Keys, crests and colours keep the feed code.

## What was checked

- Unit: 2261 pass, including the real in-play Boxscore and Header of game 122
  (`src/lib/live/fixtures/e2026-game122-*.json`): every column matches the feed,
  quarter sums equal the score, points equal 2×2P + 3×3P + FT on every row.
- E2E: `tests/e2e/game.spec.ts` on desktop and phone — open from Live, the
  shirt naming the league, sort both ways, one club alone, a new snapshot
  arriving keeps the chosen sort, scheduled game, unknown code.
- In a local run with the real worker during round 13: games 121 and 122
  published within one pass, the strip showed `Live` and `Q1 · 3:27`, then
  `Half time` once the header fix landed; no horizontal page scroll at 390,
  820 or 1440 px on the game page.

Found on the way and fixed: the cell's screen-reader text was absolutely
positioned and escaped the table's scroll box, widening the phone page to
1126 px; the table region is now `relative`. Its `scroll-padding-left` keeps
a header that is scrolled or tabbed to from hiding under the sticky name
column.

Not this slice's: Live's header (team picker and round stepper) is 9 px wider
than a 390 px phone; and matchday.spec's own tests race on round 38 when the
desktop and phone projects run in parallel (they pass alone and serially).
