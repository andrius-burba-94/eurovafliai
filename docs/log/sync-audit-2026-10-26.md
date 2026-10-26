# Sync audit, 26 October 2026

## Roster and lineup sync safety

The audit's roster-and-lineup findings (S1 guard, S3 to S8, W8, L2, L5) and
the duplicates beside them.

**Empty reads are errors.** While the worker's shared client is logged out,
PocketBase list rules answer 200 with an empty list. Both syncs read that as
"nobody holds anyone" and planned thirteen acquisitions per team, which
would be written, and announced in chat, once the client logged back in.
The fix for the login lives in another slice; this one makes the syncs
refuse. `readSeats` and `readPool` throw on none, because every caller runs
after a draft has materialized its windows and a season always has a pool.
The job fails and is retried; nothing is written.

**Blind spots are not departures.** One club's `/people` answering `[]`, or a
row failing to normalize, dropped those players from the read, and the diff
marked them left. The alarm fires only above a quarter of the pool, and one
club is about 5%. `fetchSeasonRosters` now returns `unread`: clubs it read no
player for, and the person codes of rows it could not read (a codeless bad
row protects its whole club). `diffRosters` plans no departure inside them,
and says so in the problems. A club that is no longer in the feed's club
list is not unread, so a club leaving the competition still empties.

**A failed read is not a read.** The game-day schedule asked "has anything
run since this day's first tip-off?", so an expired cookie or a 5xx five
minutes after tip-off counted, and the day's roles were never frozen. Now
only a run that is neither `failed` nor `blocked` counts, and a failed try
is retried after 30 minutes. Blocked counts as a failure too: a question
answered in that time is then picked up without "Sync now". The retry is
bounded by the round's freeze, so it cannot run all season.

**A batch's identity includes where it started.** Without the transfer log, a
BasketNews batch was keyed by its target roster. A → B → A found the first A
batch applied, saw the seats disagree, replayed steps whose transactions
already existed (so nothing moved) and threw "incomplete". The reconcile is
not inside a try, so every job for the league failed until the round changed.
The hash now covers the active window ids too. Those ids are new rows after
every move, so a return to an earlier roster is planned afresh, while a retry
of the same interrupted plan (resumed before reconcile runs) still finds its
batch.

**One linker.** The roster sync, the lineup sync, BasketNews and a positions
read each had a link-or-ask loop. BasketNews's had no claim check: two of its
players matching one of ours threw and failed the job with nothing to
answer. `linkSourcePlayers({ read, pool, idOf })` is the one loop: a stored
link wins, a pool row claimed by exactly one read player is linked, anything
else is a question. The positions read now matches only against rows with no
link in that game, as the others did. A row linked to another id was always
refused there anyway.

**Partial lineup runs are applied.** One unlinked member made the round's
lineup run `failed`, and a settled round with no applied run is re-read four
times a day. So every settled round was re-read all season, a new
`fantasy_syncs` row each time. A run that wrote some teams is now `applied`,
with the refusals in its moves. The cost is in the debt in STATUS.md:
linking that member later does not refill past rounds by itself.

The due checks read narrower: the decided round's applies for rosters, this
season's lineup runs, and BasketNews jobs since the latest settled round. A
BasketNews job counts for every round, so a round settled earlier cannot be
due unless the latest one is too. The answer is unchanged.

**Smaller fixes.** The roster pass requeued on a league's latest run of any
kind, so a lineups run hid a blocked roster run. Answering a BasketNews team
question cleared `fantasy_team_id` and hit `idx_members_basketnews_team`.
`rememberSourcePlayers` retried a unique violation without limit; it now
retries once. `isFinal` counted games postponed out of the round's freeze,
which kept a round open for weeks; it now counts what `roundWindows` counts.
A repaired transaction's date had a `T`. If source-player recovery threw after
a job was marked applied, the job was overwritten to failed. A job that could
not be marked stopped the queue. The box-score recovery read every line of
the season to check a handful of players.

**Merged.** The seat reader, step loop and `clip` are now one each, hosted in
`memberships/store.ts`. `describe` is gone in favour of `describeError`. The
Fantasy Challenge, BasketNews and registrations pool readers are now
`readPool`. Every window build goes through `readWindows`. The lineup freeze
is built by `roundFreeze`, and generational suffixes are handled by
`withoutSuffixes`. `tests/unit/helpers/fake-pb.ts` learned `>=` for the
narrowed reads.

**Failure recovery.** Nothing here adds a multi-write path. An empty read
throws before the first write. A collision blocks before any link is written.
The batch hash change only creates new batch rows, still behind the
`(league, season, round, target_hash)` unique index, and `resume` still
finishes an `applying` batch before reconcile runs. Old batches simply stop
matching, so the next job writes one step-less batch per round it
reconciles.
