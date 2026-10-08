# Trades and rosters — 8 October 2026

Reported on 8 October about the trades page: the team chips did not fit, round
4's trades looked unsynced and their +/- stale, there was no round filter, the
deal cards were tall, and a newly signed player (Cameron Payne, Anadolu Efes)
was nowhere in the app.

## What production showed

Read-only on the VPS, before any change:

- **EuroVafliai 26-27** (Fantasy Challenge) had been `blocked` on round 4 since
  its freeze opened: "1 question to answer before the rosters can sync". Ausys
  had signed Cameron Payne (`014213`), who joined Efes on 7 October and was not
  in the pool. The roster sync stopped there, so no round-4 transaction, lineup
  or impact existed for that league. This was the "round 4 did not sync" in the
  report.
- **Hostinger CA$HiorAI** (BasketNews) was healthy after #177: rounds 1–3
  final, round 4 re-read every pass, and its six round-4 free-agent swaps
  stored as four moves (two teams made two swaps each, which `planSync`
  groups).
- A dry-run `rosters:sync` planned exactly two additions (Payne, and
  Abdrahamane Kone at Barcelona), nothing leaving and no renames. With the
  user's go-ahead it was applied (batch `f2yv8ugxa378mkp`). The other ~290
  "changes" in its plan were identical bios: `readCurrentPlayers` does not
  read the bio columns, so every bio the feed carries looks new. Harmless under
  the fill-never-blank rule, but noise; the automatic sync fixes it.

## Slice 1 — trade impact is player against player, all season

**The intended feature, restated by the user:** a deal keeps measuring the
players who came in against the players who went out, from the trade round to
the end of the season.

Two things broke it.

1. **A BasketNews league read points only from `round_lineups`.** That table
   carries players somebody rostered, so a player released to free agency
   scored nothing on the Out side and every free-agent swap looked won. The
   same read fed the recap's biggest swing and League Stats, whose "best free
   agents" was therefore always empty for that league. The EuroLeague league
   reads `player_game_stats` for everyone and had neither gap.
2. **9.3 weighed only the arrivals by the team's lineup.** A benched arrival
   counted half, an inactive one nothing, a captain double — while the
   departure, never in this team's lineup again, counted in full. The two
   sides were measured differently. The user chose raw player-against-player
   points on both sides.

**The change.** `readLeaguePlayerRounds` (`src/lib/stats/player-rounds.ts`) is
now the one per-ruleset points reader for trade impact, the recap and League
Stats. A EuroLeague league reads `fantasy_pts`. A BasketNews league reads the
feed's BasketNews Modern value, which ingest already scores for every box-score
line (`basketnews_raw_pts`), and lays BasketNews's own published value over it
wherever a lineup recorded one (`mergeBasketNewsLines`). `impactForMember` no
longer takes lineup weights. The recap's best night still counts what the
owning lineup counted, because that is a different question.

The roster page's "season points while on this roster" still reads the
member's own BasketNews lineups: those are the points that team banked.

**Tests.** The merge (official wins, feed-only rounds kept, hundredths to
tenths), raw counting across a whole season, and one deal read through both
rulesets with a released player who keeps scoring.

## Slice 2 — the trades page as a round timeline

The user picked a round timeline from three mock-ups (ledger rows, round
timeline, team scorecards). Each deal used to be a card with a header line, a
note, and a block per side with Out and In columns, so one free-agent swap
filled a phone screen. Now a round is a heading with its move count and every
team side is one line, which wraps the players under the team on a phone.

