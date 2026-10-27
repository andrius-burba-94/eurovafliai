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

## Worker passes and auth

**Why the auth changed.** About a dozen worker passes share one PocketBase
client. Each pass's `catch` used to call `pb.authStore.clear()`, whatever the
error — a Euroleague feed outage included — on the theory that an expired
token and a PocketBase restart should heal the same way. Our list rules are
filters (`@request.auth.id != ""`), so a guest list does not fail: it returns
200 and no rows. One pass clearing the token while another was between a read
and a write made the second read an empty table and write from it. The
outlooks pass was the worst case: an empty read made `refreshOutlooks` delete
every stored outlook (W3, now refused on its own as well).

`superuserSession` never clears the token. Only a `ClientResponseError` with
status 401 or 403 marks it stale; a feed outage or an unreachable PocketBase
(status 0) does not. `ensure` re-authenticates with one shared promise, so
passes waking together make one login, and renews the token ten minutes
before it expires (`isTokenExpired(token, 600)` from the installed SDK,
0.28.1). An error wrapped by a pass loses its status; the sweep's first read
is unwrapped and runs every second, so it marks a rejected token stale within
a tick.

**Why one scheduler.** Eleven passes repeated the same scaffolding: an
in-flight variable, a timer variable, `setTimeout` → run → `setInterval`, a
`try { ensureAuth } catch { log; clear }`, and a hand-written
`clearInterval` at shutdown. `createPasses().schedule` owns the guard, the
failure count (logged at most once a minute, so the 15-second BasketNews poll
cannot flood), the "recovered after N" line, and the timer list. The write-up
pass and the one-minute Rewrite check pass the same `lock`, as before. The
sweep tick stays outside it: its stall warning and heartbeat are specific to
the only deadline-enforcing loop.

**Shutdown (W5).** Shutdown used to await only the sweep tick and exit, which
cut off any pass mid-write. It now drains every pass in flight with an 8-second
deadline. PM2's `kill_timeout` for the worker is 10 seconds, so the drain
finishes before SIGKILL. Every pass is idempotent, so one cut off at the
deadline is retried by the next boot.

**Live pass.** It read all ~380 fixtures every minute, around the clock. It
now asks PocketBase for unplayed fixtures whose `utc_date` day can fall
inside the window, then applies `inLiveWindow` exactly. The filter compares
whole days because `utc_date` is text, stored with a `T` or a space depending
on the writer. The window had four hand-written copies with different bounds
(the worker's closed at `<=`). They are now one `inLiveWindow`: from five
minutes before tip-off until four hours after, end excluded. The finished
snapshot read is narrowed to the candidate games. Per-game failures and
box-score disagreements are logged once per game, with a "recovered" line, and
pruned when the game leaves the window. Before, a failing game logged every
minute for up to four hours and the set of logged problems never shrank.

**S13.** If the 15-minute stats pass recorded a game before the live pass saw
`Live: false`, the live pass stopped polling it (it skips played fixtures)
and its snapshot stayed `live: true` with an ageing `checked_at`. The matchday
page and the lineup court then said "Live feed stale" for the rest of the
round. Fixed on the read side: `liveCheckedAt` drops snapshots of played
games. The matchday "Live" badge uses the same list.

**What stayed.** `upsertLiveSnapshot` still rewrites an unchanged snapshot
every three minutes. `feedStatus` and `gameStateOf` call a feed stale after
five minutes without a check, and a halftime changes nothing for fifteen.
Without the heartbeat a healthy feed would read stale. The cost is one
`router.refresh` per viewer per three quiet minutes.

**W7.** The sweep's last look before an autopick compared only `status` and
`current_pick`. If a commissioner extended the clock (`setPickClock`) between
the read and the commit, the stale deadline won. The sweep now re-runs
`isPickDue` on the fresh row (unless the member armed autodraft), and a new
test stages exactly that extension.

## AI write-up passes

**The rewrite that never stopped (W2).** The round pass re-guarded every row
that held prose, whatever its status. A re-guard that failed rewrote the row
*forced*, and forced claims skip the three-attempt cap. When the model's
answer was refused, `failWriteup` kept the old prose and moved neither
`last_guarded_at` nor `generated_at`, so the next pass, fifteen minutes on,
found the same row due, the same prose false, and paid for the same rewrite
again: up to two billed Gemini calls a pass, every pass, for good. The briefs
never had this because their re-guard only looks at `ready` rows. Now the
round re-guard does the same. A refused rewrite is `failed`, and the write
step retries it *unforced*, so the claim's cap applies: at most three calls on
one sheet, then it waits for a correction or the commissioner. The
commissioner's Rewrite is still forced and uncapped (ADR-0013). The test runs
six passes against prose a correction made false, with the model refusing
every time, and counts three calls.

**Rows a dead writer left behind (W4).** A worker killed between claim and
finish leaves a row `pending`. The claim already takes over a stale one, but
only a pass that reaches the claim recovers it. The round pass skipped a
pending row that held prose (so Recap said "rewriting" for good), the scout
skipped every pending row, and the briefs recovered the latest round only.
Two changes: the write steps now skip only a *fresh* claim (`notDue`, which is
also "attempts spent"), and the fifteen-minute pass starts with
`releaseStaleClaims`. That one read of `status = 'pending'` puts a stale row
back the way a crash-free outage would: prose stays `ready`, and the daily
re-guard checks it like any other; a row with no prose is `failed` and retried.
It is idempotent, so a pass that dies halfway through it loses nothing.

**The scout's outage (W6).** On a model-call error the scout called
`failWriteup` where the other passes call `abandonClaim`. A Gemini outage
hid every member's written reasons (the page shows reasons only from a `ready`
row) and spent an attempt. It now goes through the same helper as the others.

**Outages no longer spend attempts.** `abandonClaim` used to leave the
claim's attempt counted. Three quota errors in a row (a free tier's daily
quota running out at midday is enough) would exhaust whatever row was
first in line. When Google did not answer at all (quota, key, unavailable,
request refused), the attempt is now given back. Any other throw still counts,
so an unknown fault cannot loop uncapped.

**One way to write.** Claim, ask once, then complete, fail or put back each
row was written three times: `writeRound`, the briefs' `writeMembers`, and
inline in the scout, which is how W6 crept in. `claimAndWrite` in
`round-pass.ts` is now the only one. Each pass builds its rows and says how
to read the model's answer per member. `untilStopped` replaces five copies
of the `PassStopped` catch.

**Shared reads.** In the fifteen-minute pass the enabled leagues and each
league's finished rounds were read once per job, three times in all. Both are
now read once in `runWriteupPass` and handed down; `readComplete` is
memoised per league. The one-minute Rewrite check read every requested row
twice, and the leagues even when nothing was requested. It now reads the
requests once and the leagues only when there is one. Idle, that is one
query a minute instead of two. The round write step also checks `notDue`
before reading a sheet, so a round out of attempts no longer rebuilds its
sheet every pass.

**Failure recovery.** No new multi-write sequence. Each row is still its own
lock: claim, call, one finishing update. A crash after the claim leaves
`pending`, which `releaseStaleClaims` or the next claim takes over once
stale. A crash inside `releaseStaleClaims` leaves some rows pending, and the
next pass finishes the job. Concurrent passes are already serialised by the
worker's in-flight guard. If one did race a release, the worst case is a row
shown as written while its rewrite is in flight; that rewrite's finish
overwrites it.

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
