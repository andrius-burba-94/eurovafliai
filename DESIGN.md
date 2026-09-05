---
name: Eurovafliai
description: A physical draft board rendered as an interface — card stock, ruled slots, one marker red.
colors:
  stock: "oklch(0.943 0.004 240)"
  ink: "oklch(0.24 0.012 250)"
  ink-soft: "oklch(0.47 0.011 250)"
  ink-faint: "oklch(0.513 0.009 250)"
  rule: "oklch(0.614 0.008 240)"
  rule-strong: "oklch(0.533 0.01 240)"
  rail: "oklch(0.52 0.042 245)"
  live: "oklch(0.548 0.198 27)"
  live-sunk: "oklch(0.925 0.055 27)"
  pos-g: "oklch(0.49 0.082 235)"
  pos-f: "oklch(0.49 0.079 128)"
  pos-c: "oklch(0.5 0.093 305)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0.04em"
  code:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "0.36em"
  wordmark:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0.16em"
  card-name:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.5rem"
    letterSpacing: "0.06em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
  body-small:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "normal"
  slot-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.14em"
  field-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: "1rem"
    letterSpacing: "0.06em"
  action-label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.14em"
rounded:
  none: "0px"
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
    backgroundColor: "color-mix(in oklab, {colors.pos-g} 10%, transparent)"
    textColor: "{colors.pos-g}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
  patch-f:
    backgroundColor: "color-mix(in oklab, {colors.pos-f} 10%, transparent)"
    textColor: "{colors.pos-f}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
  patch-c:
    backgroundColor: "color-mix(in oklab, {colors.pos-c} 10%, transparent)"
    textColor: "{colors.pos-c}"
    rounded: "{rounded.none}"
    padding: "0.25rem 0.5rem"
---

# Design System: Eurovafliai

Written from the code as built, at the end of Phase 1.4. `src/app/globals.css` is
the source of truth for every value; this file is the prose record and the
rulebook. Where the two ever disagree, the stylesheet wins and this file is
stale.

Three surfaces exist today: sign-in (`src/app/login/page.tsx`), your leagues
(`src/app/page.tsx`) and the league lobby
(`src/app/leagues/[id]/page.tsx`). Everything they are made of lives in
`src/components/board.tsx` and `src/components/submit-button.tsx`.

## Overview

**Creative North Star: "The Draft Board Wall"**

The world is the physical draft board seen up close: card stock slotted into
ruled slots, names written in marker, the slot on the clock struck in red. The
value relationship of the real object is **inverted on purpose** — the card
stock is the ground and the board's ruling is the ink. Two reasons, both
recorded in the stylesheet's own header. Draft night is a lit room with a TV on,
followed by months of daylight phone checks; and a near-black surface with one
glowing accent is the first thing this category reaches for, so it is the first
thing this board refuses.

The personality is an instrument, not an entertainment product: cool, dry,
dense where density is honest and quiet everywhere else. Nothing floats,
nothing glows, nothing is rounded. Depth is made entirely of how heavily a line
is ruled. Colour is restrained to tinted neutrals plus one marker red, and the
red is load-bearing — it marks who is on the clock and what just landed, and it
is never decoration. The surface is legible from across a room because the state
language is drawn in border weight, not in badge colour.

The direction contract shipped in the emitted HTML of every page
(`src/app/layout.tsx`) states the refusals literally: no near-black surface with
one glowing accent, no metric-tile hero, **no cards inside cards**. A design
whose thesis is "the app is the draft board" cannot show the user a stack of
floating cards.

**Key Characteristics:**

- Card stock as the ground, the board's ruling as the ink; light, not dark.
- One accent — the commissioner's marker red — with two jobs and no third.
- State is carried by a row's own material (border weight and style), never by a
  pill parked beside an otherwise normal row.
- Zero corner radius, zero shadows, zero gradients, anywhere.
- One type family (Archivo), caps for names and labels, tabular figures for
  every number in the app.
- Exactly one animation is implemented, on exactly one event.
- Mobile-first with a single breakpoint; the phone gets the complete rail.

## Colors

