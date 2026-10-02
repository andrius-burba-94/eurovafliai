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

## S4 — League Home

The page now answers "how am I doing, and what do I do next" in the first
screen at 390px: the league's name as the one headline, then the viewer's team
on its own colour — crest, rank as a scoreboard figure, total, the teams they
passed since the last counted round, their place on the night, the next
tip-off and a single Set lineup action. A ticker says the round in one line.

`src/lib/season/story.ts` is new and pure: `roundStory` (winner, margin,
spoon — and nobody is crowned for a night nobody scored), `movementOf` (rank,
places moved, whom you passed, gap to the leader, ties broken on team name the
way the table does) and `ordinal`. The recap query now also returns person
codes so the best night has a portrait.

The moments are wired: the viewer's table row plays **overtake** when they
climbed, the winner's card plays **sweep** and its crown **crown**, the spoon
**spoon**. Each is keyed on the league and round, so it plays once per viewer
and a reload is still.

Removed from the season page: the 13-card roster (it is My Team's job; a
summary with G/F/C counts and two doors remains) and the mapping notice (the
Manage item carries the count). The member list stays, at the bottom, as the
league's directory with crests.

A bug found by screenshot: a shield crest's `padding-top: 16%` resolved against
the *parent's* width and stretched every shield to 46px tall. It is now a
fraction of the crest's own size.

## S5 — Live

Matchday is "Live" and opens on the scoreboard: the round's provisional total
as the page's figure, the provisional or final rank beside it, and three
chips counting the viewer's counting players who have finished, are playing
now, or are still to play. The "provisional until recorded" line stays, once,
and only final rounds say final.

Each player row now shows what counts: the raw fantasy points times the role
multiplier from the round's lineup (captain ×2, bench ×0.5, inactive ×0 and
dimmed), with the captain marked in gold and a LIVE / FINAL / SCHEDULED badge.
Games are tiles with club crests and Vilnius times. The round is stepped, not
typed, through `RoundStepper`.

## S6 — Lineup

The court is now what the page opens on after the header, drawn on the
hardwood utility, with the five formations as pills and the court/grid switch
beneath it. The typed "Which round" form became a stepper; a manager's "whose
team" choice is one compact select. The header names the round's first
tip-off. It deliberately does not say "locks": this league records lineups
after the official game, and a lock the app does not enforce would be a claim.

The per-player controls stayed, restyled rather than removed. They are what the
form posts without JavaScript and what `lineup.spec.ts` drives by accessible
name ("{name} role", "{name} captain", "Move {name}"): a role pill, the captain
as a gold armband radio, and a Move button, on compact rows instead of
two-column card blocks. The "not ready" refusal reads in gold, as guidance, not
in the loss colour.

## S7 — Standings

`src/lib/season/badges.ts` is the league's honours, pure and deterministic:
`honoursByRound` (a night's winners — all of them on a tie — and its wooden
spoons; nobody is crowned on a night nobody scored), `memberHonours` (rounds
won, spoons, the current top-three streak, best round) and `badgesFrom` (On
fire at three straight top-three nights, Crowned, Spoon collector at two).
League Stats will read the same module.

The page leads with a podium, then the badges, then the table. Each round's
winner is gold with a crown and an `sr-only` "Round winner", so the mark is not
colour alone. Play-in, Playoffs and Final Four filters appear only once those
phases have counted rounds.

A layout bug older than this slice: every table row is its own CSS grid, and
`auto` tracks sized to each row's own content, so the Total column drifted by a
few pixels row to row. The tracks after the name are now fixed widths.

## S8 — Recap

The recap reads as the morning-after front page. Its headline is a sentence
built from `roundStory` — winner, margin, spoon — so it is never written by
hand and never wrong about the night. The winner gets a banner on their own
colour with the crown and gold-sweep moments (keyed on league and round, like
Home, so seeing it on one page means it is still on the other). The night is a
ladder with a bar per team in the team's colour and the crown and spoon marks
on the first and last rows. Rounds are chips linking to `?round=`, replacing the
select-and-submit form; `recap.spec.ts` now clicks the chip.

Captain of the round was in the plan's list for this page. It needs each
member's recorded captain joined to that night's box score, which is exactly
what League Stats' lineup-efficiency section computes, so it lands there (S10)
rather than as a second implementation here.

## S9 — Trades

The page's headline promise — what every deal has been worth — is finally on
the page. `readLeagueDeals` reads the league's transactions, the players they
name and those players' box scores this season once, groups a free-agent
drop and add into one exchange (`groupTransactionHistory`, unchanged), and
computes each side's verdict with `impactForMember`, the function the team
page and the recap already used, so the three cannot disagree. It also returns
a per-team ledger of net points across all deals.

A verdict stamp plays once per viewer per deal side and per verdict: a deal
that turns from losing to winning is a new change and stamps again.

Found by the standings spec while running this slice: the round-winner cell's
`sr-only` "Round winner," was part of the cell's text, so a reader of the
number got a sentence. It is the cell's `aria-label` now.

## S10 — League Stats

