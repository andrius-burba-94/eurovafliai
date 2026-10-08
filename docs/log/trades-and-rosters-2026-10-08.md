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
