# Sync audit, 26 October 2026

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