Tinted, desaturated neutrals — office supply, not parchment — with one saturated
marker red. Everything is OKLCH; neither end of the neutral ramp is pure black
or pure white, and every neutral leans toward the rail's blue so nothing is a
dead grey.

Contrast ratios below are **measured**, not estimated: `src/app/tokens.test.ts`
parses `globals.css`, converts OKLCH to WCAG relative luminance and asserts the
floors. Twenty-three assertions, all passing.

### Primary

- **Commissioner's Marker Red** (`oklch(0.548 0.198 27)`, token `live`,
  **4.58:1** on stock): the one accent. Kept cooler and more saturated than a
  terracotta specifically so the surface cannot drift into the cream-and-clay
  cluster every generated interface lands in. It is the 2px rule over the slot on
  the clock, the caret, the selection background, the focus ring, the border and
  text of the single primary action on a surface, and the invite code the
  commissioner reads out loud. Nothing else.
- **Live Field Blush** (`oklch(0.925 0.055 27)`, token `live-sunk`, 1.10:1 on
  stock): the tint that fills a live slot. It **locates** the row; the 2px marker
  rule above it is what carries the state. It is deliberately not asserted for
  contrast — it is a background against a background, and pushing it to a
  text-grade ratio would make it a pink block fighting the rule sitting on it.

### Neutral

- **Cool Card Stock** (`oklch(0.943 0.004 240)`, token `stock`): the ground.
  Set on `body` and on the root element. There is no second surface colour: no
  panel, no elevated card, no striped row.
- **Board Ink** (`oklch(0.24 0.012 250)`, token `ink`, **13.92:1** on stock):
  all primary text, and the 2px stroke of a correction.
- **Soft Ink** (`oklch(0.47 0.011 250)`, token `ink-soft`, **5.77:1**): slot
  labels, field labels, secondary sentences under a heading, a member's real name
  beside their team name.
- **Faint Ink** (`oklch(0.513 0.009 250)`, token `ink-faint`, **4.80:1**): input
  placeholders, the "Slot 07" numbering on an unfilled slot, the round numbers
  down the left of the board plan. It was once 2.96:1 and carried form labels —
  the text that tells somebody what to type. That was solved by measurement, not
  by eye.
- **Waiting Rule Grey** (`oklch(0.614 0.008 240)`, token `rule`, **3.15:1**): the
  thin dashed rule of an empty slot, and every interior line of the board plan.
  It was once 1.36:1, which is not a boundary, it is a rounding error — and since
  the rule *is* the state language, a rule you cannot see means a surface with no
  states.
- **Heavy Rule Grey** (`oklch(0.533 0.01 240)`, token `rule-strong`, **4.40:1**):
  the solid rule of a filled slot, and the frame that closes a run of slots. It
  is 1.40× the contrast of `rule` — the major/minor hierarchy a real board has,
  asserted as a ratio between the two rather than as a fixed number.
- **Rail Slate Blue** (`oklch(0.52 0.042 245)`, token `rail`, **4.64:1**): used
  only for the top rail's bottom border, at 40% opacity. The one neutral with
  visible chroma; the rest of the ramp is tinted toward it.

### Tertiary — position patches

Three hue families for Guards, Forwards and Centers, muted enough to sit beside
twenty club colours and dark enough to carry text on stock. All three clear the
text floor because the letter inside them has to be readable.

- **Guard Steel Blue** (`oklch(0.505 0.082 235)`, token `pos-g`, **4.89:1**)
- **Forward Olive** (`oklch(0.508 0.079 128)`, token `pos-f`, **4.78:1**)
- **Center Plum** (`oklch(0.505 0.093 305)`, token `pos-c`, **5.17:1**)

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

**The Ink-on-Blush Rule.** Text on a live field is ink (**12.62:1** on
`live-sunk`). Marker red on `live-sunk` measures 4.15:1 and fails the text
floor — never put marker text on the live tint.

**The Letter-Always Rule.** Colour never carries position on its own. A
`PositionPatch` always renders its G / F / C letter, for colour-blind readers and
for a photocopied sheet (PRODUCT.md, Accessibility & Inclusion).

## Typography

**One family: Archivo** — loaded via `next/font/google` in `src/app/layout.tsx`
with `subsets: ["latin", "latin-ext"]` and `display: "swap"`, exposed as
`--font-archivo` and consumed through `--font-sans`.

