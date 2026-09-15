# ADR-0006 — The midnight board: one dark ground, and a colour-coded instrument

- **Status:** accepted
- **Date:** 2026-09-15
- **Supersedes:** [ADR-0005](ADR-0005-night-board.md)
- **Context source:** blueprint D17 and D21, DESIGN.md's direction contract,
  Phase 10

## Context

Everything below is a reversal, and it is worth being exact about what is being
reversed rather than letting a diff imply it.

The day board was a deliberate **inversion** of the physical object: the real
draft board is dark card in a dim room, and this app made the card stock the
ground and the board's ruling the ink. D17 refused dark mode by name, alongside
shadows, rounded cards and chart decoration. The direction contract in
`src/app/layout.tsx` has shipped in the emitted HTML of every page since Phase
1.4 and refuses, literally, **"the near-black surface with one glowing
accent"**.

ADR-0005 then added a night ground *while keeping that refusal intact*, and it
was careful to say so: "a dark surface with one glowing accent is the thing the
direction contract refuses; this is a board under a different lamp."

The instruction this record answers asks for exactly the refused thing: a deep
midnight navy ground at `#0B1120` with a sharp Euroleague orange accent at
`#FF5500`, vibrant position colour-coding across every surface, segmented card
blocks per player, a data-dense grid with sparklines, a second type family for
tabular figures, and spring motion on a draft selection.

So this is not an amendment. **The thesis changes.**

## What the old refusal was protecting, and what it was not

The refusal was never really about darkness — ADR-0005 established that much.
It was about two failure modes bundled into one sentence:

1. **A dark ground doing the work that structure should do.** A near-black
   surface hides a weak layout: contrast collapses, hierarchy disappears, and
   the interface reads as atmospheric rather than legible.
2. **A saturated accent glowing to make up for it.** One bright colour used
   decoratively, everywhere, until it means nothing.

Both of those are still worth refusing, and this record refuses them. What it
gives up is the *conclusion* that a light ground is the only way to avoid them.
The structure is what was load-bearing, not the lightness: four rule weights
that carry state, a marker with exactly two jobs, measured contrast on every
pair, no colour without a redundant non-colour signal.

That structure survives this change unaltered. The palette underneath it does
not.

## Decision

**One ground: the midnight board.** Not a third theme — a replacement. The day
board and the night board are both retired, along with the ground switch, the
`prefers-color-scheme` mapping and the `--night-*` indirection.

### One ground rather than two

Two grounds was the more conservative option and it is rejected on a
measurement. `#FF5500` is **2.76:1** against the day board's card stock — it
fails the text floor, and it fails the 3:1 boundary floor as well, so it cannot
be a primary action's border either. Keeping a light ground therefore means a
*second, darker* orange, and the accent's identity is the whole point of the
brief. A design system whose one accent is two different colours depending on
the lamp has two accents.

The cost is named in Consequences: 9.5 and 9.5a are undone eight days after
they merged, and a reader whose phone asks for a light interface no longer gets
one.

### The palette is solved, not picked

Both anchors are converted rather than approximated — `#0B1120` is
`oklch(0.18 0.032 266.6)` and `#FF5500` is `oklch(0.6759 0.2175 38.8)`, at four
decimal places because three round-trips the marker to `#ff5502` — and every
other value is then **solved against the floors** `tokens.test.ts` asserts,
which is the method ADR-0005 used and the only part of its process this record
keeps wholesale.

Three constraints did real work, and each one moved a value:

- **A panel is lighter than the ground, so the ruling is solved against the
  panel.** "Deeper stock" is not available on a near-black board; depth on a
  dark ground is lightness. That inverts which surface is the harder one for a
  mid-grey rule to sit on, so `rule` is solved for 3:1 on the *panel* (3.15:1)
  and clears 3.52:1 on the ground as a consequence, rather than the other way
  round.
- **The live field is the lightest warm bay that faint ink survives.** A blush
  lifted well off a near-black ground pushes `ink-faint` — what a muted pool row
  is written in, and that row can be the armed one — under 4.5:1. So
  `live-sunk` is derived downward from that constraint rather than chosen for
  looks: `oklch(0.254 0.075 38.8)`, 1.16:1 against the ground, with faint ink at
  4.61:1 on it.
- **Soft ink is solved against its worst pairing, not against the ground.** It
  is written on a position wash that itself sits on a panel, and the
  Ink-on-Blush Rule requires it to stay stronger than the marker on the live
  field. Solved against the ground at ADR-0005's 5.79:1 it failed both at
  4.3:1 and by 0.03 respectively. It lands at 6.24:1.

The ink ramp is deliberately **not** pushed to the contrast the ground now
allows. Pure white on `#0B1120` measures 18.8:1, and ADR-0005's argument against
that still holds: halation makes a phone in a dark room harder to read, and a
palette whose quiet inks shout has no quiet. Ink is 13.89:1, close to the night
board's 13.60:1.

### Colour becomes a coding system, and the redundancy rule holds

