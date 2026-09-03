# Critique — the draft board (slice 3.1)

Method: dual-agent (A: design review · B: detector + static evidence).
Target: `src/components/draft-board.tsx`, `src/components/board-scroll.tsx`, as
rendered by `src/app/leagues/[id]/draft/page.tsx`. Mode: **Operate**.

Browser injection was **not** available for the live surface: `/leagues/<id>/draft`
is auth-gated and needs a live draft, so it returns `307 → /login?error=unauthorized`
without a session. Substituted: eight screenshots at 390/900/1280px covering empty,
mid-draft, paused and complete boards, plus a DOM-faithful static harness using the
real compiled stylesheet. No user-visible overlay was produced.

## Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | No scroll-extent cue; no "just landed" state |
| 2 | Match system / real world | 3 | `· A` for autodraft; "Round" unqualified |
| 3 | User control and freedom | 2 | Board re-scrolled on every pick; no keyboard reach |
| 4 | Consistency and standards | 2 | Marker on blush; a fifth type size; display tracking at the smallest size |
| 5 | Error prevention | 3 | Server-authoritative; loud throw on a column mismatch |
| 6 | Recognition over recall | 2 | No legend for `A`; names truncated to a prefix |
| 7 | Flexibility and efficiency | 2 | No way to jump to a member's column |
| 8 | Aesthetic and minimalist | 3 | All 156 numbers at equal weight |
| 9 | Error recovery | 2 | "Reconnecting" is 11px faint text, not a `Correction` |
| 10 | Help and documentation | 1 | Nothing explains `A`, the washes, or that it scrolls |
| **Total** | | **23/40** | all ten applicable |

## Specificity verdict

Authored for this product — columns as members, motion that travels the way the
round is drafted, frame rules on the cells — but the authorship lived in the
source more than on the glass, and the room upstream of it (25 marker-red pick
buttons) was undoing the board's one accent.

## Fixed in this slice

1. Marker red on the live tint, 4.15:1 — a named DESIGN.md prohibition.
2. Position washes cost ~a tenth of every ratio: numbers 4.42:1, the G/F/C letter
   4.21–4.50:1, column rules 2.90:1. `tokens.test.ts` could not express an alpha
   background at all; it can now, with ten new assertions.
3. Names truncated at ~8 characters, `title` the only recovery — useless on a phone.
   Letter moved to the number line; columns 6rem → 8rem.
4. A paused board struck identically to a live one → `slot-standing`, the 4th state.
5. Scrollport unreachable by keyboard (WCAG 2.1.1), passing in Chromium by accident.
6. The marked slot announced as the bare word "13".
7. Board re-scrolled on every pick, interrupting the eleven people not about to pick.
8. `data-advanced` never removed, so the overlay stood in for the border all night.
9. `slot-${state}` interpolation — would have shipped a board with no state language.

## Not defects

- A paused-board screenshot with no marker predated the `markedOverallNo` work.
  The failure mode of reviewing a stateful surface by screenshot.
- "bays" in `globals.css` is a code comment; CONTEXT.md permits it there.

## Backlog (in `docs/STATUS.md` Open debt)

- The pool's 25 marker-red pick buttons — one word in `pick-form.tsx`, but 3.3's surface.
- "You are on the clock" is not perceivable without looking: no live region, no
  sound, no vibration. A written PRODUCT.md commitment; blueprint 3.7 owns it.
- `PositionPatch`'s own coloured letter on its own wash, 4.21–4.50:1, still unmeasured.
- The board sits ~4 screens down a phone until 3.3 shortens the pool.
- Open, from the review, not acted on: whether an empty slot's pick number earns
  its ink at all, and whether the marker's second job ("just landed") wants a
  fourth rule weight on the board.
