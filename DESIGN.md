---
name: Eurovafliai
description: A matchnight broadcast for one friends' EuroLeague draft league.
colors:
  stock: "oklch(0.16 0.022 262)"
  stock-panel: "oklch(0.205 0.026 262)"
  stock-high: "oklch(0.25 0.03 262)"
  stock-sunk: "oklch(0.135 0.02 262)"
  ink: "oklch(0.95 0.006 250)"
  ink-soft: "oklch(0.8 0.014 255)"
  ink-faint: "oklch(0.72 0.018 258)"
  rule: "oklch(0.52 0.03 262)"
  rule-strong: "oklch(0.6 0.03 262)"
  panel-border: "oklch(0.32 0.028 262)"
  rail: "oklch(0.78 0.06 240)"
  live: "oklch(0.74 0.165 50)"
  live-sunk: "oklch(0.27 0.055 50)"
  live-ink: "oklch(0.18 0.03 45)"
  gain: "oklch(0.8 0.15 150)"
  loss: "oklch(0.72 0.16 20)"
  gold: "oklch(0.86 0.13 88)"
  pos-g: "oklch(0.8 0.11 235)"
  pos-f: "oklch(0.83 0.12 180)"
  pos-c: "oklch(0.78 0.13 305)"
  on-air: "oklch(0.56 0.2 27)"
  on-air-ink: "oklch(0.99 0.005 30)"
  wood: "oklch(0.56 0.085 60)"
  wood-deep: "oklch(0.5 0.08 56)"
  court-line: "oklch(0.95 0.02 80)"
  team-crimson: "oklch(0.55 0.19 25)"
  team-ember: "oklch(0.7 0.17 48)"
  team-mustard: "oklch(0.82 0.15 90)"
  team-lime: "oklch(0.82 0.17 130)"
  team-forest: "oklch(0.52 0.12 155)"
  team-teal: "oklch(0.66 0.1 195)"
  team-sky: "oklch(0.76 0.11 235)"
  team-royal: "oklch(0.5 0.19 265)"
  team-violet: "oklch(0.56 0.19 300)"
  team-magenta: "oklch(0.57 0.21 345)"
  team-slate: "oklch(0.48 0.03 255)"
  team-sand: "oklch(0.8 0.06 75)"
  team-ink-dark: "oklch(0.2 0.03 262)"
  team-ink-light: "oklch(0.98 0.005 250)"
typography:
  display:
    fontFamily: "Barlow Condensed, Space Grotesk, sans-serif"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: "0.95"
    letterSpacing: "0.005em"
  figure:
    fontFamily: "Barlow Condensed, Space Grotesk, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: "0.85"
    fontFeature: "tabular-nums lining-nums"
  section:
    fontFamily: "Barlow Condensed, Space Grotesk, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "1"
  body:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    fontFeature: "tabular-nums"
  body-small:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.06em"
  stat:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    fontFeature: "tabular-nums"
  roll-clock:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "5rem"
    fontWeight: 500
    lineHeight: "1"
    letterSpacing: "-0.03em"
rounded:
  block: "0.375rem"
  control: "0.5rem"
  card: "0.875rem"
  full: "9999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  slot: "2.75rem"
components:
  button-primary:
    backgroundColor: "{colors.live}"
    textColor: "{colors.live-ink}"
    rounded: "{rounded.control}"
    height: "2.75rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "2.75rem"
  panel:
    backgroundColor: "{colors.stock-panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1rem"
  badge-live:
    backgroundColor: "{colors.on-air}"
    textColor: "{colors.on-air-ink}"
    rounded: "{rounded.block}"
---

# Design System: Eurovafliai — Matchnight

The current contract, from [ADR-0011](docs/adr/ADR-0011-matchnight.md).
`src/app/globals.css` is the source of truth for every rendered value and
`src/app/tokens.test.ts` measures every pairing on both grounds. The earlier
directions (card stock, night board, midnight board, arena) and the reasoning
behind the rules that survived them live in
[docs/log/design-history.md](docs/log/design-history.md).

## Scene

Friends on a couch at 20:00 CET with the game on the TV, phones in hand; a
quick check on the way to work the morning after. The app reads like the
scoreboard graphic in the same room: dense where density is honest, calm until
something happens, and loud for a moment when something does.

## Principles

1. **Lead with the answer.** Each page's most important fact is its hero, at
   scoreboard size, on first load at 390px: rank and total on Home, the live
   total on Live, the court on Lineup, the podium on Standings, the round's
   headline on Recap. Choosing *what* to look at (round, season, team) is a
   control in the header — a stepper or a chip — never a panel above content.
2. **Teams are people.** A member's crest (colour, shape, monogram) sits beside
   their team name everywhere the name appears. The crest is decoration for
   assistive tech; the name is the content.
3. **Celebrate changes, not pages.** A moment plays when something changed that
   this viewer has not seen, then holds still. Reloading is quiet.
4. **Colour has a word.** No state, position or identity is carried by colour
   alone: a badge prints OUT, a position prints G, a crest prints its monogram.
5. **Server truth, provisional honesty.** Live figures say provisional and when
   they were checked. Finished-game standings are the only final numbers.

## Colour

Strategy: restrained neutrals with one accent, plus a **full palette of team
colours** that carry identity (product data-viz permission). Two grounds:
dark (default) and light (`:root[data-theme="light"]`), each solved against
the same floors. The ground follows the device unless the reader holds one
with the theme switch (sidebar beside the account, or More on a phone).

