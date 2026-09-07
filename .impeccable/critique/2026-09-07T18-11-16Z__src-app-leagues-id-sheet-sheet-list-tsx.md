---
target: slice 3.4b cheat-sheet reorder surface
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 2
timestamp: 2026-09-07T18-11-16Z
slug: src-app-leagues-id-sheet-sheet-list-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), both driving the real
authenticated app at 390x844 and 1440x900. Every P0 claim was independently re-verified by the
parent before reporting; two of Assessment A's claims did not survive that check (see Corrections).

## Design Health Score — 17/40 (down from 3.4a's 19/40)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Only live region is `sr-only`. A sighted member removing a player gets no visible confirmation at all |
| 2 | Match System / Real World | 3 | Right metaphor and CONTEXT.md's words; but Remove vs "throw away", and one announcement says `#3` where three siblings say "number 3" |
| 3 | User Control and Freedom | 1 | No undo anywhere. Five one-tap irreversible mutations, one indistinguishable from a mis-tap |
| 4 | Consistency and Standards | 2 | `slot-transit` dresses the held row AND the bar. Drop-on-row asymmetric: onto #8 from above lands below, from below lands above |
| 5 | Error Prevention | 1 | 390px: Remove and Up in the same x column, 52px apart, identical material, no confirm — 407px of buttons wrapping inside a 350px bar |
| 6 | Recognition Rather Than Recall | 2 | A departed player is marked only by faint ink and a missing patch — no text, nothing for AT |
| 7 | Flexibility and Efficiency | 2 | Real gain on 3.4a, but Up is 12 Tab presses from a held row; the bar follows all 20 rows in DOM order |
| 8 | Aesthetic and Minimalist Design | 2 | 426px of chrome above rank #1 at 390x844 = 50.5% of viewport; 7 of 20 rows visible at rest |
| 9 | Error Recovery | 0 | No error surface. `editCheatSheet`'s result discarded at sheet-list.tsx:173 and :236 |
| 10 | Help and Documentation | 3 | Header and missing-players paragraph excellent; paste-box format explanation renders only when you have no sheet |

## Design Specificity Verdict

Material 9/10, model 7/10, drag mechanics 3/10.

Material is unmistakably this product: 2px dashed ink because dashed is already the system's word for
unsettled and the marker belongs to the clock; a tier is a 34px gap, not a band; no drag handle
(no icon packages) and no settle (motion budget spent). Model is right — 3.4a's "no add, no remove,
no move" is now two of three verbs.

Drag mechanics are below category, and DESIGN.md:1050 promises "the gaps jump". Measured mid-drag:
ranksInDomOrder unchanged, 1..20. The document describes behaviour the code does not have.

Deterministic scan: CLI clean (exit 0) on both files, positive control PASSES (poisoned copy -> exit 2,
4 findings). But only ~15 of 59 rules can fire on `.tsx`; ~44 cannot. STATUS.md's "37 of 59" understates
it. Every failure mode this system actually has (low-contrast, tiny-text, text-occlusion, line-length,
all-caps-body) is in the non-executing set.

Overlay detector (injection OK; live server 8400 started and confirmed stopped): 22 findings at 390px,
1 at 1440px. 20 were a false positive from the harness's own 28-char seeded names (real Euroleague names
measure 114-149px in a 192px box, zero overflow). One real: all-caps-body on the bar's 49-char caption.

## What Works

1. The bar-covers-the-held-row fix is real engineering, measured not asserted: heldRowOverlapped false
   at rank 2 and rank 20, both viewports; list still scrolls while held (scrollY 81 -> 481).
2. `slot-transit` as a state, not a composed class. Browser confirms 2px dashed from the second poll on.
3. The relative nudge, through one `applyOperation` optimistically and authoritatively, operation on the
   wire. 3.4a's overflow P0 gone: scrollWidth - clientWidth = 0.

## Priority Issues

### [P0] The transit material does not travel with the row — VERIFIED
sheet-list.tsx:462 puts `slot-transit` on the `<li>`; :503 puts the transform on the inner `<button>`.
Mid-drag: liTop 393, buttonTop 635 — 242px apart. The 2px dashed rule marks an empty hole at the origin
while the travelling content carries no material at all. namesOverlappingTravellingName: 1 — text drawn
over text in the same column.
Fix: move the transform onto the element carrying the state, or give the travelling row
`background: var(--color-stock)` plus a 1px ink rule. No settle (third animation).
Command: /impeccable polish

