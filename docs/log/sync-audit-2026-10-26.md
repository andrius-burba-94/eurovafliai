# Sync audit, 26 October 2026

The October 2026 audit of the sync code and the scripts around it. Each
cleanup slice appends its own section here.

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
