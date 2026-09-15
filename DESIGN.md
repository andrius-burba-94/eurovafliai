---
name: Eurovafliai
description: A draft board lit for a night game — midnight ground, ruled slots, one Euroleague orange.
colors:
  stock: "oklch(0.18 0.032 266.6)"
  stock-panel: "oklch(0.232 0.028 265)"
  ink: "oklch(0.898 0.008 265)"
  ink-soft: "oklch(0.668 0.014 265)"
  ink-faint: "oklch(0.629 0.014 265)"
  rule: "oklch(0.527 0.018 262)"
  rule-strong: "oklch(0.601 0.02 262)"
  rail: "oklch(0.64 0.05 258)"
  live: "oklch(0.6759 0.2175 38.8)"
  live-sunk: "oklch(0.254 0.075 38.8)"
  pos-g: "oklch(0.78 0.13 205)"
  pos-f: "oklch(0.79 0.15 155)"
  pos-c: "oklch(0.82 0.15 80)"
typography:
  display:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0.04em"
  code:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0.36em"
  roll-clock:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "5rem"
    fontWeight: 500
    lineHeight: "1"
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  wordmark:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0.16em"
  card-name:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0.06em"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  stat:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
  body-small:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  slot-label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.14em"
  field-label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
    letterSpacing: "0.06em"
  action-label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.14em"
rounded:
  none: "0px"
  block: "0.375rem"
spacing:
  "1": "0.25rem"
  "1.5": "0.375rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  slot: "2.75rem"
  "8": "2rem"
  "12": "3rem"
components:
  button-ink:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.action-label}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1rem"
    height: "2.75rem"
  button-ink-hover:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  button-live:
    backgroundColor: "transparent"
    textColor: "{colors.live}"
    typography: "{typography.action-label}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1rem"
    height: "2.75rem"
  button-live-hover:
    backgroundColor: "transparent"
    textColor: "{colors.live}"
  input-field:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.25rem"
    height: "2.75rem"
    width: "100%"
  input-field-focus:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  bank-framed:
    backgroundColor: "{colors.stock-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.block}"
    padding: "1rem"
  card-block:
    backgroundColor: "{colors.stock-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.block}"
    padding: "0.75rem"
  card-block-live:
    backgroundColor: "{colors.live-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.block}"
    padding: "0.6875rem"
  card-block-waiting:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.block}"
    padding: "0.75rem"
  slot-waiting:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.none}"
    padding: "0.5rem 0.75rem"
  slot-filled:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.75rem 0.75rem"
  slot-live:
    backgroundColor: "{colors.live-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.75rem 0.75rem"
  slot-correction:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.75rem 0.75rem"
  patch-g:
    backgroundColor: "color-mix(in oklab, {colors.pos-g} 10%, {colors.stock})"
    textColor: "{colors.pos-g}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
  patch-f:
    backgroundColor: "color-mix(in oklab, {colors.pos-f} 10%, {colors.stock})"
    textColor: "{colors.pos-f}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
  patch-c:
    backgroundColor: "color-mix(in oklab, {colors.pos-c} 10%, {colors.stock})"
    textColor: "{colors.pos-c}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
---

# Design System: Eurovafliai

Written from the code as built at the end of Phase 1.4, and **re-grounded in
Phase 10** ([ADR-0006](docs/adr/ADR-0006-midnight-board.md), blueprint D22):
the card-stock board is gone and the midnight board replaced it.
`src/app/globals.css` is the source of truth for every value; this file is the
prose record and the rulebook. Where the two ever disagree, the stylesheet wins
and this file is stale.

Three surfaces exist today: sign-in (`src/app/login/page.tsx`), your leagues
(`src/app/page.tsx`) and the league lobby
(`src/app/leagues/[id]/page.tsx`). Everything they are made of lives in
`src/components/board.tsx` and `src/components/submit-button.tsx`.

**One surface is deliberately unlike the rest**: the roll ceremony
(`src/app/leagues/[id]/order/`). Everywhere else this app is an instrument that
stays out of the way; that page is the league's one shared theatrical moment and
is composed to be watched rather than worked in. It is built from the same
components, palette and materials — the difference is scale, pacing and what it
gives display size to. See [ADR-0007](docs/adr/ADR-0007-the-roll-ceremony.md)
and Motion's Event four.

## Overview

**Creative North Star: "The Board, Lit for a Night Game"**

The world is still the physical draft board, and it is still an instrument
rather than an entertainment product. What changed in Phase 10 is the lamp: the
ground is the board itself — deep midnight navy — and the marks are chalk on it,
with one Euroleague orange for the two things that are live. Euroleague tips at
20:00 and 21:00 CET, and this app is read on a phone in a dim lounge; the board
is now drawn for that room rather than inverted out of it.

This reverses the thesis this document opened with, and the reversal is argued
rather than assumed — see [ADR-0006](docs/adr/ADR-0006-midnight-board.md) and
blueprint **D22**. The old direction refused "the near-black surface with one
glowing accent", and what that refusal was protecting is kept: a dark ground
must not do the work structure should do, and one saturated accent must not glow
decoratively. The structure is what was load-bearing, and it survives unaltered
— four rule weights that carry state, a marker with exactly two jobs, every
colour pair measured, and no colour without a redundant non-colour signal.

What is new is that **colour now codes position** rather than merely
reinforcing it. Cyan guards, emerald forwards, amber centers, at full strength,
scannable down a 323-row pool. That makes the Letter-Always Rule the *actual*
carrier rather than a belt-and-braces redundancy, and it is kept without
exception.

The personality is dense where density is honest and quiet everywhere else.
Depth exists now, as one explicit two-level scale, but it is structural: no
glow, no gradient ground, no atmosphere standing in for hierarchy.

**Key Characteristics:**

- The midnight board as the ground, chalk as the ink; one ground, not a theme.
- One accent — Euroleague orange — with two jobs and no third.
- State is carried by a row's own material (border weight and style), never by a
  pill parked beside an otherwise normal row.
- Vibrant position coding, always accompanied by its G / F / C letter.
- One radius step and one panel material; zero glow, zero gradients.
- Two type families: Space Grotesk for words, JetBrains Mono for figures.
- Exactly three animations, on exactly three state-change events, all built.
- Mobile-first with a single breakpoint; the phone gets the complete rail.

## Colors

One midnight ground, a chalk ramp tinted into it, and one Euroleague orange.
Everything is OKLCH; neither end of the ramp is pure black or pure white, and
every neutral leans toward the ground's own blue so nothing is a dead grey.

Contrast ratios below are **measured**, not estimated: `src/app/tokens.test.ts`
parses `globals.css`, converts OKLCH to WCAG relative luminance and asserts the
floors. Since Phase 10 there is **one ground**, so every ratio is asked once, of
the palette that actually ships.

The two anchors are given by the brief and **converted** rather than
approximated: `#0B1120` is `oklch(0.18 0.032 266.6)` and `#FF5500` is
`oklch(0.6759 0.2175 38.8)`. Every other value is then *solved* against a floor.
The marker carries **four** decimal places for a reason worth not rediscovering:
at three it round-trips to `#ff5502`, which is invisible and still not the
colour the brief named.

### Primary

- **Euroleague Orange** (`oklch(0.6759 0.2175 38.8)`, token `live`, **5.88:1** on
  the ground): the one accent, and `#FF5500` exactly. It is the 2px rule over the
  slot on the clock, the caret, the selection background, the focus ring, the
  border and text of the single primary action on a surface, and the invite code
  the commissioner reads out loud. Nothing else.
- **Live Field Bay** (`oklch(0.254 0.075 38.8)`, token `live-sunk`, 1.16:1 on the
  ground): the warm field that fills a live slot. It **locates** the row; the 2px
  marker rule above it is what carries the state. Its lightness is not a taste
  decision — it is the **lightest** warm bay on which `ink-faint` still clears
  4.5:1 (it lands at 4.61:1), because faint ink is what a muted pool row is
  written in and that row can be the armed one. Lift the bay further and the
  quietest row in the pool goes under the floor.

### Neutral

- **Midnight Board** (`oklch(0.18 0.032 266.6)`, token `stock`): the ground. Set
  on `body` and on the root element.
- **Panel Stock** (`oklch(0.232 0.028 265)`, token `stock-panel`, **1.12:1**
  against the ground): the one panel material, and it is **lighter** than the
  ground, not deeper. That inversion is forced rather than chosen: on a
  near-black board "deeper stock" is not available, because depth on a dark
  ground is lightness. It fills a framed `Bank` and a card block; it never
  becomes a page ground or a striped row.
- **Chalk** (`oklch(0.898 0.008 265)`, token `ink`, **13.89:1**): all primary
  text, and the 2px stroke of a correction. It stops well short of the 18.8:1
  that pure white would reach on this ground, deliberately — halation is what
  makes a phone hard to read in a dark room, and a ramp whose top shouts leaves
  the quiet inks nothing to be quiet against.