| Token | Job |
|---|---|
| `stock`, `stock-panel`, `stock-high`, `stock-sunk` | ground, panel, raised control/hover, the sidebar and tab bar layer |
| `ink`, `ink-soft`, `ink-faint` | text: primary, secondary, quiet (all ≥ 4.5:1 on every surface) |
| `rule`, `rule-strong`, `panel-border` | boundaries: meaningful (≥ 3:1), heavy, structural |
| `live` + `live-sunk` + `live-ink` | **the accent, Tip-off orange**: the one act on a surface, selection, focus, whoever is on the clock; its field; text on a filled accent |
| `on-air` + `on-air-ink` | the red LIVE bug for a game in play — always with the word |
| `gain`, `loss`, `gold` | up / improvement; down / injury / error; crowns, captains and caution |
| `pos-g`, `pos-f`, `pos-c` | sky guard, mint forward, violet center — always with the letter |
| `wood`, `wood-deep`, `court-line` | the hardwood lineup court |
| `team-*` (12) + `team-ink-dark/light` | a member's crest colour and its monogram ink |

Named rules:

- **The one act.** A surface has at most one filled accent button. Everything
  else is secondary (outlined) or quiet (text).
- **Opaque patches.** A position patch mixes its tint into `stock` rather than
  using an alpha wash, so its letter reads the same on any row.
- **Atmosphere is named.** Gradients and textures exist only as utilities:
  `team-field` (a member's colour fading into the panel), `lattice` (the waffle
  grid, which is also a draft board), `hardwood`, `waffle-mark`. Never a
  one-off gradient, glow or glass blur in a component.
- **No side stripes.** A coloured `border-left` on a card or row is refused; use
  the crest, a badge or a patch.

## Typography

| Role | Face | Where |
|---|---|---|
| `display` | Barlow Condensed 700, caps | page titles (`PageHeader`), section heads (`Bank`), team names on a scoreboard |
| `display-figure` | Barlow Condensed 800, lining | the hero figure: rank, total, live score, clock in a band |
| body / body-small | Space Grotesk 400–700 | every sentence, label, button and name in a list |
| `slot-label` | Space Grotesk 600, 0.75rem caps, 0.06em | small context lines: eyebrows, column heads |
| `stat` | JetBrains Mono | figures read down a column |
| `roll-clock` | JetBrains Mono 5rem | the roll's countdown only |

Display type is never a button label, a form label or a sentence. Headlines
step 1.25× or more above the next level; body copy caps at 65–75ch.

## Layout

- **App shell** (ADR-0008): sidebar from `lg` on `stock-sunk`, header, optional
  side panel from `xl`, bottom tabs below `lg`. In season the tabs are Home,
  Lineup, Live, Table, More.
- **Page anatomy:** `PageHeader` (eyebrow · display title · one-line lead · one
  action) → the hero → supporting sections. On wide screens the supporting
  sections form two columns (`1.35fr / 1fr`).
- **Panels:** `bank-framed` (radius `card`) groups a task; `card-block` groups
  a subject. Never a panel inside a panel.
- **Measures:** `column` for forms and reading, `wide` for league views.

## Components

- `PageHeader`, `ScoreFigure`, `StatusBadge`, `RoundStepper`, `TeamCrest`,
  `teamFieldStyle` — `src/components/broadcast.tsx`.
- `Moment` — `src/components/moment.tsx`: plays a moment once per viewer.
- The board vocabulary — `Bank`, `Slot(s)`, `CardBlock(s)`, `Door`,
  `PositionPatch`, `FilterToggle` (a pill), `Field` + `inputStyles` (a boxed
  field), `Correction` (a loss-red "needs attention" note) — `src/components/board.tsx`.
- `InfoTip` — `src/components/info-tip.tsx`: a section's or a column's
  meaning behind a small "i" (hover, focus, tap), never a paragraph under a
  heading. `Bank` takes it as `info`. Club colours: `src/lib/clubs/colors.ts`,
  always beside the club's crest.
- `SubmitButton` tones: `live` (filled accent, the one act), `ink` (outlined),
  `liveOnField` (an act inside an accented row). Each renders `data-tone`.

Every interactive element: ≥ 44px target, visible focus (2px accent outline),
hover, active, disabled and pending states.

## Moments

All on one curve (`--ease-broadcast`, ease-out-quint), all end-state under
`prefers-reduced-motion`.

| Moment | Where | Keyed on |
|---|---|---|
| overtake | your row in a table slides up past the team you passed, flashes gain | league + round + new rank |
| crown | the round winner's crest gets a dropped crown and a gold sweep | league + round |
| stamp | a deal card is stamped WINNING / LOSING | deal + verdict |
| spoon | the round's last place gets a swinging wooden spoon | league + round |
| badge | an earned streak badge flips in | league + badge + holder |
| lower-third | draft night: "pick is in" wipes across every screen (~2s) | pick number |

Plus the draft board's existing events (card lands, rule advances, pick
springs) and the roll's slot drawn.

## Do and don't

Do: lead with the answer; print the word beside every colour; put the crest
beside every team name; keep one filled accent per surface; measure every new
colour pair in both grounds.

Don't: put a form above a page's content; animate on page load; use display
type for labels; add a gradient outside the named utilities; use a coloured
side stripe; call anything final before the finished-game pipeline says so.