### [P0] Dragging into a tier gutter does nothing, then re-arms the row — VERIFIED
`onDragMove` hit-tests row rectangles only, so the 36px inter-run gutter is dead space, one per tier
boundary. Verified: gutter at rank 3/4, size 36; drop-target count 0; order unchanged; afterwards
sheet-bar count 1 and the live region back to "picked up, number 1 of 8" — the trailing click re-ran
pickUp. The next tap then moves the row somewhere the user never chose. A tiered sheet is edited at its
boundaries.
Fix: hit-test by nearest row midpoint across the whole list, not containment; suppress the trailing
click after a drag with a draggedRef.
Command: /impeccable harden

### [P0] Nothing on this surface can report a failure — VERIFIED
`await editCheatSheet(leagueId, operation);` at sheet-list.tsx:173 and :236, result discarded both times.
No try, no Correction, zero error elements. Expired session / lost membership / dropped wifi all produce:
row moves, useOptimistic reverts, nothing said or shown. PRODUCT.md principle 4 is "degrade, never
corrupt"; this degrades invisibly.
Command: /impeccable harden

### [P1] Remove is one tap, unconfirmed, unconfirmable, un-undoable — and sits under Up
sheet-remove left:32 top:788; sheet-up left:32 top:736. Same column, 52px, identical material.
Afterwards: zero visible undo controls, no visible confirmation, focus on body. Deleting the whole sheet
300px below takes two presses and names the count. The page argues against itself.
Fix: an undo, not a confirm — "Removed <Name> · Put him back" in the bar. An `insert` operation is four
lines in reorder.ts and closes heuristics 1, 3 and 9 at once.
Command: /impeccable harden

### [P1] The shortfall sentence hides the position you have none of — VERIFIED
`positionSentence` omits zeros by design (correct for the radar's "needs"). In sheet-list.tsx the first
list is "you have ranked", where a zero is the entire point. With 4 guards, 0 forwards, 1 center it reads:
"You have ranked 4 guards and 1 center, and a full roster needs 5 guards, 5 forwards and 3 centers."
The position that will break autodraft is the one the sentence drops. Inherited from 3.4a, preserved by 3.4b.
Command: /impeccable clarify

## Corrections to the assessments

- Assessment A: "no destination indicator, [data-current] count 0" — FALSE. Over a valid row the drop
  target is drawn: data-current 1, aria-current 1. A honestly reported never observing a successful
  highlight; its inference from that was wrong.
- Assessment A: a successful drag re-arms the row — FALSE. Order changed, bar count 0, correct
  announcement. The re-arm happens only on a failed gutter drop, because pointer capture keeps both
  events on the button.

## Persona Red Flags

Eight friends, phones, round nine, 1:43 on the clock.

- You leave the room to edit your sheet and the room takes the clock with it. page.tsx concedes only the
  back-link's label. No clock, no "you're on the clock". The page's own comment says a sheet is most
  useful in round nine; that is the moment it strands you.
- A mis-tap is a silent reorder. With a row held, tapping any other row moves it, and you cannot change
  which row you hold without putting it down. One-handed, mid-conversation, this is the likeliest input
  on the page: unlabelled, unconfirmed, irreversible.
- The instruction paragraph tells a phone to press Escape — 140 permanent characters listing four
  gestures before any is possible.
- VoiceOver: improved (a live region now exists, 3.4a's P0), but focus -> body after Remove and Put down;
  a departed player announces identically to a present one; the drop announcement is a verbless fragment
  that never says the row was put down.

## Minor Observations

- sheet-form.tsx:49 is now FALSE: "The remount that re-seeds this box lives in page.tsx, on a `key`."
  page.tsx:70 says the opposite at length and explains why the key was removed. Written when the key was
  added, not updated when it was taken out.
- Fixed pb-48 (192px) does not scale with a bar that is 166px at 390 and 98px at 1440 — a 205px dead gap
  below the last held row at both viewports, bracketed by two identical dashed rules. Reads as a fault.
- Bar button borders 3.09:1 — clearing the 3:1 floor by 0.09, thinnest margin on the surface.
- Held rows grow 1px (2px border vs 1px), nudging everything below by a pixel on pickup.
- Trailing patch x uniform at 358 on mobile, ragged across 10 values (764-778) at 1440 — the defect 3.3's
  critique fixed for pool rows.
- All five bar buttons are 44px on BOTH axes. The 44x24 mistake is not made a third time.
- Console clean at both viewports in every state.

## Questions to Consider

1. If the gaps do not jump, is this a drag or an animation of a drag? The code's own argument for
   tap-to-place ("tapping another row already covers any distance") argues against shipping the drag
   half-built.
2. Remove has no undo but the whole sheet has a confirm. Which is the mistake? An undo would retire the
   arm-then-commit bank entirely — one mechanism instead of two.
3. Should this page know a draft is running? It knows enough to relabel a link.
