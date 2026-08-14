# Architecture decision records

One file per decision, numbered, never edited once accepted — superseded by a
new record instead. Keep them short: context, decision, consequences,
alternatives.

| # | Decision | Status |
|---|---|---|
| [0001](ADR-0001-stack.md) | Next.js 16 + PocketBase on a single VPS | accepted |
| [0002](ADR-0002-realtime-and-worker.md) | Realtime via PocketBase SSE; enforcement in a separate worker | accepted |
| [0003](ADR-0003-no-transactions.md) | Living without transactions: the three-layer pick defense | accepted |

Locked product decisions (scoring formula, stats source, formats in and out of
scope, participant count) are not ADRs — they live in the decision log,
[EUROVAFLIAI_BLUEPRINT.md](../EUROVAFLIAI_BLUEPRINT.md) §2.
