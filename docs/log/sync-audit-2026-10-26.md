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

## Scripts cleanup

Three changes, all in `scripts/`: a table-driven `pb:verify`, one shared
setup helper, and the removal of `slugs:backfill`.

### `pb:verify` became tables

`scripts/pb-verify-rules.mjs` had grown to 1,939 lines, one hand-written block
per slice. The same three checks were written out again for every collection
they covered: create, update and delete rules all `null` (21 times), an index
regex (22 times), and a list or view rule (15 times). `requestKey: null`
appeared about 135 times. The structural half is now four tables, each
walked by one loop:

- `SUPERUSER_WRITE`: each collection name, with a reason where one is worth
  stating.
- `READ_RULES`: each collection, a predicate its rules must satisfy, and what
  that means.
- `INDEXES`: each collection, a pattern one of its indexes must match, and
  why.
- `FIELDS`: each collection field and the shape it must have.

The behavioural half still runs in the same order. Every fixture is created
through one `make()`, which also records it for cleanup. Cleanup is one loop
over one reverse-dependency list, not 22 near-identical blocks. That list now
includes `player_outlooks`, whose rows the old script never deleted. Each
client has `autoCancellation(false)`, which removes the per-call
`requestKey: null`. Those keys protect against React StrictMode's duplicate
requests, and a sequential script has none. The file is now 1,458 lines.

**Nothing was weakened.** Each assertion was mapped from the old version to
the new one. Both versions ran against a scratch PocketBase 0.39.11 built
from this branch's migrations on a temporary data directory: old 226 PASS,
new 237 PASS, no failures. Every old message is either still printed or was
reworded into a table row that checks the same thing or more:

| Assertion kind | Before | After |
|---|---|---|
| collection exists | 22 | 24 (+ `source_player_questions`, `basketnews_roster_batches`) |
| writes are superuser-only, per collection | 21 | 24 (+ `stat_imports`, `source_player_questions`, `basketnews_roster_batches`) |
| every non-system collection is superuser-write or allowlisted | 0 | 1 (allowlist: `users`, whose `createRule` keeps its own check) |
| read rule shape, per collection | 15 (some checked only `listRule`) | 15, each checking both `listRule` and `viewRule` |
| list and view rules agree on every collection | 0 | 1 |
| index pattern | 22 | 24 (the three-collection slug check became one row per collection) |
| field shape | 18 | 20 (the pir / fantasy_pts / plus_minus floor check became one row per field) |
| league-delete blockers, users auth/sign-up/OAuth2 | 7 | 7, unchanged |
| behavioural (real users, real writes) | 121 | 121. "Answered questions do not collide" now fails as a check instead of crashing the run |
| **total** | **226** | **237** |

The new checks were then mutation-tested against the same scratch database,
with automigrate off so no migration file was written. Setting
`stat_imports.createRule` to `""`, widening `drafts.viewRule` alone, and
adding an undeclared `zz_mutant` collection produced four FAILs and exit 1.
The old script would have passed all three: it never checked
`stat_imports` writes, checked only `drafts.listRule`, and had no list of
collections.

The "every collection is declared" check holds for the current schema: every
non-system collection except `users` has all three write rules `null`. So a
new collection now needs a line in `SUPERUSER_WRITE` before CI passes. That is
deliberate, and it follows the reasoning of the league-delete blocker check:
make the next collection fail CI rather than ship with whatever rule it was
created with.

### One setup helper

Sixteen scripts each built the same setup: `parseServerEnv(process.env)`,
then `new PocketBase(...)`, then superuser auth. Five of them also had their
own `--name=value` reader, and four copied the local-only URL regex.
`scripts/lib/pb.mts` now exports `env`, `superuserFromEnv()`, `arg()`,
`flag()` and `isLocalPocketBase()`. The "Plain Node, so it builds its own
client…" note that nine headers repeated now appears once, in the helper.

`arg()` keeps everything after the first `=`. This follows
`repair-basketnews`'s `slice` rather than the `split("=")[1]` the other four
used. For every value those scripts accept the result is identical. A value
containing `=` would no longer be cut short.

Scripts import it as `./lib/pb.mjs`. With `moduleResolution: "bundler"`,
TypeScript does not resolve an extensionless specifier to an `.mts` file, and
an `.mts` specifier needs `allowImportingTsExtensions`. Both TypeScript and tsx
map `.mjs` to the `.mts` source. knip follows the import, so `scripts/lib`
needs no entry glob of its own.

`fetch-golden-boxscores.mts` and `backfill-starters.mts` belong to another
slice and were left alone.

Smoke runs against the scratch PocketBase: `pb:dump-schema`, `pb:backup`,
`standings:recompute`, `stats:project`, plus the argument refusals of
`moves:repair` and `ai:preview`. All behaved as they did before. The sync
scripts that call the Euroleague, Fantasy Challenge or Rotowire feeds were
typechecked but not run.

### `slugs:backfill` removed

The worker runs `ensureSlugs` at boot and every hour (`src/worker/index.ts`),
so the manual script was only useful in the gap between the S28 migration and
the first worker boot, and that gap is over. AGENTS.md and STATUS.md no longer
mention it. The comment in `pb/pb_migrations/1790400000_readable_slugs.js`
still names it: migrations are append-only and were out of scope. The
historical line in `docs/log/matchnight.md` also stays, since it records what
was true then.

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
