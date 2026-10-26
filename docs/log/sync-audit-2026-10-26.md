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