Positions move from muted twill to vibrant: cyan guards at 9.86:1, emerald
forwards at 10.34:1, amber centers at 10.63:1 on the ground. This is the
substantive change to the visual language — colour is now *meant* to be scanned,
where before it reinforced a form distinction.

**The Letter-Always Rule is therefore more important, not less.** It is kept
without exception. 3.2's critique measured the guard and center washes as
pixel-identical under a severity-1.0 deuteranopia simulation, and brighter hues
do not fix that — they make the colour look more informative while remaining
unavailable to the same readers. Every patch still prints its G / F / C letter,
and the radar still names its axis in run heads.

**There is no head coach.** The brief asks for purple head-coach badging; Draft
Mode "is the same as the Classic Mode, except… there is no head coach" (D19,
2026-09-14), and the pool filters coaches out at ingest. A fourth position
colour would badge an entity the game does not have. Amber centers take the
warm slot the brief gave the coach, and purple leaves the palette.

### Three rules are relaxed, each in one specific way

- **Flatness.** A depth scale exists now: a radius step, a panel fill and a
  border, so a roster can be segmented into per-player blocks. What stays
  refused is **elevation as atmosphere** — no glow, no gradient ground, no
  blurred backdrop, and a shadow only as the depth scale defines it. The
  no-nesting clause is replaced by an explicit two-level scale rather than
  dropped, because "no cards inside cards" was solving a real problem (an
  undifferentiated sheet of unrelated tasks) and unlimited nesting re-creates it.
- **One family.** A second family is admitted for **tabular figures only**, and
  the condition D17-era DESIGN.md set is kept: it must ship `latin-ext`, because
  this league reads Valančiūnas and a font that falls back mid-word makes the
  board look broken. Figures are already `tabular-nums` app-wide; the mono face
  is a legibility choice for dense columns, not a decorative one.
- **The two-animation budget.** It becomes three: a card landing, the live rule
  advancing, and a spring on a draft selection. The guard that matters is
  unchanged and non-negotiable — `prefers-reduced-motion` is handled **inside**
  the animation utility, never at the call site, so a new caller cannot forget
  it.

### What does not change

The marker's **two jobs** — state, and the one act — survive verbatim, and the
brief happens to agree with them: "orange for primary actions and active states"
is precisely those two. State is still carried by a row's own **material**, in
the same four rule weights, and never by a pill parked beside a normal row.
Every colour is still OKLCH, still measured in `tokens.test.ts`, still parsed
from the stylesheet so the test cannot drift from what it guards. Mobile-first
stands: draft night is phones on a couch.

## Consequences

**Good**

- The app is legible in the room it is used in, at the only lighting that
  matters for a 21:00 tip-off, without a second palette to keep honest.
- One ground means one set of ratios: `tokens.test.ts` loses the per-ground loop
  and every assertion is asked once, of the ground that actually ships.
- Position colour becomes scannable, which is what a 323-row pool and a
  thirteen-slot roster were always asking for.

**Costs, accepted**

- **9.5 and 9.5a are retired eight days after merging.** The night board, the
  ground switch, `src/lib/theme.ts`, the `<head>` script and `theme.spec.ts` all
  go. The work was not wasted — its *method* is what solved this palette, and
  the argument it made about halation is the reason the ink ramp stops at 13.89
  — but the surface is gone.
- **`prefers-color-scheme` is no longer honoured**, because there is nothing to
  honour it with. A reader who asks their phone for a light interface gets the
  midnight board anyway. This is the single most defensible reason to reverse
  this record later.
- **A whole-app re-skin one week before the first real draft.** The interface
  the league will actually draft on has now changed underneath a rehearsal that
  was run on the old one. The mechanical proof — the pick pipeline, the sweep,
  the engine — is untouched, and none of it is styled; what is unproven is
  whether the new surface is as readable in a loud room as the one that was
  tested in it.
- **Colour-coding raises the accessibility stakes.** Brighter position hues look
  more informative than they are to a colour-blind reader. The Letter-Always
  Rule was previously belt-and-braces; it is now the actual carrier.

## Alternatives considered

- **A third ground beside day and night.** The conservative option, and it
  keeps `prefers-color-scheme` working. Rejected because the accent cannot
  survive it: `#FF5500` is 2.76:1 on card stock, so a light ground needs a
  second orange, and the brief's identity is that one orange. It also triples
  the token suite's matrix for a project with one league on it.
- **Keeping the night board and merely re-hueing its accent.** Cheapest by far,
  and genuinely close to the brief's intent. Rejected because the night board's
  ground is a *tinted* near-black solved for parity with paper, not the navy the
  brief names, and its panel is darker than its ground — which is the one
  structural thing the segmented card blocks need inverted.
- **Inverting the day palette programmatically.** Rejected for the same reason
  ADR-0005 rejected it: it produces the muddy, halating dark theme both records
  are trying to avoid. Every lightness has to be solved against the ground.
- **Delaying until after draft night.** Recommended and declined; recorded here
  because the cost above is the cost of that decision, not of this palette.
