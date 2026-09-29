# Matchnight redesign (ADR-0011)

The story behind the redesign, slice by slice. STATUS.md holds the table and
the current "Try it" notes; this file holds the why.

## The critique that started it

An `/impeccable critique` on 30 September 2026, run as two independent
assessments (a design-director review of all 20 routes plus the deterministic
detector), scored the arena interface **22/40** on Nielsen's heuristics and
failed **6 of 8** cognitive-load checks. The findings that shaped the plan:

- The design system forbade the product's own promise. "Broadcast, confident,
  playful" had no permitted means of being playful: four animations, all on
  draft night; "no material for success"; one accent with two jobs.
- Controls came before content. A framed Season panel with one option sat
  above five pages; Lineup and Recap stacked a second form under it, pushing
  the court below the fold at 390px.
- Teams had no identity beyond a string, and no page had a hero — "You
  finished 1 of 8" was `text-sm` inside a panel while the page's `h1` read
  `26-27`.
- Real bugs: the court's position badge was always cyan; the grid view printed
  every position in the guard colour; the captain's "C" collided with the
  center's "C"; matchday times were UTC while the panel used Vilnius time;
  injury news used the on-the-clock material; a completed draft still nagged
  "You have no cheat sheet".
- The detector's one primary finding (bounce easing on the pick spring) was a
  false positive; its advisories were the court's hard-coded palette and
  7.7–10px labels.

## The questionnaire and the gallery

Direction: matchnight broadcast. Dark and light grounds following the device.
A condensed display face. Team colour and monogram crest. Rewrite the rules
rather than bend them. Moments: round winner, overtake, trade verdict, wooden
spoon, streaks, plus the draft's pick-is-in banner and opt-in draft sounds. A
League Stats page (records, team profiles, lineup efficiency, draft value,
player leaders, trade ledger). No social features. Neutral copy. A fixed
League Home. Tabs Home, Lineup, Live, Table, More. Commissioner pages get the
new look and UX fixes, no celebrations.

**S0** built `/concepts` (development only, invented data) with four display
faces, two palettes in both grounds, the crest system, replayable moments and
two variants of nine screens. The owner skipped the picks, so the
recommendations were taken and recorded in ADR-0011: Barlow Condensed, Tip-off
orange, Home A (scorebug), Live A (scoreboard), Lineup B (hardwood), Standings
A (podium), Recap A (front page), Trades both (ledger over cards), Stats A
(record book), Draft A (scorebug band), Roll A (stage). Every one is a token or
a component choice and can be revisited.

## S1 — foundation

- Two grounds in `globals.css`, measured by a rewritten `tokens.test.ts` that
  asks every floor on both (180 assertions). The pinned hex anchors and the
  gradient ban are gone; the halation ceiling, the slot materials and the
  opaque position patch stay.
- Tokens were solved numerically before the tests were written: four light
  values (accent and gold on raised surfaces, the forward letter on its wash,
  the accent on its field) and two team colours (crimson, magenta) failed a
  first pass and were darkened.
- Barlow Condensed joins the two existing families as `font-display`, with the
  `display` and `display-figure` utilities. Every page `h1` moved onto it.
- The board vocabulary was restyled in place, which moved every page at once:
  `Bank` headings in display caps, rounder panels, pill filters, boxed inputs,
  a filled accent primary button with `data-tone`, a loss-red "Needs attention"
  correction, and no coloured side stripe on card blocks.
- New primitives: `PageHeader`, `ScoreFigure`, `StatusBadge`, `RoundStepper`,
  `TeamCrest` (`src/components/broadcast.tsx`), `Moment`
  (`src/components/moment.tsx`), the pure `src/lib/teams/identity.ts` and
  `src/lib/time/local.ts`.
- The shell's six hard-coded colours became tokens (`stock-sunk` is new).
- Every bug in the critique's list above is fixed. `SeasonControl` renders
  nothing while there is one fantasy season.
- Specs that asserted the old aesthetic now assert the new intent: the
  direction contract, both grounds from CSS alone, headlines in the broadcast
  face, `data-tone` instead of `text-live`, and the injury badge instead of the
  live material.

**S1 verification.** Full chromium e2e locally: 239 passed, 13 failed on the
first run. Six were specs asserting the framed Season panel, which now does not
render while there is one fantasy season; they assert its absence instead.
Four were `news.spec.ts` against a local database holding newer RotoWire items
than the planted ones (the page shows the newest 40); CI starts empty. Three
(`cheat-sheet` 317, `pool` 320 and 365, the known pool flake) and one run of the
light-ground check failed under parallel load and pass alone; the ground check
now polls. Unit: 1517 passed, lint and typecheck clean.

## S2 — team identity

A crest is a colour (twelve), a shape (waffle, shield, roundel, hex) and a
monogram taken from the team name. The migration adds two optional selects and
nothing else: no backfill, because a member who never chose is drawn with a
deterministic default from their place in the id-ordered member list, and every
reader (`toMember`, `stylesFromRecords`) uses that same order. Rollback drops
the two fields and loses only the choices.

One write per save, both values validated against the curated sets first, so
there is no half-state to repair. Styling is allowed at any league status — a
crest moves no points — for your own team, or anyone's if you manage the league.

The first screenshot showed monograms on nothing: Tailwind v4 drops theme
variables no class uses, and team colours are reached only through inline
`var()`. The theme block is now `@theme static`.

Crests appear in the lobby list, chat author lines, draft board column heads
(on a team-colour field) and the radar. Standings, recap, trades and Home take
them in their own slices. New spec: `team-identity.spec.ts`.

## S3 — shell and navigation

The tab bar now answers "what is the league doing tonight": Home first, then
Lineup, Live and Table in season, or the Draft room and Sheet while drafting.
The sidebar and the tabs share `navFor`, so "Standing"/"League"/"Standings"
collapsed into one word, and Matchday is "Live" everywhere including its
headline. The cheat sheet leaves the nav once the board is full (it only drives
autodraft), and Export stops being a destination; League Home keeps its door
until S13 turns it into a download on the board and standings.

A manager sees the mapping queue as a count on the Manage item. It is the same
`countMappingQueue` the league page already ran for managers, now run by the
shell for managers only. The phone header shows the waffle mark alone below
`sm`, so the league switcher and the panel button fit at 390px.
