# ADR-0002 — Realtime via PocketBase SSE, enforcement via a separate worker

- **Status:** accepted
- **Date:** 2026-08-14
- **Context source:** blueprint §3 core principles 1–6, §8

## Context

The product's headline requirement is that a live draft looks **identical on
every device at the same moment**: when someone picks, ten phones update. Two
sub-problems hide inside that.

1. **Propagation.** Every client must learn about every state change without
   polling.
2. **Enforcement.** Each pick has a deadline. When it passes, an autodraft pick
   must happen — even if the member's phone is asleep, on a train, or lying about
   what time it is. Nothing in a browser can be trusted to fire that.

## Decision

### Realtime is PocketBase SSE, straight to the browser

Browser PB clients point at `https://<subdomain>/pb/` and subscribe to `drafts`,
`picks` and `chat_messages` with the signed-in user's token, passed into client
components as an `authToken` prop. Any state change any client causes is pushed
to all clients by PocketBase.

Reads flow over the user's token so PB API rules apply. **Writes never do**:
they go through Next server actions using a superuser client over localhost.
Clients request actions; they do not mutate engine state. One documented
exception, for latency: `chat_messages` **create** may be client-direct, guarded
by a rule requiring `author = @request.auth.id` and league membership.

### Enforcement is a separate worker process

A second PM2 app (`src/worker/`, same repo, same engine library) polls roughly
every second:

- find `live` drafts whose `deadline < now` → `selectAutoPick()` → run **the same
  pick pipeline** a human pick uses, with `is_auto: true`;
- repair any draft left in the "pick created but draft not advanced" state
  (see [ADR-0003](ADR-0003-no-transactions.md));
- from Phase 4.3, run the nightly stats fetch and standings recompute.

### Clocks: absolute deadlines plus one offset fetch

The server stores an absolute `deadline`. At draft-room mount each client fetches
`/api/time` once and renders its countdown against `clientNow + offset`. A client
reaching zero shows "time's up" — it does **not** fire a pick.

### One engine library, two consumers

All draft logic (`buildPickOrder`, `whoIsOnClock`, `isLegalPick`,
`selectAutoPick`, `computeRollback`) lives in `src/lib/engine/` as pure
TypeScript with **zero PocketBase imports**. Both the server actions and the
worker call it. That constraint is what makes "the worker behaves exactly like a
human pick" true by construction rather than by discipline.

## Consequences

**Good**

- No websocket server, no pub/sub broker, no polling loop in the client.
- Fairness is enforced server-side: a device with a wrong clock, a throttled
  background tab or a hostile user cannot pick early, late or out of turn.
- The engine is pure, so the highest-risk logic is exhaustively unit-testable
  without a database. This is the project's main TDD surface.
- Autodraft and manual picks share one code path, so they cannot diverge.

**Costs, accepted**

- **A second process to operate.** PM2 restarts it; a heartbeat is surfaced in
  the commissioner console.
- **SSE is fragile through a reverse proxy.** `proxy_buffering off`,
  `Connection ''`, HTTP/1.1, a long read timeout and a forwarded `Authorization`
  header are all mandatory; realtime must be verified *in production*.
- **~1s enforcement granularity.** A deadline can overrun by up to a second.
  Irrelevant at a 30–60s pick timer.
- Clients must handle SSE drops: show "reconnecting", let the SDK re-subscribe,
  and re-read state from the server rather than reconstructing it locally.

**Failure mode, by design:** if the worker dies, timers stop being enforced and
**nothing corrupts**. The commissioner keeps drafting via manual pick entry until
PM2 brings it back. Any future engine work must preserve that property.
