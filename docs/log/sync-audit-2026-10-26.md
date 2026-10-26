# Sync audit, 26 October 2026

The audit of the worker's sync and write-up jobs, one slice per heading.

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