- **The note sentence is not shown.** It was either typed by hand ("Official
  game: … swapped for free agent … before round 1.") or written by a sync, and
  in both cases it restated the faces beside it. The stored note is unchanged.
- **Team chips are crests.** Ten named chips cannot fit 375px, and the
  scrolling row hid most of the league. Each crest chip keeps a 44px target and
  carries the team name as its accessible name and tooltip; the active filter
  is printed in the section's aside, so the colour still has a word.
- **The round filter** lists the rounds that have moves and composes with the
  team filter. An empty combination says so and links back to every move.
- **The stamp moment stays**, smaller and from `sm` up, beside the signed
  figure; the figure carries a screen-reader "winning" or "losing".
- The recap's round picker and these filters now share `ChipNav`, so the two
  rows cannot drift apart.

`tests/e2e/trades-timeline.spec.ts` plants a trade and a free-agent swap and
checks the grouping, the raw player-against-player figures, that the team row
does not overflow, and both filters.

## Slice 3 — rosters sync by themselves

Nothing added a player unless somebody ran `npm run rosters:sync` or uploaded
a CSV. A new signing's box-score lines were refused, his news went unattached,
and in EuroVafliai 26-27 the Fantasy Challenge sync stopped on round 4 with a
question no pool player could answer.

**When it runs.** The worker asks every 15 minutes whether a pass is due
(`rosterSyncDue`, pure): every six hours, or sooner — never within the hour of
the last pass — when a name appears that the app is waiting on and has not
seen since the last pass. The names are this season's unmatched box-score
codes, news names from the last 30 days, and the player questions a blocked
Fantasy Challenge or BasketNews sync stored in the last day. A name that is
still unknown after a pass (George Papas, Lorenzo Brown: not in the feed
either) is remembered and cannot keep pulling passes forward.

**What it keeps from D8.** It runs `runRosterImport` with the API as source,
so the authority switch, `manual_lock`, rename quarantine and stored batch all
hold. Unattended, it adds two rules: a departure share above the guard writes
nothing (the script needs `--allow-departures` for that), and a roster with
nothing to write stores no batch, so four passes a day do not bury the ones
that mattered.

**What follows an added player or a filled code.**
- The games his code was refused from are re-imported (`ingestFinishedGames`
  with `onlyGames`, the path `attachStatCode` already used).
- Unattached news names that now resolve to exactly one player are attached by
  slug.
- Every BasketNews league is queued; a Fantasy Challenge league whose latest
  run is blocked is re-run, rosters and lineups, the way "Sync now" does.

Each step is idempotent and the next pass retries what failed.

**The bio noise.** `readCurrentPlayers` did not read the bio columns, so every
bio the feed carried looked new and an import "changed" about 290 players to
the values they already held. It reads them now, with PocketBase's empty `0`
and `""` mapped back to unknown.

**Tests.** The schedule and the new-name rule; a sync that adds a signing,
re-imports his refused games and attaches his news; an unchanged roster;
a truncated feed refused; CSV authority report-only; and the unknown-name
reader across codes, news and both rulesets' questions.

## Slice 4 — commissioner pages, critique then distill

The user asked for `/players/mapping`, `/stats/import`, `/players/import` and
the draft page to be clearer and compacter, without a mock-up round. The
Impeccable critique is in
`.impeccable/critique/2026-10-08T21-00-00Z__commissioner-pages.md`; the two P1s
were the mapping page's four-screen rename list and the finished draft room,
whose grid kept an empty pool column and squeezed the board into a third of
the width.

What changed, by page:

- **Mapping.** The lead says rosters sync by themselves and when the pool last
  moved (`readLastRosterChange`, the newest applied batch). Each question is
  one line with its answers beside it; only the current one carries the live
  field. Section explanations moved behind info tips. "Check the feed" stays
  read-only: the worker applies, this re-asks.
- **Box scores.** The lead says the worker imports every game and pasting is
  for an outage or an amendment. The stored overview is one sentence with the
  latest import; earlier imports fold.
- **Roster upload.** Paste, then the plan, then the authority switch as one
  line at the foot.
- **Draft room, finished.** One column with the board and Download at full
  width; no radar and no room chat once the draft is complete; the band no
  longer sticks; commissioner tools are a plain fold, not a panel in a panel.
  Live and paused rooms are unchanged.

Every test id the specs use is kept. One mapping spec selected an alternative
before hydration and, under a full parallel run, React reset the select; it
now waits on `mapping-progress[data-ready]` like the keyboard specs do.

## Slice 5: trades face off, free agents stand against the pool

The user reported that trades and free-agent moves read the same on the
timeline. Every trade was two mirrored rows that looked just like the
one-team rows around them. Four mock-ups were offered: two lists per round,
a kind tag, a head-to-head line, and a partner column. The user picked
head-to-head, plus a kind filter.

- **Trade line.** It renders only when `readLeagueDeals` reports
  `kind: "trade"` with exactly two sides, which a sync's `swap` and a recorded
  trade both produce. Each team shows what it sent, since one side's out is the
  other side's in. From `sm` up the teams sit at opposite ends with the
  players meeting at the swap glyph; on a phone the line stacks with team A on
  top and team B at the foot. It is not a boxed card, because the Moves bank
  is already a panel.
- **Free agency.** `PoolCrest` (`components/broadcast.tsx`) is a dashed
  outline printing FA, hidden from assistive tech beside a "With free agency"
  phrase.
- **Filter.** `?kind=trade|free` lives in the same `filterHref` as team and
  round. The chip row shows only when the league has both kinds.
- **Unchanged.** Verdict stamps keep their Moment ids, so a seen stamp does not
  replay. `deal`, `data-kind` and `deal-delta` are kept for the specs.

The report also surfaced a data problem, not a display one. Theis was traded
Laurynas → Birka and then released by Birka within one sync window, and the
snapshot diff recorded it as Laurynas's release. That fix is the next slice;
see STATUS.md.

## Slice 6: Fantasy Challenge moves replayed from the official log

The plan first targeted BasketNews, whose transfer log the 8 October probe had
found. The first implementation step, a live read, showed that the reported
league (EuroVafliai 26-27, where Payne also sits) is the Fantasy Challenge
one. Its `fantasy-trades` endpoint, noted earlier as "seen, not used",
records the round exactly: Laurynas sent Theis and Hoard to Birka for Sorkin
and Mantzoukas, and Birka then released Theis for Diarra. The BasketNews log's
schema is recorded for later.

- **Planning.** `planFromLog` replays the round's moves over the stored
  rosters in id order.
  - A move whose result already holds is skipped, so a re-run in the same
    round is a no-op.
  - Anything else that doesn't apply, or rosters that don't end at the
    official ones, returns null. `runFantasySync` then keeps `planSync`'s
    difference and adds a sentence to the report.
  - The log is read only when the rosters differ, so a quiet pass makes no
    extra calls.
  - Steps keep their order (releases, trades, signings) and wording: both
    planners share `tradeStep` and `freeAgencySteps`.
- **Windows.** Rows and roster windows are separate in `applyTransaction`, so a
  pass-through player is in the trade's and the release's rows while his old
  window closes on the trade and nothing opens. Impact nets him to zero for
  the team he passed through. The planner refuses a plan where a player's
  open would precede his close.
- **Repair.** `repairRoundMoves` / `npm run moves:repair`.
  - It derives the round's before and after rosters from the windows (held
    through R-1, held at R) and replays the log over them.
  - It reconciles only rows whose note starts `Fantasy Challenge, round R:`.
    The reconcile counts rows per move, so a duplicate is removed too.
  - It adds first, then removes. A crash leaves both versions, and the next
    run removes the stale ones.
  - It never writes a window, never announces, and keeps the stored rows'
    date.
- **Verification.**
  - `plan.test.ts` covers the round-4 log itself: windows, history
    read-back, re-run, a disagreeing log, and sign-then-trade.
  - `store.test.ts` covers the fetch routing and the fallback sentence. On
    the repair side: dry run, write, the second run, crash-midway, and an
    unexplained log.
  - Not yet run against production.
