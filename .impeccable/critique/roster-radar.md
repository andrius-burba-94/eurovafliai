# Critique — the roster radar (slice 3.2)

Method: dual-agent (A: design review · B: detector + measured evidence).
Target: `src/components/roster-radar.tsx`, `src/lib/engine/radar.ts`, as rendered
by the draft room. Mode: **Operate**. Score: **21/40**.

Browser injection on the real route was not possible (`307 → /login?error=unauthorized`).
Substituted: screenshots plus a DOM-faithful harness using the real compiled
stylesheet and the real Archivo woff2. No user-visible overlay was produced.

**The evidence I supplied was broken** — two of five screenshots byte-identical,
none past one filled slot, because the driving script read `.player`/`.member`
off engine-shaped picks that carry `playerId`/`memberId`. The reviewer caught it.
A screenshot meant as evidence needs one assertion about its own content first.

**The detector found nothing, and that is now a known-weak signal:** on `.tsx`
only the regex engine runs; 37 of 59 rules never execute, including every
contrast and type-size rule. Verified against two positive controls.

## Fixed in this pass

1. **The row printed the wrong number.** `filled/total` — how full — while
   `needs`, the answer to the surface's own question, was `sr-only`. Now each run
   prints its remaining need; the total is gone.
2. **Waiting marks were not countable at any width.** Chromium's dash gap for a
   1px dashed border is 2px, the same as the slot gap, so thirteen marks rendered
   as three continuous dashed rules. The component's comment claimed the 2px gap
   had fixed this. Moot now the figure is printed.
3. **Under deuteranopia the guard and center washes are pixel-identical**
   (ΔE76 = 0.00). The radar prints no G/F/C, so place was the only carrier and
   the axis was unlabelled. Run heads added, right-aligned over their figures.
4. **A two-digit count pulled every mark 7.5px left**, so the runs zig-zagged
   from round ten. Measured before and after; all heads and figures now share a
   right edge at 320/390/1280px.
5. **The row divider was solid 1px `rule`** — the same colour as an empty mark's
   rule 7px below, and a material `globals.css` does not have. Now `slot-filled`.
6. **The list never closed.** Now `border-b border-rule-strong`.
7. **Rows were announced 2–4 times**: the visible name and count were never
   `aria-hidden`, and `title` added a fourth channel. The slice's headline
   decision was not true.
8. **The overflow sentence was ungrammatical and untested** — a surplus grafted
   onto *needs*, singular noun with plural verb, an unclosed em-dash aside. Now
   its own sentence, with eight unit tests on `rowSentence`.
9. **The name column stayed 88px at 1280px** while the marks took 570px.
10. **`Bank` did not associate its heading** — every section in the app was an
    unnamed region.
11. **"centre" vs "Center"**: 3.2/3.3 had adopted British spelling against every
    product doc and the Euroleague API.
12. **DESIGN.md justified the "your row" rule with a false claim** about what the
    board does.

## Not fixed, recorded in `docs/STATUS.md`

- The detector's coverage gap itself.
- `SubmitButton`'s 2.11:1 resting border and `PositionPatch`'s 55% borders.
- Picks are grouped twice across the `queries.ts` / `radar.ts` seam, and `filled`
  counts template slots only, so an overflow row reads `13/13`. Sub-millisecond
  and not a scale problem; flagged only against the repo's own "reading it twice
  is how the two would disagree" principle.
- Open, from the review: nothing marks the member currently on the clock, and a
  radar row cannot get you to that member's column on the board.
