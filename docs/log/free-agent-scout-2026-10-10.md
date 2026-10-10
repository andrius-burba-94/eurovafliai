# 7.2 Free-agent scout, October 2026

Spec #190. Slices land as tickets on one branch; each appends its section
here.

## 7.2 B Last season's games in place (#192)

The scout's early-season figures (role minutes, opponent strength, win chance)
need a season behind them, and production held no E2025 box scores: 0 lines
against 887 for E2026. No new command was needed; `stats:sync` and
`stats:starters` already take a season. The ticket was to prove the path end
to end on a copy of the local database and to prove the backfill is invisible
outside the scout.

### What the proof found

Two of the four surfaces it was meant to leave alone were not left alone.

**Pool averages.** An ingest pass rebuilds the pool averages and standings
for the season it imported. `players` holds one set of averages per person,
so an E2025 pass put each player's last five E2025 games, Final Four
included, on his pool row. The row headline (`averagePirOf`) then read May's
form for everyone, and it stayed that way until the next E2026 round landed
and rebuilt it. The same pass also wrote an E2025 standings table for every
league drafted in 2026, which no page shows because the season control
starts at E2026. This was right when 4.4 was built: before E2026 tipped off,
last season's last five were the projection. 9.1 replaced that with the
official table's season averages and nobody removed the rebuild. Now both
doors, the ingest pass and the CSV import, go through `refreshSeasonCaches`,
which rebuilds only for `EUROLEAGUE_SEASON`. A past season's lines and its
schedule are stored, and nothing else changes.

**The mapping doorbell.** The doorbell, the mapping page and the worker's
roster sync each read the newest 20 `stat_imports` batches. The backfill
writes one batch per 12-game pass, about thirty-five of them, all newer than
this season's. A live player's unmatched code dropped out of that window, so
the doorbell went quiet. Worse, the roster sync stopped re-importing that
player's lines once his code arrived. `codesWorthChasing` already ignored a
backfill season's codes, but it filtered a window the backfill had already
filled. There is now one framework-free reader, `mapping/store.ts`, that takes
a season. The doorbell and the sync read this season's window. The page reads
this season's window first and then other seasons' recent batches, because it
still lists every season on purpose.

Review turned up three more ways to rebuild a past season. Recording a
trade recomputed standings for every season its players had lines in, so
after the backfill it rebuilt E2025 as well. `stats:project` and
`standings:recompute` would overwrite this season's caches when given
`--season=E2025`. Attaching a code first seen last season re-imported its
games under this season's numbers, but game codes restart every season, so
those were the wrong games. The rule is now stated once, in
`isPastSeason`: no path rebuilds a season *before* `EUROLEAGUE_SEASON`.
The first fix said "only the current season". That broke the trades E2E
spec in CI, which scores a sandbox `E2099` beside the real season and
expects a recorded trade to re-score it. A later season is not history, so
it may still be rebuilt.

Standings and recaps already had a season filter on every read. The tests
now cover that too: `src/lib/stats/last-season.test.ts` runs the same league
with and without a season of E2025 lines, on the same players and round
numbers, and gets the same standings, pool averages, recap lines and round
write-up sheet. `src/lib/mapping/queries.test.ts` puts 35 E2025 batches after
an E2026 one and checks that the doorbell still counts the E2026 code and the
page still lists it.

### Refinement of blueprint 7.2

The blueprint says the scout "needs last season's `gamesStarted`", a
season total from the official stats table. That total is not stored. Last
season's starts come from the per-game `started` field. The sync stores
it, and the starters backfill fills any gaps. A role is a run of games, starter or reserve, and the minutes in
it. A season total cannot say which games a player started, so it cannot say
what his minutes were as a starter.

### Measured on a local copy (10 October 2026)

On a copy of the local database (E2026: 1,410 lines, 6 standings
snapshots, 235 players with a last five):

| | First run | Re-run |
|---|---|---|
| `stats:sync -- --season=E2025 --all` | 34 passes, 402 games, **7,010 lines** created, 0 corrected, 402 E2025 fixtures; 31m 39s | 1 pass, 0 created, under a second |
| `stats:starters -- --season=E2025` | 0 games read, 0 rows written | the same |
| Known starts | **3,148 `yes` · 3,862 `no` · 0 unknown** | unchanged |

The starters backfill has nothing to do on a fresh backfill, because since
7.0 the sync stores `started` itself. It is still in the production steps as
the check that no stored line lacks one.

Most of the half hour is the feed's rate limit, not our writes: six `429`s
with a five-minute wait each, roughly one per fifty games.

The current season did not move. A hash of every player's averages, every
E2026 standings table, the write-ups and the unmatched E2026 codes was taken
before the sync and after both re-runs, and the two hashes matched. No E2025
snapshot was written. `stats:prev -- --check` matched 227 players to the
official table and printed no PIR disagreement.

