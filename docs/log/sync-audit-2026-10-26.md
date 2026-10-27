# Sync and automation audit, 26 October 2026

An audit of every data sync, poll and scheduled task found problems in the
worker's shared auth, the roster and lineup syncs, the stats import, realtime
on phones, and the feed client, plus about 6,000 lines that could go. The
fixes ship as separate slices; each adds its own section below.

## Feed client timeout and retry (S9)

`fetchWithRetry` is the one client for the Euroleague feed and the news
pages, used by the stats pass, the live pass, the roster sync and three
server actions. It had no timeout, so a socket that accepted and never
answered held its caller until Node's own limit, about five minutes per
request. For the live pass that meant a frozen pass for up to half an hour on
a game night. For a server action, Nginx cut the browser off while the write
carried on.

A thrown error (DNS, a reset connection, the new timeout) also left the loop
at once, although it passes as often as a 503. It is now retried on the same
backoff. `Retry-After` is honoured up to 30 s: a feed asking for longer is
better retried by the next pass than by a request that waits.

The timeout covers reading the body too, since `AbortSignal.timeout` stays
attached to the response. The wait is injectable (`pause`) so the tests run
without sleeping.

Not done: a process-wide request pacer. The worker passes already space their
requests, and the only callers fast enough to trip the feed's limit are the
manual backfill scripts, which retry a 429.

## Stats import robustness

Findings S10, S11, S12, S14 and S15, plus the merges they made obvious.

**S10, caches that never caught up.** The cache rebuild ran only when an
import wrote a row. If `recomputeProjections` or `recomputeStandings` threw
after the rows landed, the next worker pass found nothing outstanding and a
re-run of the sheet planned zero writes. Nothing rebuilt the caches until the
next round, and the batch stayed `applied: false`. The worker and the CSV door
each had a copy of "record batch → apply → refresh → mark applied". They now
share `importStatPlan`, which writes the counts as soon as the rows land and
marks the batch applied only after the rebuild. `settleStatBatches` runs on
every pass that writes nothing and on a no-op CSV apply. It rebuilds while any
batch of the season is unapplied, then marks those batches applied. An import
always rebuilds (`force`), because a concurrent settle may already have marked
its batch. A failed rebuild is now a reported problem, not a thrown error, so
the CSV door no longer fails after its rows have landed.

**S11, a mapping that reverted a correction.** Confirming a person code
re-runs the games that mentioned it (`onlyGames`). The plan compared every
line in those games against the feed, so it planned updates that undid any
pasted correction. In `onlyGames` mode the plan now keeps creates only and
counts would-be updates as unchanged. The call sites in mapping and auto-sync
needed no change.

**S12, games that never fill.** The queue was the twelve oldest outstanding
games. A forfeit, an empty box score, or a game where no player is in the pool
stays outstanding for good. Twelve of those would block every newer game. An
all-unmatched game also wrote a `stat_imports` row every 15 minutes. Half the
cap now goes to the oldest games and half to the newest. A backfill still
finishes, from both ends. A plan that writes nothing is recorded only if its
unmatched lines are not already in the season's newest batch, so 4.2 still
gets its evidence once. A per-game attempt counter would have needed a
migration and more code, so it was not used.

**S14, an older standings recompute winning.** Six callers recompute
standings across two processes, with no lock. `recomputeStandings` now notes
the season's newest `stat_imports` batch (id and `updated`) before it reads.
Before each league's write it checks again, and re-runs once if the batch
changed. Every box-score write belongs to a batch recorded beforehand, with
counts written after its rows land, so the batch changes whenever the lines
may have. Changes to lineups and memberships are not versioned. Their callers
recompute after their own write.

**S15.** `applyPreviousSeason` ignored `prev_season_stats` when deciding
whether anything had changed, so a change to one stat alone was never
written. `readStatsOverview` now filters batches by season. Its row read
stays, because the page lists which rounds are stored and a count alone
cannot say that.

**Merges.** `createOrUpdate` (in `stats/store.ts`) is now the one "create; if
the unique index refuses, read the row back and update it" helper. Box scores,
fixtures and standings snapshots use it. Fixtures dropped its own copies of
`isUniqueViolation` and `describeError`. `readSeasonLines` serves both
projections and last season's comparison. `seasonCode` lives in `seasons.ts`
and replaces the hand-written regex across `src/lib/stats`. The feed's box
score is now destructured instead of copied field by field. The two snapshot
write loops in `recomputeStandings` became `writeSnapshots`. Production code
shrank. The tests for the five fixes added more lines than that saved.

**Failure recovery.** No migration. Writes are in this order: batch
(unapplied), rows, counts, caches, applied. A crash after any step leaves an
unapplied batch over rows that are already correct. The next pass, or a
re-run of the sheet, rebuilds the caches and marks the batch applied.
`unique(player, season, game_code)`, `unique(season, game_code)` and
`unique(league, season, round)` still catch any write that loses a race.