A new page answers the league's arguments with numbers. Everything is derived
in the pure `src/lib/stats/league-stats.ts` from what is already stored:

- **Records** from the snapshots (highest and lowest round, the widest winning
  margin) and from box scores joined to membership windows (the best single
  night for whoever owned the player that round, and the best captain call at
  the armband's ×2).
- **Team profiles** per counted round, with the honours from S7's
  `memberHonours`.
- **Lineup efficiency**: points left on the bench and in the stands (raw minus
  the lineup multiplier), and how often the captain was the night's best
  starter. Only rounds with a recorded or carried lineup are judged; an absent
  round counted everyone at 100% and has nothing to say.
- **Draft value**: a pick is worth what the player scored for the member who
  drafted them, while they held him. Steals are the best late picks, busts the
  weakest early ones, and autodraft is compared with picks people made.
- **Players**: season leaders with their current owner, hot form over the last
  three rounds (two games minimum), the best unowned players, and leaders by
  position.
- **Deals**: S9's ledger.

This is also where "captain of the round" from the recap plan landed, as the
best captain call record. Adding the Stats item pushed the full season sidebar
33px past a 690px laptop screen; group headers are 36px now (nav links stay
44px).

## S11 — My Team, player profile, pool, news

`readMemberRoster` now also returns each player's availability, their season
points while on this roster (from the membership window's `from_round`, raw —
before lineup multipliers, and labelled so), games counted and the latest
round's points. My Team uses them for a roster grouped by position and two
callouts: the top scorer ("Carrying you") and the lowest per-game scorer ("On
thin ice"). The radar went: once a roster is full its shape says nothing.

The player page opens on a card: portrait, club crest, position, availability
badge, bio and current PIR. The game log is a table (game, club, PIR, fantasy
shaded by size); `standings.spec.ts` reads the PIR and fantasy cells directly.

The pool is a scouting board ranked by `averagePirOf` — the same number the
draft room and the side panel rank on — with Injured and A–Z as choices. The
ingest summary is folded behind "Where this data comes from" for members and
open for managers.

Not done, and why: the plan's "Your roster / League-owned / All" filter for
injury news. `/players/news` is global — it has no league, so it has no owner
to filter by. The league's side panel already shows news with owners.

## S12 — Draft room and roll

The pick-is-in banner is a client component fed by the server's latest pick;
it remembers the last `overallNo` it has seen and only plays on a change, so a
first paint, a reload or a reconnect never replays an old pick. The sting
reuses the cue switch — silent unless the member turned cues on — and stays
quieter and shorter than the clock tone, which keeps meaning "you".

A complete draft no longer puts undo and reset next to the celebration; they
are one tap away behind "Commissioner tools", with the consequence stated.

The roll kept its composition (one announcer over the filling order, figures
in the mono face) and gained the broadcast skin: a lattice stage, the landed
team's crest dropping in, names in the display face, crests on every drawn
slot. Hiding the shell for a full-screen stage needs a layout outside the
league shell and was left out; the stage fills the content column.

Verification note: a long-running `next dev` (8 hours, 1.2 GB) turned the
fully-parallel draft specs into 75 timeouts; each failing test passed alone.
Against `next build` + `next start` (as CI runs) all 126 draft, board,
controls, setup and roll tests pass.

## S13 — Cheat sheet, Download menu, login, Your leagues

The sheet now starts from something. `startSheetFromRanking` writes the top 60
of the pool by `averagePirOf` — the order the room already sorts on — and only
onto an empty sheet, because a member with a ranking has made choices and a
one-tap overwrite is the one-way door the paste box already warns about. After
that, "Not on your sheet" lists the best twelve players the sheet lacks; Add
sends the existing `insert` operation at the bottom, so it inherits the
operation-on-the-wire safety (a double tap cannot rank anyone twice). Ranking
and suggestion logic is pure in `sheets/seed.ts` with unit tests; the pool read
(`readRankablePool`) lives in the framework-free store beside the matcher's.

The Download menu is a `<details>` of plain links to the existing export
handler, so it needs no JavaScript and every choice is a shareable URL. The
export page is unchanged and still reachable from the lobby door that
`export.spec.ts` walks.

Login dropped the empty board plan for a title screen, keeping the single
framed Sign in bank and every hook `auth.spec.ts` reads. Your leagues became
one card per league; the card's `<li>` carries the old `data-state`, and
`leagues.spec.ts` now finds the card from its title link by ancestor rather
than by direct parent.

Verification: cheat-sheet spec (78, two new), leagues, auth, a11y, export and
standings all pass against `next build` + `next start`. Run together with
other files on one machine, two cheat-sheet pool-count assertions flaked once
and passed on the file's own run.

## S14 — Mapping queue and stepwise imports

The plan asked for a strict one-at-a-time queue. It became a queue with a
cursor instead: the counter, the current row and the keyboard walk are one at a
time, but every question stays rendered and tappable. A hidden queue would let
only the first question be answered, and the mapping specs — like a
commissioner who came for one specific name — act on a particular row that is
rarely first when real imports or other runs have questions waiting.

Y and N submit the current row's own forms (`data-answer`), so the keyboard
path is the same server action, confirmation and refusal as a tap. Keys are
ignored while typing in a field. The progress bar carries `data-ready` from
`useHydrated`, the same fact-not-duration wait the pool uses; the new spec
walks J/K without answering, because a Y would write into a shared queue.

The imports already previewed before writing, so the change is the visible
step: `ImportSteps` (Paste, Review, Apply) in `broadcast.tsx`, derived from
state the forms already had.

## S15 — Polish and the second critique

Polish, driven by the captures (`npm run capture`, now pointable at a build
with `CAPTURE_BASE`) rather than by memory of the pages:

- Standings: the sticky team column is wide enough for a crest and a real team
  name (`--team-col`, 11.5rem on phones, 15rem from `sm`); honours group by
  kind with a count (`Badge.tally`), so "Crowned" is one line of crests with
  ×5 / ×2 rather than a badge per round; the podium stands on the table's rule.
- The draft pool row was cutting surnames to three letters on desktop. Its
  extras (games count, fantasy average, form line, portrait) were hidden by
  *viewport* breakpoints, and from `lg` the pool is one column of the room, so
  a 1440px screen gave the row everything a tablet does. They are container
  queries on the row now. Second cause, same symptom: `.player-portrait` and
  `.club-crest` were unlayered CSS, which beats every Tailwind utility, so the
  portrait's `hidden` never applied anywhere — the reason those call sites
  needed `!h-8 !w-7`. Both classes now sit in `@layer components`.
- a11y runs every surface under both grounds (`test.use({ colorScheme })`), and
  the standings honour glyph moved its label to `sr-only` text (axe refuses
  `aria-label` on a plain `span`).
- Test hygiene: `cleanupTestData` now deletes the test club's roster windows
  before its players. `roster_memberships.player` does not cascade, so the
  a11y court test's two players survived their test and appeared as an extra
  row in every later club-filtered pool count on the same worker — the
  "flaky" pool and cheat-sheet counts S13 recorded.

### The second critique

Scored from fresh captures of 18 surfaces at 1440px and on a Pixel 7, against
the same heuristics as the first. **31/40** (first: 22/40).

| # | Heuristic | Score | What holds it back |
|---|---|---|---|
| 1 | Visibility of system status | 4 | On-clock band, pick-is-in banner, provisional notes, live chips |
| 2 | Match with the real world | 3 | Broadcast words throughout; a recap headline treats every team name as plural ("Rimas win") |
| 3 | User control and freedom | 3 | Undo, start over, Escape, sheet operations; the roll still cannot be left from a shell-less stage |
| 4 | Consistency and standards | 3 | One board vocabulary; the Player Pool page and ingest summary still read as the older admin style |
| 5 | Error prevention | 4 | Arm-then-confirm picks, typed word to start over, sheet written only when empty |
| 6 | Recognition over recall | 3 | One name per destination; the desktop draft room is a long single column of controls above the pool |
| 7 | Flexibility and efficiency | 3 | Keyboard pool, J/K mapping queue, Download menu |
| 8 | Aesthetic and minimalist design | 3 | Every page has a hero; League Home on a phone still ends in members, export and delete |
| 9 | Error recovery | 3 | Refusals on the tapped row in the correction voice |
| 10 | Help and documentation | 2 | Inline sentences explain rules, but there is no single "how the league scores" page |

The P1 was fixed before the PR. On a 1440×900 screen the first pool row sat
at y=990, below the fold, under "Draft for me", the sound switch and five
rows of filters. From `lg` the two personal switches (and the sheet nudge)
now head the watching column, via a two-row grid where the pool spans both
rows; Position and PIR share one line; the sound switch lost a stray top
margin. Measured by the capture run: 890 after the filter change, 754 after
the move. Phones keep the old order.

Left open, in order: the shell-less roll stage (P2), League Home's phone tail (P2), a
singular/plural rule for recap headlines (P3), and a scoring explainer (P3).

Verification: lint, typecheck, knip and 1557 unit tests pass. Against
`next build` + `next start`, the full Playwright suite ran at 514–519 of 544;
the remainder were the four known local-only news tests (both projects) and
30-second timeouts under ten parallel workers on one laptop. Every non-news
failing file passed on its own run (205 and then 244 tests, zero failures).

## S16 — Header and lineup layout

The desktop shell header held one line: the league name (and, off League Home,
the page's name), directly above a page title that already says both — the
sidebar marks the page. From `lg` the sidebar carries the masthead and the
switcher, so the header is now drawn only while the side panel still needs its
toggle: the draft room, whose panel never docks, and `lg`–`xl` pages whose
panel has not become a column yet. Phones keep it for the masthead, switcher
and panel button. `shell.spec.ts` asserts the header is hidden at 1280px
instead of reading "Cheat Sheet" from it.

The lineup court was a 600 × 420 drawing stretched into a 1 : 1.08 box, which
made it taller than wide. It is redrawn at 40 units a metre to FIBA's
15 × 14 m half court and the box shares that ratio, so nothing is stretched;
it is up to 42rem wide. The discs went from 3.1rem to 4.5rem (3.6rem under
560px, 3rem under 400px) with larger badges and name tags.

The tiers' rows were full-width, so a desktop left a wide empty band between
each name and its controls. The tiers now stand in two columns once their
container reaches `@4xl` — Starting five beside Sixth man and Bench (five rows
each), Inactive and Not placed across the foot. Rows switch to one line by
their own list's width (`@sm`) rather than the viewport; in a narrow column
the Move button shows only its icon (the accessible name is unchanged) and a
long name wraps to two lines.

Verification: lint, typecheck and 1557 unit tests pass; `lineup.spec` and
`a11y.spec` pass on both projects (the draft-room a11y test timed out once
under a parallel run and passed on its own).

## S17 — Lineup on one screen

Asked for after comparing the page with the official game, whose whole lineup
— court, sixth man, bench, inactive — sits in one window. Ours spent a header
(eyebrow, "Lineup", a standfirst) restating what the page plainly is, then the
court, then thirteen full-width rows each carrying an armband radio, a role
select and a Move button.

The header is now one toolbar line: the team (the picker, for a manager), the
round stepper and the tip-off. With no `?round=` the page opens the round
`roundSchedule` already calls current — the earliest one with a game still to
play — instead of round 1; the side panel's Schedule tab shows the same round.

The court sits beside the tiers once the board is `@xl` wide, and its width is
also bounded by the viewport's height (`(100dvh − 18rem) × 15/14`, never below
17rem), so the court no longer pushes the bench off the screen. Discs and
name tags are sized in the court's own inline units, which replaced the two
viewport media queries. Sixth man, Bench and Inactive are compact cards: the
portrait, the surname, a position letter on the card's edge, club and fixture.

The grid view only listed the five with a "Make captain" link, so nobody could
be moved from it. It is now the whole lineup as a table — role select and
captain radio per row — and the court's cards no longer carry those controls.
That settles the Phase 11 critique's first open question (three ways to place a
player on every card). What the form posts is a hidden `role:<id>` per player
and one `captain`, written from state, so both views post the same thing. The
cost: without JavaScript the page shows the lineup but cannot change it.

Drag and drop is pointer-based (`lineup-drag.ts`), not HTML5 drag, which phones
do not do reliably. A mouse drags after 5px; a finger has to hold for 280ms
first, because a touch that moves at once is the page scrolling. A drop onto a
player swaps, onto the court or a tier moves, and it goes through the same
`place` a tap does. The click after a drag is swallowed so a drop does not
also pick the player up.

Verification: lint, typecheck, knip and 1557 unit tests pass; `lineup.spec`
(with a new mouse-drag test at 1600 × 1000) and the lineup `a11y.spec` (court
and grid) pass on both projects.

## S18 — Live points on the lineup, watching any team

The lineup page showed the plan and nothing of the night. Once any game of the
round has a recorded result or a live snapshot, each court name tag becomes a
two-part plate, after the official game's own: the surname on the court's dark
ink, the round's points beneath on paper, split by a rule in the position's
colour. A game in play prints `LIVE` beside the figure rather than leaning on a
red dot, a player still to play shows his tip-off clock, and a finished game
without a line reads `DNP`. The disc gives up a little height while plates are
drawn so three rows still fit the court. Tier cards and the grid show the same
figure; a live card carries the red LIVE badge.

The number is the Live page's, not a second calculation. `readMatchdayData`
was split so its per-player half (`readRoundScores`: recorded box score wins
over the live line for the same game) also feeds `readLineupLive`, and both
pages find a player's game and state through one pure `playerRoundOf`. The
lineup counts at the multiplier of where the player stands *now*, so dragging
someone to the bench halves his figure before anything is saved. The feed
component moved to `src/components/live-feed.tsx` and sits in the lineup
toolbar while the round is under way, so new snapshots refresh the page.

Live opens on your team, as before, and any member can now watch another one:
the "Whose team" picker (extracted from the lineup page as `TeamPicker`) sits in
the header beside the round stepper, and every row of the table is a link. The
scoreboard names the watched team with its crest and takes its colour
(`team-field`), and the table lights the watched row and marks yours "you".
Watching only reads, and every read already went through the viewer's own
token, which the league's rules allow for any member, so no rule changed. The
lineup page's picker stays commissioner and deputies only, because there it
opens a form that writes; "Open their lineup" on Live is offered to the same
people.

The tier cards' 3px coloured left border went: DESIGN.md refuses side stripes,
and the card already prints its position letter in a patch.

Verification: lint, typecheck, knip and 1660 unit tests pass (new cases for
`playerRoundOf` and `roundPointsOf`); `matchday.spec` (two new tests: live
points on a lineup card, and a member watching another team by picker and by
table) and `lineup.spec` pass on both projects. Screenshots at 390px in both
grounds and at 1440px checked the plates against the Live page's figures.

## S19 — Names first name first

The pool stores "Surname, First" because that is the order the Euroleague feed
gives, and matching, search, sorting and the CSV exports are built on it. People
read "First Surname", and "Vezenkov, Alexander" on every card read like a
spreadsheet. So the swap is display-only: `displayName` in
`src/lib/players/name.ts` turns the stored form round at the point a name is
drawn, and nothing that is stored or exported moves. A name with no comma (a
CSV-imported pool may not follow the feed) passes through whole, the same rule
the board's surname already followed; `surname` now lives beside it and
replaces the lineup's two unguarded copies and the board's `boardName`.

Chat sentences format inside `chat/messages.ts`, so every caller (the pick
pipeline, recorded trades, the fantasy sync, the recap's swing line) gets it at
once; formatting an already formatted name changes nothing. Lines already in
chat keep the order they were posted in. The mapping queue keeps stored names on
purpose: it compares a pool record with a feed record.

Verification: lint, typecheck, knip and 1665 unit tests pass (new `name.test.ts`;
six sentence tests updated to the new order). E2E gained `shown(name)` in
`helpers/session.ts`; the touched specs pass on both projects, except
`news.spec.ts`, which fails the same way on `main` (the local-only failure
STATUS.md already records). Seven draft tests timed out under the full
parallel run and passed on a rerun with two workers.

## S20 — A round in progress is not a finished round

`recomputeStandings` writes a round's snapshot after the round's first recorded
game, so it can update the table all evening. Every reader took the newest
snapshot as a finished round: League Home told the story of a round half
played, Recap crowned a winner with four games to go, and the standings drew
crowns, spoons and "on fire" for it. The snapshot is right to exist early; the
readers were wrong to treat it as final.

So the fact moved into one pure function. `roundProgress` takes the season's
fixtures and the league's snapshot rounds and returns the set of rounds that
are over (a snapshot and no unplayed game; a set, not a threshold, because a
postponed game keeps its round open while later rounds finish) and the round
being played, using the lineup's existing "earliest round with a game to play"
rule. With no stored schedule every snapshot round counts as finished, which is
what the pages did before, so a league whose fixtures were never ingested loses
nothing. `completedOnly` filters snapshots for anything that crowns.

League Home's hero, during a round, is a live scorebug in Live's own numbers
(`readMatchdayData`), so Home and Live can never disagree; the story and ticker
are about the last finished round. Recap keeps the open round in its picker and
says what it is: provisional banner, "lead" for "win", "Sitting last" for the
spoon, and no crown or spoon moment, since a moment plays once and a crown
taken back at the last game cannot be un-played.

Verification: lint, typecheck, knip and 1677 unit tests pass (new
`progress.test.ts`, `liveRound` cases in `dashboard.test.ts`). A new recap E2E
plants one played and one unplayed round-2 game in a season of its own per
project (fixtures are season-wide, so a shared season would reopen a round
under another spec) and passes on both projects. Locally `season-dashboard` and
`league-stats` fail on this machine's real schedule, where round 2 still has
games to play; STATUS.md records it beside the news spec.

CI then failed the same two dashboard specs on a fresh database. Attaching a
person code on the mapping page re-imports that player's games, and the import
stores the real season's schedule, whose round 3 was being played that night.
`player-mapping.spec` did that under `STATS_FETCH=off`, so every E2026 league in
the run looked mid-round. The re-import now honours `STATS_FETCH=off`, like the
worker.

## S21 — Drag-only lineup, profile with this round

The court had two ways to move a player, a drag and a tap-then-tap, and the
tap won every argument it had with a person who only wanted to look at a
player: a tap picked him up. With drag working on mouse and touch (the hold
before a touch drag keeps the page scrollable), the tap is free for what people
tried to do with it, which is open the player. `lineup-drag.ts` already
swallowed the click a drop ends with, so a drag never also opens a profile.
The grid view remains the path without a drag: a role select and a captain
radio per row.

The captaincy moved into the profile because it is a fact about one player and
the profile is where that player is on screen; the sticky bar's "Make captain"
only ever appeared with a player in hand, which no longer exists. The modal's
`action` slot is a plain node: the lineup closes the profile by unmounting it
and puts focus back on the card it came from.

"This round" is pure (`currentGameOf`) so the recorded-over-live rule is
tested once: a recorded box score is what the standings counted, so it wins
over the provisional feed. The API takes `?round=` so a lineup's profile talks
about that lineup's round rather than whatever round the season is on.

Verification: lint, typecheck, knip and 1683 unit tests pass (new
`current-game.test.ts`). The lineup spec's tap test now opens a profile, gives
the armband from it and checks the grid's radio; the drag test asserts no
profile opened on a drop; the matchday spec opens a live player's profile and
reads the same stat line and 16.5 as Live. Lineup, matchday, players and a11y
specs pass on both projects.

## S22 — Schedule tab drawn like Live's Games

The panel's Schedule was a list of "OLY vs PAN" with a time, and only a final
score once the result was stored, so during a round it said nothing about the
games being played. Live already drew a game well. The tile moved to
`components/game-tile.tsx` without hooks so the server-rendered Live page and
the client-rendered panel draw the same thing, and the score rule (feed first,
then result) is one tested `gameScores`. The panel's read gained one query, the
round's live snapshots, and works out each game's state on the server with the
same `gameStateOf` as Live. The dashboard's "next tip-off" now looks only at
games still scheduled, which is what it meant.

Verification: lint, typecheck, knip and 1686 unit tests pass (new
`game-tile.test.ts`). The matchday spec opens the lineup's side panel on a
planted live round-38 game and finds a `LIVE` tile with its score; parallel
workers each plant one, so it takes the first live tile. Matchday and panel
specs pass on both projects.

## S23 — One trade, one row on My Team

The Trades page already folded a sync's drop and add into one exchange, but My
Team scored each row on its own, so one deal showed as a release and a signing
with two numbers. Before changing the rule, the production rows were read
(read-only, 1 October): 32 rows, 16 drops and 16 adds, all written by the sync
in three sittings. Twelve are one-for-one pairs; two are one team dropping two
players and adding two in the same minute — the old rule only paired a single
drop with a single add, so those two split everywhere. No row was ever a
`trade`: the official game has none, so a swap between friends arrives as each
team's drop and add.

The rule now pairs all of one team's drops and adds in one round whose rows
were written within two minutes of each other, provided every row has a note
and no player appears on both sides (a release and re-signing is two moves, not
a trade). Notes are not compared, so a pair recorded by hand with two
differently worded notes still reads as one move. Separately, when team A dropped a player team B
added and B dropped a player A added in the same round, the four rows are one
two-sided trade. Swaps are matched first, so a crossing
deal is never claimed as two exchanges. `readMemberDeals` groups the whole
league's rows, not just this team's, because a swap's other half is someone
else's row, then keeps the events that name this team and sums their impact
and round deltas. Run over production's 32 rows the grouping gives 14 events,
twelve 1-for-1 and two 2-for-2, none left alone. The sync's own chat lines are
unchanged: a several-for-several sync still announces a drop and a signing.

Verification: lint, typecheck, knip and 1691 unit tests pass (`history.test.ts`
covers any-count syncs, separate teams, rounds and sittings, and the two-team
swap). The season-dashboard spec now opens My Team after a planted drop and add
and finds one transaction row reading "exchanged"; transactions and trades
specs pass.

## S24 — Stats you would open twice

Stats was a record book people read once. The new hero is the waffle board,
the one view that answers "how has everyone's season gone" at a glance; each
cell prints its rank so the gold-to-red tint is never the only signal, and the
tint is mixed into the panel so the number reads in both grounds. The four new
sections each ask a question the league argues about: was my lineup wrong
(hindsight), was my captain wrong (regret), how do I do against him
(head-to-head), and whose players carried me (clubs).

Hindsight uses the lineup optimizer the Lineup page already ships, fed the
round's real points instead of estimates, so "best" means the best legal
formation with its own captain, sixth man and bench. A carried lineup that
never named a new arrival scores him at 100%, which can beat every legal
lineup; the best is then taken as what actually happened rather than
reporting over 100%. Rounds nobody recorded (everyone at 100%) are not judged,
same as Lineup efficiency. Captain regret needs to know the five starters, not
just who scored ×1, so the read now resolves the lineups once and hands both
the weights and the slots to the pure layer. Club loyalty counts the club on
the box score, so a player who moves mid-season credits each club for its own
nights; a line without a club code falls back to the player's current club.

While building this, `leagueStats` turned out to count every box-score line of
the season, including the round being played, even though S20 had narrowed
the snapshots to finished rounds. It now drops lines from rounds with no
finished snapshot before any section sees them, so records, leaders and the
new sections agree on what "the season so far" is.

The honours explainer is a small client component because the plan's "CSS
popover" alone cannot open on a phone: mobile has no hover, and Safari does
not focus a tapped button. Hover is CSS; keyboard focus opens it only when
`:focus-visible` matches (so a mouse click is not counted twice); tap toggles;
Escape and blur close it. Draft value no longer compares autodraft with
people; `StatsPick` and the picks read lost `is_auto` with it.

Verification: lint, typecheck, knip and 1700 unit tests pass (`league-stats.test.ts`
works the waffle, head-to-head, hindsight 790 of 925 = 85%, captain regret
and club loyalty out by hand on a seven-man squad). `league-stats.spec` checks
the waffle, head-to-head and its form, a tap on an honour and the new empty
states. Run against a fresh PocketBase (as CI does) the stats, standings and
season-dashboard specs pass on both projects; on a local database whose
schedule still has a round 2 game to play they fail as already noted in STATUS.

## S25 — League Home: the round so far

Feedback after S20: on the second day of round 3, League Home's story still
said "Round 2 story", so the page read as if two rounds had passed. S20 had
been right that an open round has no winner and no spoon, but wrong to show
nothing of it: the friends on the couch want to know how the round is shaping
up, and Recap already had the provisional language for that.

The story panel now tells the open round in the figures the hero and the
table already use. `readMatchdayData` computes the provisional ranks from
recorded box scores plus the live feed; pure `liveRecap` reorders those ranks
by the round's own points into a `Recap`, so `roundStory` works unchanged and
the panel says "X lead by Y". The best night so far comes from the same read,
using Recap's own `bestNight` rule (now exported), weighed by each owner's
lineup over the same merged lines. Using `readLeagueRecap` for the open round
instead would have been one call, but it skips live lines, so the panel could
disagree with the hero beside it; that difference on the Recap page itself is
now a debt row.

The ladder moved out of Recap into `RoundLadder`, so both pages draw one
thing; `marks` is the crown and spoon, off while the round is open. No moment
plays for an open round. A round that has tipped off with nobody scoring yet
says so instead of drawing an all-zero ladder.

Verification: `story.test.ts` covers the ladder order, the tie-break, an
unscored round and the best night. Checked on a local database whose schedule
leaves round 2 open: Home shows "Round 2 so far", the ladder and the best
night, and Recap still draws its own ladder through the shared component.

## S26 — Theme switch

ADR-0011 chose "no in-app switch" when the light ground was new; the owner
asked for one, so the reader can now hold Light or Dark and System stays the
default. The amendment is in the ADR.

The light tokens are one block under `:root[data-theme="light"]` rather than a
`prefers-color-scheme` query, so there is still exactly one place each value
lives (and `tokens.test.ts` parses it). A head script writes `data-theme`
before the body paints: from the `theme` cookie, or from `matchMedia` on
System, with a change listener so System still follows the phone at sunset.
The script cannot import, so `theme.test.ts` executes the script string
against the module's own `themeChoiceFrom` / `groundOf` for every cookie and
device combination. `<html>` carries `suppressHydrationWarning` again, for the
one attribute the server cannot know; Phase 10 had removed it with the old
switch.

The first cut was a three-way segmented control above the account. The
`shell.spec` guard that the full season sidebar fits a 690px screen failed by
exactly its 51px, so the sidebar has one 44px button beside the account name
that cycles System → Light → Dark and names the current choice and the next
one to assistive tech. The phone's More sheet has room, so it spells the three
out as native radios. A second E2E bug was in the test: a click before
hydration landed on the server's "System" default, so the spec now waits for
the hydrated `data-choice`.

Verification: `theme.test.ts`, `tokens.test.ts`; `design.spec` (no choice
follows the device; a held ground survives a reload and ignores the device;
back to System follows it again) and `shell.spec` on both projects.

## S27 — Stats: compact, explained, linked

Feedback on S24: the page explained itself in paragraphs, four panels each
took a full row, and several numbers had no word for what they measured.

**Explanations behind an "i".** `InfoTip` generalises the mechanics S24 wrote
for `HonourChip` (hover by CSS state, focus only when `:focus-visible`, tap
toggles, Escape and blur close) and fixes its one flaw: the tip was pinned to
the left edge and ran off a phone's right side, so it now measures the trigger
and opens toward the side with room. The "i" is an 18px ring in `ink-faint`
with a 42px invisible hit area. `Bank` takes `info`; every paragraph under a
Stats heading moved into one, and each column head of the team tables has a
one-line tip in plain words ("Rounds finished in the top three").

**The spoon.** S24's "Spoon collector" needed two last places, so after two
finished rounds nobody had one while "Crowned" was on show; it read as if
spoons were gone. A spoon is now an honour from the first last place, worded
like the crown ("Wooden spoon", "Wooden spoon ×2"); the id stays
`spoon-collector` so stored moment keys are unchanged.

**Layout.** Team profiles keep one full-width table but draw each team's
worst-to-best range on a single league scale with the average marked, so the
steady and the streaky read at a glance; "Spread" was a statistician's word
and is now Swing. Head-to-head is one row; its strip is a client component so
a hover, focus or tap names the round under the bars instead of a legend.
Lineup efficiency, Captain regret, Hindsight and the Deal ledger are two rows
of two; the three lineup tables share `TeamTable` (team, then two labelled
figures). The ledger is the Trades page's diverging bar, extracted as
`MarketBars`. Captain regret no longer names who wore the armband.

**Club colours.** `lib/clubs/colors.ts` holds one OKLCH colour per E2026
club, from each club's kit and crest as published on teamcolorcodes.com and
colorcodeguide.com (checked 2 October 2026): Žalgiris green, Olympiacos red,
Panathinaikos green, Fenerbahçe and Maccabi yellow, Valencia orange, Real
Madrid's purple, Barcelona's garnet, Efes's light blue, Baskonia's navy lifted
to a mid blue. Partizan, Virtus, ASVEL, Paris, Beşiktaş and Dubai play in
black and white and are neutral greys at different lightness. Every colour is
held between L 0.46 and 0.86 so a bar reads on both grounds (tested), and a
club bar always sits beside its crest, so colour is never the only word.

Verification: unit tests (spoon at one, club colours over the 20 pool clubs);
`league-stats.spec` adds the two spoons, a section's "i" and a team link;
`standings.spec` and `transactions.spec` pass with the shared `HonourChip` and
`MarketBars`.

## S28 — Readable URLs

The owner pasted `/leagues/s7bq8d0rndsrzx5/teams/e5n7nn3xhghfv9c` and asked
for addresses a person can read and remember. They are now `/l/<league>` and
`/l/<league>/<team>`, and a player is `/players/<name>`.

**Shape.** `/l/` rather than `/leagues/` because the league is in every
address and the word added nothing; the team sits directly under its league
rather than under `/teams/`, so a team cannot be named like one of the
league's pages (`RESERVED_TEAM_SLUGS`, "Stats" becomes `stats-team`). Next's
static segments win over `[team]`, but a slug that shadowed one would make the
team unreachable, which is the bug the reserved list exists for.

**Storage, not derivation.** A slug derived from the name at read time would
need a lookup by a non-unique computed value and would move whenever a name
changed in the official sync. So it is stored, with partial unique indexes on
`slug != ''` (PocketBase accepts a `WHERE` in an index), unique per league for
teams. The migration only adds fields and indexes: generating slugs needs the
same diacritic folding as the app, and duplicating that in a goja migration
was a second implementation to keep in step. TypeScript writes them on create,
join and rename, and `ensureSlugs` fills every row without one (the worker at
boot and hourly, `npm run slugs:backfill` by hand). Until a row has one its
links use its id, and every lookup is `slug = ref || id = ref`, so a missing
slug is never a broken page. Failure recovery: each write is one field on one
record; a raced slug is refused by the index and the next pass picks another.

**Every address through one module.** `lib/nav/urls.ts` (`leagueHref`,
`teamHref`, `playerHref`, `leaguePaths`) replaced about a hundred template
strings. Pages pass their client components the league's base and each
team's address (`LeaguePaths`) rather than a builder function, which a client
component cannot receive. Server actions know only a league id, so instead of
reading the slug to revalidate one league they call `revalidateLeague()`
(every `/l/[league]` page, through a pass-through layout); the three that
redirect read the slug once (`leaguePathOf`).

**Old links.** Addresses already pasted into the league's chat keep working:
`app/leagues/[...rest]/route.ts` reads the league with the viewer's token
(so a stranger still gets a 404) and answers 308 with the query string kept.
League Home, a team page and a player page opened by id redirect to the slug;
other pages opened by id simply work. The proxy stays optimistic and never
talks to PocketBase, as its header promises.

Left for S29: player links inside pages still carry the id (the pool and
panel do not read slugs) and redirect on arrival; the profile modal's "Full
profile" link already uses the slug from `/api/players/[id]`.

Verification: `slug.test.ts`, `store.test.ts` (the fake now enforces the slug
indexes), `urls.test.ts`; `pb:verify` checks the indexes, the slug pattern and
that a member cannot set an address. `addresses.spec.ts` follows the old
addresses to the new ones and reads the nav's hrefs; every spec now opens
`/l/…`. 121 of the affected E2E tests pass locally; the two season-dashboard
failures are the local-schedule ones STATUS already records.

## S29 — Player pool inside the league

"Full profile and game log" left the league: `/players/<id>` is a global page,
so the sidebar lost its League group and the way back was the browser's.
Only the team page passed `?league=`.

The pool and the profile are now League pages as well as global ones:
`/l/<league>/players` and `/l/<league>/players/<player>` render the same
`PoolPage` and `PlayerProfilePage` as `/players` and `/players/<id>`, with the
league's nav. Rather than threading a league through every component that
draws a player, `AppShell` wraps its body in `LeagueLinksProvider` (the
league's base address) and `PlayerStatsLink` and the lineup's modal ask
`usePlayerHref()` for a player's address, so the panel, the pool, Stats and
the lineup all link inside the league without knowing they are in one. The
modal's "Full profile" link swaps the id for the slug it reads from
`/api/players/[id]` (S28).

The profile canonicalises: whatever address it was opened by (an id, a stale
league segment, or the pre-S29 `/players/<id>?league=…&member=…`), it
redirects to `playerHref(player, league)` and keeps the roster to return to
as `?member=<team>`. An unknown league is a 404, not a silent drop to the
global page.

**Nav.** Player Pool joins the League group inside a league and leaves the
EuroLeague group there; outside a league it stays where it was. That made the
commissioner's season sidebar overflow by 36px on a 690px screen, exactly one
group header, which `shell.spec` guards. The Manage group's three roster
tools moved into EuroLeague for managers (they act on EuroLeague data), so
every row keeps its 44px target and the nav fits again. The direction
contract in `layout.tsx` says so.

Verification: `items.test.ts` (pool placement, manager tools in EuroLeague),
`addresses.spec` (the league pool is current in the League group; a profile
by id and the old `?league=` form both settle on
`/l/<league>/players/<name>`), `shell.spec`, `design.spec`, `roster.spec`,
`players.spec`, `pool.spec` (26/26 alone; under seven parallel specs on the
dev server its pick confirmations time out, which is load).