- **Soft Chalk** (`oklch(0.668 0.014 265)`, token `ink-soft`, **6.24:1**): slot
  labels, field labels, secondary sentences under a heading, a member's real name
  beside their team name. It is solved against its **worst** pairing rather than
  against the ground: it is written on a position wash that itself sits on a
  panel (4.57:1 there), and the Ink-on-Blush Rule needs it stronger than the
  marker on the live bay (5.36:1 against the marker's 5.05:1). Solved against the
  ground alone it failed both.
- **Faint Chalk** (`oklch(0.629 0.014 265)`, token `ink-faint`, **5.36:1**):
  input placeholders, the "Slot 07" numbering on an unfilled slot, the round
  numbers down the left of the board plan. 4.79:1 on a panel and 4.61:1 on the
  live bay, which is the pairing that fixes the bay's lightness.
- **Waiting Rule** (`oklch(0.527 0.018 262)`, token `rule`, **3.52:1** on the
  ground): the thin dashed rule of an empty slot. It is solved against the
  **panel** (3.15:1), not the ground, because the panel is the lighter of the two
  surfaces and therefore the harder one for a mid-grey rule to sit on — the
  reverse of which surface was binding on the card-stock board. Since the rule
  *is* the state language, a rule you cannot see means a surface with no states.
- **Heavy Rule** (`oklch(0.601 0.02 262)`, token `rule-strong`, **4.79:1**): the
  solid rule of a filled slot, and the frame that closes a run of slots. It is
  1.36× the contrast of `rule` — the major/minor hierarchy a real board has,
  asserted as a ratio between the two rather than as a fixed number.
- **Rail Blue** (`oklch(0.64 0.05 258)`, token `rail`, **5.60:1**): the top
  rail's bottom border, and the app's own voice in chat. The one neutral with
  visible chroma; the rest of the ramp is tinted toward it.

### Tertiary — position coding

Three hue families for Guards, Forwards and Centers, at full strength, because
since Phase 10 colour is **meant to be scanned** down a 323-row pool rather than
merely to reinforce a form distinction. All three clear the text floor several
times over, because the letter inside them has to be readable.

- **Guard Cyan** (`oklch(0.78 0.13 205)`, token `pos-g`, **9.86:1**)
- **Forward Emerald** (`oklch(0.79 0.15 155)`, token `pos-f`, **10.34:1**)
- **Center Amber** (`oklch(0.82 0.15 80)`, token `pos-c`, **10.63:1**)

Each letter clears **8.36–8.99:1** on its own 10% wash, and each patch border at
`/80` clears **5.61–5.98:1** against the wash it encloses.

**There is no fourth position colour.** The brief asked for purple head coaches;
Draft Mode is Classic Mode without the head coach (blueprint **D19**), the pool
filters coaches out at ingest, and a badge for an entity the game does not have
is a badge that can never be correct. Amber takes the warm slot; purple leaves
the palette.

**Brighter hues raise the accessibility stakes rather than lowering them.**
3.2's critique measured the guard and center washes as *pixel-identical* under a
severity-1.0 deuteranopia simulation, and saturation does not fix that — it
makes the colour look more informative while staying unavailable to the same
readers. See the Letter-Always Rule below, which is now the actual carrier.

### Named Rules

**The Two Jobs Rule.** Marker red has exactly two jobs: *state* — the slot on the
clock and the row that just landed — and *the one act* — the single primary
action on a surface, plus the focus and caret affordances that belong to acting.
It never decorates, never fills a large area, and never appears twice as a
primary action on one screen. Creating a league carries the marker; joining one
does not.

**The 2px Marker Rule.** The double-weight marker rule (`slot-live`) means one
thing and one thing only: this slot is on the clock. Marker red as *text* is
permitted for the one thing a commissioner reads out (the invite code is written
in marker), but the code's own slot stays `slot-filled` — ruled, not struck.

**The Correction-in-Ink Rule.** Errors are struck in ink at 2px
(`slot-correction`), never in marker. An earlier version borrowed the marker for
failures, which made an error and an invite code render identically.

**The Ink-on-Blush Rule.** Text on a live field is chalk (**11.93:1** on
`live-sunk`). The marker clears the floor there too (5.05:1), but chalk remains
the label: the marker's two jobs are semantic, not merely a contrast workaround.
Soft chalk is held above the marker on that field (5.36:1 against 5.05:1) for
the same reason, and that pairing is one of the two constraints that fixed soft
chalk's lightness.

**The Letter-Always Rule.** Colour never carries position on its own. A
`PositionPatch` always renders its G / F / C letter, for colour-blind readers and
for a photocopied sheet (PRODUCT.md, Accessibility & Inclusion). **Phase 10
promoted this from a redundancy to the actual carrier**: the position hues are
now vibrant and invite being read as the signal, and they are the same
indistinguishable pair under deuteranopia that they always were.

## Typography

**Two families, with one job each.** Both load via `next/font/google` in
`src/app/font.ts` with `subsets: ["latin", "latin-ext"]` and `display: "swap"`.

- **Space Grotesk** — every word: display, names, labels, body. Exposed as
  `--font-space-grotesk`, consumed through `--font-sans`. Its geometric skeleton
  and sharp terminals are what "a night game's graphics package" reads like, and
  its caps at wide tracking still do the job Archivo's did.
- **JetBrains Mono** — every figure in a *column*. Exposed as
  `--font-jetbrains-mono`, consumed through `--font-mono` and reached through the
  `stat` utility. It exists because this app is now data-dense: a PIR column, a
  per-round standings run and a sparkline's own label are read *down*, and a mono
  face with unmistakable figures is easier to scan than a proportional one even
  with tabular figures switched on.

**Character:** two families, each with a boundary you can state in one sentence
— words in one, columns of numbers in the other. A third family, or mono used
for prose, is a change to this document.

`font-variant-numeric: tabular-nums` is set on `body`. Every figure in this app
is tabular, because a number that changes width as it counts down makes a clock
jitter and a draft has a clock on it.

### Hierarchy

- **Display** (600, 1.875rem → 2.25rem at `sm`, caps, 0.04em): the one page
  headline. "Take your slot"; a league's name in the lobby.
- **Code** (600, 1.875rem → 2.25rem at `sm`, caps, 0.36em, marker red): the
  invite code, and only the invite code. Tracking this wide exists so six
  characters can be read aloud across a room without being mis-heard.
- **Roll clock** (500, 5rem, mono, −0.03em, tabular): the roll ceremony's
  countdown and the slot being drawn, and nothing else
  ([ADR-0007](docs/adr/ADR-0007-the-roll-ceremony.md)). The same argument the
  invite code makes, for the same room: a number the league counts down *out
  loud together* has to be legible on a phone lying on a table, and display is
  a heading size. Negative tracking because at 5rem the mono face's default
  spacing opens two digits into two separate objects. Reached through
  `roll-clock`; it is a **figure**, so it is mono, and it never sets a word.
- **Wordmark** (600, 1rem, caps, 0.16em): "Eurovafliai" in the top rail.
- **Card name** (600, 1rem, caps, 0.06em): the name written
  on a card — a member, a team, later a player. Rendered by `CardName`.
- **Body** (400, 1rem/1.5rem): sentences. `body-small` (400, 0.875rem/1.25rem)
  for the line under a heading, an empty-state sentence, a correction's text.
- **Slot label** (500, 0.6875rem/1rem, caps, 0.14em, soft ink): the board's own
  small caps. Column heads, section headings, statuses, counts, slot numbers,
  nav links. This is the workhorse — a `Bank` heading is a slot label, so a
  section reads as a column head on a wall rather than a card in a stack. Shipped
  as the `slot-label` utility and the `text-slot` size token.
- **Field label** (400, 0.6875rem, caps, 0.06em, soft ink): an input's label. It
  sits *under* a `Bank` label in the hierarchy, so it differs downward and never
  by contrast: same ink, lighter weight, tighter tracking. Making it fainter was
  tried and produced a 2.96:1 label.
- **Action label** (600, 0.6875rem, caps, 0.14em): button text.

### Named Rules

**The Two Jobs, Two Families Rule.** Space Grotesk sets words; JetBrains Mono
sets figures that live in a column. Nothing else. There is no serif and no
display face, a name is never mono, and a sentence is never mono — the mono
face's own legibility argument is about scanning a column, and it does not
transfer to prose. This replaces the One Label Maker Rule ("one family, no
exceptions… no mono"), which Phase 10 retired on the grounds that the app it was
written for had four numbers on screen and this one has four hundred.

**The one-display-per-surface reading, stated because the ceremony tests it.**
Display is a surface's loudest *word*, and there is one. On the roll ceremony
that one belongs to the **name being drawn**, so the page's own title is
rendered as small caps — an `h1` at slot-label size, because a heading level is
document structure and not a type size. The first cut had it inverted, with "THE
ROLL" at display size over a 16px answer, which is the loudest element on the
page being its least interesting text. A big figure beside it is not a second
headline: one is a word and one is a clock.

**A single figure in a sentence stays in Space Grotesk.** "3 of 13 filled" is
prose. The mono face is for the PIR column, the standings run, the clock and the
box score — places where figures stack vertically and the eye compares them.

**The latin-ext Rule.** The `latin-ext` subset is not optional, and it now has
to hold for **both** families. This league reads names like Valančiūnas and
Motiejūnas; a font that falls back mid-word for the diacritics makes the board
look broken. Both families were checked against Next's own font metadata before
being chosen, not assumed.

**The Tracking-Inverts-Size Rule.** Tracking rises as size falls: 0.04em at
display, 0.06em on a card name, 0.14em on a slot label. Caps at small sizes are
only legible when they are opened up.

**The Computed-Family Rule.** `tests/e2e/design.spec.ts` asserts the *computed*
`font-family` on `body` contains "Space Grotesk" and does not contain "Arial". A
hardcoded stack on `body` once overrode the token, so the webfont downloaded on
every cold load while the page rendered in Arial. Assert the computed value, not
the token. Since 10.3 the same spec asks the question the other way round too —
a `stat` cell must compute to JetBrains Mono while the prose beside it must not —
because two families can only drift apart if something measures both.

## Layout

**One column, two measures.** Every surface is a `TopRail` followed by a
`Sheet`, and both take the same `measure` prop so the rail's wordmark aligns
with the first slot below it on every page. There are exactly two:

- **`column`** — `max-w-3xl` (48rem) centred. Every surface in the app but one.
- **`wide`** — 48rem up to `lg`, then 80rem. **Two surfaces**, and the
  argument is in 10.9 and in open question 4 below: the room is the one surface
  that is four surfaces at once (pool, board, radar, console) and the one a
  friend watches for ninety minutes without scrolling away. Below `lg` it is
  `column`, unchanged, because the phone is still the primary device.

**The second surface is the season dashboard** (blueprint **D26**), and it
earned the measure by the same argument rather than by preference: the room is
pool, board, radar and console; the dashboard is standings, chat, roster and
news. Both are *four surfaces at once*, on a page a league sits on rather than
passes through. The map's key was renamed `room` → `wide` when the second one
arrived, because a key named after one of its two callers is a lie a reviewer
has to open the map to catch.

There is still no sidebar, no full-bleed region, and **no third measure**. A
surface that wants to be wider than `column` is the draft room, the season
dashboard, or wrong.

**Three surfaces, three shapes.** 10.9's differentiation is layout, not skin —
one design system, three shapes, each one the shape of its own question:

| Surface | Shape | The question it answers |
|---|---|---|
| Dashboard (`/`) | a grid of card blocks, two across from `sm` | "which league?" |
| Draft room | `wide` measure, two columns from `lg`, sticky band | "who is on the clock, and who do I take?" |
| Standings | one scrolling grid, sticky identity column | "who won this round?" |

The lobby sits between them and is **two surfaces on one route**: a framed run
at `column` for the apparatus of setting a league up, and at `wide` the season
dashboard once the draft is over — the table, the conversation, your roster and
the league's news, on one screen. The grid of door blocks it used to be is gone
(**D26**): every block was a *promise* of a surface rather than a surface, so
the page a league opens most often across thirty-eight rounds told it nothing
until you picked a door. The doors remain, inside the panels, as the way in to
each.

**Spacing rhythm.** The board's unit is the slot: `--spacing-slot: 2.75rem`
(44px). It is also the minimum touch target, which is why the two numbers are
the same one. Vertical gaps inside a `Sheet` are `2rem` on a phone and one slot
(`2.75rem`) from `sm` up. Sheet padding is `1.25rem / 2rem` on a phone and
`2rem / 3rem` from `sm`. Inside a section: `0.75rem` between a heading and its
content, `1.25rem` between fields in a form, `1rem` between a form's label group
and its action. Slot rows are padded `0.75rem` horizontally, `0.75rem` vertically
when filled and `0.5rem` when waiting — an empty slot is deliberately shorter
than a filled one.

**Responsive behaviour: two breakpoints, and the second one is the room.**
Tailwind's `sm` (40rem / 640px) is the app's layout breakpoint; since 10.9 `lg`
(64rem / 1024px) appears too, **only in the draft room**, and there is still no
`md` or `xl` and no custom breakpoint. Everything below 40rem is the phone
layout, everything above is the wide layout, and above the sheet's measure it
simply centres. What changes at `sm`:

- Sheet padding and gap step up; display type goes 1.875rem → 2.25rem.
- "Start a league" and "Join a league" go from stacked to a two-column grid.
- Buttons go from full-width to auto-width.
- The signed-in dashboard lays its league blocks two across.
- The signed-out user's name appears next to "Sign out" in the rail.
- The board plan appears on the lobby (it is hidden on phones there).

And at `lg`, in the room and nowhere else: the measure opens to 80rem and the
room splits into two columns — what you *do* on the left (the pool), what you
*watch* on the right (radar, board, console, chat). The band above the split
stays full width, because the clock belongs to the whole room.

**The rail stays complete on the phone.** The season ("Euroleague 2026–27") is
rendered at every size. It was hidden on small screens once, which made the
primary device the one place the rail was incomplete. When the rail must
contract, the *name* beside "Sign out" is what goes.

### Named Rules

**The One Measure Rule.** New surfaces use `Sheet` at its default `column`
measure. The one exception is declared *in the component* — `Sheet` and
`TopRail` share a `MEASURE` map, and `wide` is a value in it — so widening a
surface is choosing a named measure that a reviewer can grep, never a per-page
`max-w` override. A third entry in that map needs the argument 10.9 made for
the second.

**The Slot Grid Rule.** Anything vertical is a multiple of the slot unit or of
Tailwind's 0.25rem step. Do not introduce a third spacing system.

## Elevation & Depth

**There are no gradients and no glows.** Not one gradient, `blur`,
`backdrop-filter` or coloured halo exists in the codebase, and none may.

Phase 10 introduced a **depth scale**, because the brief needs a roster
segmented into one block per player and the old answer — one framed panel, never
nested — could not express a run of sibling blocks inside a section. It is
deliberately a *scale with two levels and a stop*, not permission to nest:

- **Level 0 — the ground.** `stock`. The page, and every ordinary slot row.
- **Level 1 — a panel.** `stock-panel` inside a 1px `rule-strong` frame at the
  one radius step. A framed `Bank` and a card block are both level 1.
- **There is no level 2.** A card block may sit inside a framed Bank, because
  that is one section holding a run of blocks; neither may sit inside a *card
  block*. The moment something needs a third level, the layout is wrong.

A card block has **three states**, and they are the row's state language spoken
in a block's materials rather than a second vocabulary: `filled` is panel stock
inside a 1px rule, `live` is the marker at 2px over `live-sunk`, and `waiting` is
a 1px **dashed** rule with **no fill at all** — because dashed is already this
system's word for unsettled, and an empty place given the same stock as a real
player's block turns nine players and four absences into thirteen blocks. Three
rather than a slot's six: `transit`, `standing` and `correction` are things that
happen to a *row*, and block materials for them would be declarations nothing
renders.

The **position edge** is 10.5's colour coding: a 3px `border-left` in the
position's own hue, drawn on `filled` blocks only. It is an edge rather than a
wash because a wash puts every figure in the block on a tinted field and re-opens
the pairing `tokens.test.ts` measures for slots; an edge changes no contrast at
all. It is suppressed on `live` (the marker owns that boundary) and on `waiting`
(there is no player to have a position), and the G/F/C letter is printed anyway,
because colour never carries position alone.

Depth is otherwise still made of the same three materials it always was:

1. **Rule weight.** 1px dashed (waiting) → 1px solid heavy (filled) → 2px solid
   marker (live). Heavier reads nearer and more settled; dashed reads unfinished.
   A run of slots is closed at the bottom by a heavy 1px rule, the way a board
   has a bottom rail.
2. **A single tint.** `live-sunk` fills the live slot. It is the only fill in the
   state system besides the 10% position washes.
3. **Panel stock.** `stock-panel`, lighter than the ground rather than deeper,
   for the reason given under Colors: depth on a dark ground is lightness.

### Named Rules

**The Two Levels Rule.** Replaces the Panel Rule. A surface is the ground or it
is a panel, and there is nothing below a panel. A framed `Bank` groups a task; a
card block groups one *subject* (a player, a member's night). Rows and controls
inside either keep their own material and do not become further cards.

**The No-Atmosphere Rule.** Replaces the Flatness-Is-Not-Negotiable Rule, and
keeps most of it. Depth is exactly three things: a lighter fill, a rule, and one
radius step. **There is no shadow token**, and that is a decision rather than an
omission — a shadow works by darkening the surface beneath it, and on a ground
at L 0.18 there is nothing left to darken, so the version that reads as
elevation is a glow. What is still a regression rather than a variant: a
**gradient**, a **glow**, a coloured halo, a blurred backdrop, or a shadow used
to float something. The board is lit; it does not shine.

Both halves of this are now **enforced** by `src/app/depth-scale.test.ts`, which
reads every `.ts`/`.tsx` file under `src/` and fails on a radius that is not the
one token, on any shadow, gradient or blur class, and on a card-block material
spelled out anywhere but `board.tsx`. It reads source rather than measuring
values because Tailwind emits an unknown utility as *nothing at all*: a stray
`rounded-lg` renders a rounded button and a hand-rolled `card-block-2` renders
an unstyled `<li>`, and both look plausible in a screenshot.

## Shapes

**One radius step, and one place it is allowed.** `--radius-block` (0.375rem) is
the *only* radius in the system, and it belongs to level 1 of the depth scale: a
framed `Bank` and a card block. Buttons, inputs, patches, slot rows, the board
plan and the board's own cells stay right-angled, because a ruled slot with a
rounded corner is not a ruled slot. Phase 10 replaced "zero radius, everywhere"
with this; what it did not do is make radius a per-component choice.

**Borders are the whole form language.** Almost every border in the system is on
one side: `border-top` on a slot (that is the ruling), `border-bottom` on the
sheet's slot run and under an input, `border-bottom` on the top rail. The only
four-sided borders in the system are controls, position patches, a framed Bank
and a card block. A panel's 1px strong frame groups; it never glows and never
reaches a third level.

**The only filled shapes** are the position patch (a 10% wash of its own hue) and
the live slot (`live-sunk`). Hover and active states use 5–10% ink washes.

**Iconography is drawn, not imported.** `BackArrow` is a hand-authored inline
`<svg>`: one 1px stroke, `viewBox="0 0 12 8"`, `currentColor`,
`aria-hidden="true"`. There is no icon library in this project. New icons follow
the same recipe — a single stroke, no fill, no icon font, no package.

`SunIcon` and `MoonIcon` were the other two and were **deleted in Phase 10**
with the ground switch they belonged to. What they established is kept as the
recipe for any icon that carries a whole label's meaning rather than decorating
one: draw on 16 units and render at 18px, where the stroke lands a shade over
1px and the mark sits *with* the 500-weight caps beside it rather than under
them; and size a set against *each other* rather than to a shared box, because
matched geometrically two marks look like two different sizes on one rail.

Phase 10's own drawn graphic is the **sparkline**, and it follows the same rule:
inline `<svg>`, one stroke, `currentColor`, no fill, no package. It is
`aria-hidden` with a sentence beside it — see Marks are a picture.

## Components

The vocabulary lives in `src/components/board.tsx` (server-safe, no client
boundary) and `src/components/submit-button.tsx` (the only client component in
the design system). Build new surfaces out of these; add to this file when you
add to that one.

### On the clock — the room's sticky band

The draft room's on-the-clock block is `sticky top-0 z-20`. It is the one band in
the app that never leaves, because the pool sits below it and the countdown and
the search box otherwise could not both be on a 390px screen — so "under a
minute to find a player and commit" was not an instruction anybody could follow
while watching the minute. The precedent is the board's own `sticky left-0`
round gutter; it needs no shadow, blur or panel treatment.

**Do not add `bg-stock` to it unconditionally.** `slot-live` brings its own
opaque blush, and a plain `bg-stock` alongside it paints straight over that —
both set `background-color`, and the plain utility wins. Only the finished state
(`slot-filled`, a border and nothing else) needs a field, or the board scrolls
through it. Shipped broken once, and `tests/e2e/draft.spec.ts` now asserts the
computed background and the 2px marker rule.

The viewer's `You still need` patches share the band's lower line with the
server-offset clock. They are not a detached status row between the clock and
the pool. The pool, radar and board below are three sibling framed Banks; none
contains another, and the sticky band itself remains unframed.

### Top rail — `TopRail`

The board's top rail. Character: a label on the frame, not a navigation bar.

- **Structure:** wordmark + season on the left, the ground switch and one
  optional `action` slot on the right, baseline-aligned. Bottom border 1px rail
  blue at 40% opacity.
- **Padding:** `1.25rem / 1rem` on a phone, `2rem / 1rem` from `sm`.
- **The action slot** is a slot label — "Sign out · Name", or a `BackArrow` plus
  "Leagues". Never a filled button.
- **The rail has one line of controls, and everything that is a control sits in
  it.** The switch is `self-end` against the action group at `gap-1`, not on the
  rail's baseline. The case that decides this is an action of two lines — the
  account stack on `/`, a name over its own nav: an icon centred against that
  stack sits *between* its two lines, level with nothing, and reads as a stray
  mark. Bottom-aligned it lands in the nav's own 44px band as one more control
  in a row of them, and on the single-line surfaces (a `BackLink`, the same 44px
  box) it is the same result.
- **States:** rail links transition colour to full ink on hover and take a 2px
  marker outline at `focus-visible` with 2px offset.

### Sheet — `Sheet`

The page's own column. Centred, `flex-1`, column flow, at one of the two named
measures — `column` (`max-w-3xl`) by default, `wide` for the draft room and
the season dashboard, and
`TopRail` takes the same prop so the rail and the sheet below it always agree.
Takes an optional `testId` which lands as `data-testid` — the E2E suite
identifies surfaces this way (`login`, `app-shell`, `lobby`, `draft-room`).

### Section — `Bank`

Every bank is `aria-labelledby` its own `h2`. A section whose heading is a
sibling it is not associated with is an unnamed region: a screen reader lands in
it and is told nothing. One `id` fixes it for every section on every surface.

A section of the board. Heading is a slot label; an optional `aside` (also a slot
label) sits baseline-aligned at the right of the same line and carries the
count — "3 of 12", "9 of 12 free", "2 on the board", "none yet". Heading and
content are `0.75rem` apart. The default Bank stays open on stock. A framed Bank
uses `bank-framed`: deep stock, a 1px strong frame and `1rem` interior padding.
It never nests inside another framed Bank.

### Slot run — `Slots` + `Slot`

The signature component. A `Slots` is a `<ul>` closed at the bottom by a 1px
heavy rule; each `Slot` is an `<li>` whose **top border is its state**.

- **`waiting`** — 1px dashed waiting-grey, `0.5rem` vertical padding. An empty
  place. Rendered with a faint-ink "Slot 07" number.
- **`filled`** — 1px solid heavy-grey, `0.75rem` vertical padding. The default.
- **`live`** — 2px solid marker + `live-sunk` fill. On the clock.
- **`correction`** — 2px solid ink (`slot-correction`). An error, struck in ink
  rather than in marker. The utility shipped in 1.4 and `Slot` could not express
  it until 3.3's critique needed a refused pool row to say so *on the row that
  was tapped*.
- **`standing`** — 2px **dashed** marker, no fill. Where a paused draft stands.
  Board only (`slot-standing`). It exists because 3.1 first struck a paused slot
  exactly like a live one, which is one material carrying two opposite
  instructions — act, and wait — and the banner that disambiguates them is
  several screens up on a phone. Dashed is already this system's word for
  unsettled, so "paused" is the marker at the same weight, unsettled.
- **`transit`** — 2px **dashed** ink (`slot-transit`). A row picked up and on
  its way somewhere: 3.4b's cheat-sheet reorder. Dashed for the same reason
  `standing` is dashed — it is this system's word for *unsettled* — and ink
  rather than marker because the marker means one thing only, and a sheet is
  edited while a draft runs on the same phone. It is a **state**, never a class
  composed onto another slot rule: the first version drew a held row as
  `slot-filled slot-transit` and needed one `border-top` shorthand to beat
  another at equal specificity. Tailwind v4 emits `@utility` blocks
  *alphabetically* rather than in source order, and the dev server splits them
  across chunks, so the browser composited **1px dashed** — the width from one
  rule and the style from the other, a material that exists in neither. Two
  rules for one border is the bug; one state is the fix.
- **Content layout:** `flex-wrap`, baseline-aligned, primary content left and
  metadata right, `1rem` / `0.25rem` gaps. Typically a `CardName` on the left and
  a slot label on the right.
- **State is also in the DOM:** `data-state` always, `data-landed="true"` when
  the landing motion plays. Tests and future realtime code read these.
- **A whole-row link** stretches into the row's padding with negative margins
  (`-mx-3 -my-3` plus matching padding) so the entire slot is the hit area;
  hover is a 5% ink wash, active 10%.

**A keyboard cursor is a rule, not a wash.** `Slot`'s `current` draws a 2px
**ink** outline inside the row (ink, because marker is the clock's) and sets
`aria-current`. It was a 5% ink wash alone, which measures **1.10:1** — the one
place in this system where a state was carried by a fill and no rule at all. The
wash stays as an echo. `nowrap` belongs to the same story: a thirty-row list
must not move its trailing action between rows depending on how long the name
above it is.

**The Material-Carries-State Rule.** A slot's state is its own top border. Never
add a coloured pill, chip or badge beside an otherwise normal row to say
"waiting" or "on the clock". This system has no chip component and does not want
one. In a setup lobby, an unready member is `waiting` and a ready member is
`filled`; the word remains in the row so the rule is never the only carrier.

**The Board-Shows-Its-Shape Rule.** A list of things that occupy slots renders
its empty slots too. A lobby that is a quarter full looks a quarter full; the
signed-in home continues past your leagues into free slots. A list that just
stops is not a board.

### Card block run — `CardBlocks` + `CardBlock`

Phase 10's material, and the counterpart of a slot run rather than a variant of
one. A `CardBlocks` is a `<ul>` laid out as a **grid with a gap**; a `CardBlock`
is one subject in it. `Slots` and `CardBlocks` are deliberately separate
components and neither composes out of the other: a slot run is a *ledger*, and
a ledger's meaning is in the alignment between its rows, which a gap destroys —
composing one from the other produced a bottom rail underneath a gap, which is
what a wrong model looks like when it renders.

- **Use a block for a subject; use a slot for an entry.** A player on a roster,
  a member's night in a recap, a destination you can choose, **a league on the
  dashboard** — those are subjects. A pick in an order, a member in a standing,
  a row in a cheat sheet — those are entries in a ledger, and they stay ruled.
  The dashboard is 10.9's port and the clearest case of the distinction: a
  league is a whole board with its own season, status and roster fill, nothing
  about the list is ordered, and nothing in it is compared down a column — so
  the ruled run it used to be was claiming a ledger's meaning it did not have.
  The three empty "Slot 04" placeholders went with it: they drew a board's
  shape for something that is not a board, and the create and join forms below
  are how another league actually starts.
- **`columns` is off by default.** Two across from `sm` up is available, and the
  phone is the primary device: thirteen players two-up on a 390px screen gives
  each block about 170px, which cannot hold a name like Valančiūnas beside a
  patch and a control.
- **State and position** are carried by the block's own material — see Elevation
  & Depth. `data-state` and `data-position` are always in the DOM.
- **`role="list"` is stated**, for the reason `Slots` states it: Safari and
  VoiceOver drop list semantics from a `<ul>` that is `list-style: none` and a
  flex or grid container, and draft night is iPhones.

**The Captain-Is-A-Mark Rule.** An exclusive choice across a run of blocks is a
**radio group**, not a row of toggles wired to clear one another. The lineup's
captain is the case: one armband across thirteen players, so the browser clears
the previous choice, arrow keys move between them, and a screen reader says
"3 of 13" — all of which a set of thirteen checkboxes would have to
reimplement, minus the keyboard handling. The mark is separate from the
**place**, which stays a four-option select: the captaincy is not a sixth role
on the team sheet, it is a mark on one of the five starters, and `validateLineup`
refuses a captain who is not among them. Choosing the mark therefore also sets
the place, and moving the place off `starter` clears the mark — a control that
can express something the validator must then refuse is a control that exists to
produce an error message.

**The Fixture-Or-Nothing Rule.** A block renders a fixture line only when there
is fixture data, and renders *nothing* when there is not. No "TBD", no em dash,
no skeleton. A placeholder claims the app looked at the schedule and found no
opponent. Since 10.7 it does look — `fixtures` holds every unplayed game — but
the rule is unchanged and matters more, not less: a league whose season has not
been ingested yet, or a club with no game left in the phase, has to render
nothing rather than a hopeful dash. `FixtureNote` owns this and has a test for
the empty case precisely because an affordance waiting for data is one refactor
from being deleted as dead and one careless edit from growing a placeholder.

### Door — `Door`

A whole-row route out of the current board, implemented as a `Slot` so its
material, focus ring and 44px target cannot drift between lobby destinations.
It takes a title, one sentence, a trailing verb and an explicit destination.
Several related doors form one `Slots` run inside one framed Bank; a standalone
door, such as the cheat sheet, still belongs to a `Slots` run and does not gain
a floating container. A live draft door remains a `filled` slot and may put its
one trailing verb in marker; `slot-live` belongs to the on-clock slot only.

Since 10.4 a door may also be drawn as a **card block** (`block`), which is what
the league page's run of destinations uses: a destination is a subject, so a
grid of them says "pick one" where a ruled run says "read down". Both renderings
share one body deliberately — a door that looked different depending on which
page built it is how the lobby and the season pages drifted apart before this
component existed.

### Chat panel — `LeagueChat`

Chat is one framed Bank, never a bubble stack. Its transcript is a ruled slot
run: system lines are waiting/dashed and rail blue with no team name; member
lines are filled and remain left-aligned, with ownership carried by the printed
team or account name. The composer closes the Bank behind one strong top rule.
The lobby opens it as a task; the denser draft room folds it to the latest line.
When open, Hide belongs in the Bank heading rather than occupying a transcript
row.

### Season control — `SeasonControl`

Every season surface starts with the same framed GET control: one Euroleague
season select and one ink action. The code appears once, as the selected value;
the Bank heading does not repeat it against the fixed competition year in the
rail. It
offers the configured season, the preceding season used for backfills, and any
valid historical code already in the URL. Standings and recap carry that code
into team links; the recap's round control carries it forward too. Changing
season resets page-local choices such as round and phase rather than combining
an old choice with a new season. It is one component on standings, recap, team
and transaction pages, not four copies of query-string parsing.

### Card name — `CardName`

The name written on a card: 600 caps at 0.06em, 1rem at every size. Use it
for the thing that occupies a slot, never for a label about the thing.

`scale="slot"` is the one step down — same caps, same 0.06em, at body-small's
0.875rem — for the board's 8rem columns. It exists because a full-size card name
cannot write "Valančiūnas" inside a board column, and because the alternative
was a bespoke `text-xs tracking-[0.04em]` class that quietly added a fifth type
size to a five-size system and set it at *display* tracking. A player in a slot
on the board is still a name on a card; it is only smaller.

### Position patch — `PositionPatch`

A twill patch. 1px border at 55% of its hue, 10% wash behind, slot-size type at
600 with 0.1em tracking, `0.25rem / 0.5rem` padding, baseline-aligned inline
flex. Renders an optional count and **always** the letter.

On a roster summary, the count may be current/template (`1/3 C`) and the patch
takes a full spoken label (`1 of 3 centers`). The compressed visual figure is
then hidden from assistive tech so it is not announced twice.

### Field + input — `Field`, `inputStyles`

A form on card stock. Character: a ruled line to write on, not a box to type in.

- **`Field`** stacks a field label over its control with a `0.375rem` gap, as a
  `<label>` wrapping both.
- **`inputStyles`** is a shared string, not a component: `min-h-11` (2.75rem —
  44px, one-handed on a phone), full width, transparent background, **bottom
  border only** at 30% ink, `0.25rem / 0.5rem` padding, 1rem text, faint-ink
  placeholder.
- **Focus:** the bottom border becomes marker red and the default outline is
  removed. This is the one place in the system that replaces the focus ring
  rather than adding one — see the open question below.
- **Per-field overrides are allowed for input semantics:** the invite code input
  adds `text-lg uppercase tracking-[0.32em]` so a typed code looks like the code
  on the board.
- **There is no error or disabled input style.** Field-level failure is reported
  by a `Correction` at the top of the surface.

### Action — `SubmitButton`

`liveOnField` is the one act sitting *inside* a live row — the pool's armed
pick. Its label stays ink under the Ink-on-Blush Rule; marker text now clears
the floor, but that does not give the marker a third semantic job. The border
goes to full-strength marker at 2px (4.59:1 on the blush) and the label goes to
ink (12.62:1). The act is still struck in marker; it is the rule that says so,
which is how this system says everything else.

`compact` drops the full-width phone treatment for a button that belongs to a
*row* rather than to a surface: a list of thirty rows each with a full-width
button is a column of buttons with names above them, not a pool of players.


The board's action, with the pending state a server action needs. A client
component for exactly one reason: `useFormStatus`.

- **Shape:** 1px border on all four sides, no radius, `min-h-11` (2.75rem),
  `1rem / 0.75rem` padding, action-label type. Full width on a phone, auto width
  from `sm`.
- **`tone="ink"` (secondary):** 35% ink border → 80% on hover; 5% ink wash on
  active. This is the default.
- **`tone="live"` (primary):** 60% marker border and marker text → full marker on
  hover; 8% marker wash on active. **One per surface.**
- **Focus:** 2px marker outline at 2px offset, `focus-visible` only.
- **Pending:** `disabled`, `aria-busy`, `data-pending="true"`,
  `cursor-progress`, 60% opacity, and the label is replaced by a `pendingLabel`
  in the board's own voice — "Opening the board…", "Taking a slot…",
  "Redirecting to Google…". Default is "Working…".
- **Why pending matters here specifically:** React 19 clears uncontrolled inputs
  across a server-action transition, so a slow submit without feedback looks like
  the form silently emptied itself.

**The Pending-Label Rule.** Every `SubmitButton` gets a `pendingLabel` written in
the domain's words. "Loading" is not one of the domain's words.

### Ground switch — removed in Phase 10

There was one, for eight days: a sun/moon `aria-pressed` mark in the rail,
switching between the day and night boards (9.5, 9.5a, ADR-0005). Phase 10
retired it along with the second ground — there is one ground now, so there is
nothing to switch. `src/lib/theme.ts`, the `<head>` override script, the
`prefers-color-scheme` mapping and `theme.spec.ts` went with it.

Recorded rather than deleted because the cost is real and somebody will
eventually ask for it back: **the app no longer honours
`prefers-color-scheme`**, so a reader who has asked their phone for a light
interface does not get one. That is the strongest argument for reversing
[ADR-0006](docs/adr/ADR-0006-midnight-board.md), and it is written down there
too. The two icons (`SunIcon`, `MoonIcon`) were deleted with the control; the
drawn-icon recipe under Shapes survives them.

### Filter toggle — `FilterToggle`

A filter, in the board's own material. `aria-pressed` button, slot-label type,
44px target. **Off** is the dashed waiting rule under it; **on** is a 2px solid
**ink** rule. That is the Material-Carries-State rule applied to a control: this
system has no chip and no coloured dot, so a filter's state is the weight of its
own underline. Ink and not marker, because a filter is not the one act on a
surface and must not compete with the act that is.

The label sits **on** its own rule (`flex items-end pb-1.5`), not centred in the
44px box — centred, the dashed rule that carries the state sat 18px below the
word it belonged to and read as a stray tick. And the target is `min-h-11`
**and `min-w-11`**: the Do's rule was written as `min-h-11`, i.e. height only,
and a single-letter toggle fell straight through it at 24–27px wide.

Filters group by kind, on their own rows with their own slot label — *which*
(Position: G F C) above *whether* (Show: hide drafted, fit to play, legal for
me). As one wrapping run, "Hide drafted" landed on the same line as G F C and
read as a fourth position.

### Select — `selectStyles`

The same ruled line as `inputStyles`, so the same focus idiom. `appearance-none`,
because a native select's own chrome is the one place a rounded corner and a
gradient would arrive in this app without anybody choosing them.

### Correction — `Correction`

A correction on the board. 2px solid **ink** top border, `0.75rem` padding, a
"CORRECTION" slot label over the message in small body text, `role="alert"`. It
is the system's only error surface: form failures, auth failures and league
failures all render here, in finished sentences the server wrote.

### Board plan — `BoardPlan`

The board itself, drawn at plan scale: `rounds` (13) rows down, `slots` columns
across, round numbers in faint ink down the left edge. Interior cells are 1px
dashed waiting-grey; the frame and the left edge are heavy; the last row's bottom
edge is heavy and solid. Cell height `1.25rem` → `1.5rem` at `sm`.

It exists because the thesis is "the app is the draft board", and a surface that
shows none of it is a claim without a demonstration. **It carries no data** — it
is an authored depiction of an empty board, which is why it is
`aria-hidden="true"` rather than described. It is ungated on the login page,
which has no slot run to restate, and desktop-only on the lobby, where it added a
third to the mobile scroll to repeat the run immediately above it.

### Draft board — `DraftBoard`

The real board, and `BoardPlan`'s data-carrying sibling: rounds down, one column
per member across, every slot drawn whether it is filled or not. Lives in
`src/components/draft-board.tsx`; its scrollport is
`src/components/board-scroll.tsx`, the design system's second client component.

- **Columns are members, not slots.** A column is one member's roster, readable
  top to bottom. Laying it out by pick sequence instead would make every column
  of a snake draft a zigzag of two people's players. The pick *numbers* zigzag,
  exactly as they do on a real board.
- **The shape comes from the engine** (`buildBoardShape`), which derives it from
  `buildPickOrder` rather than beside it — so the board cannot disagree with the
  order the clock is driven by.
- **Slot state is the slot's own top rule**, the same weights as `Slot`, all four
  of them: dashed `rule` for a slot nobody has filled, solid for a pick, 2px
  solid marker plus `live-sunk` for the slot on the clock, 2px dashed marker for
  where a paused draft stands. A filled slot also takes a 10% wash of its
  position's hue — the patch colours, used as a field rather than a border — and
  **always** carries the G / F / C letter.
- **Every word in a slot is ink or soft ink.** Not the position's own hue, and
  never the marker. See the Wash-Costs-A-Tenth Rule below: the wash carries the
  hue, the letter carries the position, and the text carries the contrast.
- **Structure:** `2rem` round gutter, then `minmax(8rem, 1fr)` per member. That
  `minmax` is the whole layout: with room to spare the columns share it, and past
  about five members they hold their width and the region scrolls. 8rem is not
  arbitrary — at 6rem a slot had ~69px for a name once the position letter had
  taken its share of the same line, about eight characters, so the board could
  not write "Valančiūnas" or "Papanikolaou" and the only recovery was a `title`
  tooltip, which does not exist on a phone. The letter therefore sits on the
  number line, right-aligned, and the name gets the column. Round numbers are
  `sticky left-0` on the framed Bank's deep stock, so the row you are reading
  stays labelled while the columns move. Slot height is `min-h-slot` — the
  board's own spacing unit.
- **Column separators are `rule-strong`, and the board's outer edge is 2px of
  it.** `rule` over a position wash measures 2.90:1, under this system's own 3:1
  floor for a boundary that means something — and which column a pick is in is
  meaning. The 2px outer edge does a second job: a closed board reads closed,
  and an interior-weight line at the viewport edge means "more board this way",
  which is scroll extent expressed in rule weight rather than in the shadow or
  gradient this system forbids.
- **Semantics:** grid layout, table roles — `role="table"`, `role="row"`,
  `role="columnheader"` for members, `role="rowheader"` for the round. A real
  `<table>` would give this for free but not the widths: a fixed-layout table
  divides the container, and this board has to overflow it in order to scroll.
  Unlike `BoardPlan` it is **not** `aria-hidden`: it carries data.
- **State in the DOM:** `data-board-slot` on every slot, plus `data-state`
  (`waiting` / `filled` / `live` / `standing`), `data-live="true"` on the marked
  slot whichever of the two things it means, `data-reversed="true"` in a round
  drafted right to left, and `data-advanced="true"` for the duration of the
  second motion event — removed on `animationend`, so the pseudo-element hands
  the rule back to the real border rather than standing in for it all night.
- **The scrollport is focusable, named and a region.** `tabIndex={0}`,
  `role="region"`, `aria-label`, and the system's own `focus-visible` ring. A
  scrolling region with no focusable descendant cannot be reached by keyboard,
  and past about five members that is most of the board. Chromium 127+ makes such
  a region focusable by itself and Firefox and Safari do not, so the first
  version passed WCAG 2.1.1 in one engine by accident, wearing a 1px black
  user-agent ring nobody chose.
- **The marked slot says so in words.** An `sr-only` "on the clock" (or "the
  draft stands here"), because border weight, a fill and a colour are three
  things a screen reader cannot see — the live slot used to announce itself as
  the bare word "13".
- **A paused board keeps its marker**, on the slot the draft stands at. Strictly
  nobody is on the clock while paused — but the room's on-the-clock banner is
  struck in marker throughout a pause, and a board that alone showed nothing was
  the odd one out. A **complete** board has no marked slot: there is no next one.

**Frame rules go on the cells, never on the row.** A row is a grid whose tracks
overflow its own border box — that is what makes the board scroll — so a
row-level border is only as wide as the scrollport and stops halfway across a
twelve-member board once you scroll right. The header's heavy underline and the
last round's bottom rule are both per cell for this reason. The gutter cells are
additionally `sticky left-0` on the framed Bank's deep stock, header included,
or a member's name scrolls underneath and its tail shows through; the header's
gutter cell needs `self-stretch` on top of that, because its only child is
`sr-only` and therefore absolutely positioned, and a background painted on a
zero-height box hides
nothing.

**The Wash-Costs-A-Tenth Rule.** A 10% wash over the ground costs roughly a
tenth of every contrast ratio measured on top of it, and a wash over
`stock-panel` costs more. So text on a washed field is `ink` or `ink-soft`, and
a rule on one is `rule-strong`. `tokens.test.ts` asserts those pairs over both
stock materials — and the panel version of that pairing is one of the two
constraints that fixed `ink-soft`'s lightness, so it is load-bearing rather
than belt-and-braces.
3.1 shipped the opposite of all three, and the test was green throughout,
because it could not yet express an alpha background.

**The Composite-In-Gamma Rule.** A browser blends translucent colour in the
gamma-encoded space its pixels live in, not in linear light. 3.1's `wash()`
helper blended in linear light — more physically correct, not what the screen
does, and wrong in the worst available direction: it reads about **0.2 too high**
on dark text over a light wash, so it lets a real failure pass. It scored the
position letter on its own wash at 4.50 and asserted ≥4.5 while the browser
rendered 4.30. Encode, blend, decode. Every alpha pairing in `tokens.test.ts`
moved by 0.2 when this was fixed, and two of them turned out to be failing.

**The gutter header must stay in flow.** It is a `role="columnheader"` wrapping
an `sr-only` span, not an `sr-only` span itself. `sr-only` is absolutely
positioned, so hiding the whole element takes it out of the grid and slides every
member's name one column left — a board that names the wrong person above every
column, which a screenshot only reveals if you already know the draft order.

### Roster radar — `RosterRadar`

One row per member, one mark per roster slot, in three **labelled** runs — and
each run prints **what that member still needs**. Same material as the board:
dashed `rule` waiting, solid `rule-strong` over a position wash filled, at the
one scale where the whole league is visible at once. Rows are in draft order, so
the radar reads *down* the same order the board reads *across*, and both zip
against one `columns` array.

- **The figure is the answer; the marks are the shape.** The first version
  printed `filled/total` and put the needs in an `sr-only` sentence — so the
  surface whose subject is *who still needs a center* showed how **full** a
  roster was, a number the board's own heading already gives, and hid what it
  was missing. Counting could not recover it either: measured in a browser,
  thirteen waiting marks render as three continuous dashed rules, because
  Chromium's dash gap for a 1px dashed border is 2px and the gap between slots
  was also 2px. Filled marks were countable; the empty ones — the ones you would
  want to count — were not.
- **The run heads are right-aligned**, so each letter sits directly above its
  own figure and "how many centers does D Ballers need" is a one-step lookup
  down a labelled column. A blank figure means no room left, so the block's ink
  *decreases* as the evening goes on.
- **The figure is fixed-width, and there is no trailing total.** The old `11/13`
  had no fixed width, so a two-digit count pulled every mark in that row 7.5px
  left and the runs zig-zagged down the page from about round ten. Measured
  before and after; every head and figure now shares a right edge at 320, 390
  and 1280px.
- **It fits a phone because a mark is not a name.** The board needs 8rem a column
  to write "Valančiūnas" and therefore scrolls; a radar slot says only *filled*
  or *waiting*, so thirteen of them plus a member's name sit inside 350px, at
  every width, with no horizontal overflow. The name column widens at `sm`
  rather than staying 88px while the marks get 570px.
- **Your own row** is `text-ink` and `· you`, and nothing else — which is what
  `DraftBoard` actually does for your column. This entry used to claim the
  heavier top rule was "the same treatment the board gives your column"; the
  board does no such thing, and the rule bought 1.39:1 on a hairline.
- **Row dividers are `slot-filled`**, a solid `rule-strong`, so a divider is a
  full contrast step away from the dashed `rule` data below it. Solid 1px `rule`
  — what this used to use — is the *same colour* as an empty mark's own rule,
  differing only in dash phase, so the eye read two parallel lines per row
  rather than thirteen slots. It is also a material `globals.css` does not have.
- **The list closes** with `border-b border-rule-strong`, like every other run in
  the app. It used to just stop.
- **Each row links to its board column.** The whole row is a 44px target; its
  hash target is the matching focusable column header, so the compact roster
  index can move a phone's horizontally scrolling board to the same member.
- **A surplus is drawn, not dropped**, at a fixed width so it cannot shrink the
  thirteen real marks beside it. A pick that does not fit the template is struck
  in `slot-correction` — 2px ink, the system's word for an error. There should
  never be one; a radar that quietly discarded it would hide the only state that
  would mean the referee had failed.

**Position here is carried by a run head, not by a per-mark letter.** The locked
decision — that a *mark* does not print G / F / C — stands, and is right at 156
marks. It should never have been extended to the *table*: this was the only grid
in the app whose axis was unnamed, and the colour that was meant to be the
fallback is not one. Measured under a severity-1.0 deuteranopia simulation, the
guard wash and the center wash are **pixel-identical** (ΔE76 = 0.00; protanopia
0.36), so "colour is the third signal" was really "place is the only signal" —
unlabelled. `DraftBoard` names its columns; the pool's filters name G, F and C
on their own rules. A table naming its axis once is not a per-cell letter.

**The position wash is decoration, and this document should say so.** At
`bg-pos-*/10` it measures **1.14:1** against stock — 62% short of the 3:1
boundary floor, and identical for all three hues. What separates filled from
waiting is *form*: a solid `rule-strong` rule over a filled box (4.37:1) against
a dashed `rule` hairline (3.36:1 on stock), which survives grayscale and every CVD
simulation. The wash reinforces; it never carried.

### Marks are a picture; the sentence is the content

Thirteen 14px marks are a visualization, and to a screen reader they are
thirteen announcements of nothing. So the radar's grid is `aria-hidden` and each
row carries an `sr-only` sentence instead — "B Ballers, 3 of 13 filled, needs 3
guards, 4 forwards and 3 centres" — which is the same fact said properly rather
than the same fact said 156 times.

`DraftBoard` does the opposite, and correctly: its cells carry player names, so
they are content, and they are announced. The rule is about what the element
*holds*, not about how it is drawn: a cell with a name in it is text; a cell
whose whole meaning is "this one is filled" is a picture of a number, and the
number should be said once.

### Standings table — the board's grid, scored

Slice 10.9, and it is the draft board's layout applied to the season: members
down, rounds across, in the **same scrollport component** the board uses — which
is why `BoardScroll` now takes a `label`.

- **The run of tokens it replaced could not answer the table's own question.**
  Until 10.9 a member's season was a wrapped paragraph — `R12 14.0 R13 9.5 …` —
  and a standings table exists to compare *members in a round* ("who won
  Thursday"). Read down a column that is a one-step lookup; read along 38
  wrapped tokens per row it is not a lookup at all.
- **Identity and the headline number are sticky; the evidence scrolls.** The
  rank, the team name and the total sit in a `sticky left-0` block on panel
  stock, and the rounds move under it — because the answer should not scroll
  away from the question. The same reasoning put the board's round gutter on the
  left.
- **The name truncates, with the whole of it in `title`.** A grid row is one
  line tall, and a wrapped "Gintaras Ballers FC" makes every other row taller
  for it. 10.5rem holds about sixteen characters, which is most team names in
  this league.
- **Semantics are table roles on a grid**, exactly as `DraftBoard`: `role=
  "table"`, `columnheader` per round, `rowheader` on the sticky block. A real
  `<table>` divides its container; this one has to overflow in order to scroll.
- **The row ends with its own sparkline**, drawn from the values the row already
  prints rather than from a second query — a chart reading from its own source
  is how two numbers on one row come to disagree.

### Cheat sheet — a run per tier, and a pinned shortlist

Slice 3.4. Two surfaces, and both are made of `Slots` runs with no new material
at all.

- **A tier is a gap, not a band.** CONTEXT.md defines a tier as *a break in a
  cheat sheet*, so the sheet is drawn as one `Slots` run per tier with the
  ordinary gap between them and a faint caption above each. No coloured band,
  no chip, no rule weight of its own — a break between two runs is already how
  this board says a run has ended, and inventing a fourth slot state for
  "tier 2 starts here" would be a state that carries no state.
- **The caption is suppressed when there is one tier**, because a sheet with no
  breaks in it should not grow a heading that says "Tier 1" over the whole of
  it.
- **A place on a sheet is a number in ink**, `#4`, in the same tabular
  `slot-label` the ticker uses for a pick number. Never a colour and never a
  badge: a tier is a place in a list, and the place is the thing to print.
- **"Best on your sheet" is pinned, not sticky.** The room already has one
  sticky band — the clock — and a second one costs a 390px phone the rows it
  exists to show. What *pinned* has to mean here is that it survives typing and
  filtering, and it does: it is the server's answer to a different question and
  nothing on the surface narrows it. Its buttons are ink, because the pool's
  armed row is still the one marker action on that surface.
- **The pool rests at eight rows**, not thirty, and opens to forty. Thirty
  alphabetical rows of 323 was a wall between the pick path and the board; eight
  in the viewer's own ranked order is a shortlist. The control is a
  `FilterToggle` — no new affordance — but it sits **beside the count**, not in
  the "Show" row: the four toggles there change *which players are in the set*
  and this one changes how many are drawn, and as a fifth chip it both read as a
  data filter and wrapped that row to three lines on a phone.
- **A rank is `#N`, right-aligned, in a fixed-width leading column.** One
  format, one position, one alignment, on both surfaces. It shipped as `01` on
  the sheet, a leading `#1` in the pinned block and a *trailing* `#1` on a pool
  row — and trailing the position patch it landed at eight different
  x-positions, so a ranked list could not be read down. The column is drawn
  empty for an unranked row so the rows still align.
- **The pinned shortlist is drawn only when the pool is narrowed.** At rest the
  pool is already in the sheet's order, so the block was the same three players
  in a second set of rows with a second set of buttons — six of eleven Pick
  buttons on a phone for three players. The *caption and the link back to the
  sheet* stay unconditional, because losing the door to your sheet exactly when
  your sheet runs out is the other half of that mistake.
- **A patch brings its own opaque field.** `bg-pos-*` at 10% alpha let the row
  behind it decide the letter's contrast — 4.10–4.18:1 on the live blush of an
  armed row, under the floor, on the element that *is* the colour-blind fallback
  for position. `color-mix(…, stock)` composites once. `tokens.test.ts` reads
  the map in `board.tsx` and fails if the alpha returns.

### Back arrow — `BackArrow`

See Shapes. One stroke, inline, `aria-hidden`, `h-2 w-3`.

## Do's and Don'ts

### Do:

- **Do** carry state in the row's own material. A new state means a new rule
  weight or style, defined as a `@utility` in `globals.css` next to
  `slot-waiting` / `slot-filled` / `slot-live` / `slot-correction`.
- **Do** put every colour in `globals.css` in OKLCH and add it to
  `src/app/tokens.test.ts`. Text and patch colours clear **4.5:1** on stock;
  meaningful non-text boundaries clear **3:1**. The test parses the stylesheet, so
  it cannot drift from the values it guards.
- **Do** give any new interactive element a 44px minimum target on **both** axes
  (`min-h-11 min-w-11`) and a `focus-visible` 2px marker outline at 2px offset.
  This rule used to say `min-h-11`, and 3.3's single-letter position toggles
  went out 44px tall and 24px wide because of it.
- **Do** render empty slots. Show the shape of the board, not the length of the
  list. `DraftBoard` draws all 156 of them.
- **Do** use CONTEXT.md's words. A **slot** is a position on the **board**. An
  earlier draft of `board.tsx` invented "bay" and led a page headline with it —
  which is exactly the drift CONTEXT.md exists to prevent. The word survives in
  code comments and in the `--spacing-slot` rationale; it must not survive in
  user-facing copy.
- **Do** guard `prefers-reduced-motion` inside the animation utility itself, not
  at each call site, so a new caller cannot forget.
- **Do** write a `pendingLabel` for every submit, and a finished-sentence message
  for every failure.
- **Do** use arbitrary properties for per-side border *styles* — e.g.
  `[border-bottom-style:solid]`.

### Don't:

- **Don't** add a gradient, a glow, a blur or a surface colour beyond `stock` and
  `stock-panel`. Radius is one token at one level of the depth scale, and there
  is no level below a panel.
- **Don't** compose a utility name from a variable. Tailwind reads source text,
  so `` `slot-${state}` `` emits nothing, the rule does not exist, and the
  surface looks plausible with its whole state language missing. Write the map
  out — `SLOT_RULE` exists in two files for exactly this reason.
- **Don't** add a plain background utility next to a state utility that brings
  its own. `bg-stock` alongside `slot-live` paints straight over the live tint,
  because both set `background-color` and the plain one wins. Shipped that way
  once, on the room's sticky band.
- **Don't** put a second marker-red primary action on one surface, and don't use
  marker red for anything that is not state or the one act. The pool's **armed**
  row is the one act, and is struck accordingly: exactly one row at a time, and
  only while a pick is armed. It was 25 marker-red buttons at once until 3.3 —
  which is what taught the room that red meant "button" one screen above a
  board whose whole state language is red used sparingly.
- **Don't** strike an error in marker. Corrections are ink
  (`slot-correction`) — an error and an invite code must never look alike.
- **Don't** put marker-red text on the live tint. It now clears contrast, but ink
  is 12.62:1 and marker text would still violate the Two Jobs Rule.
- **Don't** use `slot-live` for anything that is not a slot on the clock. It is
  the 2px marker and it has exactly one meaning. 3.4a used it for a "Saved"
  confirmation on a page that is open *during* a live draft, on the same phone.
- **Don't** splice a sentence out of conditional JSX fragments. A string, a
  `null` and a bare `". "` compose into something that reads fine in the source
  and badly on screen — it shipped "and so does rank,tier,name" with no spaces.
  Write each alternative as a whole sentence and pick one.
- **Don't** let a surface instruct one format and emit another. The paste box
  documents `rank, tier, name`; `sheetToText` writes exactly that, and is tested
  as a round trip against the parser rather than against a literal.
- **Don't** let a sentence wear `slot-label`. Eleven-pixel caps at 0.14em is
  right for "L3" or "Which one?" and wrong for sixty-five characters of prose,
  which wraps into two shouting lines and is what the detector's `all-caps-body`
  rule exists to catch. Card names are the deliberate exception.
- **Don't** put a whole sentence in a `shrink-0` sibling inside a `flex-nowrap`
  row. A 65-character note took 502px in a 350px row: the page overflowed 161px
  at 390px, *clipped and unscrollable*, and the content it sat beside was
  crushed to zero width. Let the note wrap onto its own line.
- **Don't** encode position or status by colour alone. The G / F / C letter is
  always present.
- **Don't** hide the season from the top rail on small screens. If the rail must
  contract, drop the user's name.
- **Don't** introduce a *third* font family, an icon package or an icon font, and
  don't set prose in the mono face.
- **Don't** write `border-b-solid`. It is **not a Tailwind v4 utility** and
  compiles to nothing — the border silently stays dashed and the screenshot looks
  plausible. Use an arbitrary property.
- **Don't** ship a system-level comment as JSX (`{/* … */}`). A JSX comment is a
  JavaScript comment: it reaches a sourcemap and nothing else, so it is a contract
  nobody can audit. React has no comment node, so the direction contract in
  `layout.tsx` is emitted through `dangerouslySetInnerHTML` and guarded by
  `tests/e2e/design.spec.ts`. Both failure modes on this list are invisible in a
  screenshot; that is why they are written down.
- **Don't** animate anything new. See the motion rules below.

## Motion

Motion exists for **meaningful state changes only** — PRODUCT.md's brand
commitment, and the direction contract's promise: "a budget of THREE animations:
[a card landing in its slot], the live rule advancing across the board, and a
draft selection springing into place. The budget is spent; a fourth is a change
to DESIGN.md."

**The budget is now four, and this is that change**
([ADR-0007](docs/adr/ADR-0007-the-roll-ceremony.md), blueprint **D25**). The
fourth event is **a slot being drawn** in the roll ceremony, and it was raised
by argument rather than by a variant, which is what the rule asked for. The
argument in one sentence: the other three animations annotate a board somebody
is working on and must stay out of the way, whereas the ceremony *is* the
surface — it is the app's one theatrical page, and the thing being animated is
the only content on it. A fifth is still a change to this document.

**Implemented today: both.** The `card-lands` utility — 260ms,
`cubic-bezier(0.22, 1, 0.36, 1)`, `both`, from `opacity: 0` /
`translateY(-0.375rem)` to rest. It plays on the single row that genuinely just
arrived: the create and join actions redirect with `?arrived=1`, and the lobby
passes `landed={justArrived && member.isYou}` to that one `Slot`. Without a
signal like that the motion would either never play or play on every load, and
the second is decoration.

`@media (prefers-reduced-motion: reduce)` is handled **inside** the utility:
`animation: none`. The state change still lands; only the travel is dropped.

The second event landed with the draft board (3.1): **the live rule
advancing**. When a pick lands, the marker rule leaves the slot that was on the
clock and draws itself across the next one — 260ms on the same curve, painted by
a pseudo-element because a border cannot be scaled from one end. Under
`prefers-reduced-motion` the rule arrives without travelling.

`data-advanced` comes off again on `animationend`, handing the rule back to the
real border underneath — so the overlay exists only while it is travelling, which
is what makes the sentence above true. Under `prefers-reduced-motion` no
animation runs and none ends, so the attribute simply stays and the rule sits at
its resting width.

It travels **the way the round is being drafted**: `transform-origin: left`
normally, flipped to `right` on a slot carrying `data-reversed`. Every even round
of a snake draft runs right to left, so a rule that always grew from the left
would spend half the draft moving against the round it was advancing through.

It is keyed on `data-advanced`, set by `board-scroll.tsx`, rather than chosen on
the server like every other utility here. The reason is the same one that makes
`card-lands` wait for `?arrived=1`: the server knows which slot is live but not
whether *this viewer* was watching when it changed, and motion rendered from
server state would replay on every load and every refresh. A first paint is
still.

**The Four Events Rule.** Phase 10 raised the budget from two to three, and
spent the third: **a draft selection springs into place**. The roll ceremony
raised it to four and spent that one too — see "Event four" below. The rule's
shape is unchanged and is the point of it: the budget rises only in a numbered
decision, never in a diff. That is one event —
the pick you just committed — on the one surface where a committed act deserves
to be felt rather than merely seen. The budget is spent again: a fourth
animation is a change to this document, not a variant.

The third event is the second one **seen from the other end**, and that is why
it is not a fourth: one state change, the clock moving, and two things it does
to the board. The rule leaves the slot that was on the clock; that slot, now
holding a player it did not hold a moment ago, springs shut on it. `pick-springs`
— 320ms, scale `0.86 → 1.04 → 0.99 → 1`, keyed on `data-landed` and set by the
same effect in `board-scroll.tsx` for the same "was this viewer watching"
reason. The attribute comes off on `animationend`, like `data-advanced`.

Three guards decide when it does *not* play, and each is a rule rather than a
detail:

- **Only a slot that FILLED.** A rollback also moves the marker, backwards,
  onto a slot it empties — springing there would announce a pick that had just
  been taken away.
- **One slot, never a burst.** An autodraft sweep can move the marker three
  places at once; three cards landing together is a board flickering, not a
  pick arriving. The slot the marker left is the one that springs.
- **Never on a first paint**, which is the `data-advanced` argument unchanged.

The overshoot lives in the **keyframes**, not in a second easing vocabulary: the
timing function between the stops is `cubic-bezier(0.22, 1, 0.36, 1)`, the same
curve the other two events use. So this app still has one curve, and a spring is
a shape drawn with it. It is deliberately small — 4% — because a slot is ~92px
wide and its neighbours' rules are 1px, and the ruling *is* the state language
here; an overshoot big enough to eat it would be motion undoing the design it
sits in.

The guard did not move, and it is the part that matters:
`prefers-reduced-motion` is handled **inside** the animation rule, never at a
call site, so a new caller cannot forget it. Under it the pick is simply there —
name, wash and position letter on the first frame — and `draft-board.spec.ts`
asserts exactly that rather than trusting the media query.

### Event four — a slot is drawn

The roll ceremony (`/leagues/[id]/order`), and the only animation in this app
whose surface has nothing else on it. `slot-drawn` — **900ms**,
`cubic-bezier(0.22, 1, 0.36, 1)`, `both`, from `opacity: 0` /
`translateY(0.875rem)` to rest, so the slot **rises** into its place.

Two details are decisions rather than settings:

- **It rises, where `card-lands` drops.** The ceremony's board fills *upward*,
  because the draw walks from the last slot to the first, so the empty places
  are always the ones above and a slot arrives from below. Reusing `card-lands`
  would have made one utility mean two directions.
- **900ms, where every other event is 260–320ms.** The brief asked for a slot to
  appear *slowly*, and it is right to: a slot lands every three seconds with a
  name being read out over it. At 260ms that is a flinch. A slower event is a
  **longer duration on the one curve** — this system still has exactly one
  easing vocabulary.

The pacing around it — ten seconds of clock, then one slot every three seconds —
is **not** animation and is not counted against the budget: it is a clock, and
under `prefers-reduced-motion` it still runs. What reduced motion drops is the
rise, guarded inside the utility like the other three, so somebody who asked
their phone for no motion still watches the order being drawn and is simply not
moved through it.

It also brings **one new type step**, `--text-roll` (5rem, mono, `-0.03em`),
reached through the `roll-clock` utility: the countdown is the only figure in
this app read from across a room, and it is the invite code's argument rather
than a new one. Mono because this document already puts every clock there.

Nothing else animates. Both of the original two events stand unchanged below.
The board's auto-scroll is not one of them — following the clock is scrolling,
not animation, and it uses `behavior: "auto"` under reduced motion. Colour transitions on hover
(`transition-colors`) are not animation and are permitted on interactive
elements. **A transform driven directly by a pointer is not animation either**
— no keyframes, no transition, no duration: the element is where the finger is,
and it stops when the finger stops. 3.4b's cheat-sheet drag is the only use, and
it is deliberately austere because of this rule rather than in spite of it: the
row tracks the pointer, the drop is instant, and the row it will land on is
marked with the 2px ink outline `Slot` already has. **The list does not reflow
under the finger** — the gaps do not open, and the first draft of this paragraph
said they did, which was a promise the code never made. Corrected by 3.4b's own
critique, which measured the DOM order unchanged throughout a drag. Reflowing
live is a legitimate future choice and needs no new motion; claiming it here
while the code marks a target instead was the mistake. A settle on release, a
lift, or a gap that eases open would each be a third animation and a change to
this document.

**A row in transit carries its own material.** The rule that says "this is in
your hand" travels with the content, not with the place the content came from,
and the place it came from reads as `waiting` — an empty slot, which is what it
now is. This is written down because the first version had it the other way
round and the failure was invisible in code review: the `<li>` kept the dashed
rule while its contents translated 242px away, so the marker sat on a hole and
the row somebody was holding had no material at all. A spinner, a skeleton, a page transition, a parallax or an
entrance animation on a static element is out of scope for this world.

### There is no material for success — and that is the decision

This app never flashes green, never plays a checkmark and never lifts a toast
to say a pick worked. That is not an omission: **the state change itself is the
confirmation.** A landed pick is a row leaving the pool, a slot on the board
going `filled`, the live rule advancing to the next team and a sentence in the
transcript naming the player and the team that took them. Four surfaces move,
three of them permanent. A fifth, temporary mark that says "yes, that worked"
would be a second telling of something already told, and — under The Three
Events Rule above — a fourth animation.

Phase 10's spring does not reopen this. It marks the **state change**, on the
slot that changed: the pick is in a place it was not in, and the motion is that
place closing on it. A success mark is a fifth surface saying "yes, that
worked" after the four that already said it.

Raised as a finding by both 3.3's and 3.7's critiques, which is why it is
written down here rather than left to be re-discovered a third time. Toasts were
cut for the same reason (blueprint D14): a confirmation that disappears is the
one form of feedback a phone on a couch is most likely to miss, and the room is
full of feedback that does not. **A refusal is different and does have
material** — `Correction`, which stays until the thing it is about changes,
because a refusal has no state change of its own to be visible as.

## Open questions

Gaps in the built system that future work must decide. These are honestly
unresolved, not omissions from this document. Answered ones are struck through
rather than deleted, so the decision and the question it settled stay together.

1. ~~**The second motion event does not exist yet.**~~ **Answered in 3.1:** the
   live rule advancing, keyed on `data-advanced`. See Motion above. **Reopened
   and re-closed in 10.8:** D22 raised the budget to three and the third is
   built — `pick-springs`, the slot the rule just left. The budget is spent
   again.
2. ~~**There is no real draft board.**~~ **Answered in 3.1:** `DraftBoard`, above.
   `BoardPlan` **stays** where it is, unchanged — the login page and the lobby
   have no draft to draw, and an authored depiction of an empty board is still
   the honest thing to show there. The two are the same object at two scales and
   share their ruling, their round gutter and their heavy frame deliberately.
3. ~~**Two focus idioms.**~~ **Answered in 3.3:** the idiom follows **the
   element, not the role**. A `<button>` or `<a>` takes the 2px marker outline at
   `focus-visible`; an `<input>` or `<select>` turns its bottom rule marker red
   at `focus`. Both were already shipped and both pass — the only thing missing
   was saying which is which. A corollary settled the same slice: a filter is a
   **button** with `aria-pressed`, never a checkbox, so it also inherits the
   button idiom and carries its state in its own rule (`FilterToggle`).
4. ~~**No wide layout beyond 48rem, and only one breakpoint.**~~ **Answered in
   3.1:** a horizontally scrolling region, and one layout everywhere. No second
   container width and no new breakpoint — `max-w-3xl` stays the app's single
   column, and the board overflows it rather than the app widening around the
   board. The cost is accepted knowingly: a full twelve-member league scrolls
   sideways on a laptop as well as on a phone. Up to about six members the
   columns simply share the width they have. **Reopened and re-answered in
   10.9**, and the 3.1 answer survives everywhere except one surface. The
   scrollport was never the problem — it is still how twelve columns fit, on a
   phone and on a laptop alike. What 3.1 could not have known is how much the
   room would come to hold: by Phase 9 it is a pool, a board, a radar, a
   console and a chat stacked into one 48rem column, and on a 1440px laptop
   that is a third of the glass used and a page five screens tall on the one
   surface nobody scrolls away from. So `wide` opens to 80rem at `lg` and
   splits acting from watching; every other surface keeps `column`, the board
   still overflows rather than the app widening around it, and below `lg` the
   room is byte-for-byte the phone layout it always was. The cost, stated:
   there is now a second measure and a second breakpoint, and both are in a
   `MEASURE` map with one entry per measure rather than in a page.
5. ~~**No dark mode.**~~ ~~**Answered in 9.5**~~ — and then **overtaken in Phase
   10**, which is worth stating before the paragraph below is read, because the
   paragraph is now history rather than law. There is **one** ground and it is
   the midnight board; the day board, the night board and the switch between
   them are all gone. The reasoning below is preserved because two parts of it
   outlived the decision: the halation argument (which is why chalk stops at
   13.89:1 rather than the 18.8:1 the ground allows), and the method of solving
   every value against a floor instead of picking it. What did *not* survive is
   the conclusion, and the cost is that `prefers-color-scheme` is no longer
   honoured at all. See [ADR-0006](docs/adr/ADR-0006-midnight-board.md).
   The 9.5 record, as written:
   **Answered in 9.5**, and the price this question set
   was paid rather than skipped: the inversion argument was re-made, in
   [ADR-0005](docs/adr/ADR-0005-night-board.md) and D21. It survives and gains a
   clause — the ground inverts the physical object **for the light it is read
   in**, so by day the card is the ground and by night the board is. What the
   direction contract refuses is the near-black surface with one glowing accent,
   and that is untouched: one design system, two grounds, and every material
   below is the same on both. Three things make it a ground rather than a theme.
   The **system preference decides in CSS** (`prefers-color-scheme`), so a
   reader with JavaScript off lands where their phone asked and an OS switching
   at tip-off reaches an open page; a ~200-byte script in `<head>` applies an
   explicit override **before first paint**, because a theme applied from an
   effect is a white page flashed at somebody in a dark room. Choosing the
   ground the system already wants **clears** the override. And every night
   value is solved against the day board's own margins — soft ink at 5.79:1
   where day is 5.77, the marker at 5.10 against 5.06 — because a dark theme
   whose quiet inks read at 8:1 has no quiet, it has two shouts, and hierarchy
   here is carried in ink strength. The palette is declared as `--night-*` and
   `tokens.test.ts` loops over both grounds; a palette that overrode `--color-*`
   in place would have been invisible to that file, which reads declarations.
6. **Input error and disabled states are unstyled.** `Correction` carries every
   failure today. Per-field validation (which a player search or a trade form
   will want) has no visual language yet.
7. ~~**The patch and button opacity modifiers are unverified.**~~ **Answered,
   in three passes.** 3.3 taught `tokens.test.ts` to composite an alpha token
   over an opaque one, which found the position letter failing on its own wash
   (darkened to L 0.49/0.49/0.50). 3.2's critique corrected the compositing to
   gamma-encoded sRGB — see the Composite-In-Gamma Rule — and then measured the
   two remaining modifiers: `border-ink/35` on a button was **2.10:1** and
   `border-pos-*/55` on a patch **2.22–2.26:1**, both under the 3:1 boundary
   floor, and on a button the border *is* the control. Now `ink/50` (3.10:1) and
   `pos-*/80` (3.05–3.11:1 against the wash it encloses, which is the binding
   side). And the one that had been missed twice: an input's and a select's
   bottom rule at `ink/30` was **1.87:1**, the lowest boundary in the app — and
   this document's own claim is that the ruled line *is* the input, so it is the
   whole affordance and takes the 3:1 floor. Also `/50` now. All of it asserted.
8. **Two tracking values are one-offs, not tokens.** `tracking-[0.32em]` on the
   code input and `tracking-[0.36em]` on the displayed code. Both are display
   treatments of the same six characters and want to stay in sync; if a third
   place needs them, promote them to `@theme`. (A third one-off, a 1.0625rem
   card-name step, was removed rather than promoted: at 6% it was never a step,
   and weight plus caps already separate a card name from body text.)
9. ~~**The depth scale has two levels and one radius, and nothing enforces
   either.**~~ **Answered in 10.4** by `src/app/depth-scale.test.ts`, and more
   of it than the question asked for: one radius, no shadow/gradient/blur, and
   the card-block materials applied only by `board.tsx` — which is what makes
   "is a block nested inside a block?" a question about one file instead of
   forty. What is *still* open is the cross-component case: the recursive nest
   is closed (a `CardBlock` cannot render a `CardBlock`), but two callers
   composing one into another is left to review. Verified by injecting a
   violation and watching three assertions fail, rather than by watching the
   suite go green.
10. **Position colour is now the primary scanning signal, and the letter is the
    only fallback.** That is a deliberate trade (D22) rather than an oversight,
    but it has not been tested with anybody who needs the fallback. 3.2's
    deuteranopia measurement was of the *old*, muted washes; the vibrant hues
    have not been re-simulated, and the honest version of this question is
    whether cyan/emerald/amber separate any better under CVD than steel/olive/
    plum did. They may well not, in which case the letter is doing all the work
    and the colour is decoration with a job title.
