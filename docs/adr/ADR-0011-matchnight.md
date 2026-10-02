# ADR-0011: Matchnight — the broadcast interface

Date: 2026-09-30
Status: accepted

## Context

The arena interface (ADR-0009) made the season product correct and accessible,
and it still read like a statistics page. A design critique scored it 22/40
on Nielsen's heuristics and failed six of eight cognitive-load checks. The
root cause was the design system rather than any single page: a motion budget
that allowed four animations, all on draft night, a rule that there is "no
material for success", one accent with two jobs, and a ban on the team
identity, gradients and display type that a friends' league runs on. Every
season surface inherited rules written for a correctness-critical draft board.

The owner asked for an app that is lively, welcoming and worth coming back to,
without becoming harder to navigate, and with the most important fact on each
page visible on first load. A questionnaire and a concept gallery
(`/concepts`, development only) settled the direction.

## Decision

**Direction: matchnight broadcast.** The app reads like the TV graphics
package of a EuroLeague game night: one big number per page, team colour
bars, a scorebug, lower thirds for moments.

- **Two grounds.** Dark by default and light when the device asks for it,
  through `prefers-color-scheme`. Both are measured in `tokens.test.ts`.
  *Amended 2 October 2026 (S26):* the owner asked for a switch, so the reader
  can hold Light or Dark (System stays the default) from the sidebar, kept in
  a `theme` cookie that a head script reads before first paint.
- **Palette: Tip-off.** Basketball orange is the accent (`live`): the one act on
  a surface, the selection, focus, and whoever is on the clock. Gain green,
  loss red, gold for crowns and captains. A red `on-air` bug marks a game in
  play, always with the word LIVE. Position colours are sky (G), mint (F) and
  violet (C), always with the letter.
- **Type.** Barlow Condensed is the broadcast voice for headlines, scores and
  team names (`display`, `display-figure`). Space Grotesk sets every other
  word. JetBrains Mono sets figures in a column (`stat`).
- **Team identity.** Each member's team has a colour from twelve and a crest
  shape from four (waffle, shield, roundel, hex), with a monogram from the
  team name. A member who never chose gets a deterministic default from their
  place in the league. Every monogram clears 4.5:1 on its colour.
- **Moments.** Round winner crown, rank overtake, trade verdict stamp, wooden
  spoon, streak badges, and on draft night the pick-is-in lower third with an
  optional sting. Each is played by `Moment` once per viewer, keyed on what
  changed, never on a page load, and holds still under reduced motion.
- **Hierarchy.** Every page leads with its answer: rank and total on Home, the
  live total on Live, the court on Lineup. Controls that choose *what* to look
  at (round, season) are a stepper in the header, never a panel above the
  content. The season control disappears while there is one season.
- **Chosen layouts** from the gallery: Home as a scorebug hero with a round
  ticker; Live as a scoreboard; Lineup on a hardwood court; Standings with a
  podium; Recap as a front page; Trades as a ledger over deal cards; League
  Stats as a record book; the draft band in the picker's team colour; the roll
  as a full-screen stage.
- **Kept without change.** Server authority, the pure engine, 44px targets,
  visible focus, the letter-always rule for position, a word beside every
  colour, opaque position patches, reduced motion everywhere, and "provisional"
  on every live figure.
- **Retired.** The four-animation budget, "no material for success", the
  marker's two-jobs rule, the no-gradient and no-display-face rules, and the
  pinned hex anchors in `tokens.test.ts`. Gradients and textures exist only as
  named utilities (`team-field`, `lattice`, `hardwood`, `waffle-mark`), never
  ad hoc in a component. Side-stripe accents stay refused.

## Consequences

`DESIGN.md`'s current contract is rewritten; the earlier directions move to
`docs/log/design-history.md`. `league_members` gains `team_color` and
`team_crest` (S2). The phone tabs become Home, Lineup, Live, Table and More,
and a League Stats page is added. The redesign ships in slices, foundation
first, each with its own tests; behaviour, test ids and region names are
preserved so the end-to-end suite keeps describing what the app does.

## Alternatives considered

- **Hardwood clubhouse** (warm, tactile everywhere): kept for the lineup court
  only, where it is the most basketball moment in the app.
- **Trading-card collection:** strong for players, weak for standings and
  trades, and too close to salary-cap fantasy's look.
- **Keeping cyan (Floodlight):** closest to the previous release, and the reason
  it felt unchanged.