**Character:** one family, the way a kit room has one label maker. Archivo's
grotesque caps at wide tracking are the honest translation of marker lettering on
card stock; its figures are unfussy and its diacritics are complete.

`font-variant-numeric: tabular-nums` is set on `body`. Every figure in this app
is tabular, because a number that changes width as it counts down makes a clock
jitter and a draft has a clock on it.

### Hierarchy

- **Display** (600, 1.875rem → 2.25rem at `sm`, caps, 0.04em): the one page
  headline. "Take your slot"; a league's name in the lobby.
- **Code** (600, 1.875rem → 2.25rem at `sm`, caps, 0.36em, marker red): the
  invite code, and only the invite code. Tracking this wide exists so six
  characters can be read aloud across a room without being mis-heard.
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

**The One Label Maker Rule.** One family, no exceptions. There is no display
face, no serif, no mono. Numbers are already tabular, so a mono face has no job
here.

**The latin-ext Rule.** The `latin-ext` subset is not optional. This league reads
names like Valančiūnas and Motiejūnas; a font that falls back mid-word for the
diacritics makes the board look broken. Any future family must ship latin-ext.

**The Tracking-Inverts-Size Rule.** Tracking rises as size falls: 0.04em at
display, 0.06em on a card name, 0.14em on a slot label. Caps at small sizes are
only legible when they are opened up.

**The Computed-Family Rule.** `tests/e2e/design.spec.ts` asserts the *computed*
`font-family` on `body` contains "Archivo" and does not contain "Arial". A
hardcoded stack on `body` once overrode the token, so the webfont downloaded on
every cold load while the page rendered in Arial. Assert the computed value, not
the token.

## Layout

**One column, one measure.** Every surface is a `TopRail` followed by a `Sheet`.
`Sheet` is `max-w-3xl` (48rem) centred, and `TopRail`'s inner row uses the same
measure, so the rail's wordmark aligns with the first slot below it on every
page. There is no sidebar, no second column at page level, and no full-bleed
region.

**Spacing rhythm.** The board's unit is the slot: `--spacing-slot: 2.75rem`
(44px). It is also the minimum touch target, which is why the two numbers are
the same one. Vertical gaps inside a `Sheet` are `2rem` on a phone and one slot
(`2.75rem`) from `sm` up. Sheet padding is `1.25rem / 2rem` on a phone and
`2rem / 3rem` from `sm`. Inside a section: `0.75rem` between a heading and its
content, `1.25rem` between fields in a form, `1rem` between a form's label group
and its action. Slot rows are padded `0.75rem` horizontally, `0.75rem` vertically
when filled and `0.5rem` when waiting — an empty slot is deliberately shorter
than a filled one.

**Responsive behaviour: one breakpoint.** Only Tailwind's `sm` (40rem / 640px) is
used anywhere in the codebase; there is no `md`, `lg` or `xl` in any source file,
and no custom breakpoint is declared. Everything below 40rem is the phone
layout, everything above is the wide layout, and above 48rem the sheet simply
centres. What changes at `sm`:

- Sheet padding and gap step up; display type goes 1.875rem → 2.25rem.
- "Start a league" and "Join a league" go from stacked to a two-column grid.
- Buttons go from full-width to auto-width.
- The signed-in home shows five extra empty slots (8 total instead of 3) — a wide
  viewport has the height for them.
- The signed-out user's name appears next to "Sign out" in the rail.
- The board plan appears on the lobby (it is hidden on phones there).

**The rail stays complete on the phone.** The season ("Euroleague 2026–27") is
rendered at every size. It was hidden on small screens once, which made the
primary device the one place the rail was incomplete. When the rail must
contract, the *name* beside "Sign out" is what goes.

### Named Rules

**The One Measure Rule.** New surfaces use `Sheet`. If a future surface needs to
be wider than 48rem (a real draft board with 12 columns will), that is a
deliberate new container with its own justification — not a per-page `max-w`
override.

**The Slot Grid Rule.** Anything vertical is a multiple of the slot unit or of
Tailwind's 0.25rem step. Do not introduce a third spacing system.

