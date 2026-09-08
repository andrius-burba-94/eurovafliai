# Post-deploy checks

What was checked on the box after each deploy, moved out of `docs/STATUS.md`.
The rule these record: a `done` in STATUS.md was checked *after* its deploy by
more than an HTTP 200. See [README.md](README.md).


Everything below marked `done` was checked *after* its deploy by more than an
HTTP 200 — the classes the slice added were grepped out of the stylesheet the
box actually serves, and realtime was re-verified through the `/pb/` proxy
(`PB_CONNECT` on the first frame, stream held open, unbuffered), because that
is the thing a deploy breaks silently. Do the same after yours.

3.4a was checked that way: `color-mix(in oklab,var(--color-pos-g)`,
`border-live\/80`, `resize-y`, `max-w-prose` and the global
`prefers-reduced-motion` transition guard are all in the stylesheet the box
serves, `/leagues/<id>/sheet` redirects to login rather than 404ing, and
`PB_CONNECT` still arrives through the proxy.

**3.5 was checked the same way, and it is the first slice since 1.5 to ship a
migration** — so the deploy log is the interesting half. It reads
`Migrations changed — restarting eurovafliai-pb to apply them`, which is the
branch of `deploy.sh` that every slice since 2.4 has skipped, followed by both
PM2 apps reloading, `worker is online (pid 1916116)` and
`Deployed c3588989…` matching `main`. The migration really applied:
`/pb/api/collections/chat_messages/records` answers **200 with an empty list**
rather than 404 — and 200-with-nothing is the *correct* answer for a non-null
list rule, because an unauthenticated request matches no records rather than
being refused. (The rule itself is proved with real data by `pb:verify` in CI,
not by this check; production has no messages yet, so this only proves the
collection exists.) `chat-system`, `color:var(--color-rail)`, `line-clamp` and
`break-words` are all in the stylesheet the box serves, alongside 3.4b's
`slot-transit`. Realtime through the `/pb/` proxy: `PB_CONNECT` on the **first
frame at 0.07s**, stream held open the full 12 seconds and closed by the
client — which matters more than usual for this slice, since 3.5's worst bug
was a *second* realtime client making the first one hang.

**The code-health pass (#71, #72) and everything merged with it was checked on
2026-09-08 after the `dbf619f` deploy**, and this entry is the shape to copy
when nothing new is user-facing. There was no migration, so the log correctly
reads `No migration changes — leaving eurovafliai-pb alone`; both PM2 apps
reloaded and `worker is online`. The checks that matter for a pass like this
are the ones that prove it did not quietly break a seam:

- **The box is on the commit.** `git rev-parse HEAD` on the VPS equals local
  `main` — `dbf619f`. Worth doing explicitly, because `deploy.sh` rewrites
  itself mid-run (issue #34) and a half-applied deploy is the failure that looks
  most like success.
- **Every gated route still gates.** `/players`, `/players/mapping` and
  `/stats/import` all answer 307 to `/login?error=unauthorized`; `/login`
  answers 200. A refactor that touched server actions and env access is exactly
  the kind that turns a redirect into a 500.
- **Realtime survived.** `PB_CONNECT` on the first frame through the `/pb/`
  proxy, stream held the full 12 seconds and closed by the client.
- **The worker's stats fetcher came back.** `stats fetch on · E2026 · every
  15min` appears immediately after the reload, and the log is now structured
  JSON — that reformatting is itself a thing to check, since a log line is how
  the fetcher is observed at all. No `stats pass failed` lines.
- **PM2 restart counts are shared history, not a symptom.** `eurovafliai-web`
  and `eurovafliai-worker` both read 46 restarts, which is the count across
  every deploy this box has had, not evidence of a crash loop. Compare the
  number between two checks rather than reading it once and worrying.

Nothing else was expected to move: the pass added no CSS utilities and no
collections, so there was nothing new to grep out of the served stylesheet.

**4.1 and 4.3 were checked that way too, and 4.1 is the second migration
slice since 1.5** — so the deploy log is again the interesting half. It reads
`Migrations changed — restarting eurovafliai-pb to apply them`, and the
migration really applied: `/pb/api/collections/player_game_stats/records` and
`/pb/api/collections/stat_imports/records` both answer **200 with an empty
list**, while `/pb/api/collections/not_a_collection/records` answers 404 —
that contrast is the proof, since 200-with-nothing is the correct answer for a
signed-in-only list rule when nobody is signed in. `/stats/import` answers 307
to `/login?error=unauthorized` rather than 404ing. Realtime through the `/pb/`
proxy: `PB_CONNECT` on the **first frame**, stream held open the full 12
seconds and closed by the client.

**4.3's own check is the one worth copying**, because a working fetcher is
*silent* and silence proves nothing by itself. Three facts together do: the
worker logs `stats fetch on · E2026 · every 15min` immediately after the
deploy; **zero** `stats pass failed` lines since; and, from the box itself,
the feed answers the schedule request **200 in 0.6s** and reports **0 played
E2026 games**. So the fetcher is quiet because there is nothing to fetch
until 24 September, not because it cannot reach anything. 4.1 and 4.3 added
no new CSS utilities, so there was nothing new to grep out of the served
stylesheet — noted so the omission does not read as a skipped step.

**3.4b was checked the same way**, and the check is worth reading as a
template. `slot-transit` is in the stylesheet the box serves *with its
declaration intact* — `border-top:2px dashed var(--color-ink)` — which is the
assertion that matters for this slice, because a state language reduced to a
class name that emits no CSS still looks plausible in a screenshot.
`touch-action:none` is there too, and `slot-standing` and `slot-correction`
are still beside it. `/leagues/<id>/sheet` answers 307 to
`/login?error=unauthorized` rather than 404ing. Realtime through the `/pb/`
proxy: `PB_CONNECT` on the **first frame at 0.09s** and the stream held open
for a full 12 seconds, closed by the client's own timeout rather than by the
server — which is the pair of facts that proves `proxy_buffering off`
survived, since a buffered stream delivers nothing until it flushes. And the
deploy log shows what a whole deploy looks like when it works: `lockfile
unchanged — skipping npm ci`, a clean `next build`, `No migration changes —
leaving eurovafliai-pb alone`, both PM2 apps reloaded, `worker is online (pid
1894028)`, and `Deployed 193cd8a…` matching `main`. That worker-liveness line
is [#34](https://github.com/andrius-burba-94/eurovafliai/issues/34)'s check
finally running on a deploy of its own.

**Phase 3 is four slices in**: the board (3.1), the radar (3.2), the pool
(3.3, partial) and cheat sheets (3.4a). The first three were each followed by
an `/impeccable critique` pass whose fixes are their own merged PRs, and
**every finding from all three passes is closed**. The snapshots are in
`.impeccable/critique/` and are worth reading before touching those surfaces —
they carry measured numbers and the reasoning behind decisions that look
arbitrary otherwise. **All four passes are closed** — 3.4a's is the newest and
the harshest (19/40 against 23, 21 and 24), and its fixes are in the slice
rather than in a follow-up PR because 3.4a had not merged when it ran.

**Phase 1 — walking skeleton** — auth, league creation, join-by-code, the
design foundation, the live lobby and the deploy all landed long ago.
