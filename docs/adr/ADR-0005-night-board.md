# ADR-0005 — The night board: a second ground, not a second design system

- **Status:** accepted
- **Date:** 2026-09-14
- **Context source:** blueprint D17 ("we explicitly refused … dark mode"),
  DESIGN.md open question 5, slice 9.5

## Context

The day board is a **deliberate inversion** of the physical object. The real
draft board is dark card in a dim room; this app made the card stock the ground
and the board's ruling the ink. DESIGN.md argues that from two facts: draft
night is a lit room with a TV on, and the months either side of it are daylight
phone checks. D17 then refused dark mode by name, alongside shadows, rounded
cards and chart decoration.

Open question 5 did not close the subject — it set the price of reopening it:

> Whether a genuinely dark room during a night draft deserves an answer is open;
> if it ever does, **the inversion argument has to be re-made, not quietly
> dropped.**

This record is that argument.

## What the original refusal was actually about

Read D17 and the direction contract together and the refusal is narrower than
the word "dark mode" suggests. The contract refuses **"the near-black surface
with one glowing accent"** — the category's house style, where a dark ground
does the work that structure should do and a saturated accent glows to make up
for it. That is a refusal of a *look*, and it is still in force.

What the light ground was argued from is **the room**, and the room is not a
constant. Euroleague tips off at 20:00 and 21:00 CET; a phone checked from bed
after a Thursday double-header is the same instrument in the opposite lighting.
A surface at L 0.94 in a dark room is not a design choice, it is a torch.

So the inversion argument survives intact and gains a second clause: the ground
inverts the object **for the light it is read in**. By day the card is the
ground; by night the board is.

## Decision

**Ship a second ground and nothing else.** Two palettes, one design system.

Five constraints, all of them enforced rather than intended:

1. **The system decides until somebody says otherwise**, in CSS. The night
   values are applied by `@media (prefers-color-scheme: dark)`, so a reader with
   JavaScript off still gets the ground their phone asked for, and an OS
   switching at 21:00 reaches a page that is already open. A ~200-byte inline
   script in `<head>` applies an *explicit override* only — before first paint,
   because a theme applied from an effect is a white page flashed at somebody in
   a dark room.
2. **Choosing the ground the system already wants clears the override**
   (`overrideFor`), so "follow my phone" is always one tap away rather than
   something you get back by clearing site data.
3. **Every ratio is measured on both grounds.** `tokens.test.ts` was written to
   read the *first* `--color-X` declaration in the stylesheet, so a second theme
   that overrode those names in place would have been invisible to it — dark
   mode would have shipped unmeasured, which is the one thing this design system
   does not do. The night values are therefore declared under `--night-*` and
   the suite is parameterized by ground: 122 token tests, every ratio among them
   asked twice.
4. **The night values were solved for the day board's own margins**, not picked.
   Soft ink lands at 5.79:1 where the day board is 5.77:1, the marker at 5.10
   against 5.06, the rail at 5.05 against 5.05, the two rules at 3.35/4.40
   against 3.36/4.40, and the position letter clears its own 10% wash on both. A
   dark theme whose quiet inks read at 8:1 has no quiet; it has two shouts, and
   the hierarchy this system carries in ink strength would be gone.
5. **Nothing else changes.** Same four rule weights and meanings, same two jobs
   for the marker, same 10% washes, same framed Bank as one deeper sheet, zero
   radius, zero shadow, zero glow — asserted in the browser on the night ground
   by `theme.spec.ts`, which counts elements with a shadow and expects none.

The control is the existing `FilterToggle` in the top rail: a button with
`aria-pressed`, carrying its state in its own rule, which is DESIGN.md's settled
answer for a two-state control. A sun/moon icon button would have been a new
idiom and a new material in one step.

## Consequences

**Good**

- The app is readable in the room it is actually used in at 21:00.
- `prefers-color-scheme` is honoured, which is what most readers expect and
  never have to ask for.
- The token suite is now theme-shaped: a third ground, if anybody ever wanted
  one, is a palette and a loop iteration rather than a rewrite.

**Costs, accepted**

- **Two palettes to keep honest.** Every new colour now has to clear both
  grounds or CI fails — which is the cost being paid deliberately, and the
  reason the mapping blocks are asserted to carry identical token lists.
- **Screenshots and any future visual regression baseline double.**
- **The control settles after hydration.** The *page* never flashes, because
  the attribute is set in `<head>`; the toggle's own `aria-pressed` is rendered
  from the server's snapshot (day) and corrected on hydration. Rendering nothing
  until mount was the alternative and it moves the rail as the page loads.
- **An inline script in `<head>`.** The CSP already carries
  `script-src 'self' 'unsafe-inline'` (Next's own bootstrap needs it), so this
  adds no new exposure — but it is a line item, and a nonce-based CSP later has
  to cover this script too.

## Alternatives considered

- **A cookie and a server-rendered class.** No flash *and* no hydration
  settle, and the toggle would be a server action. Rejected for what it costs
  everything else: a per-reader cookie read in the root layout makes every page
  dynamic, and this app renders a draft room per request already.
- **Duplicating the palette into both mapping blocks.** Simpler CSS, one guaranteed
  drift. The `--night-*` indirection exists so the two blocks cannot disagree.
- **Inverting programmatically** (a filter, or computing ink from stock).
  Cheap, and it produces exactly the muddy, halating dark theme this record is
  trying to avoid — the lightness of every mark had to be solved against the
  ground, not flipped through it.
