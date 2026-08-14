# ADR-0003 — Living without transactions: the three-layer pick defense

- **Status:** accepted
- **Date:** 2026-08-14
- **Context source:** blueprint §3 principle 3, §4 (`picks` indexes), §9 risk 1

## Context

PocketBase exposes no database transactions to application code. Meanwhile the
riskiest moment in the product is a two-write operation under contention:

1. create a `picks` record;
2. advance the `drafts` record (`current_pick`, a new `deadline`, or
   `status: complete`).

Two hazards follow. **A race:** two clients (or a client and the worker's
autodraft) submit a pick for the same slot in the same instant, both read a
valid state, and both write. **A partial write:** the first write lands, the
process dies, and the second never happens.

A double pick on draft night is unrecoverable in social terms — it hands one
member two players and corrupts the board for everyone. So validation alone is
not an acceptable defense.

## Decision

Three independent layers, each of which must hold on its own.

### 1. Validate-then-write

The server action reads and checks everything the pick depends on before writing
anything: is it this member's turn, is the draft `live`, is the player still
available, is the roster slot legal under `{G:5, F:5, C:3}`. Legality is decided
by the pure engine, never by the caller.

### 2. Unique indexes as the physical backstop

`picks` carries two composite unique indexes:

- `unique(draft, overall_no)` — one pick per slot, so a race cannot double-fill
  a turn;
- `unique(draft, player)` — a player cannot be drafted twice in one draft.

Validation can be raced; an index cannot. The database physically rejects the
second writer even when both passed validation microseconds apart. The loser
gets a clean "already taken" error and the UI re-reads state.

`draft_trade_offers` uses the same trick for "one offer per member per draft":
`unique(draft, from_member)`.

Note the PocketBase caveat that shapes these: unset numbers are stored as `0`,
not `null`, so a unique index on a *bare numeric field* produces false
conflicts. Both indexes above are composite and include a relation, which is
what makes them safe.

### 3. Idempotent repair, enabled by write order

The write order is fixed: **create the pick first, advance the draft second.**

That ordering is chosen so the only reachable intermediate state is
*detectable and repairable*: "a pick exists for `current_pick`, but the draft has
not advanced past it". Both `makePick` and the worker detect it and finish the
advance. The repair is idempotent — running it twice changes nothing.

The reverse order would be silently lossy: the draft would move on with a
missing pick, and no invariant would reveal it.

## Consequences

**Good**

- A double pick is impossible even under a perfect race, without any locking.
- Crash recovery is automatic and needs no human.
- The rule generalizes: any multi-write action must pick a write order whose
  intermediate state is detectable, then own the repair.

**Costs, accepted**

- Uniqueness errors surface as ordinary write failures, so actions must
  translate them into intelligible user-facing messages ("Gone — someone just
  took that player").
- Every multi-write action carries a repair story, which is real design work.
  The PR template therefore **requires** it in writing; a PR that writes two
  records without one is incomplete.
- Some invariants live in indexes rather than in code, so migrations become
  correctness-critical: dropping an index is a correctness regression, not a
  cleanup. Never remove one because "the code already checks".

## Applies to

Everything with more than one write: `makePick`, rollback (delete N picks +
re-point the draft), accepted draft trade offers, trades and add/drops in
Phase 5 (close memberships + open new ones + write the transaction), and stats
ingestion (upsert stats + recompute standings). Ingestion additionally relies on
`unique(player, season, game_code)` to make re-imports idempotent.