## Elevation & Depth

**There are no shadows.** Not one `box-shadow`, `drop-shadow`, `blur`,
`backdrop-filter` or gradient exists in the codebase. There is also no second
surface colour: every page is card stock all the way down.

Depth is made of exactly two materials:

1. **Rule weight.** 1px dashed (light) → 1px solid at heavy rule grey → 2px
   solid marker. Heavier reads nearer and more settled; dashed reads unfinished.
   A run of slots is closed at the bottom by a heavy 1px rule, the way a board
   has a bottom rail.
2. **A single tint.** `live-sunk` fills the live slot. It is the only fill in the
   system besides the 10% position-patch washes.

### Named Rules

**The No-Card Rule.** Nothing is a card, so nothing can be a card inside a card.
Sections are separated by their heading and their rules, not by a container. If a
new surface seems to need a panel, it needs a `Bank` and a rule.

**The Flatness-Is-Not-Negotiable Rule.** A shadow, a gradient, a glow or a
rounded corner arriving anywhere in this system is a regression, not a variant.
The board is a physical object photographed head-on in flat light.

## Shapes

**Zero radius, everywhere.** No `rounded-*` utility appears in any source file.
Buttons, inputs, patches, slots and the board plan are all right-angled
rectangles. This is the strongest single carrier of the "physical board, not an
app chrome" read, and it is not adjustable per component.

**Borders are the whole form language.** Almost every border in the system is on
one side: `border-top` on a slot (that is the ruling), `border-bottom` on the
sheet's slot run and under an input, `border-bottom` on the top rail. The only
four-sided borders in the system are the button (1px at 35–60% opacity) and the
position patch (1px at 55% opacity).

**The only filled shapes** are the position patch (a 10% wash of its own hue) and
the live slot (`live-sunk`). Hover and active states use 5–10% ink washes.

**Iconography is drawn, not imported.** `BackArrow` is a hand-authored inline
`<svg>`: one 1px stroke, `viewBox="0 0 12 8"`, `currentColor`,
`aria-hidden="true"`. There is no icon library in this project. New icons follow
the same recipe — a single stroke, no fill, no icon font, no package.

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
round gutter; it needs no shadow, no blur and no second surface colour.

**Do not add `bg-stock` to it unconditionally.** `slot-live` brings its own
opaque blush, and a plain `bg-stock` alongside it paints straight over that —
both set `background-color`, and the plain utility wins. Only the finished state
(`slot-filled`, a border and nothing else) needs a field, or the board scrolls
through it. Shipped broken once, and `tests/e2e/draft.spec.ts` now asserts the
computed background and the 2px marker rule.

### Top rail — `TopRail`

The board's top rail. Character: a label on the frame, not a navigation bar.

- **Structure:** wordmark + season on the left, one optional `action` slot on the
  right, baseline-aligned. Bottom border 1px rail blue at 40% opacity.
- **Padding:** `1.25rem / 1rem` on a phone, `2rem / 1rem` from `sm`.
- **The action slot** is a slot label — "Sign out · Name", or a `BackArrow` plus
  "Leagues". Never a filled button.
- **States:** rail links transition colour to full ink on hover and take a 2px
  marker outline at `focus-visible` with 2px offset.

### Sheet — `Sheet`

The page's own column. `max-w-3xl`, centred, `flex-1`, column flow. Takes an
optional `testId` which lands as `data-testid` — the E2E suite identifies
surfaces this way (`login`, `app-shell`, `lobby`).

### Section — `Bank`

Every bank is `aria-labelledby` its own `h2`. A section whose heading is a
sibling it is not associated with is an unnamed region: a screen reader lands in
it and is told nothing. One `id` fixes it for every section on every surface.

A section of the board. Heading is a slot label; an optional `aside` (also a slot
label) sits baseline-aligned at the right of the same line and carries the
count — "3 of 12", "9 of 12 free", "2 on the board", "none yet". Heading and
content are `0.75rem` apart. No border, no background: a `Bank` is a column head,
not a container.

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
one.

