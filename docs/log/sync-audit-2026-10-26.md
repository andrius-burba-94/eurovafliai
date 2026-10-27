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

## Realtime refresh (R1–R8)

**Why the connect moved into `browser.ts`.** Each surface used to subscribe to
`PB_CONNECT` itself and treat its first one as "connected". On a client-side
navigation the old page's cleanup and the new page's subscribe run in the same
tick while the shared `EventSource` is still open, so the SDK only re-posts the
topic list and never replays `PB_CONNECT`. The new surface waited out its
five-second grace, said "Reconnecting", and — never having seen a connect —
treated the next real reconnect as its first and skipped the catch-up. Now the
page holds one `PB_CONNECT` for its life (`keepLinked`) and a surface that
attaches to an open stream comes up at once (`attachSurface`). Checked against
the installed SDK (0.28.1) with a mock `EventSource`: one stream across the
navigation, the new topic posted, the old one gone, and the surface catching
up again after a dropped stream. That check was a throwaway; the committed
tests use a small fake of the realtime client.

**Why the first catch-up waits for the topics.** `PB_CONNECT` fires before a
surface's own topics are posted, so the old "the first connect missed nothing"
was false by one to three seconds on a phone. `onConnect` now runs once the
surface's topics are up and after every reconnect, never with a `reconnect`
flag; each surface catches up every time. That costs one `router.refresh()`
per page load on the refreshing surfaces, which is the price of not missing a
pick.

**Why a failed first connect is retried here.** The SDK retries a dropped
stream forever but rejects a first connect that fails, and keeps the failed
listener registered. Since `browser.ts` is now the only `PB_CONNECT`
subscriber, it can drop that topic wholesale and try again: 1s doubling to
30s, and at once on `online` or when the page is shown. Surfaces subscribe
their own topics only once the stream is up, so a failed connect never
leaves a surface's listener behind.

**Why the token check is client-side.** `session.ts` discards a refreshed
token, and a server component cannot set cookies, so a tab open past the
token's life reconnects with an expired one. If PocketBase treats that as a
guest (the audit could not confirm it), the read rules filter every event and
the page looks connected while hearing nothing. `authStore.isValid` is checked on every connect and whenever
the page is shown; an expired token goes to the existing sign-in redirect.

**One refresh hook.** LiveFeed's in-flight/dirty refresh was the correct one:
a refresh asked for mid-flight is owed, not dropped. It is now the pure
`refresher` (tested with fake timers) plus `useLiveRefresh`, which LiveDraft,
LiveFeed, the write-up strip and the fantasy sync status share. It also holds
refreshes while the tab is hidden and pays them once when shown. The lobby
keeps its own re-read of `league_members` (it merges into state), but through
the same refresher, so a roll's one-event-per-member burst is one read. Chat
keeps its append-from-payload handler and now re-reads and merges by id on
every connect.

**The write-up strip** listened to every `ai_writeups` row in the league:
private briefs, the scout, guard claims, every round. It now filters on its
round and the two kinds it shows.

**`fantasy_syncs`** already had a list rule of "commissioner or member of the
league", which covers everyone the page admits, so the subscription needed no
migration.
