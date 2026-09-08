---
target: slice 3.7 draft-day polish
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-09-08T10-44-07Z
slug: src-app-leagues-id-draft-confirm-pick-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), both driving the real signed-in
app at 390x844 and 1440x900. Every P0/P1 was verified by the parent against the source before being
accepted; all held.

## Design Health Score — 24/40 (best in this project's corpus: 23, 21, 24, 19, 17, 21)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live region exactly right — "Your turn. Pick 1, round 1." when yours, "" when not. Docked: a successful pick renders as a row silently vanishing |
| 2 | Match System / Real World | 2 | Four words for one act (Choose, Chosen, Drafting X, Draft X) and CONTEXT.md defines none |
| 3 | User Control and Freedom | 3 | Best work in the slice: cancel, Escape, confirm all land focus on `pool-search` |
| 4 | Consistency and Standards | 2 | Two marker-red primary actions on one surface — DESIGN.md forbids by name. 12 marker edges over 6 elements at 1440 |
| 5 | Error Prevention | 3 | Purpose achieved, confirm out of double-tap reach. Docked: a paused draft keeps a marker `Draft X` that cannot work while the pool withdrew every `Choose` |
| 6 | Recognition Rather Than Recall | 3 | Band names the player. Docked: `aria-label="Choose X"` static while the visible label reads `Chosen` — WCAG 2.5.3 |
| 7 | Flexibility and Efficiency | 3 | Two keystrokes still draft; the focus handoff makes pointer and keyboard one idiom |
| 8 | Aesthetic and Minimalist | 1 | Band 118px -> 250px armed -> 346px long name (41% of a phone) -> 380px refused (45%), printing the same name twice in 11px wide-tracked caps |
| 9 | Error Recovery | 2 | Refusal renders in the band AND strikes the row (closes 3.3's oldest item), then focus drops to `<body>` and the refusal is announced twice |
| 10 | Help and Documentation | 2 | Nothing says a sound cue exists; the only affordance is a button labelled with its own off state |

## Design Specificity Verdict

Material 9/10, model 6/10, copy 3/10.

The material is unmistakably this project's — `tone="liveOnField"` is the tone DESIGN.md invented *because*
3.3 broke the ink-on-blush rule on this very control. The model is the repo's second independent arrival
at "one action on the row, every verb in a fixed bar".

The copy is the weakest layer and not close. Four words for one act, none in CONTEXT.md — which says
"If a name in a UI label disagrees with this list, change the name — not the list." Aloud on a couch:
"did you pick him?" "no, I chose him, I haven't drafted him."

Deterministic scan: CLI clean on all ten files; positive control PASSED (exit 2, three findings). B
re-derived the executable-rule count and STATUS's **18 of 59** holds exactly, so the clean run covers
under a third of the ruleset.

Overlay detector: four real findings, all on the new band — `gray-on-color` on `confirm-pick-who`,
`all-caps-body` on `confirm-pick-go` (**89 characters of uppercase inside one button**) and on
`confirm-pick-who` (92), `line-length` ~124 chars at 1440. Two false positives correctly dismissed:
`gradient-text` on `<body>` (no gradient exists) and seven `text-overflow` hits that are `truncate`
working as designed.

## What Works

1. The focus contract finally kept — on three of four paths, closed at the source rather than per call
   site. Five `activeElement === body` occurrences across four slices is this repo's most-repeated defect.
2. `clockCue` is the right shape: pure, `lastFiredFor` as an input, so the rule that matters is a unit
   test rather than a hope. B verified the whole contract empirically — 0 vibrate calls and 0
   AudioContexts before any gesture, 1 buzz of exactly [90,70,90] when enabled, 0 on another member's turn.
3. Tap targets pass on both axes, fourth slice running: five controls, all `min-h-11 min-w-11`.

## Priority Issues

### [P0] A refused pick drops focus to `<body>` — VERIFIED, both viewports
Both agents measured it independently; the cause is in the source: the focus effect fires `if (armed)`
keyed on `[armed]`, and a refusal does not change `armed`. `disarm()` restores focus but a refusal
deliberately does not disarm. **Sixth occurrence of this defect** (3.3, 3.4a, 3.4b x2, 3.5), and
`armed-pick.tsx` claims in a comment to have closed it "before anybody has to measure it".

### [P0] A refusal is announced twice to assistive tech
`confirm-pick-error` and `pool-refused` are both polite live regions mounting in the same render, so a
screen reader hears "The draft is paused" twice. Caused by preserving 3.3's row-strike as a `role="alert"`
when the band already announces it.

### [P1] Arming from the pinned shortlist is a different, worse feature — VERIFIED
`pick-form.tsx:419` hardcodes `forTeamName: null` where the pool row computes it, so a manager arming
from the pinned shortlist on somebody else's turn reads "Drafting P01…" with no team named — a mis-pick
that spends another member's turn, undoable only by a rollback that deletes every later pick. It also
gives no armed material, and its label stays `Choose` while the same player's pool row reads `Chosen`.

### [P1] The band's marker act survives a state where it cannot work
Paused, the band is 380px (45% of a phone), says the same sentence three times, and centres a marker-red
`Draft X` — while every `Choose` in the pool has correctly withdrawn. `page.tsx` states the principle in
its own comment: "Offering a button the server is about to refuse would be worse than not offering one."

### [P1] Two marker-red primary actions on one surface
DESIGN.md forbids it by name, and the 2px marker rule "means one thing and one thing only: this slot is
on the clock". The "preserve the SubmitButton weight" reasoning caused it — avoiding one regression
created a worse one.

## Corrections to the assessments

- A claimed the band "swallows the row you just chose". B measured the first pool row's y **unchanged**
  (511 -> 511) and visible rows **5 -> 5**: Chromium's scroll anchoring absorbs the band growth exactly.
  Overstated.
- A implied `Cancel` sits beside `Draft`. B measured `Cancel` **wrapping onto its own line even at
  ordinary name lengths** on a phone. Worse than A described.
- `Cancel`'s border measures **3.03:1** on the blush — passing by 0.03 — and `tokens.test.ts` asserts
  `ink/50` on *stock* only. Same shape as the `border-live/60` = 2.60:1 miss 3.4a caught.

## Minor Observations

Enabling the toggle while already on the clock fires the buzz retroactively. `cue-locked` is reachable
only on a reload, because clicking the toggle *is* the unlocking gesture. `cueKey` is per-league, so the
preference is re-set in every league a member joins. At 390px the pool row gives a player's name 135px
of 350. The `Correction` label word "CORRECTION" is visible rather than `sr-only`, stacking a second
label above the sentence inside an already-380px band.

## Questions to Consider

1. If `Choose` arms and `Draft` commits, what is `Chosen`? It is the only one of the three that names a
   *state*, and it is drawn in the material of an *act*.
2. Is the second tap solving a fat-finger problem or moving it? The double-tap is genuinely dead; the new
   hazard is a manager arming from the pinned shortlist with no team named.
3. DESIGN.md refuses a second sticky band because it "costs a 390px phone the rows it exists to show".
   At 380px the one band costs those rows by itself. Is the rule about the count of bands, or the pixels?
4. What is this app's material for success? Draft night ends with the thirteenth pick vanishing from a
   list, and the two-event motion budget is spent. If the answer is "nothing", that belongs in DESIGN.md
   as a decision rather than reading as an omission.
