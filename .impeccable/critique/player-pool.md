# Critique — the player pool (slice 3.3)

Method: dual-agent (A: design review · B: detector + measured evidence).
Target: `src/app/leagues/[id]/draft/pick-form.tsx`, `src/lib/pool/search.ts`,
`src/components/board.tsx`, `src/components/submit-button.tsx`. Mode: **Operate**.

Browser injection on the real route was **not** possible: `/leagues/<id>/draft`
is auth-gated and needs a live draft, and returned `307 → /login?error=unauthorized`
to both curl and Chromium. Substituted: five screenshots at 390/1280px, plus a
DOM-faithful harness using the real compiled stylesheet and the real Archivo
woff2, driven by the project's own Playwright. No user-visible overlay was produced.

**The detector found nothing, and that is a weak signal.** Its browser engine —
which owns `low-contrast`, `tiny-text`, `undersized-ui-text`, `all-caps-body`,
`wide-tracking`, `cramped-padding`, `text-overflow` — needs puppeteer and never
ran. Its static-HTML engine ran degraded (missing htmlparser2, css-select,
css-tree, domutils) and declared its own output an undercount. Verified working
against a positive control. "Clean" here means no purple gradients.

## Design health: 24/40, all ten heuristics applicable

Weakest: user control and freedom (1 — Escape died once armed), then visibility
of status, match-with-real-world, consistency, recognition, and minimalism.

## Fixed in this pass

1. **Marker text on the live tint, 4.15:1** — the armed row's button. Forbidden
   by name in DESIGN.md, and the same rule 3.1 was fixed for. Now a
   full-strength 2px marker border (4.15:1, clears the 3:1 boundary floor) with
   an ink label (12.62:1), as `tone="liveOnField"`.
2. **`wash()` composited in linear light**, ~0.2 optimistic, so it let a real
   failure pass. Now gamma-encoded — which immediately failed `pos-g` (4.30) and
   `pos-f` (4.22). Both darkened to L 0.49; now 4.56:1 on their own wash.
3. **A drafted row could be armed** — marker-struck, no button, focus lost, live
   region promising an impossible action.
4. **Escape and the arrows died once armed.** Handler hoisted to the pool; the
   spec now uses `page.keyboard.press`, which is what makes it a real test.
5. **Spectators saw the picker's legality** — `needs = canPick ? clockNeeds : yourNeeds`.
6. **The live region flooded** on every keystroke, filter and league-wide pick.
   Now reports the match count; the row carries `aria-current`.
7. **The keyboard cursor was a 1.10:1 wash** with no rule. Now a 2px ink outline.
8. **Position toggles were 24px wide** — the Do's rule said `min-h-11` and meant
   both axes. `min-w-11` added to the component and to the rule.
9. **The filter's state rule sat 18px below its label.** `flex items-end pb-1.5`.
10. **A bespoke name class at display tracking** → `CardName scale="slot"`.
11. **Thirty buttons named "Pick"** → `ariaLabel` per row.
12. **`Slots` lost its list role on iOS VoiceOver** → `role="list"`.
13. **`autoCorrect` was on** for the one input this slice exists to serve.
14. **Rows ran 59–107px with the button flipping sides** → uniform 61px, `nowrap`.
15. **Marker red as decoration** on the ticker's pick numbers (from 3.1) → ink.

## Not defects

- The detector's clean run (see above).
- Two blueprint filters absent because their data does not exist (4.4, 3.4).

## Backlog (in `docs/STATUS.md` Open debt)

- The clock is not on screen while picking; sticky on-the-clock block, 3.7's.
- A refusal renders above the search box, up to 30 rows from the tap. Needs
  `DraftResult` to carry the player id so the row can take `slot-correction`.
- `SubmitButton`'s 35% resting border is 2.11:1; `PositionPatch`'s 55% borders
  are 2.16–2.23:1. Measured now, unfixed, because both repaint the whole app.
- The pool's resting state is still 30 rows; "best available" needs 3.4.
- Open, from the review, not acted on: whether arming deserves its own rule
  weight rather than borrowing the clock's marker, and what this system's
  material for *success* is — "you got your man" currently renders as a row
  disappearing, and the two-event motion budget is spent.
