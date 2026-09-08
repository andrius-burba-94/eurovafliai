---
target: slice 5.2 transaction builder
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
timestamp: 2026-09-09T01:07:00Z
slug: src-app-leagues-id-transactions-new
---
Method: code review against DESIGN.md / board vocabulary, plus Playwright
`transactions.spec.ts` on chromium and Pixel 7. Detector on `.tsx` still cannot
see this system's real contrast/type risks (STATUS debt).

## Design Health Score — 28/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Confirm sentence is the live preview; refusal uses `Correction` |
| 2 | Match System / Real World | 3 | Room voice; names, not "you"; round not calendar date |
| 3 | User Control and Freedom | 2 | Recording is irreversible; no undo (same as a pick; rollback is draft-only) |
| 4 | Consistency and Standards | 3 | Sheet/Bank/Slots/FilterToggle/SubmitButton only |
| 5 | Error Prevention | 3 | Arm on the row, submit in the sticky band; server re-plans |
| 6 | Recognition Rather Than Recall | 3 | Rosters are the pickers; free-agent search is the pool's |
| 7 | Flexibility and Efficiency | 2 | Free-agent list capped at 40 until you search |
| 8 | Aesthetic and Minimalist Design | 3 | One marker-red act; filters are not the act |
| 9 | Error Recovery | 3 | Plan verdicts are full sentences on the sheet |
| 10 | Help and Documentation | 3 | Header says the room already agreed |

## What was fixed in-slice

- Confirm lives in `sticky bottom-0` `bg-stock`, not on the player row.
- Whole-row `min-h-11` hits.
- Empty roster copy when a side has nobody.
- `from_round` is controlled (React 19).
- No em dashes in UI copy.

## Remaining

### [P1] Search is required past forty unsigned names

The add list slices to 40 so a phone is not handed 300 waiting slots. Typing uses
the same fuse index as the pool. Logged rather than expanded: a commissioner
signing one free agent will type.

Command: leave; do not invent a second infinite-scroll primitive this slice.