**For 7.2 E (#195): a quarter of last season's lines are not stored.** The
feed returned 9,540 lines. 2,530 of them (26%), from 118 person codes,
were refused, because those players left the league and are not in our
pool. That does not matter for role minutes, which only concern players we
can suggest. It does matter for opponent strength measured from stored lines:
"the PIR all of a club's opponents' players collect against it" would be
missing every departed player's share, and unevenly across clubs. Last
season's opponent strength needs a source that is not this table. One option
is team totals kept at ingest. Another is ratios between clubs, where the
missing share would partly cancel. Win chance is unaffected: it reads
fixture margins, and all 402 fixtures are stored.

### Production steps, for a person, after the deploy

From `/var/www/eurovafliai`, while the worker runs. Both commands skip what
is already stored, so either one can be stopped and run again:

```bash
npm run stats:sync -- --season=E2025 --all
npm run stats:starters -- --season=E2025
```

The sync takes about half an hour for 402 games, most of it waiting out
the feed's rate limit. Its second line says
E2026 is the season being played and that the pool averages and standings
stay as they are. Then check:

- **The counts.** The sync's last line gives the lines created. In the
  PocketBase dashboard, `player_game_stats` with filter `season = "E2025"`
  should hold about 7,000 lines, and
  `season = "E2025" && started = ""` should hold 0. `fixtures` with
  `season = "E2025"` should hold 402. Production's pool is the live one, so
  the line count can differ from the local 7,010 by a few dozen.
- **Both re-runs are no-ops.** Run both commands again. The sync prints
  `0 game line(s) created`, and the starters backfill prints `0 row(s)
  written`.
- **Nothing else moved.** The pool still ranks on this season's last five,
  and the standings page shows the same table. The mapping doorbell counts
  what it counted before.
- **Do not run `npm run stats:prev` without `--check`.** With last season's
  lines stored, a write would give every matched player a last-season
  fantasy average on his pool row, which is a visible change. `--check`
  compares the official table with the new lines and writes nothing.

## 7.2 C Three previews of the Scout page (#193)

Three structures were built as throwaway routes from the app's own
components, at 390px and 1280px, each with every state in the ticket: A, the
desk (moves and the wire as two places: tabs on a phone, side by side on a
laptop); B, the fixture ticker (every player's next opponents as shaded
cells); C, the ledger (one ranked table with your moves pinned on top). The
maintainer picked **A** with no revisions, recorded on #193. The routes were
deleted once the choice was made, because the corner-scale test caught B and
C. The screenshots stay in `.impeccable/mocks/decision/`, which is
gitignored.

## 7.2 E Outlooks and the waiver wire (#195)

**Last season is a fallback, not a blend.** The spec had opponent strength
"leaning on last season's regular season early". The B measurement showed
that stored E2025 lines miss 26% of the league, the players who left. That
moves a club's "PIR allowed" by up to ±8% (ASV +8%, OLY −7% against points
allowed), which is as large as the effect being measured. The maintainer
ruled that last season should not count for much. So the outlook uses last
season only where there is nothing else:
- a player's PIR a minute and his role minutes, when he has no game this
  season;
- a club's margin, while it has played fewer than three games.

Opponent strength is this season's alone, shrunk toward neutral by
`OPPONENT_PRIOR_GAMES` (5). Recorded as a deviation from the spec and in
CONTEXT.md.

**No known start is not a reserve.** The first local run defaulted every
player whose starts were unknown to "reserve". That read his minutes from
last season's bench average and underrated starters. With no start known,
minutes now come from his recent games, and a test holds it.

**The outlook pass has its own guard, not the AI lock.** It needs no key and
calls no model, so a league without write-ups still gets its wire. It runs
every 15 minutes, two minutes after boot. `npm run scout:outlooks` runs the
same function by hand. On the local copy it computed 255 outlooks in 1.6
seconds, and a second run wrote nothing. The figures track each player's
last-5 fantasy average within about a point; on the local copy the leaders
were Kabengele at 26.7 and Vezenkov at 26.2.

**The pool left the League group.** Scout made the season League group ten
44px rows, one more than a 690px screen holds (`shell.spec`). Inside a league
the Player Pool now sits in the EuroLeague group, at the maintainer's choice.
It is still the league's own pool page. Only the open group takes height, so
on the pool page the League group is folded, a tap away.

## 7.2 F Moves worth making (#196)

Moves are worked out at read time from stored outlooks and the current
transaction board. There is no stored "moves" row to go stale: a free agent
somebody signs leaves the wire and every member's moves on the next page
load. `scoutFor` only ever reads the viewer's own seats, so no other member's
advice is computed in their request at all, which is a stronger guarantee
than filtering it out afterwards.

A pair is legal when the roster still counts its template in the league's
own positions. For a full roster that means like for like, and the reader
passes each player's position in the league's game, so the Omoruyi case is
decided before the advisor sees it. The bar is +3.0 fantasy points a game, or
+3.4 Modern points in BasketNews (7.2 A). A move exactly at the bar is shown;
one a hundredth under is not.

On a phone the gain leads each card and the names get the full width. The
first build put the gain beside the names, and on a 390px screen that broke
names letter by letter. League Home's line is a door beside the round's
recap, because the advice is about acting between rounds, and that panel is
where the round is.

Review found that a short roster (a drop not yet replaced) was told a
position question was coming. D raises one only for a full roster, so a short
roster now says it has a hole. The same review fixed three outlook gaps:
- A game marked played whose box score was not stored yet counted as zero
  PIR conceded.
- A postponed game still counted as upcoming.
- Stale rows were never removed.
