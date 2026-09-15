# Architecture decision records

One file per decision, numbered, never edited once accepted — superseded by a
new record instead. Keep them short: context, decision, consequences,
alternatives.

| # | Decision | Status |
|---|---|---|
| [0001](ADR-0001-stack.md) | Next.js 16 + PocketBase on a single VPS | accepted |
| [0002](ADR-0002-realtime-and-worker.md) | Realtime via PocketBase SSE; enforcement in a separate worker | accepted |
| [0003](ADR-0003-no-transactions.md) | Living without transactions: the three-layer pick defense | accepted |
| [0004](ADR-0004-injury-news-source.md) | Reading a publisher's pages for availability (narrows D5) | accepted |
| [0005](ADR-0005-night-board.md) | The night board: a second ground, not a second design system (amends D17) | superseded by 0006 |
| [0006](ADR-0006-midnight-board.md) | The midnight board: one dark ground, and a colour-coded instrument (supersedes 0005, D17, D21) | accepted |
| [0007](ADR-0007-the-roll-ceremony.md) | The roll ceremony: a derived-phase draw, a fourth animation (raises D22's budget) | accepted |

Locked product decisions (scoring formula, stats source, formats in and out of
scope, participant count) are not ADRs — they live in the decision log,
[EUROVAFLIAI_BLUEPRINT.md](../EUROVAFLIAI_BLUEPRINT.md) §2.