**The Board-Shows-Its-Shape Rule.** A list of things that occupy slots renders
its empty slots too. A lobby that is a quarter full looks a quarter full; the
signed-in home continues past your leagues into free slots. A list that just
stops is not a board.

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
pick. Its label cannot be the marker's own red: `live` on `live-sunk` is 4.15:1
and the Ink-on-Blush Rule forbids it by name. So the border goes to
full-strength marker at 2px (4.15:1, which clears the 3:1 boundary floor) and
the label goes to ink (12.62:1). The act is still struck in marker; it is the
rule that says so, which is how this system says everything else. 3.3 shipped
`tone="live"` there and broke a named rule on the one control it matters most
for — the last thing read before an action only a commissioner can undo.

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
  `sticky left-0` on stock, so the row you are reading stays labelled while the
  columns move. Slot height is `min-h-slot` — the board's own spacing unit.
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
additionally `sticky left-0` on stock, header included, or a member's name
scrolls underneath and its tail shows through; the header's gutter cell needs
`self-stretch` on top of that, because its only child is `sr-only` and therefore
absolutely positioned, and a background painted on a zero-height box hides
nothing.

**The Wash-Costs-A-Tenth Rule.** A 10% wash over stock costs roughly a tenth of
every contrast ratio measured on top of it. `ink-faint` is 4.80:1 on stock and
**4.42:1** on a position wash; a position colour on its own 10% wash is 4.50:1 at
best and 4.21:1 at worst — and that letter is the colour-blind fallback for
position, so it is an accessibility floor twice over. So text on a washed field
is `ink` or `ink-soft`, and a rule on one is `rule-strong`. 3.1 shipped the
opposite of all three, and `tokens.test.ts` was green throughout, because until
3.1 it could only compare one opaque token with another and had no way to express
an alpha background at all. It can now, and these pairs are asserted.

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
a dashed `rule` hairline (3.15:1), which survives grayscale and every CVD
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

- **Don't** add a corner radius, a shadow, a gradient, a blur or a second surface
  colour. None exist today; each would be a regression, not a variant.
- **Don't** put a second marker-red primary action on one surface, and don't use
  marker red for anything that is not state or the one act. The pool's **armed**
  row is the one act, and is struck accordingly: exactly one row at a time, and
  only while a pick is armed. It was 25 marker-red buttons at once until 3.3 —
  which is what taught the room that red meant "button" one screen above a
  board whose whole state language is red used sparingly.
- **Don't** strike an error in marker. Corrections are ink
  (`slot-correction`) — an error and an invite code must never look alike.
- **Don't** put marker-red text on the live tint: 4.15:1. Ink on the live tint is
  12.62:1.
- **Don't** encode position or status by colour alone. The G / F / C letter is
  always present.
- **Don't** hide the season from the top rail on small screens. If the rail must
  contract, drop the user's name.
- **Don't** introduce a second font family, an icon package or an icon font.
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
commitment, and the direction contract's promise: "Only two things in this app
animate: a card landing, and the live rule advancing."

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
still. That is also why the room's board has no "just landed" animation on the
pick itself — one event per state change, and the state change here is the clock
moving.

**The Two Events Rule.** Nothing else animates. Both events now exist, so the
budget is spent: a third animation is a change to this document, not a variant.
The board's auto-scroll is not one of them — following the clock is scrolling,
not animation, and it uses `behavior: "auto"` under reduced motion. Colour transitions on hover
(`transition-colors`) are not animation and are permitted on interactive
elements. A spinner, a skeleton, a page transition, a parallax or an entrance
animation on a static element is out of scope for this world.

## Open questions

Gaps in the built system that future work must decide. These are honestly
unresolved, not omissions from this document. Answered ones are struck through
rather than deleted, so the decision and the question it settled stay together.

1. ~~**The second motion event does not exist yet.**~~ **Answered in 3.1:** the
   live rule advancing, keyed on `data-advanced`. See Motion above. The
   two-event budget is now spent.
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
   columns simply share the width they have.
5. **No dark mode.** `color-scheme: light` is declared and the light ground is a
   deliberate inversion of the physical object, argued from a lit room and
   daylight phone use. Whether a genuinely dark room during a night draft
   deserves an answer is open; if it ever does, the inversion argument has to be
   re-made, not quietly dropped.
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
