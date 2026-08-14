---
name: draft-engine-invariants
description: The non-negotiable rules of the Eurovafliai draft engine — server-authoritative draft state, a pure TypeScript engine library with zero PocketBase imports, pick-then-advance write order with idempotent repair, never trusting client clocks, and mandatory order-generation tests for every format change. Use when working on src/lib/engine/, the worker, draft server actions, pick timers, autodraft, rollback, or any draft-room UI that renders draft state.
---

# Draft engine invariants

Break one of these and draft night breaks. There are no acceptable exceptions;
if a requirement seems to need one, the requirement is wrong.

## 1. The server is the only authority

The `drafts` record is the single source of truth: `current_pick`, `deadline`,
`status`, `order`. Clients **render** state and **request** actions.

- No client ever decides whose turn it is, whether a pick is legal, or that a
  timer has expired.
- A client countdown is display only. The worker enforces expiry.
- Every write path re-validates on the server, even when the UI already
  disabled the button.

## 2. The engine library stays pure

`src/lib/engine/` is pure TypeScript: **zero PocketBase imports, zero I/O, zero
`Date.now()` reached for implicitly** — time comes in as an argument. It is
consumed by both the server actions and the worker, which is exactly why it may
not know about either.

Core surface:

- `buildPickOrder(format, memberIds, rounds)` → `overall_no → member`
- `whoIsOnClock(draft, picks)`
- `isLegalPick(roster, player, template)` — availability **and** positional caps
- `selectAutoPick(candidates, cheatSheet, roster, template)`
- `computeRollback(picks, targetPickNo)`

If a function needs to read the database to answer, it belongs in the action
layer, not the engine.

## 3. Pick-then-advance, always in that order

Creating a pick and advancing the draft are two writes and PocketBase has no
transactions. The order is fixed:

1. create the `picks` record;
2. advance `drafts` (`current_pick`, new `deadline`, or `status: complete`).

That order makes a crash between them **detectable and repairable**: "a pick
exists for `current_pick` but the draft has not advanced" is an unambiguous
state. The reverse order silently loses a pick. Both `makePick` and the worker
repair this state on sight; the repair must be idempotent — running it twice
changes nothing.

The unique indexes `unique(draft, overall_no)` and `unique(draft, player)` are
the physical backstop under the validation. Never remove them "because the code
already checks".

## 4. Never trust a client clock

- The server stores absolute `deadline` timestamps.
- Clients fetch an offset once from `/api/time` at draft-room mount and render
  the countdown against `serverNow = clientNow + offset`.
- Expiry is executed **only** by the worker (~1s poll): find `live` drafts with
  `deadline < now` → `selectAutoPick` → the same pick pipeline with
  `is_auto: true`.
- A client hitting zero shows "time's up", it does not fire the pick.

## 5. Format changes require order-generation tests

Any change to a format, or a new format, ships with tests for
`buildPickOrder` covering:

- every supported format: `linear`, `snake`, `snake3rr` (and `keeper` when it
  lands);
- odd **and** even member counts, plus the minimum (2) and maximum (12);
- the full round count (13) — not just rounds 1–3;
- round boundaries, where snake direction flips and 3RR repeats round 2's
  direction.

Rollback maths must survive snake direction. `computeRollback` is tested
alongside, including "rollback to pick 1" and "rollback to the last pick".

## 6. Legality includes the endgame

`isLegalPick` enforces the roster template (`{G:5, F:5, C:3}` by default, read
from `leagues.settings.roster_template` — never hardcoded at a call site). The
case that catches naive implementations: when only C slots remain open, **only
centers are legal**. Autodraft must filter by legality *after* ranking, never
before, or it will happily "pick the best available" into a full slot.

## 7. Degradation is a feature

If the worker dies, timers stop being enforced — and **nothing corrupts**. The
commissioner can still enter picks manually. Any new engine behavior must keep
that property: no state that only the worker can repair, and no partial write
that blocks a manual override.
