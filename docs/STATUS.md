# Status

**What is done, what is next.** This file is the single answer to "where is this
project?" — read it before proposing work, and update it in the same PR that
changes what it describes.

It is deliberately *not* the plan. The plan is
[EUROVAFLIAI_BLUEPRINT.md](EUROVAFLIAI_BLUEPRINT.md) and it does not move; this
file records how far through it we are. When the two disagree, the blueprint
defines the target and this file is wrong.

It is also deliberately *not* the story. The narrative behind each slice — why
a decision went the way it did, what was checked on the box after a deploy,
which bug each test found — lives in [`docs/log/`](log/README.md). This file
keeps the tables, the open debt, the next step and the current phase's
"Try it" notes, so that it fits on a few screens and stays true.

> **Production tracks `main`.** Every merge deploys itself — CI green on `main`
> triggers the deploy workflow — so "what is live" is always just `main`, and
> this file names no SHA, because a SHA here is a line that goes stale on the
> next merge and then quietly misleads. Live at
> [eurovafliai.com](https://eurovafliai.com).

## Custom domain cutover

`eurovafliai.com` points to the existing VPS and serves the app over HTTPS.
`www` and the old `eurovafliai.labrium.online` address redirect to the root
name. The production public URLs and Google OAuth callback have been updated;
DNS, TLS, `/login`, PocketBase health, the admin deny rule and the first live
realtime event were verified on 5 October 2026. A completed Google sign-in on
the new domain still needs a user check. See
[log/domain-cutover-2026-10-05.md](log/domain-cutover-2026-10-05.md).

## BasketNews Hostinger league

The BasketNews Draft import is implemented as a **separate** league from
EuroVafliai 26-27. Creating Hostinger CA$HiorAI with the Einikio Kabliai team
URL queues a worker import of nine teams, 117 draft picks, roster windows,
lineups and official round scores. The other eight teams receive placeholder
accounts. The worker checks for new rounds every 15 minutes; Sync now queues a
pass. BasketNews totals remain authoritative when EuroLeague stats are ingested.

Migration `1790500000_basketnews_sync.js` is live, the BasketNews session is set
on the worker, and Hostinger CA$HiorAI has its own production league. Its nine
teams, 117 picks and three completed rounds are imported. All 27 stored team
round totals match BasketNews exactly. See
[log/basketnews-import.md](log/basketnews-import.md) for the source evidence,
query plans and recovery checks.

BasketNews player positions now sync into a separate source field. Its league
uses those positions in rosters, lineups, the draft, stats, player profiles and
pool views; EuroVafliai 26-27 keeps the EuroLeague positions. The seven
differences among the 130 captured BasketNews players are recorded in the log.

**Parity with EuroVafliai 26-27 (8 October 2026).** The first import treated a
BasketNews league as a mirror of finished rounds only. That hid Live and
labelled every stored round finished. It also froze round 4 at its Tuesday-night
partial scores, because the sync never re-read a round that had a score.
Production showed every pass since then reading zero rounds, so no trade had
synced since.
- **Round state.** It now comes from fixtures (`readRoundProgress`) for every
  league.
- **Live.** Matchday and the live scorebug are back. They use the EuroLeague
  live feed scored with BasketNews Modern (`basketNewsTenths`), and recorded
  games read `basketnews_raw_pts`.
- **Final results.** A round's BasketNews result is `final` only once its
  games are played. Until then, every pass re-reads it.
- **Rosters and trades.** Each pass also reads BasketNews's public league-wide
  lineups (`draftLeagueFantasyTeamLineupsFromClient`), so a processed transfer
  lands within 15 minutes, before its round tips off. Other teams' lineups for
  a round that has not locked are private, so the per-team read cannot do this.
- **No roster replay.** A re-read below the newest stored round never replays
  rosters.

Lineup, roster and trade writes stay BasketNews-owned. See the log for details.

**Try it on localhost:**
- Run `npm run dev` during a round with a BasketNews league in the local
  database.
- Open `/l/<league>/matchday`. Live is in the nav and shows provisional points.
- Standings reads "So far" for the round being played. Recap marks it "in
  progress".
- After the next worker pass, `/l/<league>/transactions` lists any transfer
  BasketNews has processed for the next round.

## Player mapping, 5 October 2026

The commissioner confirmed six news-to-player identities, A.J. Lawson, and
three new players named in box scores. The live pool now has Bandja Sy,
Bryant Dunston and Nick Smith Jr under their official feed codes; a targeted
re-import restored six missing game lines. Only George Papas and Lorenzo Brown
remain unmatched in the news queue, by decision, because neither has a player
in the current pool or roster feed. Player-facing names use the familiar forms
for the confirmed players while the stored feed names remain the matching keys.
See [log/player-mapping-2026-10-05.md](log/player-mapping-2026-10-05.md).

## Welcome page, 5 October 2026

`/login` welcomes anyone with **EuroLeague Fantasy Draft**, a short account of
creating a league, drafting with friends and following the season, and one
Google sign-in action. Creating an account needs no invite. A league's invite
code is used after sign-in to join that league. The hero uses text-free draft
board artwork with a separate phone crop; a three-step How it works section
rotates while visible, pauses on interaction and starts paused for reduced
motion. Existing deep-link guidance and sign-in corrections remain. See
[log/matchnight.md](log/matchnight.md) for the design and verification record.

## In progress: Matchnight redesign (ADR-0011)

A full visual and experience refresh after a design critique scored the arena
interface 22/40. The direction is a matchnight broadcast: two grounds that follow
the device, Barlow Condensed for headlines and scores, Tip-off orange as the one
act, a colour-and-monogram crest for every member's team, one hero fact per page,
and a small set of celebration moments. Built on the `matchnight-redesign` branch,
one commit per slice. The story is in [log/matchnight.md](log/matchnight.md).

| Slice | State | What changed |
|---|---|---|
| S0 Concept gallery | Done | `/concepts` (development only, invented data): fonts, palettes in both grounds, crests, moments with replay, two variants of nine screens. |
| S1 Foundation | Done | Two measured grounds, display face, restyled board vocabulary, `PageHeader`/`ScoreFigure`/`StatusBadge`/`RoundStepper`/`TeamCrest`/`Moment`, shell colours tokenised, the critique's six bugs fixed, season control hidden while there is one season. |
| S2 Team identity | Done | Migration `1790100000` adds optional `team_color` / `team_crest` to `league_members`; a member who never chose gets a default from their place. `setTeamIdentity` (own team any time, managers anyone's). Picker in the lobby and on the team page; crests beside names in the lobby, chat, draft board and radar. |
| S3 Shell and nav | Done | Phone tabs Home, Lineup, Live, Table, More in season (Home, Draft, Sheet, Players while drafting). One name per destination: "Live", "Standings". Cheat Sheet leaves the nav once the draft is done; Export leaves it (still reachable from League Home until S13). Manage shows how many mapping questions wait. Compact phone header, tokenised sidebar and panel toggle. |
| S4 League Home | Done | Your team as the hero (crest, rank at scoreboard size, total, who you passed, the next tip-off, Set lineup), a round ticker, the table with crests and gaps beside the round's story (crowned winner, best night with portrait, wooden spoon, biggest swing), a roster summary, then chat. Overtake, crown, sweep and spoon moments play once per viewer. The 13-card roster moved to My Team; the mapping notice is in Manage's count during the season. |
| S5 Live | Done | A scoreboard: your round total and provisional or final rank first, with finished / playing now / still to play chips; your players with counted points (role multiplier applied, captain marked C×2 in gold), status badges and Vilnius tip-off times; game tiles with club crests; a crested table. The typed round field is a ‹ Round › stepper. |
| S6 Lineup | Done | The court is the first panel, on hardwood, with formation pills and the court/grid switch under it; the round is a stepper and the header says when the round tips off (it does not claim a lock — lineups are recorded after the fact). Tiers are compact rows: a gold C×2 armband radio, a role pill and a Move button per player — every control and accessible name the form posts and the specs use is kept. |
| S7 Standings | Done | A podium for the top three, the honours earned so far (On fire, Crowned, Spoon collector — pure `season/badges.ts`), then the table with crests, a gap-to-leader column, each round's winner in gold with a crown, and the viewer's row lit. Only phases with counted rounds are offered. The provisional note is gold guidance, not a red error. Overtake plays on the viewer's row and a new badge flips in, once each. |
| S8 Recap | Done | A front page: a headline written from the night ("X win round 3 by 32.4", "Y take the wooden spoon"), the winner's banner with a dropping crown and gold sweep, the night as a colour-coded ladder, the best night with portrait, the wooden spoon (swinging once) and the biggest swing. Rounds are chips, not a select. |
| S9 Trades | Done | "Who is winning the market": net points since each deal per team, as a diverging bar. Then every deal as a card — each side's players out and in with portraits, from which round, and a live verdict stamped Winning or Losing (the same lineup-weighted `impactForMember` the team page and recap use, via the new `readLeagueDeals`). Team filter chips. Record a trade gets the new header; its two-column builder and announcement preview stay. |
| S10 League Stats | Done | New `/leagues/[id]/stats` and a Stats nav item. Record book (highest and lowest round, biggest margin, best single night, best captain call), honours, team profiles (average, best, worst, spread, rounds won, top-3, spoons), lineup efficiency (bench points lost, captain hit rate), draft value (steals, busts, autodraft vs people), players of the season (top, hot, best free agents, by position) and the deal ledger. Pure `stats/league-stats.ts`, one query in `league-stats-queries.ts`. |
| S11 Team, player, pool | Done | My Team: crest header, "Carrying you" / "On thin ice", the roster grouped G/F/C with injury badges, season points (raw, while on this roster), last round, form and next opponent; the radar is gone and the crest editor sits at the foot. Player profile: a card hero (portrait, club, badge, current PIR) and a game-log table with heat shading. Pool: ranked by the same average PIR the draft uses, with position, Injured and sort filters; the ingest summary is folded for members. News keeps S1's Out / Doubtful badges; an ownership filter needs a league context the global news page does not have, and is left to the side panel. |
| S12 Draft and roll | Done | The on-clock band carries the picker's crest at headline size. Every landed pick raises a "The pick is in" lower-third for the whole room (team crest, player, position, pick number, AUTO when the worker made it) with a short two-note sting where cues are on; a first paint or reload shows nothing. A finished draft reads "That's the draft", links to the standings and to Stats' steals and busts, and folds undo / start over behind "Commissioner tools". The roll is a stage: a lattice panel, the drawn team's crest and name at display size, crests down the order, and a gold "First pick" reveal. The full-screen shell-less stage from the plan is not done: the roll still renders inside the league shell. |
| S13 Sheet, export, login, leagues | Done | Login was later reworked as the public welcome page described above: one Google action and a three-step explainer, without the season's three figures. Your leagues is one big card per league whose button is the likely next act (lobby, draft room, lineup, final table). A Download menu (results CSV, rosters CSV, everything JSON, or choose) sits on the standings header and above the draft board; `/export` stays for the full picker and deep links, and the lobby door still leads there. An empty cheat sheet offers "Use the PIR ranking" — the top 60 by the draft's own average PIR (pure `sheets/seed.ts`), written only onto an empty sheet — and a sheet with rows gets "Not on your sheet", the best 12 unranked players with an Add button (the existing `insert` operation). Paste stays below. The plan's "star" is the Add button; there is no separate favourites list. |
| S14 Commissioner pages | Done | Mapping is a queue: "Question 3 of 23" across feed names, box-score codes and news names, one current row (the board's keyboard-cursor outline), J / K to move, Y / N to answer the current question. A rename is two records side by side, "In the pool" and "In the feed". Every row stays on the page and answerable by tap — the specs (and a commissioner) act on a specific question, not only the first. Roster and stat imports show Paste → Review → Apply, derived from the form's own state (a plan on screen is Review, a stored result is done). |
| S15 Polish and re-critique | Done | Re-scored **31/40** (from 22). Standings' team column fits a crest and name, honours group with counts. The draft pool row sizes its extras by the row (container queries), so desktop no longer cuts surnames to three letters; portrait and club crest CSS moved into `@layer components` so `hidden` works on them. a11y runs every surface in both grounds. E2E cleanup removes roster windows before players, which fixes the pool-count flake. On a laptop the draft room's "Draft for me" and sound switches head the watching column, so the first pool row sits at 754px of a 900px screen (it was 990). Open from the critique: the roll stage is not shell-less (P2), League Home's phone tail (P2), recap headlines are always plural (P3), no scoring explainer page (P3). |
| S16 Header and lineup layout | Done | From `lg` the shell header no longer repeats the league name above the page's own title; it is drawn only while the side panel still needs its toggle (the draft room, and `lg`–`xl` pages with a docked panel). The lineup court is drawn to FIBA's 15 × 14 m half court (key, arc with corner lines, restricted area, hoop) and up to 42rem wide; player discs are 4.5rem on desktop. The tiers stand in two columns once the list has room (container query): Starting five beside Sixth man and Bench, Inactive across the foot. In a narrow column a row's Move button is its icon and long names wrap to two lines. |
| S17 Lineup on one screen | Done | The page header is one toolbar (team or picker, round stepper, tip-off); with no `?round=` the page opens the current round (earliest with a game to play) instead of round 1. The court stands beside Sixth man, Bench and Inactive as compact cards, and its width is bounded by the viewport's height so the lineup fits one window. Players move by drag (mouse at once, touch after a short hold) or tap. The grid view is now the whole lineup as a table with a role select and captain radio per row — the court's cards no longer carry them. The form posts hidden fields from state, so without JavaScript the lineup can be read but not changed. |
| S18 Live points on the lineup, watching any team | Done | Once a round tips off, each court name tag becomes a scoreboard plate (surname over the round's points, split by the position colour, `LIVE` while the game is on, the tip-off clock until it starts, `DNP` after) and the tier cards and grid show the same figure. It is the Live page's number: one `readRoundScores` and one pure `playerRoundOf` feed both, counted at the multiplier of where the player stands now. The lineup toolbar shows the feed status and refreshes on new snapshots. On Live, any member picks whose team to watch (the lineup's "Whose team" picker, now a shared `TeamPicker`) or taps a row in the table; the scoreboard names the team with its crest and colour. The lineup page's picker is still commissioner and deputies only. The tier cards lost their coloured left border (a DESIGN.md ban); the position patch already says G/F/C. |
| S19 Names first name first | Done | Every screen prints a player as "Alexander Vezenkov", not the stored "Vezenkov, Alexander": one pure `displayName` (and `surname`, which replaces three local copies, including the board's `boardName`) in `src/lib/players/name.ts`, applied where a name is drawn. New chat lines (picks, trades, drops, adds, lineups) and sync summaries use it too. The stored name, matching, search, sorting, CSV exports and chat lines already posted are unchanged. The mapping queue still shows stored names, because it compares records. A name with no comma passes through whole. |
| S20 A round in progress is not a finished round | Done | `recomputeStandings` writes a round's snapshot after its first finished game, and every page used to treat the newest snapshot as a finished round. A pure `roundProgress` (`src/lib/fixtures/progress.ts`) now says which snapshot rounds have no game left (`complete`, `lastComplete`) and which round is being played (`current`: started, played, total). Crowns, spoons, honours, overtake moments, the Stats page and League Home's round story read only complete rounds. During a round League Home's hero is a live scorebug (provisional round score and rank from Live's own `readMatchdayData`, games played, `LIVE` while a game is on, **Watch live**); the table labels its round column "So far" and drops arrows. Recap opens on the last finished round; a round in progress stays in the picker marked "in progress" and reads provisional: a banner with games played, "X lead round N", "Leading so far" without a crown, "Sitting last" instead of the wooden spoon, no moments. With no stored schedule a snapshot round counts as finished, as before. |
| S21 Drag-only lineup, profile with this round | Done | The court and tier cards move players by drag only; tap-to-place (a player "in hand", "Start here" / "Move here") is gone and open places are passive drop slots. A click that is not the end of a drag opens the player's profile (`PlayerStatsModal`, now exported with an `action` slot); for a starter it holds **Make captain ×2**, or says **Captain ×2** for the current one. The grid stays the keyboard and no-drag path. The profile (`readPlayerProfile`, `/api/players/[id]?round=`) gains `currentGame`, from pure `live/current-game.ts`: opponent and venue, state via `gameStateOf`, tip-off, and PIR, fantasy points and stat line from the recorded box score, else the live snapshot by `person_code`. The modal draws it as "This round" above Recent games; from a lineup it is that lineup's round. `GAME_BADGE` moved to `broadcast.tsx`. |
| S22 Schedule tab drawn like Live's Games | Done | Live's Games tile is now `GameTile` (`src/components/game-tile.tsx`, no hooks, so the server page and the client panel share it): the `GAME_BADGE` state, the tip-off while scheduled, each club's crest and name, and the score from pure `gameScores` (live snapshot first, then the stored result). The side panel's Schedule tab draws the round as a column of these tiles with full club names. `readPanel` also reads the round's live snapshots, so a game in play shows `LIVE` and its score; `PanelGame` carries `state` and nullable scores instead of `played`. |
| S23 One trade, one row on My Team | Done | The official game has no trades, so a sync writes every move as drops and adds. `groupTransactionHistory` (`memberships/history.ts`) now pairs **all** of one team's drops and adds from one sync (same round, each row within two minutes of the last, a note on every row, no player on both sides) at any count, and reads two teams in one round that each added a player the other dropped as one two-sided trade (`swap`). `readMemberDeals` groups the whole league's rows the same way and sums each group's impact, so My Team shows one row per deal; the dashboard's Trades tab and the Trades page use the same events. `announceExchange` takes lists. Checked against production on 1 October: its 32 rows (16 drops, 16 adds) become 14 exchanges, two of them 2-for-2 that used to split. |
| S24 Stats you would open twice | Done | Stats opens on a **waffle board**: teams down in table order, finished rounds across, each cell the round's finish printed as a number and tinted from gold (1st) to `loss` (last) over the `lattice`. New sections, all pure in `stats/league-stats.ts` and over finished rounds only (box-score lines from an unfinished round are now dropped before any section counts them): **Hindsight lineup** (each recorded round replayed through `optimizeLineup` with the squad's real points; a season "lineup IQ %" and the round that left most behind), **Captain regret** (the armband against the best starter of the five, summed, with perfect calls), **Head-to-head** (a GET form with two team selects, `?a=&b=#h2h`; rounds won each and a margin strip), **Club loyalty** (counted points by the club a player wore that night, from `player_game_stats.club_code`, as crest bars). Draft value is two aligned lists with a one-line meaning each (pick, portrait, name, drafting crest, round, points) and an empty state; the autodraft sentence and averages are gone. One `HonourChip` (`components/honour-chip.tsx`) replaces the Stats ternary and Standings' `HONOURS`; it explains the honour on hover, keyboard focus and tap (`aria-describedby`), with the copy in `badges.ts` `HONOUR_MEANING`. The read adds `club_code`, the pool's club names and the resolved lineups. |
| S25 League Home: the round so far | Done | While a round is played, League Home's story panel is **"Round N so far"**, not the previous round: "X lead by Y" at display size, the round's provisional ladder (every team by its points this round, a bar in its colour, no crown or spoon) and the **best night so far**, with a door to that round's Recap. The ticker says "Round N so far · X leading · Best night so far · Last". All of it reads Live's figures: pure `liveRecap` (`season/story.ts`) turns `readMatchdayData`'s provisional ranks into a `Recap`, and `readMatchdayData` now names the best night with Recap's own `bestNight` rule over the same lines, so the hero, the table and the story agree. The ladder is one `RoundLadder` (`components/round-ladder.tsx`) shared with Recap. A finished round still reads "Round N story". |
| S26 Theme switch | Done | System, Light or Dark per browser. The light tokens moved from `@media (prefers-color-scheme: light)` to `:root[data-theme="light"]`; a head script (`THEME_SCRIPT`, `lib/theme.ts`) sets `data-theme` before first paint from the `theme` cookie, or from the device on System and follows it when the device changes. On the sidebar the switch is one 44px button beside the account name (a second row pushed the season nav into a scroll on a 690px screen); since S32 it opens the three rather than cycling; on a phone, More shows the three spelled out. The browser's status-bar colour follows the ground. `theme.test.ts` runs the head script against the module so the two cannot part ways. ADR-0011 amended. |
| S27 Stats: compact, explained, linked | Done | Explanations moved behind a small **"i"**: `InfoTip` (`components/info-tip.tsx`, hover, keyboard focus and tap, opens toward the side with room) and a `Bank` `info` prop; `HonourChip` is built on it. A **wooden spoon** is an honour from the first last place, as a crown is from the first win ("Wooden spoon ×2"). **Team profiles** lost "Per counted round"; each column head has a one-line tip, Spread is **Swing**, and a range bar runs worst to best on one league scale with the average marked; Won and Last carry crown and spoon. **Head-to-head** is one row (two selects, the score between crests, a margin strip whose bars name their round on hover, focus or tap). **Lineup efficiency**, **Captain regret** and **Hindsight** are labelled two-figure tables (`TeamTable`) in two columns beside the **Deal ledger**, now the Trades page's diverging bars (`MarketBars`, shared). **Club loyalty** is a bar per team cut by club in the club's colour (`lib/clubs/colors.ts`, one OKLCH colour per E2026 club) with crests whose name is behind a tap. Every team name links to its team; every player name opens the profile modal. Players of the season are ruled into columns. |
| S28 Readable URLs | Done | Leagues live at **`/l/<league>`** (`/l/kavos-lyga-26-27/standings`), a team directly under its league (`/l/kavos-lyga-26-27/vafliu-fabrikas`) and a player at `/players/<name>` (`/players/isaia-cordinier`). Migration `1790400000` adds `slug` to `leagues`, `league_members` and `players` with partial unique indexes (`slug != ''`; a team's is unique per league). Slugs fold diacritics (`lib/slugs/slug.ts`); a team cannot take a page's name (`stats` becomes `stats-team`); a second league or player of one name gets `-2` or the club code. They are written on create, join and rename, and `ensureSlugs` (worker at boot and hourly, `npm run slugs:backfill`) fills any row without one; until then links use the id, and an id still resolves anywhere a slug does. Every league link goes through `lib/nav/urls.ts`; actions revalidate every league page with one `revalidateLeague()`. Old `/leagues/<id>/…` and `/leagues/<id>/teams/<member>` addresses 308 to the new ones (`app/leagues/[...rest]/route.ts`), and League Home, a team and a player opened by id settle on the slug. A rename changes the team's address; its old slug stops resolving (the id never does). Player links inside pages still carry the id and redirect on arrival; S29 gives them their league. |
| S29 Player pool inside the league | Done | **Player Pool** is a League page: `/l/<league>/players` (the same `PoolPage` as `/players`) sits in the League group of the sidebar, so opening the pool no longer drops the league. A player opened from inside a league lives at `/l/<league>/players/<name>` (`PlayerProfilePage`, shared with `/players/<id>`): `LeagueLinksProvider` in `AppShell` gives every `PlayerStatsLink` and the lineup's profile its league, so **Full profile and game log** stays in the league from the lineup, the panel, the pool, Stats and the team page. A profile opened by id, or by the old `/players/<id>?league=…&member=…`, settles on the league's readable address (the way back to a roster is `?member=<team>`). Outside any league `/players` is unchanged. The sidebar's **Manage** group is folded into **EuroLeague** for managers (mapping and imports after Injury News): with the pool in the League group a fourth header pushed the commissioner's season nav into a 36px scroll on a 690px screen. |
| S30 Standings on one screen | Done | The podium, the honours list and the table are one board that fits a 1440×900 screen with room to spare and a phone with no page scroll (rounds swipe inside the table). Each row: rank (first, second and third in gold, silver-ink and bronze-wood chips), movement, crest and name with its honours as marks (crown, spoon, flame with a count; tap or hover for what it means), a **race bar** of the total against the leader's (from `lg`), total, gap, every round as a cell **shaded by that night's finish** (the waffle board's gold-to-red, `lib/season/tint.ts`, shared with Stats; a winner keeps its crown; the round in progress is a dashed "so far" cell), and form. The lead sentence and the provisional paragraph moved behind "i" tips; provisional is a gold pill with **Set lineup** beside the table's heading. The phase filter appears only when there is more than one phase to choose. The tint now mixes into the panel in OKLab: in OKLCH a winner's gold swung toward the dark panel's blue and printed teal, on Stats' waffle board too. |
| S31 My Team, a page about the team | Done | The team page leads with the **team** in its colours: rank (with movement), total and gap to the leader, the round being played so far with its live rank, and **every round** as a cell shaded by that night's finish. Under it, one strip of what kind of team it is: best and worst round, rounds won, top 3, lineup IQ, captain calls, bench points and net from deals, each explained behind an "i" (pure `stats/team-summary.ts` picks the team's slice of `readLeagueStats`). The **roster** is dense: one 44px row per player with club crest, name and status, club and next opponent, form, last, season and pick, grouped G/F/C by a rule, in about half the old height and with no portraits. Beside it: **Who carries it** (Carrying you / On thin ice), **Points by club** (a bar in the clubs' colours), transactions and the crest editor. |
| S32 Tips that float, a roster that lines up | Done | `InfoTip` draws its tip on `document.body` through `Floating` (`components/floating.tsx`, pure `placeFloating`), fixed beside its button and flipped above it when there is no room below, so a clipped parent (the team strip, the hero) can no longer hide it. A roster row always has a Form cell (a dash before two games), so Last, Season and Pick stay in their columns. **Last** is the player's own latest game on this roster (`memberships/roster-figures.ts`), with its round on hover; it used to be the roster's latest round, a dash for everyone whose game was still to come. The club bars on My Team and Stats are one `ClubBar`: point at or tap a colour and it lifts, the others step back, and a tip names the club and its share of the team's points (`clubs/share.ts`). The sidebar's theme button opens **System, Light, Dark** upward instead of cycling (`ThemeSwitch` `popover`, on `Menu`, which now also closes on `data-close`). |
| S33 Every team from My Team, and a trophy room | Done | The team's name is a button (`TeamSwitcher`, route-local, on `Menu`): it opens the league's teams in table order, each with rank, crest, manager and a **You** pill on yours, and keeps `?season`. The panel drops from under the title on the desktop and spans the hero on a phone (`Menu` gained `headingClassName`, so the button sits inside the page's `h1` and the panel outside it, and `anchored={false}`). It is an opaque panel like the league switcher: DESIGN.md refuses glass in components. The hero lost `overflow-hidden` so the panel can leave it (the lattice carries the corner radius instead). Under **Every round**, a **Trophy room** shelf shows this team's honours from `badgesFrom` (crown ×N, wooden spoon ×N, flame N in a row) in their colours, each flipping in once when newly earned, or "No silverware yet." |
| S34 A podium that fits | Done | The top three stand on a low stage at the head of **The table**'s own panel, 2-1-3: crest, name, total (and the gap for second and third) over a step in its medal colour with the place as a display numeral. The leader's crest wears a crown that drops in once per viewer when the lead changes hands (`podium-crown:<league>:<member>`). 83px at 1440×900, where S30's removed podium was 130, so the whole table still ends above the fold (the eighth row ends at 697px). A screen reader hears first, second, third; each place links to its team. |
| S35 Lineups read after every tip-off | Done | The lineup sync reads a frozen round again five minutes after each of its tip-offs (`RoundWindow.tips`, `lineupRoundsDue`), not only hourly, because a manager can move a starter or the captain between a round's game days. The lineup form follows a synced change when nothing is unsaved. See **Fantasy Challenge sync** for the round 3 evidence and the scoring debt it uncovered. |

**Try it on localhost.** `npm run dev`, then open `/concepts` to compare the
directions, and any signed-in page with the system in dark and then light mode:
the ground, headlines and primary buttons change with it. On a lineup, the grid
view shows each position in its own colour and the captain reads `C×2`. Open
your team page, expand **Your crest**, pick a colour and a shape and save: the
crest appears beside your name in chat and on the draft board. Signed out,
`/login` shows the public welcome page; scroll to How it works and select its
three numbered steps. With reduced motion on, Play resumes the rotation. On a
league's Cheat Sheet with nothing ranked,
press **Use the PIR ranking**, then add someone from **Not on your sheet**.
Standings has a **Download** menu. In a draft room on a desktop, pool rows show
the whole surname beside the club and position. On a desktop, open a lineup:
there is no bar above the page title and the court is a proper half court.
Open `/leagues/<id>/lineup` with no round in the URL: it opens the current
round, and the court, sixth man, bench and inactive fit in one window. Drag a
bench card onto a starter to swap them; switch to **Grid** to change any role.
During a round with a game played or in play, the court's name tags carry each
player's points (the same figures as `/leagues/<id>/matchday`), and moving a
player to the bench halves his. On Live, choose another team in **Whose team**
or tap its row in the table; the scoreboard says **Watching** and its name.
Every player name reads first name first ("Alexander Vezenkov"), on the
lineup, the draft board's tooltips, Stats, Recap and in new chat lines; a
results CSV from **Download** still says "Vezenkov, Alexander".
While a round still has a game to play, League Home's hero shows that round's
score so far and **Watch live**, and beside the table **Round N so far** ranks
every team by its points this round with the best night so far (a local
database whose schedule has a round 2 game left shows it on round 2). Recap
opens on the last finished round, with the open one marked "in progress".
On a lineup, a tap on any player opens their profile with "This round" (the
game, its badge, the line so far); a starter's profile has **Make captain ×2**.
Moving someone is a drag; the grid view still changes any role by select.
The side panel's **Schedule** tab shows each game as Live does: badge, crests,
full club names, and the live score while a game is on.
On a team page whose roster changed by a sync that swapped two players for
two, **Transactions** shows one row, "exchanged A and B for C and D", with one
total.
Open your team (`/l/<league>/<team>`): rank, total, this round so far and
every round's finish lead; the roster is one compact row per player.
Point at the "i" beside Lineup IQ: the tip sits over the roster, not under
it. Point at a colour in **Points by club**: it lifts and names the club and
its share. Every player who has played shows **Last**. In the sidebar, the
theme button opens System, Light and Dark. Press the team's name: every team
in the league drops down, in table order; pick one. Its **Trophy room** sits
under Every round.
Open `/l/<league>/standings`: the top three stand on a podium at the head of
the table, and the whole table still fits the screen, each round shaded by
the night's finish; tap a crown or a spoon beside a team.
Inside a league the sidebar's League group ends with **Player Pool**; open a
player there and **Full profile and game log** keeps the league in the sidebar.
Every league address now reads `/l/<league>/…`: open an old bookmark such as
`/leagues/<id>/teams/<member>` and it lands on `/l/<league>/<team>`. On a
fresh database run `npm run slugs:backfill` once (the worker also does it).
Beside your name at the foot of the sidebar, the sun / moon / screen button
cycles System, Light and Dark; reload and the held ground paints at once (on a
phone it is three choices in **More**).
Open `/leagues/<id>/stats`: the waffle board leads, one gold-to-red cell per
team per finished round. Under **Head-to-head** pick two teams and press
**Compare**, then point at a bar. Tap an honour such as **Crowned**, or any
small **i**, to read what it means. A team with one last place shows
**Wooden spoon**; team names open the team and player names the profile.

**Known local-only failure.** `news.spec.ts` plants items dated 13 September; a
local database that has run the news worker holds newer items, and the page
shows the newest 40, so the planted row is off the list. CI starts empty.
Likewise `season-dashboard.spec.ts` and `league-stats.spec.ts` seed snapshots
for rounds 1–2 of the current season: on a local database whose ingested
schedule has a later round under way (round 3 on 2 October), League Home
shows that round's live scorebug instead of the seeded rank, and while round 2
still had a game to play its crowns, ranks and records were (correctly) not
shown. CI has no schedule.

## League activity

The season dashboard separates member Chat, recorded Trades, injury reports, and
EuroLeague news. Chat's count and unread state include only member messages;
the setup lobby and draft room still show the full system transcript. A free-agent
exchange stored as drops plus adds (at any count) appears as one event in the
Trades view, full trade history and My Team when its team and round match and
its rows were written minutes apart at most; two teams' drops and adds that
cross in one round read as one trade.
The underlying transaction and chat rows remain the audit record. News and
injuries use the existing RotoWire items, split by their stored injury status.
No PocketBase schema migration is needed for this presentation change.

## Fantasy Challenge sync (5.5)

The league drafts here and makes every move in the official EuroLeague Fantasy
Challenge. The worker reads the official league's rosters (one call,
`/fantasy-leagues/{id}/rosters`, with `FANTASY_CHALLENGE_TOKEN`) and records the
differences as ordinary transactions: a one-for-one free-agent swap as a drop and
an add that Trades shows as one exchange, a two-way move as a trade. It **writes
only inside a round's freeze** (5 minutes after the first tip-off, then hourly
until 90 minutes after the round's last tip-off) and **previews** every six hours
otherwise. Teams and players are matched once and the links stored
(`league_members.fantasy_team_id`, `players.fantasy_id`); anything it cannot
place blocks the sync and is asked on `/leagues/<id>/fantasy` (Trades → Fantasy
sync, commissioner and deputies). Recording a trade by hand stays, for the
same people, as the correction path.

On 30 September the real official rosters matched production's hand-recorded
ones exactly, so rounds 1–2 need no roster backfill (that test is golden). The
first freeze to exercise the write path is E2026 round 3.

**Lineups sync too (5.5b).** Each team's round lineup is read from the official
game's `/roster/preview` (the one lineup endpoint that answers for other
managers' teams) and stored with `source = synced`, replacing a hand-typed one:
court positions 1–5 the five, 6 the sixth man, 7–10 the bench, the unnamed
three inactive; the formation is checked against our positions by
`validateLineup`. Hourly through a round's freeze after the roster pass, once
more after the freeze closes, and any finished round never synced is filled in,
so rounds 1–2 backfilled themselves on the first worker pass after deploy, and
**round 2 now equals the official table team for team** (159.9 … 94.15). A
lineup player no roster sync has linked (traded away before 30 September) is
matched from the lineup; one it cannot place is asked on the Fantasy sync page.
Each run's report (Trades → Fantasy sync, "Lineups") sets our round total beside
the official one per team. Migration `1790300000`. Manual repair:
`npm run lineups:sync -- --rounds=1,2`.

**Read after every tip-off (S35).** The official game locks a player when his
own game starts, so a manager can bench day 1's captain and make a day 2
player captain until the round's last tip-off. On 2 October the hourly read
landed at 16:57 UTC, three minutes before day 2's first game, and the swap
waited until 17:57. `RoundWindow.tips` now lists every distinct tip-off in a
round, and `lineupRoundsDue` reads the round again five minutes after each tip
that no run has followed (within ten minutes, the worker's check cadence). An
open lineup page follows a synced change when it holds no unsaved edit.

**Debt: a swapped-out player is scored in his new role, not the one he
played in.** The official game counts a player's points in the role he held
when his game was played, then lets the manager move him. Round 3: Montero
scored 8 as captain on day 1 and was benched for Francisco on day 2. Official
62 counts him ×2; we count the one stored lineup, ×0.5, so 50. The 17:57 run
reported 7 of 8 totals off, part of it live games and part this. The API has
no per-game-day view (`/roster/preview` ignores a `round_id`; a per-round path
is 404), so the fix is ours: freeze each player's role from the first read
after his tip-off and score from the frozen roles (a schema field on
`round_lineups` plus every scoring reader). Not started; needs a decision.

**Try it on localhost.** Put `FANTASY_CHALLENGE_TOKEN` and
`FANTASY_CHALLENGE_LEAGUE_ID` in `.env`, `npm run dev`, then as commissioner of
a league in season open **Trades → Fantasy sync**, press **Link league**, then
**Preview now**. A local league whose team names differ from the official ones
asks which member each official team is; answer and preview again. Outside a
freeze nothing is written but the run. The same button reads the lineups of
every finished round not yet synced; a local league with made-up rosters
reports each team as refused ("names a player who is not on the roster"),
which is the refusal working. `npx vitest run src/lib/fantasy/lineup.test.ts`
replays the real round-2 lineups against the official totals.

## Landed: arena visual redesign (visual rules superseded by ADR-0011)

The user approved the interactive site concept on 28 September 2026. The implementation branch is **not production**. [ADR-0009](adr/ADR-0009-arena-redesign.md) records the new design and the product boundaries; earlier ADRs remain available.

| Slice | State | What to review |
|---|---|---|
| Shell and navigation | In review | Separate League, Drafts, EuroLeague and Manage groups; phone tabs use Lineup, Players, Matchday, League and More. The masthead puts the Euroleague season below the wordmark so the desktop sidebar fits without horizontal scrolling. The selected fantasy season cannot be E2025, while prior-season player stats remain. |
| Lineup and player research | In review | Fixed-ratio court with non-overlapping G/F/C rows, five formation choices, grid view, tap swap, captain action, locally recovered unsaved edits, optimizer preview and comparison drawer. Player stats open in an in-window dialog from player links, with the full profile retained for deep links. The existing record action still validates. |
| Other league surfaces | In review | Searchable player pool, accessible Trades history and split trade builder, wider team, standings and recap layouts. |
| Matchday | Live | Provisional scores/ranks, fixture states, last-updated and stale status, realtime snapshot reads. `LIVE_FETCH` defaults **on**: the gate was cleared on E2026 round 2, when the live Boxscore was seen changing in play. Live points are scored by our own `scoreGame` from the feed's components (its `Valuation` is only a logged cross-check), each lineup player shows a live stat line, and a finished game reads **Full time** until the official box score is recorded. Finished-game standings are authoritative. A live line only counts for a player whose `person_code` is stored — a new signing waiting at `/players/mapping` scores nothing live or final until it is confirmed. |
| Official imagery | In review, VPS files installed | 318 official E2026 player portraits and 20 club marks are on the personal VPS. Players whose official profile still uses placeholder art use the letter fallback. The repository contains only source URLs and an installer; the interactive local preview returns to fictional players and illustrative marks. See [ADR-0010](adr/ADR-0010-official-media.md). |

Try the branch locally with `npm run dev`, then open a league in season at `/leagues/<id>/lineup`, `/matchday`, `/standings`, `/recap`, and `/transactions`. At 390px and desktop width, check the court after selecting each formation, the save bar above phone tabs, the five phone destinations and the separate Drafts sidebar section. On desktop, check that the masthead season sits below Eurovafliai and the sidebar has no horizontal scrollbar.

**Try live points on localhost** while a Euroleague game is on: `npm run dev`, which starts the worker, and live polling is on by default (run `npm run rosters:sync` first if the local pool is old). Open `/leagues/<id>/matchday`. Within about two minutes of the worker starting, the game tile shows the live score, and each lineup player with a game on shows counted points and a line such as `12 PTS · 4 REB · 3 AST · PIR 15 · 18:20`, updating once a minute without a reload. At the final buzzer the tile reads **Full time**, and later **Final** once the 15-minute stats pass has recorded the official box score.

The phase notes below describe what had landed before this review. ADR-0009 and the in-review table above supersede their older visual descriptions once this branch lands.

**Phase 11 — the app shell — has landed: 11.1, 11.2 and 11.3.** Layout and
information architecture only; the midnight board's palette, materials and
motion are untouched. Every signed-in page now renders one shell — a sidebar
from `lg`, a header, a bottom tab bar on phones — whose contents come from one
pure function, `navFor`; the lineup, team page, season dashboard and draft
room have a Players / Schedule / News side panel; and the lineup's five stand
on a drawn half court with tap-to-place. Recorded as
[ADR-0008](adr/ADR-0008-app-shell.md) and blueprint **D27**, which reverse
DESIGN.md's "no sidebar, no third measure". **Read the Phase 11 table before
touching the draft room**: its panel is deliberately different.

**Phase 10 — the midnight board — has landed.** A full visual direction change,
and a **reversal** of what this app looked like from 1.4 to 10.1: the card-stock ground
and the night board are both retired in favour of one dark ground (`#0B1120`)
with one Euroleague orange accent (`#FF5500`), vibrant position colour-coding,
a two-level depth scale, a second type family for figures, and a third
animation. It is recorded as [ADR-0006](adr/ADR-0006-midnight-board.md) and
blueprint **D22**, which supersede D17, D21 and ADR-0005 — the eight-day-old
night board is undone, and the reason is written down rather than implied.
Read D22 before touching a colour.

**Phase 10 is closed: all nine slices have landed.** The decision and the
palette (10.1–10.2), two type families (10.3), the card-block material and its
enforced depth scale (10.4), roster blocks and the captain as a mark (10.5), the
data grid and the last-five sparkline (10.6), the `fixtures` collection (10.7),
the third motion event and the band (10.8), and the three differentiated
screens (10.9). Two of the brief's asks were **dropped on measurements rather
than deferred** — purple head-coach badging (D19/D22) and the double-round
indicator (**D23**) — and one of this system's own named refusals was reversed
with its own row: the draft room gets a second measure (**D24**), which is the
app's only surface wider than 48rem.

**Next up is not a slice: it is the human half of 3.7 / D12** — a real draft
night, with friends, on their own phones, before the league drafts into a season
already in progress. Everything mechanical about that night is proven. The rest
of the open work is the debt table below, where the `pool.spec.ts` count flake
is the one worth picking up first.

**This landed before draft night, which was a deliberate risk**, stated here
because the next agent should not have to infer it: the interface the league
will draft on has changed underneath a rehearsal that was run on the old one.
Nothing mechanical moved — the engine, the pipeline and the sweep are untouched
and unstyled — but "does it read in a loud room" was answered for a surface that
no longer exists.

Phase 9 was
five gaps measured against the official EuroLeague Fantasy Challenge **Draft
Mode** rulebook and against comparable fantasy apps; the table below carries
them. **9.1 has landed**: the draft pool now leads with average PIR rather than
an unlabelled fantasy average, last season's numbers are imported from the
official stats table, and autodraft ranks on the same figure the row shows.
**9.2 has landed too**: the room's commissioner controls are a named, framed
panel with per-member autodraft, a mid-draft pick clock and a real
"Pick for them" — see D18, which takes three of D13's four cut items back.
**9.3 has landed**: lineups and the captain, so a table finally means what the
official game's table means — see D19, which amends D4. **9.4 has landed**:
`players.status` finally has something writing it — the worker reads RotoWire's
two Euroleague pages hourly, stores the fact and links out for the prose, and an
unmatched published name becomes a mapping question rather than a dropped item.
See D20 and [ADR-0004](adr/ADR-0004-injury-news-source.md), which narrow D5 to
the decision it actually made. **9.5 has landed and closes the phase**: the
board has a night ground, the system preference decides until somebody says
otherwise, and the switch rides in the top rail on every surface. It amends
D17's dark-mode clause rather than stepping over it — the price DESIGN.md's open
question 5 set was that the inversion argument be re-made, and it is, in D21 and
[ADR-0005](adr/ADR-0005-night-board.md). One design system, two grounds: every
contrast assertion in `tokens.test.ts` now runs on both. **9.5a** follows it
with one control: the switch is a drawn sun/moon rather than the word "Night",
and it sits in the rail's own line of controls.

**E2026 tips off on 24 September 2026**, so 9.1, 9.2 and 9.4 were draft-night
critical, and 9.3 had to land before round-1 standings could be trusted.
Alongside the slices, one thing outstanding is a date rather than a
ticket: the human half of 3.7 / D12 — a real draft night, with friends, on
their own phones — has to happen before the league drafts into a season already
in progress. Everything mechanical about that night is proven; whether it
*feels* right is the one claim no script can make.

Phases 0–5 and 8 are closed; the blueprint's remaining phases are 6 (keepers,
explicitly a summer-2027 feature) and 7 (AI, not next).

The last piece of pre-season engineering is in: **4.2's quarantine now has a
doorbell.** A manager's lobby and the pool's own mapping row both name how many
suspected renames and unattached person codes are standing, and both read the
same filter the mapping page renders, so the count cannot advertise work the
page will not show. It matters from 24 September, not before: an unanswered
rename is a player whose box scores cannot attach.

**8.0–8.5** have all landed, and the human halves are done: the backup timer is
enabled and has written a real archive, that archive has been through the
restore drill, and logrotate is installed. R1 already covers the client-load
check.

A **full three-account draft has now been run on production, across several real
devices** — thirteen rounds, three real Google accounts, all three rosters legal
at the end (5 G / 5 F / 3 C each) and no repair needed. It found exactly one
defect, since fixed: the pool's legality preview followed the member *on the
clock* rather than the viewer, for anybody who could enter somebody else's pick.
See "the commissioner legality fix" below and the note in
[`docs/log/slice-notes.md`](log/slice-notes.md). Recorded because it is a real
draft against production rather than a scripted one, and it caught something no
test on the repo was asking about. Real devices rather than browser profiles is
what **closes Phase 1's DoD** and the two-device debt below. It still does not
close the human half of 3.7 / D12: three accounts driven by one person is not
three friends in one room, and that check is still open.

The season-surface rollout
([U4](https://github.com/andrius-burba-94/eurovafliai/issues/94)) has landed.
The draft-room rollout
([U3](https://github.com/andrius-burba-94/eurovafliai/issues/93)) has landed.
The lobby and chat rollout
([U2](https://github.com/andrius-burba-94/eurovafliai/issues/92)) has landed.
The shell, home and login rollout
([U1](https://github.com/andrius-burba-94/eurovafliai/issues/91)) has landed.
The panel material
([U0](https://github.com/andrius-burba-94/eurovafliai/issues/90), blueprint D17)
now has its first real surfaces. The scripted rehearsal
([R1](https://github.com/andrius-burba-94/eurovafliai/issues/89)) has landed.
Phase 4 is closed in code: **4.1–4.5 have
landed**, and **Phase 5 is closed**: **5.1–5.4 have landed**. A finished draft writes
`roster_memberships`, a commissioner records trades, standings join by
Euroleague round, the team page shows live deltas, and **This round** recaps
one night. Phase 6 keepers stay luxury. Phase 7 AI is not next. Phase 3 is
closed in product code; R1 scripts the mechanical half of 3.7 / D12. Whether
it feels right with friends in one room remains human. Nightly backups run on
the box, and a production archive has been restored and re-verified — so the
backup is a backup and not a hope.

## Try it on localhost — 9.3b, standings in hundredths

```bash
npx vitest run src/lib/stats   # Laurynas Birutis' official 121.15 stays 12115
npm run dev && npm run standings:recompute
```

- Open `/leagues/<id>/standings` for a league in season with a recorded lineup. A total with a benched odd score shows two decimals, for example 121.15; the rest look as before.

## Try it on localhost — 9.3a, a round rounded once

```bash
npx vitest run src/lib/stats   # the official round-1 lineup test totals 1646
npm run dev                     # then /leagues/<id>/lineup for a league in season
```

- Put two players with odd scores on the bench and record the lineup. The standings add their halves before rounding, so 18.7 and 7.7 on the bench count as 13.2, where the old code gave 13.3.

## Try it on localhost — Phase 11, the shell, the panel and the court

```bash
npm run dev      # then open http://localhost:3007 and sign in
```

- **At 1280px or wider**, open a league: the sidebar lists its destinations
  with the current one ruled in ink, and the switcher at the top moves between
  your leagues. On the lineup, a team page or the season dashboard the panel is
  the right-hand column — search a name, toggle G/F/C, arrow between the tabs.
- **At 390px** (devtools, Pixel 7): the tab bar holds four destinations and
  *More*; the header's *Players* button opens the panel as a sheet and Escape
  closes it. The last row of every page clears the tab bar.
- **The draft room** keeps its pool in the page; its header button says
  *Schedule* and opens a sheet with Schedule and News only, at every width.
- **The lineup** (`/leagues/<id>/lineup`, a league in season): tap *Move* on a
  player, then an open place on the court or a tier's *Move here*. With a bench
  player in hand, tap a starter on the court and the two swap. The select on
  each card still does the same thing, and still posts the form. At 390px,
  scroll halfway: *Record this lineup* sits above the tab bar, not under it.

## Try it on localhost — one command, and test data that always goes

```bash
npm run dev      # next + PocketBase + the worker, together
```

**`npm run dev` now starts the worker too.** It was a second terminal
(`npm run worker:dev`) and therefore a thing to forget — and it was forgotten,
for a whole local draft: autodraft was armed on three members, the clock ran to
zero every turn, and **0 of 39 picks** were taken by the engine. Nothing
enforces a deadline unless that process is alive.

**The worker imports last season's averages on boot when the pool has none.**
That is the number a draft is decided on — a draft happens before its season has
a single game, so the pool falls back to `prev_season_*` for every player. It
was a one-off script and so it never got run: **local and production both had
zero**. The guard is the pool itself, so a restart with data present makes no
request at all. Verified both ways:

```
# pool has it:
(nothing — no log line, no request)
# pool does not:
no last-season averages in the pool — importing E2025
previous season · E2025 · 335 in the feed · 225 matched · 225 written
```

`npm run stats:prev` is still there for a forced re-import, and reports
`225 already current` when there is nothing to do.

**E2E test data now always goes.** `afterEach` only ever cleaned the run it
belonged to: `TEST_CLUB` is a random code minted per worker process, and the id
registry lives in memory, so a **killed** run left players, leagues and users
that no later cleanup could even name. That reached 900 test players against
327 real ones and 213 leagues, which is why the club filter offered 195 clubs —
and it made every pool render slower, which showed up as *flaky specs*.

Playwright now sweeps **before** the suite as well as after
(`tests/e2e/helpers/sweep.ts`), on two markers no real row can carry: users at
`@e2e.invalid` (RFC 2606 reserves `.invalid`, so it can never be a person) and
players whose `club_name` is the literal `E2E Test Club` — deterministic, unlike
the random club *code* a dead process takes with it. Fixtures are found through
the club codes of the test players, read before those are deleted. Proved by
killing a run mid-test and watching the next one report:

```
e2e sweep before: 1 leagues, 1 players, 1 users
```

It is silent when there is nothing to clean, so a line means the previous run
did not finish.

### What runs by itself, and what does not

| | Local (`npm run dev`) | Production |
|---|---|---|
| Next | ✔ | ✔ PM2 `eurovafliai-web` |
| PocketBase | ✔ | ✔ systemd `eurovafliai-pb` |
| **Worker** — pick deadlines, autodraft, repairs (1s) | ✔ **new** | ✔ PM2 `eurovafliai-worker` |
| Box scores + standings (15min) | ✔ via worker | ✔ via worker |
| Injury news (60min) | ✔ via worker | ✔ via worker |
| Last-season averages | ✔ **new**, on boot when absent | ✔ same worker |
| Nightly backup | — | ✔ systemd timer |
| **Roster ingestion** (`rosters:sync`) | ✖ by hand | ✖ by hand |

PM2 is `enabled` for boot, so both processes survive a reboot. **Roster
ingestion stays manual by design** — ADR/blueprint 2.1 makes the API and the
hand-corrected CSV alternately authoritative, and a process that silently
re-synced the pool could overwrite a commissioner's corrections the night
before a draft.

## Try it on localhost — four reports from a real draft night

```bash
npm run dev
npm run worker:dev   # the second one. It is not optional.
```

Four things were reported after a full local draft. **Two were the app telling
the truth and one was a missing process** — recorded here because the
diagnosis is worth more than the fixes:

| Reported | What it actually was |
|---|---|
| "The commissioner always gets 1st" | **No bias.** 200,000 rolls per league size, every slot within noise; see the fairness tests in `roll.test.ts`. The cause was #119's replay announcing one roll fifty-two times |
| "The draft order seemed weird" | **Correct.** All 39 stored picks replay identically through `buildPickOrder`; snake alternates every round, 13 picks each. It reads oddly because at every turn one member picks *twice in a row*, which is what a snake is — and because all three teams were named "Andrius Burba" |
| "Autodraft does not work" | **The worker was not running.** 39 picks, **0 autodrafted**, with `autodraft_enabled` set on all three members. `npm run dev` does not start it. `selectAutoPick` needs no cheat sheet — it ranks, then takes the first legal player |
| "No legal picks with one C left" | **Correct.** All four Olympiacos centers were already drafted, and the club filter was still set to Olympiacos from an earlier search |

Two of those were fixed as code, and one gap was closed that none of them asked
for:

**The club filter reads as clubs.** It listed bare three-letter codes in code
order, which put `OLY` between `MIL` and `PAN`. It now carries `club_name`,
sorted and labelled by name; the option's value is still the code, so the
filter itself is unchanged. A row still shows the code — three characters
beside a name is what a code is for.

**An empty pool says what emptied it.** "Nobody left matching that" described
the result without naming the cause, on the surface where a manager has sixty
seconds. It now reads back the filters: *"Filtered to C · Olympiacos Piraeus ·
legal for me."*

**The room admits when nothing took an expired pick.** This is the gap: every
`stuck_reason` 8.2 renders is written **by the worker**, so the one failure the
banner can never report is the worker's own absence — no process, no write, no
banner, and the room still promising "the engine picks the moment your turn
comes". It is now detected client-side from the deadline the server wrote,
precisely because it cannot depend on the worker being alive, and it waits out
the room's existing pulls first so a healthy expiry says nothing. It names a
symptom and the two ways out, never a cause: a slow box, a paused worker and a
crashed worker are indistinguishable from a browser.

**A note on local data.** A full e2e run leaves players behind whose club is a
generated `Z???` code, and a killed run leaves them for good because `afterEach`
never runs. That had reached **900 test players against 327 real ones and 213
test leagues**, which is why the club dropdown had 195 entries. Local PocketBase
after a cleanup should read 327 players and exactly 20 clubs; `npm run pb:backup`
first, delete leagues before players (PocketBase refuses to delete a player a
pick points at).

## Try it on localhost — the season dashboard

```bash
npm run dev
npx playwright test tests/e2e/season-dashboard.spec.ts
```

Open a league whose `status` is `season` with a seat of your own. The lobby body
is gone: in its place, at the **`wide`** measure, your team, the table and the
round's story across the top, then the conversation (chat, trades, news) at full
width underneath. The thing to look
at is that **you can tell whether you are winning without pressing anything** —
which the four-door grid it replaced could not do. Then narrow the window: below
`lg` it is one column in the same order, because match night is phones on a
couch.

The rail's **Eurovafliai · Euroleague 2026–27** is now a link home, on every
surface. One link over both clauses, not two to the same place.

**Three of the brief's panels described a different game and were substituted
rather than faked** ([D26](EUROVAFLIAI_BLUEPRINT.md), the same discipline as D19
and D23):

| Asked for | Why it cannot be true here | What is there instead |
|---|---|---|
| A **W-L** column | No head-to-head. Standings are cumulative fantasy points with per-round snapshots (4.5), so there is no opponent to have beaten and the column reads `0-0` forever | `PTS`, and the round's signed movement |
| **Matchup of the week** | No matchup format exists in the blueprint, PRODUCT.md or CONTEXT.md. Inventing one would invent a game | 5.4's recap: the night's ranking, the best night, the deal that moved most |
| Player **headshots** | At the time, `players` had no image field and permission for official portraits had not been supplied | Superseded by [ADR-0010](adr/ADR-0010-official-media.md): official portraits match stored person codes, with a letter fallback where no portrait exists |

A spec asserts the page says neither "W-L", "matchup" nor "final". The
earlier no-image assertion is superseded by the permitted official media in
ADR-0010.

**The `wide` measure now has two callers**, and the `MEASURE` key was renamed
`room` → `wide` to say so. That is D24's argument reused rather than a new one:
the room is pool, board, radar and console, the dashboard is your team,
standings, the round's story and the conversation, and both are four surfaces
at once. There is still no third
measure.

Two things left this screen on purpose: the **cheat sheet** (the brief's own
instruction, and its season copy was already only a souvenir) and the lobby's
**second copy of the chat** — the dashboard renders the same thread in its own
panel, and two transcripts of one thread on one page is two unread counts for
the same messages. Later, two more went: the **Your roster** panel (the sidebar
already leads to your lineup and team) and the lobby's **Members** list (every
team is a row in the standings, each linking to its team page). That gave the
chat the full row. Before the first counted round the standings list the teams
unranked under the empty notice, so every team is still one tap away.

## Try it on localhost — the roll ceremony

```bash
npm run dev
```

Open one league in two browser profiles — commissioner in one, an ordinary
member in the other, both sitting in the lobby. Press **Roll the order**.
**Both windows leave for `/leagues/[id]/order`.** Ten seconds of clock, then one
slot every three seconds, from the **last** pick upward to the first; the name
being drawn is the biggest thing on screen and the order fills in below. The
member is not clicking anything.

The two things worth checking specifically:

```bash
# Land in the middle of a draw, on purpose. Backdate the instant and reload:
# the page joins the draw in progress instead of restarting at ten.
npx playwright test tests/e2e/roll.spec.ts -g "opens late"
npx playwright test tests/e2e/roll.spec.ts
```

Then press **Reshuffle** — it redraws the order *without* summoning anyone, in
the lobby, where 2.3b's staged reveal still plays. The ceremony belongs to the
first draw only.

**The phase is derived, never broadcast and never timed on a client**
([ADR-0007](adr/ADR-0007-the-roll-ceremony.md), blueprint **D25**). The first
roll stores `settings.rolled_at` and every device computes its own phase from
that one instant, correcting its clock against `/api/time` the way the pick
clock does. A reload restarts nothing, a phone that opens thirty seconds late
joins in progress, somebody arriving an hour later reads a finished order, and
the whole ceremony is testable by backdating one field rather than waiting
forty-six seconds.

**The motion budget is now four** and the fourth is spent: `slot-drawn`, 900ms,
rising. DESIGN.md's Three Events Rule said a fourth is a change to that document
rather than a variant, so it is argued in ADR-0007 and written into DESIGN.md's
Motion section as Event four. One type step came with it (`--text-roll`, 5rem
mono). Under `prefers-reduced-motion` the pacing still runs — it is a clock, not
an animation — and only the rise is dropped.

One consequence worth knowing before writing a test: **rolling now navigates**,
so every spec that rolls goes through the `rollOrder` helper in
`tests/e2e/helpers/session.ts` rather than clicking `draft-roll` directly. The
exceptions are the three places where the roll itself is the subject — a
re-apply, and the two refused rolls.

## Try it on localhost — the order everyone can read

```bash
npm run dev
```

Open one league in two browser profiles: the commissioner in one, an ordinary
member in the other. Press **Roll the order** as the commissioner and watch the
*member's* window. The thing to look at is the new **The order** Bank — it now
reads `01`, `02`, `03` downwards for the member too, and it is the same list the
commissioner reads. No roll button, no reshuffle, no settings, no Start.

```bash
npx playwright test tests/e2e/draft-setup.spec.ts -g "a member reads the order"
```

Blueprint §2.3 asks for a roll "revealed live to all clients one slot at a
time", and 2.3b built that — but the reveal only ever landed numbers onto the
**member list**, which during `setup` is in *join* order. So a member saw
`03, 01, 02` scattered down the rows while the readable ordered list sat inside
the commissioner's own Bank. Everyone watched the roll; only one person could
read its result. Measured before the fix in a three-member league: the member's
lobby had **zero** ordered lists.

`DraftSetup` is now two components — `DraftSetup` (the commissioner's format and
clock) and `DraftOrder` (the league's order, controls gated on `canManage`).
`DraftOrder` **shares the lobby's `revealed`** rather than calling
`useRollReveal` again, so the ordered list and the member rows count down
together instead of the list printing the answer first.

## Try it on localhost — the roll re-apply fix

```bash
npm run dev
```

Open a league in `setup` with at least two members and press **Roll the order**.
It announces in the lobby chat, as it always did. Now press the same button
again — it reads **Re-apply the roll** — and the thing to look at is that
**the transcript does not grow**. Instead the order Bank says the order is
already on the board and points at Reshuffle. Press it a third time: still one
announcement. Then open **Reshuffle&hellip;**, tick the box, and confirm — that
one *does* announce, because it changed who picks first.

```bash
npx playwright test tests/e2e/chat.spec.ts -g "re-applying the roll"
```

Found in production, not in a test: a two-member league collected **fifty**
identical "the draft order was rolled" announcements, which is the whole of that
lobby's chat history. The roll was never broken — a seeded roll of two members
returns the same order every time by design, and re-applying is deliberately
idempotent so a half-saved roll can be finished without changing who drafts
first. What was broken is that the *announcement* was not idempotent: every
press published a fresh-looking roll, and nothing on the page said "this was a
replay". So the correct behaviour was indistinguishable from a stuck shuffle,
and the commissioner reasonably concluded the button did nothing.

## Try it on localhost — slice 10.9

```bash
npm run dev
```

Open `http://localhost:3007` on a laptop and make the window wide (1200px or
more). Three surfaces, three shapes:

- `/` — your leagues are a **grid** of card blocks, two across, and the run no
  longer trails off into empty "Slot 04" placeholders.
- A **draft room** — past 1024px the room opens to 80rem and splits in two: the
  pool on the left, the radar, board, console and chat on the right, with the
  countdown band full width above both.
- `/leagues/<id>/standings` — one grid. Rank, team and total stay put while the
  rounds scroll under them.

The one thing to look at: **narrow the window back to a phone width** with the
room open. The two columns collapse into the single column the league will
actually draft on, in the same order as before — nothing about the phone layout
changed, and that is the point.

## Try it on localhost — slice 10.8

```bash
npm run dev
npm run worker:dev          # so a pick can also land without you
```

Open a draft room on two devices, or two windows side by side. Pick on one and
watch the **other**: the marker rule leaves the slot that was on the clock and
travels across the next one, and the slot it left springs shut on the name that
just appeared in it. Two animations, one event, adjacent slots.

The one thing to look at: reload the watching window. Nothing moves. A page load
is not news, and a board that replayed the last pick on every refresh would be
decoration — which is the same argument the rule advance has made since 3.1.

Then turn on reduce motion (macOS: System Settings → Accessibility → Display).
Pick again: the name, the position wash and the letter are all there on the
first frame, and neither the rule nor the slot travels. The guard is inside the
CSS rule rather than at the call site, so nothing new can forget it.

The band above it is the same band, restyled: the countdown is now the largest
figure in the room and the sentence over it is a step smaller.

## Try it on localhost — slice 10.7

```bash
npm run dev
npm run stats:sync          # one pass: fills fixtures from the schedule
```

Open a team page (`/leagues/<id>/teams/<memberId>`). Each block now carries a
fixture line: **vs ZAL** at home, **at ZAL** away. Then open
`/leagues/<id>/lineup` and switch rounds — the line follows the round you are
arranging, because a lineup is arranged against that round's opponent and not
against whatever happens to be next.

The one thing to look at: in September the line says who and stops. "Hard draw"
only appears once the *opponent* has three played games, because a club's record
over two games is a coin toss reported as a fact.

You will not see "Double round" anywhere, and that is now a finding rather than
missing work: every club plays exactly once in every Euroleague round — 1,564
club-rounds measured across two seasons, no exceptions — so the indicator was
dropped. The numbers are in `docs/research/euroleague-api.md`.

## Try it on localhost — slice 10.6

```bash
npm run dev
npm run test -- sparkline
```

Open a player who has played this season (`/players/<id>`). Under the season
figures there is a **Last 5** line: the five PIRs as a single stroke, and the
numbers beside it. Then open the draft room — on a laptop the same stroke sits
in each pool row; narrow the window and it leaves, because a 390px row has no
column to spare.

The one thing to look at: a player with one game has **no** stroke, only the
number. Two points make a trend and one makes a dot, so the line is not drawn
at all rather than drawn flat.

If you use a screen reader, the picture says nothing and the sentence beside it
does: "Last 5 games, oldest first: 12, 9, 15 PIR — trending up." On standings
that sentence reads in points **to the tenth**, matching the row it sits in,
because the stored figures there are integer tenths.

## Try it on localhost — slice 10.5

```bash
npm run dev
npx playwright test tests/e2e/lineup.spec.ts
```

Open a team page (`/leagues/<id>/teams/<memberId>`). The roster is a grid of
blocks, each with a coloured left edge — cyan guard, emerald forward, amber
center — and the open places are dashed and empty rather than filled.

Then open `/leagues/<id>/lineup` and put the armband on somebody. Move it to a
second player: the first clears itself, because it is a radio group and that is
the browser's job, not ours. Now take the captain and change their role to
**Bench** — the armband goes with the place.

The one thing to look at: the role select no longer offers "Captain". That is
the rule, not a trim — the captaincy is a mark on one of the five starters, and
`validateLineup` refuses a captain who is not among them, so a control that
could name a bench captain would exist only to produce an error message.

You will not see a fixture anywhere, and at 10.5 that was correct: ingestion
still discarded every unplayed game, so there was nothing to say. 10.7 fills the
line in — and drops the "Double round" half of it, for the reason recorded
there.

## Try it on localhost — slice 10.4

```bash
npm run dev
npm run test -- depth-scale
```

Open a league page: the **four doors** are now card blocks in a grid rather than
a ruled run — a panel a shade lighter than the ground, one soft corner, and the
draft-room door outlined in orange when the draft is live.

The one thing to look at: put your eye level with the screen and note there is
**no shadow under a block**. Depth here is a lighter fill and a rule, nothing
else — on a ground this dark a shadow has nothing to darken, so every version
that reads as elevation is a glow, which is the thing ADR-0006 exists to refuse.

Then try to break it. Add `rounded-lg` or `shadow-md` to any component under
`src/`, or spell `card-block` outside `board.tsx`, and re-run the test above: it
fails by name and points at the file. That guard is the point of the slice —
Tailwind emits an unknown utility as *nothing*, so the mistake it catches is one
that renders cleanly and silently wrong.

## Try it on localhost — slice 10.3

```bash
npm run dev
npx playwright test tests/e2e/design.spec.ts --project=chromium
```

Open `/players` and look down the **PIR column**. The figures are JetBrains
Mono; the surnames beside them are Space Grotesk. That contrast is the whole
slice.

The one thing to look at: the sentence under a heading, and the chat's unread
count, are **still** sans. A figure inside a sentence is prose. If you find a
mono sentence anywhere, the `stat` utility has been used as decoration and the
rule has already started leaking.

Then open a draft room: the clock counts down in mono without the digits
shifting, and chat timestamps line up as a column down the transcript.

## Try it on localhost — slice 10.2

```bash
npm run dev
npm run test -- src/app/tokens.test.ts
```

Open any page. The ground is **`#0B1120`** and there is **no sun in the top
rail** — that is the whole of 10.2 visible in one glance, because the switch and
the second ground went together.

The one thing to look at: put your OS in **Light** mode and reload. The app is
still the midnight board. That is not a bug, it is
[ADR-0006](adr/ADR-0006-midnight-board.md)'s accepted cost, and it is in Open
debt so nobody has to rediscover it.

Then `/leagues/<id>/draft` with a board on it. The slots are still ruled the
same four ways, the marker is now orange on the slot on the clock, and the
G/F/C patches are cyan/emerald/amber with their letters still printed. Type is
deliberately unchanged — Archivo until 10.3.

## Try it on localhost — slice 9.5 (superseded by 10.2)

The sun/moon switch this describes **no longer exists**; kept because the
"does it arrive without JavaScript" check below is the one the midnight board
inherited, and `design.spec.ts` now asserts it.

```bash
npm run dev
```

Open any page and press the **sun** in the top rail. The ground goes to the
board and the ink to chalk, the icon becomes a **moon**, and a hard reload
lands dark **without a white flash** — the choice is applied in `<head>` before
the first paint, not from an effect afterwards. Walk to another surface: the
same ground, because the switch lives in the rail rather than on a page.

Then the part worth checking twice. Put macOS in Dark Mode with **nothing
chosen** in the app (press the rail's switch until its icon matches your
system, which clears the override rather than pinning it) and reload: the app is dark
because CSS asked, not because JavaScript ran — turn scripts off and it still
is. Switch your system back to Light while the page sits open and it follows
live, which is what a 21:00 tip-off actually does to a phone.

Nothing else moves. Same rules, same washes, same marker with the same two jobs,
no shadow and no glow — asserted on the night ground by
`tests/e2e/theme.spec.ts`, and every ratio measured on both by
`npm run test -- src/app/tokens.test.ts`.

## Try it on localhost — slice 9.4

```bash
npm run dev
npm run news:sync -- --dry   # what a pass would do, writing nothing
npm run news:sync            # and now for real
```

Open `http://localhost:3007/players` — the pool's own row now says how many
players are marked unavailable — and follow **Injuries and moves**. Each item is
the fact, the date and the publisher's headline, with a **RotoWire** link for
everything we deliberately did not copy. A player currently marked by an item is
struck `live`; open them and the same items are on their profile.

Then check the two corrections a person is needed for. **Available again** on
the flagged list clears the status *and* spends the items, so run
`npm run news:sync` a second time and the player stays fit — that is the part
that stops an hourly pass undoing you. **Read the pages now** runs a pass
without waiting for the hour.

Finally open `/players/mapping`: published names the pool cannot resolve are the
third question there, answered **by slug**, so one answer attaches every item
about that person — including the ones that arrive next week. `NEWS_FETCH=off`
in `.env` stops the worker's hourly read without stopping pick deadlines.

## Try it on localhost — slice 9.3

```bash
npm run dev
```

In a league whose draft is complete, open **Your lineup** from the lobby.
Thirteen rows, one role each: captain, starter, sixth man, bench, inactive —
the multiplier is printed beside every role. The summary line under the list
names the formation as guards-forwards-centers and refuses an illegal one
before you submit it (try three centers in the five). Record it, then open
**Standings**: the totals are recomputed with the captain doubled, the bench
halved and the inactive three at zero.

Then change the round to one you have not typed. It says the previous round's
lineup is carried forward. Go back far enough and it says nothing is recorded,
and the standings page strikes that round as a `Correction` naming it. As
commissioner, the **Whose team** select opens anybody's lineup; a plain member
does not see it and cannot reach another team's by URL.

## Try it on localhost — slice 9.2

```bash
npm run dev
```

Roll and start a draft in a league you run, then open the room and find
**Running the draft** — a framed panel where an unnamed cluster of buttons used
to be. Three things to try:

- **Set the clock to 20 seconds** while somebody is mid-turn. The countdown
  restarts at 0:20 rather than jumping into the past, chat says so, and the
  lobby's own setting has followed it.
- **Press `Draft for them`** on another member's row. The row says the engine
  picks for them now; with `npm run worker:dev` running, their next turn is
  taken the moment it comes round. Press `Hand it back` to undo it.
- **Press `Pick for <name>`** while it is somebody else's turn. It puts the
  cursor in the pool's search box, below the sticky band — the walk a manager
  used to make by scrolling and inferring.

Then open the same room as a plain member: the panel is not there at all, and
their own "Draft for me" still is.

## Try it on localhost — slice 9.1

```bash
npm run dev
# Once, before the draft. Last season is the only number E2026 has:
npm run stats:prev              # 335 in the feed, 222 matched, 0 disagreements
npm run rosters:sync            # now also lands heights, birth years, countries
```

Open a live draft room. **The pool row leads with a `PIR` column** — bold, full
ink, right-aligned under a column head, with the games behind the average
beside it and the fantasy average trailing as `FP`. A player nobody has data
for reads `—` and fails every floor. Toggle `15+`: it is now a PIR floor, not a
fantasy one. Then open `/players/<id>` for someone who played last season: a
**Last season** bank above the game log with PIR leading, and the bio on the
header line.

`npm run stats:prev -- --check` compares the feed against our own E2025
backfill and writes nothing; it exits non-zero if they ever disagree.

## Try it on localhost — the mapping doorbell

```bash
npm run dev
npm run rosters:sync -- --dry-run   # or open /players/mapping and press Check the feed
```

A sync stores its held-back renames whether or not anybody looks, so the queue
is readable without a network. With something standing, open any league lobby
you run: a `Correction` above the member list says how many players may have
been re-registered and how many person codes belong to nobody, ends on the cost
(*their box scores cannot attach*), and links to `/players/mapping`. Answer them
there and the banner goes on the next load — the count is the page's own filter,
so it cannot claim work the page does not show.

Three things to check because they are the point: sign in as a **plain member**
of the same league and the banner is not there (they could not act on it — the
page 404s for them); with an **empty** queue there is no banner at all rather
than a cheerful nothing-to-do; and after `npm run stats:sync -- --season=E2025
--all` the banner stays **silent** even though `/players/mapping` then lists a
hundred-odd unmatched codes, because those are last season's departed players
and not work. `/players` carries the same number on its Player mapping row,
struck as a correction.

## Try it on localhost — 8.4

```bash
npm run dev
# Open the draft room. Confirm one h1 (the band title).
# Arm a row, press Escape: focus returns to that row's Choose button, not to search.
# Tab from a cold page: the first stop is "Skip to content", Enter lands on #main.
npm run test:e2e -- tests/e2e/a11y.spec.ts
```

## Try it on localhost — 8.3

```bash
# No VPS required to prove the file:
cat deploy/logrotate/eurovafliai
npm test -- tests/unit/logrotate-config.test.ts
```

The VPS copy is already installed. To re-check it rather than re-install it:

```bash
ssh hstgr 'cd /var/www/eurovafliai && cmp /etc/logrotate.d/eurovafliai deploy/logrotate/eurovafliai && echo matches'
ssh hstgr 'ls -la /root/.pm2/logs/ | grep eurovafliai'
```

`deploy.sh` no longer warns about logrotate; that silence is the check. The
listing is the stronger one — live `.log` files at 0 bytes next to a populated
`.1` (and a `.2.gz`) is `copytruncate` working. A live log frozen at its old
size while `.1` grows is the failure this file exists to prevent.

## Try it on localhost — 8.2

```bash
npm run dev
# In another terminal, with a live draft whose pool has no legal pick left:
# the worker marks stuck_reason; as commissioner open /leagues/<id>/draft and
# look for the Correction above the controls (data-testid="draft-stuck").
# Sign in as a non-manager member of the same league: the banner is gone.
```

A stuck reason is a single write after the sweep refuses; clearing it is
another single write when the draft moves again. Stats failures stay in the
worker log — they do not stop a draft and they have no league to attach to.

## Try it on localhost — 8.1

```bash
npm run pb:backup
npm run pb:restore-drill -- pb/pb_data/backups/eurovafliai-<stamp>.zip
```

The drill extracts into a disposable directory, boots the pinned binary on a
spare port, runs `pb:verify` against it, and tears everything down. The live
`pb/pb_data` is never touched.

The VPS units are already installed and firing. To re-check them:

```bash
ssh hstgr 'systemctl list-timers eurovafliai-backup.timer --no-pager'
ssh hstgr 'ls -lah /var/www/eurovafliai/pb/pb_data/backups/'
```

`deploy.sh` no longer warns that the timer is disabled or that the newest
archive is stale; that silence is the check. Look at `LAST` in the timer
listing and at the newest stamp — a timer that is `enabled` but failing is the
case the 48h warning exists for, and `journalctl -u eurovafliai-backup.service`
is where it would say why.

## Try it on localhost — 8.5

```bash
npm run dev
```

Sign in at `http://localhost:3007`. With no leagues, the empty slot names Start
and Join below it. Open `/leagues/not-a-real-id`: the board says the slot is
missing and **Your leagues** is the way back (the same page a stranger sees on
someone else's lobby). On a league still in setup, Standings and This round
point back to the lobby instead of a blank table.

## Try it on localhost — the commissioner legality fix

```bash
npm run dev
```

Roll and start a two-member draft as the commissioner, then enter a pick for
the *other* member until one of their position buckets is full. Open the pool
with `Position C` on: the remaining center reads as yours to take, because it
is — no "No room", and `Legal for me` keeps it. Tapping the row still asks the
server, and the server still refuses the pick *for them*. The "You still need"
line, the radar and the pool now all name one roster: yours.

## Try it — the nginx drift warning, and a production restore drill

```bash
npx vitest run tests/unit/nginx-vhost-canonical.test.ts
scp hstgr:/etc/nginx/sites-available/eurovafliai.labrium.online /tmp/live.conf
npx tsx scripts/nginx-vhost-canonical.ts /tmp/live.conf \
  deploy/nginx/eurovafliai.labrium.online.conf && echo "clean"
```

The live vhost must now compare **clean**, because the only differences were a
comment header that no deploy refreshes and the `listen` line certbot rewrites
— neither of which is configuration. A real `/pb/` edit still warns; there is a
test for a hand-edit hiding behind a comment.

For the drill against a production archive:

```bash
scp hstgr:/var/www/eurovafliai/pb/pb_data/backups/eurovafliai-<stamp>.zip /tmp/
npm run pb:restore-drill -- /tmp/eurovafliai-<stamp>.zip --adopt-superuser
```

Ends with `Restore drill passed`. Delete the archive afterwards — it is the
league's real data.

## Try it — slice 8.0

```bash
npx vitest run tests/unit/nginx-vhost-canonical.test.ts tests/unit/deploy-reexec.test.ts
```

There is no changed page. After this merges, the **first** production deploy
still runs the previous `deploy.sh` (it has no re-exec). The **next** deploy's
log must show `Deploy script after re-exec` and must **not** warn that the
nginx vhost differs from git.

## Try it on localhost — export

```bash
npm run dev
```

Open a league that has drafted, then **Export the draft** on the lobby. All
four boxes start ticked; untick everything but *Rosters as drafted*, leave the
format on CSV and press Download. The file is named for the league and the day,
and the rows are grouped by team and then G/F/C — the centre appears below the
guards even when the centre was picked first. Every player name is quoted,
because they are all "Surname, Firstname". Then export two things at once and
open the file: two labelled sections, one blank line between them. A league
still in setup says there is nothing to export instead of offering a button.

## Try it on localhost — U4

```bash
npm run dev
```

Open Standings, This round, a team and Record a transaction from a season
lobby. Each page starts with the same framed season control; choose `E2025` and
follow a team link to see the scoring season stay with the route.

## Try it on localhost — U3

```bash
npm run dev
```

Open a live draft room. Pool, radar and board are framed sibling tasks; roster
needs stay beside the clock. Tap the last radar row in a wide league and its
board column moves into view below the sticky band.

## Try it on localhost — U2

```bash
npm run dev
```

Open a setup league at `/leagues/[id]`, then mark a team ready. The member
rule changes from waiting to filled, chat and its composer stay open in one
framed panel, and Roll does not take the marker until everybody is ready.

## Try it on localhost — U1

```bash
npm run dev
```

Open `/login` signed out, then `/` signed in. The login door and the league
board are framed once; a populated home keeps Create in ink, names each roster
count, and leaves the clock's marker unused.

## Try it on localhost — U0

```bash
npx vitest run src/app/tokens.test.ts
```

There is intentionally no changed page to open. This system-only slice proves
the deeper stock, framed Bank and every existing text/rule pairing before U1
puts the material on screen.

## Try it on localhost — R1

```bash
npm run dev
npm run rehearsal
```

Watch eight isolated rooms complete 104 picks. The command prints propagation
percentiles and writes the same report to `docs/log/rehearsal.md`.

## Try it on localhost — slice 5.4

```bash
npm run dev
# season league with counted snapshots (see 5.3 / 4.5)
```

Open the lobby. **This round** is next to Standings. Latest counted night:
each team's tenths, the best night, the deal that moved most. Add
`?round=2&season=E2025` for a known night. A league still drafting says there
is no recap yet.

## Try it on localhost — slice 5.3

```bash
npm run dev
# season league with a recorded trade (see 5.2) and imported nights
```

Open a roster from the lobby. Under the names: each deal, a signed fantasy
total, PIR, and a wrapping per-round run from `from_round` onward. Add
`?season=E2025` if you scored last season. A roster with no deals says no
trades are recorded yet.

## Try it on localhost — slice 5.2

```bash
npm run dev
# league already in season (finish a tiny practice draft if needed)
```

Open the lobby as commissioner. **Record a transaction** → pick Trade, tap one
player on each roster, set **Counts from round** to `2`, Record this. The lobby
chat names both teams. Open each roster: the names have swapped. Open
Standings (use `?season=E2025` if you imported last season): round 1 still sits
with the old owner, round 2 and after with the new one.

## Try it on localhost — slice 5.1

```bash
npm run dev
# complete a tiny practice draft (roll, start, fill the board)
```

When the last pick lands, the league is `season`. Open the lobby: each member
name is a link. Open yours — the thirteen (or however many the template asked
for) names, plus that member's radar. Open **Standings** and tap a name: the
same roster.

To see the repair: delete the `roster_memberships` rows for that league in the
admin UI (or leave a crash between complete and the loop), then:

```bash
npm run standings:recompute -- --season=E2025
```

The windows come back from the complete draft, and a second run writes
`0 snapshot(s)` once the table already matches.

## Try it on localhost — slice 4.5

```bash
npm run dev
# complete a tiny practice draft (roll, start, fill the board)
# then import last season against it:
```

On `/stats/import`, set the season field to `E2025`, paste a round (or run
`npm run stats:sync -- --season=E2025 --max=3`), then:

```bash
npm run standings:recompute -- --season=E2025
```

Open the lobby → **Standings** (`?season=E2025` if the env season is still
E2026). Ranked slots, totals in tenths, per-round numbers wrapping under the
name. Toggle `RS` off and `PO` on: playoff nights drop in or out without another
import. Open `/players`, a club, a name: that player's game log (round, club,
PIR, fantasy tenths). Run `standings:recompute` again: `0 snapshot(s) written`.

## Try it on localhost — slice 4.4

```bash
npm run dev
npm run stats:sync -- --season=E2025 --max=3
npm run stats:project -- --season=E2025
```

E2026 has no played games until 24 September, so last season is what draft night
has to rank on. Then:

- **Read the line `stats:project` prints.** It names how many player rows it
  wrote. Run it again: `0 player(s) written`, because the recompute is
  idempotent.
- **Open a draft room.** Pool rows that have played show a last-5 number next
  to the club, in tenths (`14.2`). Press `15+`: anyone below that, and anyone
  with no games, leaves the list. Press it again and they return.
- **Leave a member without a cheat sheet and let the clock run out** (or arm
  autodraft). The pick is the legal player with the best last-5, not the lowest
  id.

## Try it on localhost — the code-health pass

```bash
npm run lint:dead        # knip: unused files, exports, dependencies — now a CI job
npm run test             # 1021 unit tests; memberships, standings join, and the snapshot recompute are covered now
CI=1 npm run test:e2e    # what CI runs: Playwright against `next start` over a fresh build
```

Then `npm run dev`, open `http://localhost:3007`, and paste a wrong invite
code into **Join a league**: the refusal renders under the form from
`useActionState`, and the URL stays clean — no `?error=` in the address bar,
which is what closed [#16](https://github.com/andrius-burba-94/eurovafliai/issues/16).
In a draft room with picks on the board, open **Undo a pick** and change the
number: the line under it now says how many picks *that* number would discard,
before the button.

`npm run test` is **1021** unit tests after the mapping doorbell. (It read 983
here through 8.5 while `main` had moved to 1002 — the nginx-canonical and
logrotate work added tests without correcting this line. Measured, not
remembered: `npm run test` on the parent commit, then again after.)

## Try it on localhost — slice 4.2

```bash
npm run dev
npm run rosters:sync -- --dry-run   # read the plan; it writes nothing
```

The dry run is where this slice shows itself. Look for the line:

```
Plan: +6 add · ~23 change · 10 leaving · 15 suspected rename(s) held back · …
  = Burnell, Jason → Burnell, Jason Scott (MIL, code 014782) — same player? …
  ? Juzang, Johnny (ULK) has no code — best guess Juzang, Jonathan: …
```

Every `=` is a player a sync would otherwise have departed *and* re-added as a
duplicate. Then, signed in as a commissioner:

- **Open `/players` → `Player mapping`.** Press `Check the feed`: 21 requests,
  a few seconds, and it writes nothing to the pool.
- **Read one `=` row.** It names both spellings, the club, the code and *why*
  the two names are believed to be one person — in tokens you can check.
- **Press `Same player`.** The row goes and a sentence says what happened. Look
  the player up in `/players`: same row, new name, code attached. That the **id
  did not change** is the whole point — a delete-and-recreate would have
  detached their picks, sheets and box scores.
- **Read a `?` row.** It has a `<select>`, because a nickname is not a
  string-distance problem: `Aj` and `Anthony` share one letter. Choose, or say
  `Different people` — which adds the arrival and departs the stored row, i.e.
  exactly what the sync would have done unasked.
- **Codes from box scores** is the other direction, and it is empty until an
  import meets one. `npm run stats:sync -- --season=E2025 --max=3` produces
  about twenty, because the local pool is *this* season's rosters.

## Try it on localhost — slice 4.3

```bash
npm run dev                                  # Next :3007 + PocketBase :8095
npm run rosters:sync                         # the fetcher matches on person code
npm run stats:sync -- --season=E2025 --max=3  # one pass, by hand, against last season
```

E2026 has no played games until 24 September, so point it at **E2025** to see
it work at all. Then:

- **Read the line it prints.** `3 game(s), 51 new, 21 unmatched code(s) · 402
  outstanding` — the unmatched codes are the point: the local pool is *this*
  season's rosters, so last season's departed players have nowhere to go. That
  is 4.2's input, and it is honest rather than silent.
- **Run the same command again.** It imports the *next* three games rather
  than redoing the first three. Nothing is stored twice, and nothing had to
  remember what the last run did.
- **Open `/stats/import`** and look at the batch list: the newest rows say
  `api` rather than `csv`, and both doors write the same shape.
- **Watch the worker do it**: `npm run worker:dev`. A minute after boot it logs
  `stats fetch on · E2026 · every 15min` and then one pass. With `E2026` there
  is nothing to import yet, so it says nothing at all — a pass with no work is
  deliberately silent, or the log would be useless four times an hour.
- **Turn it off**: `STATS_FETCH=off` in `.env`. The worker says so on boot and
  keeps enforcing pick deadlines, which is the point of the switch.

## Try it on localhost — slice 4.1

```bash
npm run dev              # Next :3007 + PocketBase :8095
npm run rosters:sync     # once, if the pool is empty — the importer matches on person code
npm run stats:golden -- --check   # optional: ask the feed whether it still agrees with the fixture
```

Sign in as a commissioner and open **`/stats/import`**. Then:

- **Press `Show the header row`** and copy it. That is the sheet's shape: the
  feed's own column names, 27 of them, order irrelevant because the header
  names them.
- **Paste one line** under it — any `person_code` from the pool, a game code, a
  round, a club, the two scores, then the counts. Press `Read the sheet`.
  Nothing is stored yet; the plan says what would be.
- **Include a `valuation`** (the official PIR) that does *not* match the
  numbers beside it. The line is refused and told which two numbers disagree —
  the golden test, running on your paste.
- **Press `Store`**, then paste the *same* sheet again and read it. It says
  *already stored* and there is no button to press. That is the failure-recovery
  story you can see: re-running an import is always safe.
- **Change one number and read it again.** It is a *correction*, and it is
  spelled out field by field before you store it, because a correction rewrites
  a game the standings have already counted.
- **Check the arithmetic yourself**: a line worth PIR 3 on a win stores
  `fantasy_pts: 33` — tenths, not 3.3 — and the same line on a loss stores 30.

## Export — take the draft away with you

**Done, and out of phase.** Not a blueprint slice: it was asked for directly,
so it is recorded here as its own section rather than fitted into a phase table
it does not belong to.

Any member of a league can export its draft from a door on the lobby, in **CSV
or JSON**, choosing any of four things: the **results** (every pick in order),
the **rosters as drafted**, the **draft order**, and the **player pool**. The
picker is `/leagues/[id]/export` and the file comes from
`/leagues/[id]/export/download`, one segment lower because Next refuses a
`page.tsx` and a `route.ts` in the same segment.

Four decisions worth knowing before changing it:

- **A plain `method="get"` form.** No JavaScript on this surface at all: the
  checkboxes become query parameters and the handler answers with a file. That
  also makes the result a **URL somebody can paste into the league chat**, which
  is where the file is actually going.
- **Any member, not the commissioner.** The board is already readable by
  everyone in the league, so a file of what it says is not a new permission —
  and one person owning a spreadsheet everybody wants is a bottleneck for ten
  friends. The route still authenticates *itself*: `proxy.ts` is optimistic, so
  `readDraftExport` calls `getSession()` and then checks membership, and a
  non-member gets the same `404` as a league that does not exist.
- **Reads go through `getDraftView`**, the room's own query, rather than
  fetching picks again. It costs an extra read the export does not need (the
  chat) and buys the thing that matters: the board and the file resolve a team
  name, a player's club and who holds whom through **one** code path, so a name
  cannot read one way on the board and another in the file somebody keeps.
- **CSV has no second sheet.** One selected kind is a plain sheet with no
  preamble — the case a spreadsheet import expects. Two or more are written as
  labelled sections separated by a blank line, because the alternative is a zip
  dependency for a league of ten. Anything that will be *parsed* should ask for
  JSON, which always keys every kind plus the league and the timestamp.

`"Rosters as drafted"` is named that way on purpose: a trade moves a player
without moving the pick that took them, so this is the draft and **not**
today's squads. The label, the page's own note and the module header all say so
together, because that is the one reading of this file that would be wrong.

Also new: `src/lib/csv/write.ts`, the writer half of `split.ts`. Its test
round-trips through `splitCsvLine`, so the two halves are checked against each
other rather than each against its author's idea of the format.

**One gap, stated rather than left to be discovered:** the door is on the
lobby, and a member of a league in **season** sees the dashboard, which replaces
the lobby's body. The door is rendered in its own run gated on membership alone
so it survives that replacement — but if the dashboard ever grows its own run
of doors, the export belongs in it.

## Legend

| State | Meaning |
|---|---|
| **done** | Merged to `main`, and its part of the phase DoD holds |
| **partial** | Merged, but something it was scoped to cover was deferred — the Notes say what |
| **next** | The slice being picked up now |
| **todo** | Not started |

---

## Phase 0 — Repository bootstrap & foundation

**Complete.** DoD held: a fresh clone runs `./scripts/pb-download.sh && npm i &&
npm run dev`, and PRs go green through CI.

| Slice | State | Landed |
|---|---|---|
| 0.1 Repo & runtime — Next 16, TS strict, Tailwind v4, Node 24 pin, branch protection | done | `c5bc635`, #1, #8 |
| 0.2 PocketBase — pinned 0.39.11, checksum-verified download, committed migrations | done | `913944e` |
| 0.3 Testing & CI — Vitest + Playwright, GitHub Actions | done | `f42c427`, #14 |
| 0.4 Skills install — mattpocock-skills, impeccable, 3 project skills | done | `5160cbe` |
| 0.5 Foundation docs — CLAUDE/AGENTS/CONTEXT/PRODUCT/DESIGN, ADR 0001–0003 | done | `f9da3f5`, #5 |
| 0.6 Env plumbing — `.env.example` + validated config module | done | `3d13c4d` |

## Phase 1 — Walking skeleton: auth, league, lobby, deployed

**Done.** DoD — *"phone + PC, two Google accounts, live lobby on the production
subdomain"* — is met. The site serves over TLS, realtime is confirmed through
the production nginx proxy, and the three-account production draft recorded at
the top of this file ran across several real devices, the board updating on each
of them. One person drove all of them, so this closes Phase 1's device claim and
**not** the separate question 3.7 / D12 asks: whether the night feels right with
friends in one room.

**Production:** `https://eurovafliai.labrium.online`, on the shared Hostinger
box `srv837724` — app on `127.0.0.1:3007`, PocketBase on `127.0.0.1:8095`.
Eight other apps live there; see `docs/runbooks/vps-setup.md` before touching
anything.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 1.1 Schema — `leagues`, `league_members`, Google OAuth2 on `users` | done | #2 | Rules and indexes asserted by `npm run pb:verify` |
| 1.2 Auth — Google sign-in, httpOnly session, route protection | done | #6, #11, #12, #13 | Password sign-up closed; first-time Google OAuth2 sign-up proven against a local OIDC issuer |
| 1.3a League & lobby — create, join by code, lobby page | done | #10 | Shipped without the realtime list or the commissioner controls; both landed in 1.3b |
| 1.3b Lobby, finished — live list, real names, team names, ready, kick | done | #19 | Closes #15. Realtime SSE with the viewer's token — the first use of the `authToken` pattern, and the shape the draft room will copy |
| 1.4 Design foundation — tokens, app shell, the board's vocabulary | done | #17 | The Draft Board Wall. Contract recorded in `DESIGN.md` |
| 1.5 Deploy — VPS, PM2 + systemd, SSE-safe Nginx, `deploy.sh`, auto-deploy | done | #20 | Live behind Certbot TLS. Node 24 is installed for this app alone via fnm, because the box runs Node 22 for eight other apps and this repo's `engine-strict` makes `npm ci` refuse it. **Realtime verified in production**, not just locally — `PB_CONNECT` through the `/pb/` proxy in 0.1s, unbuffered |

## Phase 2 — Draft engine v1, the TDD phase

**Complete.** The rehearsal its DoD asked for is **waived** — blueprint **D12** —
and the reasoning is there rather than here: every mechanism the DoD names is
built and tested, and the ceremony had been the last open item on a phase that
has been code-complete for five slices. A DoD nobody intends to perform makes
every phase after it provisional.

What is genuinely untested is the part only people can test: whether draft night
*feels* right on eight phones in one room. **That is 3.7's own DoD**, which
already asks for a rehearsal draft night with friends on mixed devices — one
rehearsal, once, against the finished draft-day experience rather than against a
half-built one.

The original DoD read: *"a full 13-round mock draft on
phone + PC with one member on autodraft, a mid-draft rollback, and the engine
suite covering every format × edge case"*. Every mechanism it names now exists
and is tested: the engine suite (2.2), the pick pipeline, the room and rollback
(2.4), and the worker that enforces the clock and drafts for the absent (2.5). A
13-round draft has been run end to end locally, but by the worker rather than by
people — so what remains is literally the phase's own wording: **a mock draft
with humans on two devices**, with a rollback in the middle. Until somebody runs
it, this phase was complete-pending-rehearsal. It is now simply complete, and
the rehearsal lives in 3.7.

**Phase 1's two-device confirmation was a separate, smaller row — two accounts,
two devices, one lobby — and it is now closed** by the three-account production
draft, which ran on several real devices. Its row under Open debt records what
that does and does not prove.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 2.1a Roster ingestion — the shared pipeline and the API front door | **partial** | #24 | Landed: `players` / `roster_imports` / `app_settings` migrations, the pure normalize→diff pipeline (41 tests), the API sync (`npm run rosters:sync`, idempotent, rate-limit-resilient), the authority *gate*, and the `/players` pool page with source and lock badges. **Deferred to 2.1b, deliberately:** the CSV front door, the web diff preview, and any UI for flipping the authority or setting `manual_lock` — all three are commissioner controls, and the app has no app-global admin role yet (see Open debt). Both are settable in the database meanwhile |
| 2.1b Roster ingestion — the CSV front door and the roster authority | done | — | Paste a sheet at `/players/import`, read the plan, then apply. Preview writes nothing at all; applying **re-parses and re-diffs** rather than trusting the preview, so a plan left in a tab cannot write itself against a table that moved. Authority flips between `api` and `csv` from the same page. Gated on the league's permission rule. **Deferred:** per-player `manual_lock` toggles in the UI — the lock is honoured everywhere and settable in the database, but there is no button for it yet |
| **2.2 Engine library** — `buildPickOrder`, `whoIsOnClock`, `isLegalPick`, `selectAutoPick`, `computeRollback` | done | #22 | Pure, **175 tests**. Purity is **enforced** by `purity.test.ts`, not just asserted — it reads the source and fails on a PocketBase import, I/O, an implicit clock, or randomness. 2.5 found and fixed one real bug in it: `rankForMember` subtracted two `-Infinity`s for a pool with no projections, and `Array#sort` reads the resulting NaN as "equal" — so the documented player-id tiebreak was dead code for *every* pool that exists before Phase 4.4, and the ranking silently became whatever order the caller passed. Fixed with a test for the both-absent case, which is the case the suite had never had |
| 2.3a Draft setup & order determination — settings, the seeded roll, manual order | done | — | No new collection: settings live in `leagues.settings`, positions on `league_members.draft_position` (the field 1.1 created and left "unset until the roll"). `rollOrder` is pure and seeded, so a roll **replays identically** — which is what makes a half-written roll repairable by re-applying rather than re-rolling, and what 2.3b's reveal will replay from. `reverse_standings` is in the vocabulary and refused with its reason: it needs Phase 4's `standings_snapshots` |
| 2.3b The roll, revealed live — one slot at a time, plus reshuffle | done | — | The order lands last-slot-first for everyone at once, driven by the seed changing rather than by any new state — so it plays on a first roll and on a reshuffle, and never on a reload or a re-apply. Reduced motion gets the finished order immediately, which every other E2E spec covers since the suite forces `reduce`. **Reshuffle** is a separate action behind a tick-box: `Re-apply` must be safe to press twice, changing who picks first must not happen by accident |
| 2.4 Pick pipeline — `drafts` + `picks` migrations, `makePick`, pause/resume, rollback | done | — | A draft can be started, picked through, paused, resumed and undone. Pick-then-advance writes the pick first and advances second, with `repairUnadvanced` running *before* the read on the next pick — so a crash between the two writes costs nothing and the next pick repairs it. Both unique indexes are exercised by `pb:verify`, not merely declared. A commissioner or deputy may enter a pick **for** whoever is on the clock (the button reads "Pick for them"), which is what keeps a draft moving when a phone dies. Every refusal revalidates the room, so a stale tab is corrected by the act of being wrong. Undo discards highest-numbered pick first and re-points the draft last, so a half-run undo leaves a shorter contiguous board rather than a hole, and pressing it again finishes the job; it always lands **paused**. The one piece of 2.4's blueprint text not here is the system **chat message** announcing a rollback — there is no chat until 3.4 |
| 2.5 Worker — the ~1s sweep, autodraft, repair, `/api/time` | done | — | The heartbeat became a loop. One `sweepOnce` a second: autodraft for whoever is out of time (a 1s grace period past zero, so a member who taps on zero beats the sweep and the loser of that race is refused by the index either way) or has armed it, plus three repairs nothing else would notice — an unadvanced pick, a live draft whose every slot is filled, and a live draft whose deadline went missing. It refuses two things on purpose: a pool with no legal player, and a board with a hole in it, both of which are logged once and left for the commissioner (§7 — the worker running must corrupt no more than the worker dying). **The pick pipeline moved to `src/lib/drafts/pipeline.ts`**, framework-free, so the sweep and the server action land a pick through the *same* `commitPick` — a human pick and an automatic one cannot diverge. Autodraft is armed by the member themselves ("Draft for me" in the room, `league_members.autodraft_enabled`, the field 1.1 created and nothing used); the commissioner's per-member version is 3.6. `/api/time` plus an offset-corrected countdown finish 2.6's clock. Three properties are worth knowing before touching it: a **repair is the tick's one action** for that draft (carrying on meant reasoning about a record that had just changed, which handed the next member an expired clock); the sweep **re-reads the draft immediately before it writes**, so a pause or a rollback landing mid-tick is not written through; and the worker **counts its own intervals outside the tick**, so a wedged PocketBase produces a log line saying no deadline is being enforced rather than silence from a process everything else calls healthy |
| 2.6 Minimal draft room | done | — | Shipped with 2.4, since a pick pipeline nobody can reach is not testable. `/leagues/[id]/draft`: on the clock at the top of the phone viewport, the positions you still need, the manager's controls, a filtered pool and the board newest-first. 2.5 added the countdown — display only, corrected against `/api/time`, incapable of firing a pick. **This row said `done` for two slices while it was not.** 2.6's own blueprint text asks for "realtime subscription wiring, connection-lost indicator", and neither shipped; the gap was recorded in Open debt but the row still claimed the slice. Both landed after the first real two-device draft ran into it, and the row is now true. Correctness before beauty — fuzzy search, tiers and the radar are still Phase 3 |

## Phase 3 — Draft-day experience (the flagship UI)

**Started, out of order.** The plan is 3.1 → 3.7; what actually happened is that
running a real draft on two devices produced two findings, and both were
answered before the board was built. That is the right order — a beautiful board
nobody's screen updates is worth less than a plain one that does. The board has
now landed on top of them.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **3.1 Draft board — the rounds × teams grid** | done | `920439e`, critique `66f7fe7` | Rounds down, members across, in a region that scrolls sideways inside the app's one `max-w-3xl` column — no second container width and no new breakpoint, which settles DESIGN.md's open question 4 and accepts knowingly that a twelve-member league scrolls on a laptop too. **Columns are members, not pick slots**: a column has to be one member's roster or every column of a snake draft is a zigzag of two people's players. The layout is a new pure engine function, `buildBoardShape`, and it is computed **from `buildPickOrder`** rather than from its own parity arithmetic — round direction stays decided in exactly one place, so this board is already right for any format that function is right for, including ones not written yet. Round numbers are sticky, so the row stays labelled while the columns move. Grid layout with table roles, because a rounds × members wall genuinely is tabular data and a real `<table>` cannot both divide its container and overflow it. `BoardPlan` **stays** — the login page and the lobby have no draft to draw (open question 2, answered). A **paused** board keeps its marker on the slot the draft stands at — strictly nobody is on the clock while paused, but the room's own banner is struck in marker throughout a pause, and a board that alone showed nothing was the odd one out; a complete board has no marked slot, because there is no next one. The chronological run below the board is now a **ticker**, capped at the last 8: the board above it holds the history, and the run is better at the sentence — who took whom, and whether the worker did it |
| **3.2 Live Roster Radar** | done | `3d218e5`, critique `3cd3230` | Shipped in three pieces across three slices, which is worth knowing when reading the blueprint's one bullet: the **realtime half** belonged to 2.6, the **legality muting** landed with 3.3, and this slice is the **radar itself** — one row per member, one mark per roster slot, grouped the way the template is written. Rows are in draft order so the radar reads *down* the same order the board reads *across*; the two answer different questions, because the board is sorted by when a pick happened and the radar by what a roster is missing. It fits a phone with no scrolling at all, which the board cannot, for the plain reason that a mark is not a name. The layout is a pure engine function (`buildRadar`) because the template is a **rule** read from league settings — the blueprint leaves open whether a twelve-member league drops to eleven-man rosters, and a radar that had assumed 5/5/3 would be a second place to correct when that lands. A pick that does not fit the template is **drawn** as a correction rather than dropped: there should never be one, and a radar that discarded it would hide the only state that would mean the referee had failed. 3.1's board is the closest thing to it today: a column *is* a member's roster, and the position letter and wash are in every filled slot, so "who still needs a center" is readable off the wall by eye rather than stated |
| **3.3 Player pool: filters + fuzzy search** | done | `cdb1e51`, critique `66f7fe7` | Landed: fuse.js over the whole pool in the browser (no round trip per keystroke), position, club, hide-drafted and fit-to-play filters, legality muting brought forward from 3.2, and a keyboard path — type, arrow, **Enter to arm**, Enter again to pick, Escape to cancel. The blueprint says "enter to queue pick" and there is no queue until 3.4, so arming is what Enter does: a pick is undoable only by a commissioner rollback and Enter is the key people press to dismiss things. Diacritic folding is not reimplemented — the browser is sent ingestion's own `name_normalized`, so "valanciunas" finds Valančiūnas because 2.1a already folded it. The pool now arrives **whole**, drafted players included and marked with who took them, because "hide drafted" is a filter and a filter needs something to filter. **The projected-points filter landed with 4.4** — last-5 floors of 10+ / 15+ / 20+, and an unprojected player fails them the way autodraft ranks them last. The *cheat-sheet tier* filter shipped in 3.4a, along with an "on my sheet" toggle, because the working agreement is that debt a slice touches is debt that slice fixes |
| **3.4a Cheat sheets — the sheet, the door and autodraft** | done | — | Paste a ranked list at `/leagues/[id]/sheet`, read what it matched, answer whatever was ambiguous, save. Autodraft then picks from it. **The sheet is keyed on the membership, not on the draft**, which is a deliberate divergence from the blueprint's `unique(member, draft)` and is argued in the migration: `startDraft` creates the `drafts` record, so a sheet keyed on one could not exist until the moment it stopped being useful to write — and 3.6a's "start over" deletes the draft, which would have thrown away every member's preparation. It is **private**, and that is the only collection in the app private *within* a league: `pb:verify` drives two members of one league and asserts the second cannot read the first's. Matching is fuzzy with a **confirm step** — two players the pool cannot tell apart resolve to nothing until a human chooses, because a sheet drives autodraft and a silently wrong match is a player drafted for somebody who never wrote them down. Applying **re-parses and re-matches** rather than trusting the preview, the same discipline as 2.1b, and here it earns its keep: ingestion runs nightly between writing a sheet and drafting from it. The room's pool is now ordered by the viewer's sheet and pins the best three still available from it, computed through the engine's own `rankForMember` and `isLegalPick` so the pinned shortlist and the pick the sweep would make are the same answer |
| **3.4b Cheat sheets — editing one by hand** | done | — | **Arm, then move.** Tap a row to pick it up — 2px dashed ink, a new `slot-transit` state on `Slot` — and every verb appears in one sticky bar rather than three controls on each of sixty rows: at 44px on both axes that is 132px of buttons beside `#N`, a name, a club and a patch inside 390px, and 3.4a already overflowed this surface by 161px once. Tap another row to drop it there, **drag** the held row, or press `↑`/`↓`; `Escape` puts it down. A player comes off the sheet in one tap. `cheat_sheets.source` finally has something writing `manual`, and no migration was needed because 3.4a declared the value for this slice. **Three things are worth knowing before touching it.** (1) A nudge is a **relative** operation. Written as "move to rank − 1" it was computed on the client from the rank last rendered, so two quick presses of `↑` both resolved to the same destination and the second did nothing — found by a spec that pressed the button twice. (2) The wire carries the **operation**, not the new ranking, and the server applies it to the sheet *as stored*: a tab holding a stale view cannot overwrite an edit made elsewhere, which matters because PocketBase has no transaction to notice. `applyOperation` is pure and runs twice — optimistically here, authoritatively there — the same one-pipeline discipline as `commitPick`. (3) Breaks are **places, not labels**: moving a player past one changes that player's tier and leaves the break where it was put, which is the argument `ranking.ts` makes where the type is declared. A remove is the one edit that moves breaks, because every rank above it shifts down. **The blueprint says dnd-kit and there is none** — argued below rather than deferred. **Followed by an `/impeccable critique` that scored it 17/40 and whose every finding is fixed in the slice**, 3.4a-style, rather than in a follow-up PR: see the critique section below for the five that were defects |
| **3.5 League chat** | done | — | The transcript of draft night, and the end of 2.4's deferred line: a **rollback announces itself**, naming how many picks it discarded and which one it rewound to, readable in the room *without opening the panel*. Picks, pauses, resumes, rolls, reshuffles, start-overs and a completed draft all announce too. **The write is a server action and the blueprint's §4 client-direct exception is withdrawn** — its stated latency reason does not hold, because both paths end in the same record create firing the same realtime event, so every *other* device sees a message equally fast. Instant-ness lives on the read side instead: the panel appends straight from the realtime payload rather than asking the server to re-render, which is a deliberate divergence from the room's pattern and justified by chat being the one surface with **no derived state** — the payload *is* the message. A system message is written **last and cannot fail its event** (`announce()` swallows its own errors), so the pipeline's pick-then-advance invariant is untouched and the sweep gains no repair; the accepted cost is that the transcript can have a hole in it. Collapsed by default, with the latest line and an unread count in the header, because a panel that merely said "Chat" would have hidden the one announcement the slice exists for. System voice is **rail blue at 4.64:1**, measured — not marker, which has two jobs and no third — and never colour alone: a system line also has no team name. **Chat replaced the room's ticker** (blueprint D11). Rate-limited per member in the action rather than in PocketBase settings, because configuration on the box is the one thing this repo has kept out of. `pb:verify` gained 11 checks, including that a member **cannot** write chat with their own token. **Followed by an `/impeccable critique` that scored it 21/40 and whose every finding is fixed in the slice**, 3.4a-style; see below for the two P0s |
| **3.6a Start over** | done | `0540606` | Out of 3.6's slice, brought forward by draft-night feedback: pause is reversible and undo walks the board back, but nothing threw a draft away, so a practice run could only be cleared by editing the database. "Start over" deletes the draft and its picks (`picks.draft` cascades, so the board goes in one operation rather than a delete loop that can stop half way) and returns the league to the lobby, keeping the draft order — somebody who started too early should not have to re-roll. Behind a typed word, because it is the only control in the room that destroys work. Deletes the draft **first** so the only crash state is a league claiming to draft with no draft to open, which `reconcileLeagueStatus` now repairs; the reverse order would leave a `setup` league with a live draft that `startDraft` would silently resume, ignoring a fresh roll. A room whose draft is gone now redirects to the lobby rather than 404ing, which is also what every other member's room does the instant the delete event arrives |
| **3.6b Delete the league** | done | `281bbe1` | The way out. Commissioner only and **not delegable** — a deputy is trusted to help run the league, not to end it, the same line `setMemberPermission` draws. Confirmed by typing the league's **name** rather than a fixed word, because a commissioner with three leagues open should have to look at which one they are deleting; case and stray spaces are forgiven. Deletes the drafts first, then the league: deleting the league alone *does* work — PocketBase walks the cascade tree — but that leans on an order nothing here pins, while a **direct** delete of a member or player a pick points at is genuinely refused. Both halves measured against 0.39.11 and written into the `pocketbase-patterns` skill, because the difference between "refuses" and "happens to work" is exactly the kind of thing this repo should not have to rediscover. A lobby somebody else has open no longer sits there empty afterwards: every membership vanishing at once means the league is gone, so the list hands back to the server and the page says so — which also, for free, ejects a member who has just been kicked |
| 3.6 Commissioner console — the rest | **cut** | — | Blueprint **D13**, and the argument is that each of the four already has a working path: the sweep autodrafts an absent member from their own sheet and "Pick for them" covers a manager who will not wait; the rollback field works and the board shows every pick number; the timer never needs changing mid-draft if it was set sensibly, and pause covers the rest; and "Pick for them" **is** the offline pick entry the blueprint text predates. What was left was commissioner comfort for eight friends in one room. 3.6a and 3.6b shipped and stay |
| **3.7 Draft-day polish** | done | — | **A tap arms; the tap that drafts is in the sticky band.** Until now a tap on a pool row submitted immediately — so on the device draft night happens on, one tap drafted a player irreversibly, undoable only by a rollback that deletes every pick after it too. The confirm is in the band rather than on the row for a specific reason: with it on the row's own button **a fast double-tap armed and picked inside 200ms**, so the guard would have caught a stray single tap and missed the exact gesture it was built for. That also gives the pointer a `Cancel` it never had, since Escape was keyboard-only, and it makes the pointer path identical to the keyboard's — one idiom, and `ConfirmPick` takes focus so two keystrokes still draft and one still cannot. Same shape 3.4b reached for the sheet, independently. **And the clock can be heard.** A polite live region says "Your turn. Pick 7, round 1." when your turn arrives and **nothing** when somebody else's does; a synthesized two-note tone and `navigator.vibrate` sit behind a per-device toggle beside "Draft for me", off by default. `clockCue` is pure, so the rule that matters is tested without a browser: the cue fires on the *transition into* your turn and never on a re-render — the room re-renders on all ~156 picks of a draft. **Toasts were cut** (blueprint D14). **Followed by an `/impeccable critique` that scored it 24/40 — the best in this project's corpus — and whose every finding is fixed in the slice**; see below. The human rehearsal is what remains of the slice's text |
| **R1 Scripted rehearsal** | done | — | Eight signed-in browser contexts, five Pixel 7 and three desktop, drive the real lobby and draft controls through 104 picks. Two members arm autodraft; one never taps and waits out the 15-second server clock. The run pauses, resumes, rolls pick 16 back, sends chat, checks the one correct on-clock banner on every turn, waits for seven peers to fill the slot, and verifies the season handoff plus all 104 membership windows. It records p50/p95 propagation rather than asking someone to watch eight screens. D12 now separates that repeatable evidence from the one claim only friends in a room can make: whether the night feels right |
| **U0 Panel material** | done | — | D17 amends the no-card rule without abandoning it: a Bank may be framed once with deep stock and one strong rule, but framed Banks never nest and nothing rounds, shadows or floats. The deeper field forced the honest cost into the palette: marker, rail, faint ink and the waiting rule darkened just enough to keep their existing contrast floors on both stocks. `tokens.test.ts` measures every text, boundary and position-wash pairing before any page adopts the material. U1 is the first visual rollout |
| **U1 Shell, home and login** | done | — | The home now leads with an `h1` and a framed league board, with Start and Join as sibling framed tasks. Setup uses the waiting rule; every established league uses the filled rule, so `drafting` no longer steals the on-the-clock marker. Each row says `Your roster`, prints current/template G/F/C counts and exposes full spoken labels. The rail names the signed-in member and gives Leagues, Pool and Sign out 44px targets on both axes. Login explains the Google handoff and groups its one act in one framed Bank. Independent Impeccable critique moved from 29/40 before to 31/40 after the first post-change pass was corrected; the final pass has no P0/P1 findings and the detector is clean |
| **U2 Lobby and chat** | done | — | The lobby now reads title first, then one framed invite or Door run, Your team, framed Members, framed chat, the private sheet and the folded way out. `Door` owns every whole-row destination. During setup, an unready member is waiting and a ready member filled, with both states also written; after setup, free slots and the ready tally disappear. Lobby chat opens with its transcript and composer attached to the lower rule; the denser draft room still folds it. System lines remain rail blue and a member line always has a team or account name. The critique's no-ship pass caught two competing marker acts, an empty manual-order control and unevidenced chat claims; the final pass scores 30/40 with no P0/P1/P2 findings and a clean detector |
| **U3 Draft room** | done | — | Pool, radar and board are one level of sibling framed Banks; the sticky band keeps its blush, 2px rule and server-owned confirm path. `You still need` now shares the clock line, so it remains visible while the pool scrolls. Every 44px radar row names and focuses its matching board header, centers far columns inside the horizontal scrollport and measures the actual sticky-band clearance before adjusting the page. Deep-stock gutters keep the board opaque while it moves. The pool's keyboard help is sentence text rather than a long slot label. Independent Impeccable critique moved from 27/40 to 31/40 with no P0/P1 findings and a clean detector. `draftPlayer` and `submitPick` remain the only browser helper tap paths |
| **U4 Season surfaces** | done | — | Standings, This round, team rosters and the transaction builder use sibling framed Banks and one shared framed `SeasonControl`. Its GET select offers the configured season, the previous backfill season and a valid historical URL selection. Standings and recap carry the selection into team links; recap round changes retain it. Transaction selections use ink transit while Record this remains the only marker act. Radar rows link only in the draft room, so the team page no longer advertises a board destination that is not there. Independent Impeccable critique moved from 24/40 to 32/40 with no P0/P1 findings and a clean detector |

## Phase 4 — Player stats, projections, standings

**Done.** 4.1–4.5 are in; Phase 5 is closed after them.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **4.1 Stats schema + scoring engine + CSV import** | done | — | **PIR is not ours to get right by reasoning, so it is checked against theirs.** The box-score feed publishes `valuation`, which *is* PIR — so `scoring.golden.test.ts` replays **168 real player rows from seven E2025 games** and asserts our sum equals the number the Euroleague printed that night, plus all fourteen team totals: **zero mismatches**. Regenerate with `npm run stats:golden`; `-- --check` asks the feed whether it still agrees with the committed fixture. The endpoint the research file left open is pinned (`/games/{code}/stats`), and it came with **one finding that would have been a silent, season-long bug**: the feed's `winner` field is the *season's champion* on every game of the season — `OLY` on all seven samples, five of which it did not play in — and the win is what the ×1.1 bonus hangs on. Derive it from the scoreline; two of the seven agreed by coincidence, so a small sample would have looked fine. **Fantasy points are integer tenths everywhere**, because `3 * 1.1` is `3.3000000000000003` and a season of those in a standings sum is a wrong number nobody can explain. **Blueprint open question 3 is settled** (D15): the ×1.1 applies uniformly, negatives included — cheap to correct later because every component is persisted, and the fixture carries 8 real negative-PIR-on-a-win rows either way. The CSV door has **no `won` column** on purpose (a stated winner is a place to disagree with the scoreline) and **self-checks**: a sheet that brings the official PIR has every line compared against what its own numbers add up to, and a disagreement is refused rather than resolved by guesswork — so the golden check runs on every real import, not only in CI. Idempotent by index, so **re-running an import is the repair**; nothing here deletes, so a partial sheet cannot erase a round |
| **4.2 Player mapping** | done | — | **Not the light verification pass the blueprint expected — it caught a defect that would have split fifteen real players in two.** 2.1's research said 13% of E2026 players had no `person_code` and that the count would fall "as clubs register". It fell, and the clubs registered those players **under their passport names**: `Burnell, Jason` became `Burnell, Jason Scott` *with* a code. So the name+club fallback missed and a sync planned an **add and a departure for the same human** — measured against the live feed as 18 adds and 22 departures, at least 15 of them one person. Box scores attach by `person_code`, so the points would have landed on the new row while a pick or a cheat sheet still pointed at the old one, and 4.3 fetches unattended. `diffRosters` now **quarantines** a likely pair: neither half is written, so the worst case is a stale display name rather than a split identity. On the live pool that turned 18/22 into 6/10. **The rule is token containment, not a fuse threshold** — and that is a measurement, not a preference: over 15 real pairs and 5 hard negatives, fuse's scores *overlap* (true 0.008–0.568, false 0.485–0.777), so any cut-off catching `Duarte, Chris → Theoret Duarte, Christopher` (0.531) also merges `Nunn, Kendrick` with `Nunn, Kevarrius` (0.509) — two real players, one silent identity error. Fuse still ranks the leftovers, which is where a nickname (`Juzang, Johnny → Juzang, Jonathan`) gets offered as a question rather than answered. `/players/mapping` resolves both directions: a rename, and an **unattached person code** from a box score — attaching one also re-imports the games it appeared in, without which the mapping would be cosmetic. A **merge keeps the stored player's id**, so picks, sheets, memberships and stats stay attached |
| **4.3 Automated fetcher (worker cron)** | done | — | **The worker imports box scores by itself, every 15 minutes.** Not nightly, which is what the blueprint says: a Tuesday game that ends at 22:00 is argued about at 22:05, and a nightly job would have nothing to say until morning. One pass = one schedule request → the games that are **played and not already stored** → up to 12 of them, oldest first. That shape is what makes it **self-healing by construction**: a game missed because the box was down, because a parse failed, or because nobody ran the worker for a fortnight is simply still outstanding next time, so there is no backfill path because there is nothing for one to do. It runs `ingestFinishedGames`, which is also all `npm run stats:sync` does — the automatic path and the by-hand path are the same function, the way `commitPick` is shared by a tap and an autodraft. **The SDK the blueprint names was evaluated and declined** (D16): it is alive and it fits, but its schemas validate the whole payload, so a change to a field we never read could refuse a whole round and stop the automation. A tolerant schema over the ten fields we read keeps going, and the roster sync's retry/backoff moved to `src/lib/euroleague/http.ts` so there is one HTTP idiom rather than two. **Every row still self-checks against the feed's own PIR** on the way in, so 4.1's golden assertion now runs against live data four times an hour — a rulebook change would show up as a refused row with both numbers in the log. It has its **own in-flight guard**, never the sweep's: a slow feed response must not delay a pick deadline. Proved against the live feed and the real database, not only against fixtures — 107 real E2025 lines imported by hand, then the second pass moved on to the next games instead of redoing them |
| 4.4 Projections | done | — | **Last-5 and season fantasy averages, materialized onto `players` after each ingest.** Integer tenths, same as `fantasy_pts`. Absence is `proj_last5_games === 0`, not a 0 average — PocketBase stores unset numbers as 0, and autodraft already treats a missing projection as worse than −2. Last-5 of 1–4 played games is last-N; DNPs (`time_played = 0`) do not occupy a slot; order is `(round, game_code)`. Both doors call the same `recomputeProjections` after a write, so a human paste and the fifteen-minute pass cannot diverge. **Draft night is before E2026 tip-off:** backfill E2025 then `npm run stats:project`; the first E2026 ingest overwrites the fields. The pool filter is 10+ / 15+ / 20+ last-5 floors, exclusive `FilterToggle`s, and the number sits on the row. A crash between stats landing and the player rows updating leaves stale averages; running the script again is the repair |
| **4.5 Standings** | done | — | **The first surface that displays a scored night.** Snapshots are a cache, unique `(league, season, round)`, written after ingest the way 4.4 writes projections. The roster join is **active `roster_memberships`** as of 5.1; until then it was the newest complete draft's picks. Totals are stored `fantasy_pts` tenths (`formatTenths` only), so custom per-league weights remain a later rescore. Phase is a filter on the page, default RS; every phase stays in `player_game_stats`. Round-over-round is a wrapping table, not a chart. `/players/[id]` is the game log. `/stats/import` finally has a season field. Repair: `npm run standings:recompute` |

---

## Phase 5 — Season mode: rosters, trades, impact tracking

**Done.** 5.1–5.4 are in. Phase 6 (keepers / slow draft) is luxury; not before
season two is on the horizon.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **5.1 Membership backbone** | done | — | On the last pick, `advance` writes `roster_memberships` (`from_date` = that instant, `from_round: 1`, `acquired_via: draft`) after the draft is complete and the league is `season`. Unique active `(league, player)` is the backstop; a second pass skips anyone who already has an open window. `recomputeStandings` repairs an incomplete set from the newest complete draft **only while no window has been closed**. A complete set does not reread picks. Start-over deletes memberships *before* drafts. Squad of record is the open windows; `/leagues/[id]/teams/[memberId]` is the roster plus that member's radar |
| **5.2 Transactions** | done | — | **Record, do not broker.** Commissioner or deputy writes a trade or an add/drop; there is no offer queue. N-for-N only; drop may leave a hole; add needs a vacancy and an unsigned player. Intent row first (`transactions`), then close windows (`to_date` + exclusive `to_round`), then open, then `announce()` which never throws. Standings join `from_round`/`to_round` so a trade at round 2 leaves round 1 with the old owner. Open draft windows still own every round, so an E2025 backfill matches 4.5 until the first close. `/leagues/[id]/transactions/new` is the builder |
| **5.2a Adds and drops can be saved** | done | — | **Every add and drop had been refused by the database since 5.2.** `players_in` / `players_out` were required JSON, and a drop writes `{}` for nobody arriving (an add, for nobody leaving), which PocketBase treats as blank. Only trades could be recorded; found recording the first real free-agent swaps after E2026 round 1. Migration `1789800000` makes both optional; `members` stays required. `pb:verify` now saves a one-sided add and drop as the superuser: its only one-sided write had been a member-token create, which is refused by the rule whether or not the payload is valid |
| **5.3 Impact tracking** | done | — | Live in − out from box scores, from `from_round` onward, all phases. Fantasy tenths are the headline; PIR sits under them. No new collection and no chart library: a wrapping `R2 -4.3` run. Team page lists that member's deals; a drop's counterfactual is the out sum. `?season=` matches standings |
| **5.5 Fantasy Challenge sync** | done | — | The official game's rosters become transactions, written only inside a round's freeze; previews outside it. Migration `1790200000` (link fields, `fantasy_syncs`). An apply stores its steps as `applying` before the first roster write and the next run finishes it; it is marked applied only when the rosters then equal the official ones. See the section near the top |
| **5.5b Official lineup sync** | done | — | Round lineups read from `/roster/preview` and written as `source = synced` (one upserted row per team), then standings recomputed; the report sets our round total beside the official one. Hourly in a freeze, once after it closes, and finished rounds never synced are filled in — rounds 1–2 on the first pass after deploy. Unlinked lineup players matched from the lineup, else asked. Migration `1790300000` (`synced`, `fantasy_syncs.kind`). **Verified in production**: the first pass after deploy synced rounds 1–3, 8 of 8 each, and round 2 now equals the official table to the hundredth (`docs/log/deploy-checks.md`) |
| **5.4 Weekly recap** | done | — | One Euroleague night. Rank is that round's tenths from `standings_snapshots`, not season-to-date. **Best night** is the highest `fantasy_pts` among players whose window covers the round (a traded-in player can win). **Biggest swing** is the covering deal with the largest absolute `impactForMember` delta that night, shown from the side that gained. No new collection; no chat announce on ingest. `/leagues/[id]/recap?round=&season=` |

## Phase 8 — Hardening & ops polish

**Done, in code and on the box.** 8.0–8.5 are in, and the two human halves —
enabling the backup timer and installing logrotate — are installed on the VPS.
A deploy is now the check: `deploy.sh` §6b/§6c warn on a disabled timer, an
archive older than 48h, and a missing or drifted logrotate file, so the next
run going quiet is the standing proof. What remains open is not an install but
a decision: the archives still sit on the same disk as the database (open-debt
row below).

| Slice | State | Landed | Notes |
|---|---|---|---|
| **8.0 Deploy script hygiene** | done | — | `deploy.sh` pulls, then `exec`s the fresh copy once, passing `BEFORE_SHA`/`AFTER_SHA` so `changed()` does not restart PocketBase on every deploy. The nginx check compares a canonical vhost (certbot TLS + HTTP stub stripped) to git, so a warning means a real `/pb/` edit. Closes #34; the re-exec proved itself on the deploy after this one, as designed. #35 it did **not** close — the canonical form still compared comments and the `listen` line certbot rewrites, so the box warned on every deploy with a byte-correct `/pb/` block. Its own test fixture appended certbot's lines instead of *replacing* `listen 80;`, so CI could not see it. Fixed after the Phase 8 VPS install |
| **8.1 Nightly backup + restore drill** | done | — | Timer + oneshot were already committed. This slice adds `scripts/restore-drill.sh` (`npm run pb:restore-drill`), deploy warnings when the timer is off or the newest archive is older than 48h, the runbook install steps, and a unit-file test that keeps the timer name and `Persistent=true` honest. **Human half now done:** the units are installed and `eurovafliai-backup.timer` is `enabled`/`active`, firing nightly (03:15 + jitter) — four 33 MB archives on the box and the last oneshot exited 0 |
| **8.2 Draft-breaking failure → commissioner banner** | done | — | `stuck_reason` / `stuck_since` on `drafts`; sweep writes on no-legal / board-hole / three consecutive throws, clears when it can move again; commissioner-only `Correction` in the room. Not chat — `chat_messages` has no per-member visibility. Stats failures stay in the log |
| **8.3 PM2 log rotation** | done | — | `deploy/logrotate/eurovafliai` → `/etc/logrotate.d/eurovafliai`, glob `/root/.pm2/logs/eurovafliai-*.log` only, `copytruncate` required. `pm2-logrotate` rejected (daemon-global on a shared box); `out_file` rejected (needs delete+start). Deploy warns on missing/drift. **Human half now done:** the file is at `/etc/logrotate.d/eurovafliai`, byte-identical to git, and visibly rotating — truncated live logs beside a `.1` and a `.2.gz`, which is `copytruncate` + `delaycompress` working rather than merely installed |
| **8.4 Accessibility pass** | done | — | Draft room `h1` (all three band states); disarm restores focus to the armed row (cheat-sheet `focusWanted` idiom); skip link in the root layout → `#main` on `Sheet`; `@axe-core/playwright` over login, home, lobby, draft, standings (serious/critical). Clock live regions already shipped with 3.7 |
| **8.5 Impeccable harden / onboard / adapt / audit** | done | — | A board-shaped `not-found` (missing and forbidden still look the same), Archivo loaded on `global-error` because that file replaces the root layout, a 44×44 `retry`, and `break-words` / `min-w-0` on every name that can be a long one. Empty Banks name the next act as a sibling `Door` in a `Slots` run, never a nested framed Bank, and their `data-testid` stays on the sentence so the framed-Bank E2E assertions still hold. **No tours** — PRODUCT rules out onboarding hand-holding, so first-run is the empty slot itself. English-only, so i18n and RTL were skipped deliberately and the budget went to overflow and recovery. Audit 17/20 |

## Phase 9 — Official rules alignment and the five missing surfaces

**In progress.** Five gaps measured against the official EuroLeague Fantasy
Challenge **Draft Mode** rulebook and against comparable fantasy apps, sequenced
so the draft-night-critical work lands before E2026 tips off on 24 September.

The rulebook settled one thing worth recording before the table: Draft Mode "is
the same as the Classic Mode, except… there is no head coach". So **per-player
scoring is already exactly right** — PIR plus a 10% team-win bonus is what
`scoreGame` computes and what 168 real E2025 rows are golden-tested against —
and **blueprint D4 was right to cut coach scoring**. What D4 got wrong is
**captain 2× and bench 50%**, which Draft Mode keeps; 9.3 put them back.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **9.1 Previous-season stats and PIR on every pool row** | done | — | **The pool row was showing the wrong number, unlabelled.** It printed `proj_last5_fantasy` in soft ink with no heading — fantasy points, which is PIR × 1.1 on a win — so a drafter reading `14.2` was reading a bonus-inflated figure and would reasonably take it for the PIR the league actually talks in. PIR was stored per game and **averaged nowhere**. Now `projectPlayer` returns `last5Pir` / `seasonPir` beside the fantasy pair, and **average PIR is the single ranking number**: the row headline, the `10+/15+/20+` floors, and autodraft all read it, so the eye, the filters and the worker cannot disagree. `EnginePlayer.projectedPoints` is renamed **`rankPir`** — a field called `projectedPoints` carrying PIR is the kind of name CONTEXT.md says to change rather than document. Resolution is stated once, in `averagePirOf`: **last-5 when the player has current-season games, last season otherwise**, which on draft night is uniformly last season because E2026 has no games. Prominence without breaking the Two Jobs Rule (marker red has two jobs "and no third"): a **leading, fixed-width, right-aligned column in full `text-ink`** under a `slot-label` column head, games played beside it, fantasy demoted and labelled `FP`. Measured cost on a Pixel 7: the name column goes 101px → 87px, and the games count and `FP` return at `sm`. **Last season comes from the official stats table**, a v3 bulk endpoint (`npm run stats:prev`) carrying four traps now written into the research doc — omitting `seasonMode=Single` silently returns all-time career leaders, and `statisticMode=perGame` silently drops 127 of 335 players below a 24-game qualification. Our own E2025 backfill is the cross-check and **220 of 222 matched players agreed exactly**. Bios (`height`, `weight`, `birth_date`, `country_*`) now land from the feed and show on `/players/[id]` above a last-season block. **The one-request roster endpoint was tried and rejected**: `/{season}/people?limit=1000` is a registration *history*, not a roster — see the log |
| **9.2 Commissioner control panel** | done | — | **Three of D13's four cut items are back** (blueprint **D18**), because two of their "working paths" were claims about the server rather than a surface. The room's controls were a bare unlabelled `<div>` between "Draft for me" and the pool: no heading, no frame, nothing in the accessibility tree. Now a fourth framed `Bank` — "Running the draft" — carrying pause, the clock, autodraft per member, undo and start-over, ordered by what each costs. **Per-member autodraft** has worked server-side since 2.5 (`setAutodraft` takes a `memberId` and lets a manager set it for anybody); `getDraftView` simply never shipped anyone else's flag, so the only way to reach it was a crafted POST. Rows are in draft order, each with its own refusal. **The mid-draft clock** is the item D13 admitted carried a real correctness question, and the answer is stated once in `setPickClock`: the new deadline is **now plus the new clock**, never the pick's original start plus it — so cutting 120s to 30s cannot hand the member on the clock to the sweep. Asserted against a deadline already ten seconds in the past, which is the state that separates the two implementations; the league's own default follows the draft's, so a start-over does not quietly go back to a minute, and the change announces itself in chat because the countdown everybody is watching jumps. **"Pick for them"** existed only as the pool's Bank heading, 600px down the page; it is now a control in the panel that names whose turn it is spending and leaves the focus in the pool's search box — the radar's own reveal idiom, `href` first so it works before JavaScript. **Skip a turn is refused**, not deferred: see the debt row |
| **9.3 Lineup and captain scoring** | done | — | **Every total the app had printed was thirteen players at 100%**, which the official game's table never is. Draft Mode is Classic Mode without the head coach, so it keeps **captain ×2 and bench ×50%** — blueprint **D19**, amending D4, which cut all three as Classic-only. New `round_lineups` (unique on league+member+season+round, one JSON `slots` field so a lineup either landed or did not) plus `lineup_template` in settings, defaulting to 5 starters + 1 sixth + 4 bench + 3 inactive. **The multiplier applies in `computeStandings`, never at ingest**: `player_game_stats.fantasy_pts` is app-global — one row serves every league — so baking a per-league captain into it would be wrong the moment two leagues arrange the same player differently, and the golden fixture never moves. Rounding is stated once, in `scaleTenths`: multiply, round half away from zero, **per player-round**, which is where halving an odd 3.3 into 1.7 would otherwise let a float into a season of sums. The pure validator refuses transcription errors rather than storing a wrong total — every id inside that round's membership windows, no duplicates, the five exactly full, and the starting five one of the **five official formations** (2-2-1, 1-2-2, 2-1-2, 1-3-1, 3-1-1 as G-F-C); the sixth/bench/inactive caps are *at most*, because 5.2's drop can legally leave a twelve-man roster and a lineup nobody could record is worse than a place left empty. **Carry-forward is the default** and an unarranged round is not silently final: a round with no lineup of its own inherits the last one recorded before it, and a round before any lineup exists is struck on the standings page as a `Correction` naming it. `bestNight` and `impactForMember` take the same weights, so the recap and a trade's delta cannot tell a different story from the table — PIR stays raw in both, because nobody played half a game. Entry at `/leagues/[id]/lineup` for the owner and, per the league's answer, for the commissioner on anyone's behalf: the league is played on the official site and typed in here afterwards |
| **9.3a A round is rounded once** | done | — | **A team's round is summed in hundredths and rounded to tenths once**, not per player. 9.3 rounded each weighed player first, so the first real round printed a bench 18.7 as 9.4 where the official game prints 9.35 — and Monikutės Naktys' official 164.6 as 164.7. `weighHundredths` / `hundredthsToTenths` in `scoring.ts`; `computeStandings` and `impactForMember` both use them, and `standings.test.ts` replays that official round to 1646 tenths. No schema change; a recompute applies it |
| **9.3b Standings in hundredths** | done | — | **Team totals are integer hundredths and are never rounded**, so the table prints what the official game prints: 121.15, 142.75, 164.6. 9.3a still rounded each round to tenths, which put five of E2026 round 1's eight official totals 0.05 off. `standings_snapshots.table` rows now carry `totalHundredths` / `roundHundredths`; `snapshotRowsFrom` reads an older tenths row as ×10 until a recompute rewrites it. `formatHundredths` shows the second decimal only when it is not zero, so whole-tenth totals read as before. Single-player figures (best night, a deal's impact) stay in tenths |
| **9.4 Injury and transfer news** | done | — | **`injured` was a status nothing had ever written**, and `diffRosters`' `LOCAL_STATUSES` guard had spent a phase and a half protecting a field nobody filled in. The Euroleague feed cannot help — `/injuries` and `/news` both 404, and RotoWire publishes no Euroleague RSS (`sport=EURO` is a 200 with an empty body while `sport=NBA` works) — so 9.4 reads their two HTML pages. **D5 is narrowed, not stepped over**: it refused scraping *stats*, because the official API answers that completely; availability is a question it does not answer at all. See **D20** and [ADR-0004](adr/ADR-0004-injury-news-source.md). What is stored is the **fact and a link** — player, body part, what the item asserts, the date, their headline, their URL — and `rotowire.test.ts` asserts no stored field contains their paragraph. **The page's own `is-injured` marking is the only classifier**: keywords fail in both directions on one screen ("Jumps to Partizan" is a transfer on the injuries view, "Taking part in workouts" a recovery note for a player still hurt). Each view returns the latest **25 updates, not a census**, so a pass may **raise a flag and never clear one**, and only items published within **21 days** may move a status — the first real pass reached back to 8 June. `applied` is what makes a commissioner's "Available again" stick: without it the next hourly pass re-flags them from the same item, so `markPlayerFit` spends the items first and clears the status second. Matching published names is the whole difficulty and 4.2 had already solved it — clubs register passport names (`Lessort, Mathias Michel`) and publishers write common ones (`Mathias Lessort`), so reusing `looksLikeRename`'s token containment took the live pages from **27 of 48 items unattached to 11**, and all eleven are real questions that go into the mapping queue, answered **by slug** so one answer covers every future item. Hourly, on the worker's own third guard, `NEWS_FETCH=off` to stop it |
| **9.5 The night board** | done | — | **A second ground, and only a ground.** It contradicts D17's dark-mode clause head-on, so it opens by paying the price DESIGN.md's open question 5 set — the inversion argument is **re-made** rather than quietly dropped: the day board inverts the physical object *for the light it is read in*, and Euroleague tips at 20:00 and 21:00 CET, so by day the card is the ground and by night the board is. What the direction contract actually refuses — the near-black surface with one glowing accent — is untouched and still asserted. Blueprint **D21** and [ADR-0005](adr/ADR-0005-night-board.md). **The system preference decides in CSS**, so a reader with JavaScript off lands where their phone asked and an OS that switches at tip-off reaches a page already open; a ~200-byte script in `<head>` applies an explicit override **before first paint**, because a theme applied from an effect is a white page flashed at somebody in a dark room. Choosing what the system already wants **clears** the override, or "follow my phone" becomes something you get back by clearing site data. The control rides in the top rail, so it reached every surface without editing a page — it shipped as the existing `FilterToggle` labelled "Night" and is now a drawn sun/moon mark (**9.5a**). **The test file was the design constraint**: `tokens.test.ts` reads the *first* `--color-X` declaration in `globals.css`, so a palette that overrode those names in place would have measured the day board twice and dark mode would have shipped unmeasured. The night values are therefore declared as `--night-*`, pointed at `--color-*` from two blocks whose token lists are asserted identical, and the suite is parameterized by ground: **122 assertions, every ratio asked twice**. Each value was solved against the day board's own **margin** rather than picked — soft ink 5.79:1 where day is 5.77, marker 5.10 against 5.06, rail 5.05 against 5.05, the rules 3.35/4.40 against 3.36/4.40 — because a dark theme whose quiet inks read at 8:1 has no quiet, it has two shouts, and hierarchy here is carried in ink strength. `board.tsx`'s patch field needed no change: it mixes into `var(--color-stock)`, a *token reference*, so it follows the ground without the component knowing there is a second one |
| **9.5a The ground switch becomes a mark** | done | — | **A one-control slice, and the alignment was the whole of it.** 9.5's switch was a `FilterToggle` reading "Night"; it is now a drawn sun/moon on a 44px `aria-pressed` button — the one control in this system whose **state is the picture, not a rule**, which is why it takes no underline. The label would have been the safer choice and the icon is the asked-for one, so the price is paid where DESIGN.md can see it: a new **Ground switch** entry states the exception, and the Shapes section carries the recipe. **What actually made it look wrong was the alignment context, not the drawing.** `TopRail`'s right group is baseline-aligned, and on `/` the action is not one line but a stack — a name over its own nav — so an icon centred against it sat *between* the two lines, level with nothing, reading as a stray mark. The rail now has **one line of controls and everything that is a control sits in it**: `self-end` at `gap-1`, which lands the mark in the nav's own 44px band and is the same result on the single-line surfaces. The pair is sized against each other rather than to a shared box — the sun a small disc whose rays read wide, the moon one thin arc drawn nearer its edge — because matched geometrically they look like two different sizes on the same rail; 16 units rendered at 18px, so the stroke comes out a shade over 1px and sits *with* the 500-weight caps beside it. `theme.spec.ts` needed no edit: the `aria-pressed` contract and the test id are what it asserts, and neither moved |

## Phase 10 — The midnight board

**Closed.** One visual direction change, sequenced as nine slices so the app was
shippable after each, and all nine have landed. The decision is
[ADR-0006](adr/ADR-0006-midnight-board.md) / blueprint **D22**; it supersedes
D17, D21 and ADR-0005. Two of the brief's asks were **dropped on measurements**
(**D19/D22** head coaches, **D23** the double round) and one named refusal was
**reversed with its own row** (**D24**, the room's measure).

Three items from the brief were **dropped with a reason** rather than deferred,
and all three are worth knowing before anybody re-reads the brief and thinks
something was missed. **Purple head-coach badging**: Draft Mode has no head
coach (D19) and the pool filters coaches out at ingest, so a fourth position
colour would badge an entity the game does not have. **A persistent countdown**:
it already exists, sticky since 3.7, corrected against a server clock offset —
10.8 restyles it rather than building it. **PIR and the rolling five-game
average**: landed in 9.1 and already the pool's leading column; what is new is
the *sparkline*, which needs per-game values the pool never queried.

| Slice | State | Notes |
|---|---|---|
| **10.1 The decision, the rulebook and the palette** | done | ADR-0006, D22, DESIGN.md re-grounded, `.impeccable/design.json` regenerated. **The palette is solved, not picked**, and three constraints moved real values: a panel is *lighter* than the ground (depth on a dark ground is lightness), so `rule` is solved for 3:1 on the **panel** (3.15) and clears 3.52 on the ground as a by-product — the reverse of which surface was binding on paper. `live-sunk` is the *lightest* warm bay on which `ink-faint` still clears 4.5:1 (4.61), because faint ink is what a muted pool row is written in and that row can be the armed one. `ink-soft` is solved against its **worst** pairing — a position wash on a panel (4.57) and staying above the marker on the bay (5.36 vs 5.05) — where ADR-0005's 5.79:1 failed both. Chalk stops at **13.89:1** rather than the 18.8:1 the ground now allows, because halation is real: that argument is the one part of 9.5 that outlived it. The marker carries **four** decimal places (`oklch(0.6759 0.2175 38.8)`) because three round-trips to `#ff5502` |
| **10.2 The palette in code** | done | `globals.css` rewritten; the `--night-*` indirection, `theme.ts`, the `<head>` script, `ThemeControl`, the sun/moon icons and `theme.spec.ts` all removed; `stock-deep` renamed **`stock-panel`**, because on this ground "deep" says the opposite of what it does. `tokens.test.ts` collapsed from two grounds to one — **74 assertions, every pair re-measured**, plus four that are new and deliberate: the two anchors asserted as sRGB *bytes* (`#0b1120`, `#ff5500`) rather than as OKLCH nobody can read; a **ceiling** on chalk so "improving" contrast toward white stops being a one-character change; `rule` asserted to be *harder on the panel than on the ground*, which is the inversion easiest to undo by accident; and a guard that every token is declared **exactly once**, because 9.5's `--night-*` naming was what stopped a second palette shipping unmeasured and deleting it removed that protection. `global-error.tsx` also carried a copy of the theme script — it renders when the layout has failed, so it had to be found by grep rather than by CI |
| **10.3 Two type families** | done | Space Grotesk for words, JetBrains Mono for figures in a column, both verified against Next's own `font-data.json` to ship `latin-ext` **before** being chosen — this league reads Valančiūnas, and a face that falls back mid-word makes the board look broken. The mono face is reached only through a named `stat` utility, which **deliberately sets two properties and not four**: adding `font-weight` and `letter-spacing` to it would have been a real bug, because it composes with `slot-label` (weight 500, 0.14em tracking) and with `font-semibold`, and Tailwind v4 emits `@utility` blocks **alphabetically** — `slot-label` sorts before `stat`, so a tracking declaration here would silently beat the caps tracking of every label it joined. That is the same composition failure `slot-transit` already paid for. Applied to ~30 columnar figures (pool PIR, standings, recap, impact, team and player pages, board and sheet numbering, the clock, chat timestamps); **not** applied to the chat unread badge or a figure inside a sentence, which is the boundary the rule states. `design.spec.ts` now asserts both halves in a browser: a `stat` cell computes to JetBrains Mono and prose does not |
| **10.4 The card-block material** | done | One radius token (`--radius-block`), the `card-block` / `card-block-live` materials, and `CardBlock` / `CardBlocks` in `board.tsx`. **There is no shadow token**, and that is argued rather than skipped: a shadow darkens what is beneath it, and at L 0.18 there is nothing left to darken, so the version that reads as elevation is a glow — the thing ADR-0006 kept refusing. Depth is a lighter fill, a rule and a corner. `Door` gained a `block` variant sharing one body, and the league page's four doors are the port: they are *destinations*, so a grid saying "pick one" is more honest than a ruled run saying "list". The position edge is a full-strength `border-l-3`, not an alpha, so it cannot take its colour from whichever surface the block sits on — and it is an edge rather than a wash precisely so it changes no text contrast. **The scale is enforced**, closing the debt 10.1 opened: see `depth-scale.test.ts` |
| **10.5 Roster blocks and the captain** | done | The roster and the lineup are runs of card blocks with the position edge; `card-block-waiting` (dashed, **unfilled**) draws an open roster place, because giving an absence the same stock as a player turns nine players and four gaps into thirteen blocks. The captain became a **radio group**, which is what "exactly one of these" already is in a browser — thirteen toggles clearing each other is that, reimplemented without the keyboard handling. The rule it encodes: the captaincy is a *mark on a starter*, not a sixth role, so marking also places, moving off `starter` clears the mark, and the select drops to four options. `validateLineup`, the five formations and the `lineup-role` test id are untouched, and the server takes the captain only from its own field — two doors onto one fact is how a form names two captains. The fixture line is a **seam**: `FixtureNote` renders nothing until 10.7 has data, and is tested for that, because a "TBD" would claim we looked |
| **10.6 The data grid and sparklines** | done | Five PIR marks as one hand-drawn polyline on `currentColor` — no chart package, because the whole component is nine lines of SVG and `sparklinePoints` is the only arithmetic in it. Two rules it follows and one it refuses: the picture is `aria-hidden` with an **`sr-only` sentence** beside it, because five marks are otherwise five announcements of nothing; the sentence takes the caller's **formatter**, since the standings hold tenths and a reader would otherwise hear "120" where the row reads "12.0"; and it draws **nothing below two games**, because a single point is a dot claiming a trend. The series needed a new `proj_last5_pirs` JSON field — the five numbers, not the average 9.1 already stores — written where the other projection fields are materialized, and `sameProjection` compares it so a re-ingest is still a no-op write. The sparkline is `sm`-and-up in the pool and standings **rows** and unconditional on the player page and the roster block, which is the same width budget the fantasy column already lives under. Also closes a flake the gate kept excusing: the pool's filters are client state, so a club selected before hydration narrowed nothing — `useHydrated` now surfaces that fact on `pool-ready`, one hook shared with the sheet, which had already paid for this once |
| **10.7 Fixtures** | done | The `fixtures` collection, filled from the schedule request 4.3 was already making and discarding half of, keyed `unique(season, game_code)` — an upsert whose plan is recomputed every pass, so a pass that dies after two hundred rows is finished by the next one fifteen minutes later without being told. **The double-round indicator is dropped, not deferred**, and this is the second brief item killed by a measurement rather than by taste: across E2025 and E2026 all **1,564 club-rounds hold exactly one game**, because twenty clubs and ten games make a round. A flag derived that way is `false` forever; the two-games-in-a-week reading covers a third of the season. **Difficulty is derived and home court is measured**: the home side averages **+3.46** points across 402 played E2025 games (+3.34 in the regular season alone, 63.7% home wins), which is both the number `homeEdge` computes and the scale behind the four-point threshold. Absent until the opponent has played three games, with no fallback to last season — a player's PIR follows the same person across a summer, a club's margin follows a rebuilt squad. The lineup page asks about **its own round** and the team page about the next unplayed game, which is two different questions and two functions |
| **10.8 Motion and the band** | done | The third animation event is **the second one seen from the other end**, which is the argument that keeps it from being a fourth: one state change — the clock moving — and two things it does to the board. The rule leaves the slot that was on the clock; that slot springs shut on the pick it has just taken. `pick-springs`, 320ms, scale `0.86 → 1.04 → 0.99 → 1`, keyed on `data-landed` from the same effect that decides whether this viewer was *watching*. **The overshoot is in the keyframes, not in a second easing vocabulary** — the timing function between the stops is the system's one curve, so a spring here is a shape drawn with it rather than a physics library arguing with it; and it is 4% because a slot is ~92px wide, its neighbours' rules are 1px, and the ruling *is* the state language. Three guards, each a rule: only a slot that **filled** (a rollback moves the marker backwards onto one it empties), only **one** slot (an autodraft sweep can move the marker three places, and three cards landing together is a board flickering), and never on a first paint. The band was **restyled, not rebuilt**: the countdown went `text-2xl → text-4xl/5xl` and the headline down one step, because the headline is the same sentence for the whole of somebody's two minutes and the clock is the only thing on the band that changes — measured at +4px on a Pixel 7 and +12px at 1440, which is what a band that never leaves the viewport gets to spend. No colour was reached for: the figure was already the top of the chalk ramp, and a number in marker on a marker-tinted band breaks the Ink-on-Blush Rule on the surface everybody is looking at |
| **10.9 Screen differentiation** | done | **Three surfaces, three shapes, one design system** — and the slice is layout, not skin. `max-w-3xl` **stops holding on exactly one surface**: `Sheet` and `TopRail` take a `measure` prop with two values, `column` (48rem) and `room` (80rem from `lg`), and the room splits *acting* (the pool) from *watching* (radar, board, console, chat) with the band full width above both. That reopens DESIGN.md's open question 4, so the reversal is argued where the refusal lives, in the ADR-shaped place: blueprint **D24**. The argument is not "laptops are wide" — it is that 3.1 answered for the *board*, which still overflows rather than widening the app, and by Phase 9 the *room* had become five surfaces in one 48rem column, five screens tall on a 1440px laptop. **Below `lg` the room is byte-for-byte the phone layout**, which is the half that matters: draft night is phones on a couch. The other two changed shape without changing measure. The **dashboard** is a grid of card blocks, because a league is a subject rather than an entry in a ledger — nothing on `/` is ordered and nothing is compared down a column — and its three `Slot 04` placeholders went with the port: they drew a board's shape for something that is not a board, which narrows the Board-Shows-Its-Shape Rule to things that genuinely occupy slots. The **standings** became one scrolling grid in the **draft board's own scrollport** (`BoardScroll` therefore takes a `label` now): members down, rounds across, rank/team/total `sticky left-0`, the sparkline closing the row. The run of `R12 14.0 R13 9.5 …` tokens it replaced could not answer the table's own question — "who won Thursday" is a lookup down a column and was 38 wrapped tokens a row. Axe now reads a **populated** dashboard and a **populated** table, because both of the surfaces this slice rebuilt had only ever been swept empty, where there is no list, no link inside a block and no sticky row header to get wrong. One real regression came out of the sweep: a radar jump landed the far board column 0.19px past the scrollport's own edge once the board sat in a fractional grid track, so that assertion asks "visible" within a pixel rather than exactly |

## Phase 11 — The app shell

**Closed.** Three slices, the plan's order. The decision is
[ADR-0008](adr/ADR-0008-app-shell.md) / blueprint **D27**. Layout and IA only:
the reference's orange gradient and colour-blocking were asked about and
declined, because they reverse ADR-0006's No-Atmosphere Rule.

| Slice | State | Notes |
|---|---|---|
| **11.1 Decision and shell** | done | `AppShell` (sidebar from `lg`, header, tab bar below `lg`), `Menu`, drawn nav icons, and `navFor` / `tabsFor` with a unit test per league status and role. **Rendered by each page, not by a route layout**: a layout cannot see which page it wraps and is kept across navigation, so a league flipping to season would keep offering a live room. `TopRail`, `BackLink` and the lobby Doors that only duplicated navigation are gone; the four surfaces outside a session draw `BareRail`. **The shell reads with the viewer's token**: the first cut asked `canManageRosters`, a superuser *password* sign-in, on every render — and the draft room re-renders for every viewer on every pick. Measured on the dev server, the six draft-room and pool specs took 22 minutes at two workers with most room tests timing out, and 2.7 minutes at five workers after the change, with one failure left that was the dev overlay below. The draft room also stopped reading the lobby's league on each refresh; `getDraftView` returns the nav's view of the league from reads it already made. Local dev hides Next's badge and allows `'unsafe-eval'` in development only (Next's own CSP guidance), because the badge and React's refused-eval console error both pinned an overlay bottom-left, over the account menu and the first tab |
| **11.2 The side panel** | done | `ContextPanel` (a roving-tabindex tablist) in `PanelFrame`, fed by `readPanel`. **Not extracted from `pick-form`, shared beneath it**: the panel's list sits on the room's own `selectPool` and `toPoolPlayer`, because `pick-form`'s row *is* the pick — arming, the sheet's ranks, needs-muting, the live regions — and a reading list needs none of it. **The draft room's panel is Schedule and News only, and never docks**: a second pool beside the real one could not pick, and a docked 22rem column at 1280px leaves the pool and board about 340px each. It reuses the room's pool read rather than making its own, for the same per-pick reason as above |
| **11.3 The court** | done | `LineupCourt`: a FIBA half court as non-scaling 1px line art, starters in one row per position letter so every legal formation stands on something, captain in marker. **The court is a picture, the tiers are the editor**: a card with a select and a captain mark does not fit three across on a 390px court, so each player appears once, as a card in Starting five / Sixth man / Bench / Inactive / Not placed. Tap-to-place calls the same `place` the select does, so `validateLineup` sees one kind of change; the selects remain what the form posts, and the page still works without JavaScript. **A player in hand, tapped onto a player in another tier, swaps with them**. That fix came from the critique: without it a substitution took four taps and passed through a lineup the validator refused |

## Phases 5–8

| Phase | State |
|---|---|
| 5 — Season mode: rosters, trades, impact tracking | **done** — 5.4 is the weekly recap |
| 6 — Optional formats | todo — 6.1 keepers is luxury, not now |
| 7 — AI features (Gemini 2.5 Flash) | todo |
| 8 — Hardening & ops polish | **done** — 8.0–8.5 are in, and the backup timer and logrotate are installed on the box |

---

## Cross-cutting agent and production hardening

The repository now loads project rules on demand through path-scoped skills
rather than putting every production gotcha in the always-on `AGENTS.md`.
Cursor and Claude share the same skills; staged JS/TS is linted before commit.
The application side gained route/root error boundaries, meaningful loading
states, bounded CSV/search inputs, terminal-vs-retryable realtime error
handling, parallel independent draft-room reads, security headers, structured
worker logs, and first-time OAuth verification in CI.

Nightly backup automation is committed as `eurovafliai-backup.timer` and uses
PocketBase's backup API, retaining 14 archives. The restore drill
(`npm run pb:restore-drill`) is proved locally **and against a real production
archive**. The units are installed and enabled on the VPS, so the deploy
warnings are silent; a deploy that starts warning again means the timer stopped
or an archive went stale.

**Try it on localhost:** `npm run lint && npm run typecheck && npm run test`,
then `npm run dev` and open `http://localhost:3007`. Navigate between the home,
lobby, draft and sheet routes: each navigation has a board-shaped loading
fallback, while an expired realtime token returns to sign-in instead of
retrying forever.

The code-health pass that followed put the same discipline on the codebase
itself. **Knip runs in CI** (`lint:dead`) so an export nobody imports fails the
build rather than accumulating. **Playwright runs in CI** against `next start`
over a fresh build, on both browser projects, booting PocketBase the same way
`pb:verify` does — the E2E suite was local-first for three phases and is now a
merge gate. It runs as **four shards** (`e2e (1/4)`…`e2e (4/4)`), each with its
own PocketBase, because one two-core runner had grown to 12+ minutes for the
suite alone. On pull requests the `mobile` project runs only the layout specs
listed in `playwright.config.ts` (`E2E_MOBILE_SCOPE=layout`); pushes to `main`
run every spec on both projects. A PR that touches only `docs/` or Markdown
skips the browser jobs. The framework-free stores (`sheets`, `chat`, `stats`, `rosters`)
and both repairs have unit tests over `fake-pb`, each exercising the failure
story the module's header promised. The lobby, the room and chat share one
realtime lifecycle (`useLiveSubscription`), so the three surfaces cannot
disagree about what a dropped connection or an expired token means. Two debt
items closed: `createLeague`/`joinLeague` return refusals through
`useActionState` instead of the query string ([#16](https://github.com/andrius-burba-94/eurovafliai/issues/16)),
and the undo control names the number of picks it would discard. Dependabot
batches minor and patch bumps weekly and never opens a major.

## Open debt

Carried deliberately, each with an issue. Anything here that a slice is about to
touch should be fixed by that slice rather than deferred again.

| # | What | Blocks |
|---|---|---|
| **Recap's open round reads fewer lines than League Home** | Found in S25. League Home's "Round N so far" and Live read `readMatchdayData` (recorded box scores plus the live feed); Recap's in-progress view reads `readLeagueRecap` (the stored snapshot plus recorded box scores only). While a game is on air the two can rank the round differently until its box score is recorded. The fix is Recap reading `liveRecap` for an open round | Nothing; the figures meet when each game is recorded |
| **The Fantasy Challenge token expires by hand** | `FANTASY_CHALLENGE_TOKEN` is a browser session token of unknown lifetime; password login is not available to an SSO account. A refused token is a `failed` run saying so on the sync page and in the worker log, and nothing is written; replacing it means editing the VPS `.env` and restarting both PM2 apps | Rosters stop syncing until somebody notices |
| **The sync page has no E2E spec** | It talks to somebody else's API, which CI must not. Covered by unit tests over the real 30 September rosters and pool, and `fake-pb` store tests; the page itself is checked by hand | Nothing; a UI regression would be caught late |
| **A failed league delete has already destroyed the board** | Found in production, and the fix below is only half of it. `deleteLeague` is four writes with no transaction, and the *destructive* ones come first: roster windows, then drafts (taking their picks), then the league. So a step-3 failure leaves a league whose board is gone — which is exactly what happened on the box, twice, before the blocker was understood. It is now idempotent (every step deletes by league filter, so the same click finishes the job) and `pb:verify` fails CI on a new blocker rather than letting production find it — but **ordering cannot be fixed into atomicity**: PocketBase has no transactions, and the cascade is the only thing that removes members, chat and sheets, so the league record has to go last. A pre-flight that proves the delete will succeed before anything is destroyed is the real fix and is not written | Nothing today; a delete that fails for a *new* reason still takes the board with it |
| **The route error boundary promises more than it knows** | "Something on this page broke. The board itself is unchanged" is true of the read paths it was written for and false of a partial multi-step write — the league delete above said it while the draft was already gone. Copy on every surface, so it is recorded rather than changed on the way past: either the sentence drops its second clause, or the actions that can half-fail say so themselves | Nothing mechanical; a reassurance that can be wrong |
| **`E2E_PORT` and `NEXT_PUBLIC_APP_URL` can disagree, and the failure is a *false pass*** | Found in 10.4 while running the gate. `/auth/callback` redirects to the **absolute** configured origin (`NEXT_PUBLIC_APP_URL`, `http://localhost:3007`), so running the suite on another port sends the browser somewhere the suite is not. With 3007 empty this is loud: `ERR_CONNECTION_REFUSED`, four failures. With a dev server on 3007 it is silent and worse — the two callback specs assert a **path** regex, which the *other* server satisfies, so they go green while testing a different build. The run STATUS previously recorded used `E2E_PORT=3011`, so those two results should be treated as unproven before 10.4. Two real fixes exist: derive the redirect from the request origin, or have the config refuse a port mismatch. Neither is written; for now the suite runs on the default port | Nothing today, but two security specs are only as trustworthy as the port they ran on |
| **Local PocketBase drifts from `main`** | A dev database only applies migrations on boot, so a checkout that has been running across a schema change silently tests the old shape. It cost a confusing run of lobby-spec failures. `npm run dev` after pulling is the whole fix; the symptom is `pb:verify` disagreeing with CI | Nothing; a time sink |
| **Two-device confirmation** | Closed, and recorded here so the thread is not re-opened. Phase 1's DoD wanted real devices rather than two browsers on one machine, because the realtime gap that opened Phase 3 could only have been *seen* by two sessions watching one board. The three-account production draft ran on several real devices and every one of them drew the board as picks landed — which is also how the commissioner legality defect was spotted. What it is **not** is the human half of 3.7 / D12: one person drove all the devices, so "does draft night feel right with friends in one room" is still unanswered and still needs other people | Nothing; Phase 1 is complete |
| **No `manual_lock` button** | A locked player is untouchable by both sources and the pool page shows the badge, but setting the lock still means editing the database. The rest of 2.1b shipped without it | Nothing; a commissioner-comfort gap |
| **A partial CSV still empties the pool** | Mitigated, not removed. Any player missing from an applied sheet is marked `left`, and beyond a quarter of the pool the upload now demands a tick-box (`assessDepartures`) and the sync script demands `--allow-departures`. Below that threshold a partial sheet still departs people quietly. Departures are a status and never a deletion, and the next sync revives them — which is exactly how this was found | Nothing; a known edge |
| **Every alpha boundary is measured now — one is not** | Closed, and recorded here because the thread ran across four slices and the next person should not re-open it: 3.3 darkened the position letter (`pos-g`/`pos-f` to L 0.49) after `tokens.test.ts` learned to composite; 3.2's critique corrected that compositing to gamma-encoded sRGB, which is how a browser actually blends and is ~0.2 *stricter*; and #48/#49 fixed the last three sub-floor boundaries — the button border (2.10:1), the patch border (2.22–2.26:1) and an input's ruled line (1.87:1, the lowest in the app, and the one DESIGN.md itself calls the whole affordance). All now clear 3:1 and all are asserted. **What is left:** nothing measured. If a new colour or modifier is added, `tokens.test.ts` is where it has to be proved, and `wash()`/`contrastOn2()` are the helpers for it | Nothing |
| **The design detector cannot see this app's real risks** | Four runs now have reported zero findings on the surfaces under review, and 3.4b's pass re-traced the regex engine's own module graph to put a firmer number on it: **18 of the registry's 59 rules can fire on a `.tsx` file, so 41 cannot.** This number has now been derived twice and the second method is the one to trust: 3.5's pass cross-referenced the rule ids the regex engine actually references against `ANTIPATTERNS` and **enumerated all 18** (`side-tab, border-accent-on-rounded, overused-font, flat-type-hierarchy, gradient-text, ai-color-palette, monotonous-spacing, bounce-easing, dark-glow, radial-halo, marquee, em-dash-overuse, marketing-buzzword, aphoristic-cadence, broken-image, gray-on-color, layout-transition, codex-grid-background`). Earlier passes guessed "37 of 59 never execute" and then "~15 can fire"; an enumeration beats both. On `.tsx` input only the regex engine runs — including `low-contrast`, `tiny-text`, `undersized-ui-text`, `all-caps-body`, `wide-tracking` and `text-overflow`, which are precisely this system's failure modes. The static-HTML engine needs `htmlparser2`/`css-select`/`css-tree`/`domutils` and the browser engine needs `puppeteer`; none is installed, and `.tsx` would not route to them anyway. `design-system-radius` also cannot read Tailwind `rounded-*` in source. A clean `design-detect` in CI means "no purple gradients and no bounce easing", which was never the risk here — every real finding in three critiques came from measurement or from reading. Worth knowing before anybody trusts that green tick | Nothing; but the CI check is far weaker evidence than it looks |
| **A radar row cannot reach that member's column** | The last open finding from 3.2's critique, and the only one not fixed. The radar answers "who needs a center" and the board answers "what did they take" — and getting from a name on one to a column on the other means scrolling the board sideways by hand. An enhancement rather than a defect, and it wants a decision first: whether a radar row is a link at all, given the board is a horizontally scrolling region and this system has no idiom for "scroll that thing to here" | Nothing; two surfaces that answer adjacent questions do not connect |
| **A board wider than about six members scrolls on a desktop too** | Accepted with the layout decision (DESIGN.md, open question 4): one scrolling region everywhere rather than a second container width for one route. At the real league's size the columns share the width they have; at twelve members a laptop scrolls sideways like a phone. Recorded because the alternative — a wider container and a new breakpoint — is a real option somebody may want later, not an oversight | Nothing; a decision, logged so it can be revisited |
| **The Phase 11 critique's design questions** | Fixed at once: the tab bar hiding the bottom sticky bars, the swap, the Players tab's order and cap, a menu's click-through, and the lineup refusal's silence. **Open, each wanting a decision rather than a patch:** (1) ~~every lineup card still shows its select and captain radio beside Move~~ — settled in S17: the selects and radios live only in the grid view; (2) the captain's orange is a third job for the accent, which DESIGN.md's Court section allows and its Two Jobs Rule does not; (3) below `xl` the panel sheet is not a dialog (no `aria-modal`, no `inert` behind it) and its only Close is at the top; (4) the More sheet repeats four tab-bar items among about 15 rows; (5) "the worker reads…" copy on the Schedule and News tabs names the machinery; (6) the loading frame draws an empty sidebar | Nothing; the lineup and the panel work, and read heavier than they need to |
| **Autodraft ranks unsheeted members by last-5** | Closed in 4.4, and **re-pointed in 9.1**: the ranking number is now average PIR rather than a fantasy average, which is the number the pool displays and the league talks in. A member with a sheet is still picked from the sheet first, `isLegalPick` still refuses a pick into a full G/F/C bucket, and a player with no games anywhere still ties on player id | Nothing |
| **Last-5 of a full E2025 backfill includes the Final Four** | 4.4 averages every stored phase of the season it is pointed at. Standings now filter by phase; last-5 on the pool still does not. **Mostly defused by 9.1**, which makes the *previous-season* average the draft-night headline and only falls back to last-5 once a player has current-season games — so the late-playoff skew no longer decides a draft. The feed's own season average spans the same phases (`gamesPlayed` reaches 44), so the two agree by construction. What is unfixed is mid-season: from October, last-5 across a phase boundary still mixes RS and playoff form | Nothing; a known skew, now only during the season |
| **A turn cannot be skipped** | Argued against rather than deferred, in 9.2 (blueprint **D18**), and recorded here because it is the one thing a commissioner may go looking for in the new panel and not find. A skip leaves a hole in the order: `buildPickOrder` builds a contiguous run of slots and `isDraftComplete` counts them, so a permanently empty slot is a draft that can never finish — and the sweep's own board-hole repair would start reporting a draft it cannot move. The two cases a skip is reached for both already have controls beside it: **autodraft** takes the absent member's turns as they come, and **"Pick for them"** enters a pick for whoever is on the clock. What is genuinely missing is only the case where a league wants somebody to draft *fewer than thirteen* players, which nothing in this app supports anyway | Nothing; a hole in the board is worse than a slow turn |
| **An injury flag never expires on its own** | 9.4 may raise a flag and may never clear one, because both RotoWire views carry the latest 25 *updates* rather than a census of who is hurt — a player disappearing from them is not evidence of anything. So a player who quietly recovers stays marked until somebody presses **Available again** on `/players/news`. Two candidate fixes, neither chosen: an age-out (a flag older than N days stops warning), which invents a recovery date the source never gave; or a second source that publishes a *current* injury list, which is a new ADR and a new parser. The commissioner button is the honest version and it is one press | Nothing mechanical; a stale "injured" beside a fit player until somebody says otherwise |
| **The news parser breaks when somebody else's markup does** | `rotowire.ts` reads class hooks (`news-update`, `news-update__playerhead`, `is-injured`) from pages we do not control. A rename makes a pass parse **zero** items, which is why zero is reported as a problem rather than logged as a quiet success — it shows in the worker log, in `npm run news:sync -- --dry` and in the commissioner's "Read the pages now". The saved markup in `src/lib/news/fixtures/` is what a fix is written against. What is *not* detectable is a subtler change — a body part moving to another element — which would show up as items losing a field rather than as an error | Nothing else; the news stops, and the app does not |
| **`pool.spec.ts` flakes on counts, and passes on retry** | Eight of the suite's 430 tests, all in one file, all green on the first retry — measured on a fresh build, so it is not the dev server's route compilation. The shape is always the same: a filter that should leave one row resolves three. The pool is **app-global** and these specs scope themselves with `TEST_CLUB`, a club code randomised once per *worker process* and therefore shared by every test that worker runs; `cleanupTestData` runs `afterEach` and deletes what it recorded. So a player the cleanup could not delete — or a run that aborted mid-draft — is still in that worker's club when the next test filters it, and the count is off by exactly the leftovers. Not caused by 9.5, and visible since 9.4's specs joined the file's neighbourhood. The fix is a club **per test** rather than per worker, which touches every helper in `pool.spec.ts`; recorded rather than done because CI's one retry hides it and a rushed change here breaks the file that catches real pool regressions. **10.6 found and closed a second, unrelated cause** rather than this one: the pool's filters are client state, so a club selected before hydration narrowed nothing, and `enterDraft` selected it the moment `pick-pool` became visible — see the `pool-ready` note on 10.6. Measured after: `pool.spec.ts` plus `cheat-sheet.spec.ts` run twice through, 190 test runs, **one** flake, and that one a pick button that never arrived rather than a lost filter. The full suite still shows eight, which is what keeps this row open — the shape there is a *position* toggle leaving three rows where one was expected, and three is exactly "the right answer plus two leftovers". **Re-measured at 10.9 and unchanged: eight, in the same file, on a fresh build, all green on retry** — and 10.8's zero-flake run, read against this row rather than as news, is what a 1-in-190 defect looks like on a 425-test sample. `pool.spec.ts` on its own passes 22 of 22, twice over, which is the other half of the evidence: the leftovers come from *other* specs sharing the worker's club, not from this file | Nothing in the app; a retry in CI, and a count assertion that cannot be trusted on a first run |
| **The night switch corrects itself after hydration** | The *page* never flashes — 9.5's script sets `data-theme` in `<head>` before the first paint. The control's own `aria-pressed` is another matter: it is rendered from the server's snapshot, which has no `localStorage` and no media query, so on a night phone it is drawn unpressed and flips when React arrives. Rendering nothing until mount was the alternative, and it moves the rail as every page loads, which is worse on the surface that is on every page. A cookie read in the root layout would fix it properly and makes every route dynamic for one attribute | Nothing mechanical; the toggle's label can be wrong for one frame while the ground it reports is already right |
| ~~**Every new colour now has to clear two grounds**~~ | **Closed by 10.1**, and not by fixing anything: there is one ground again, so `tokens.test.ts` asks every ratio once and a screenshot is one screenshot. Recorded rather than deleted because the cost it describes was real for eight days and the *reason* it is gone is a reversal, not a simplification | Nothing |
| **`prefers-color-scheme` is no longer honoured** | The accepted cost of 10.1 / [ADR-0006](adr/ADR-0006-midnight-board.md). There is one ground and it is dark, so a reader who has asked their phone for a light interface gets the midnight board anyway — and unlike 9.5's arrangement there is no control to change it, because there is nothing to change it to. This is named in the ADR as the strongest argument for reversing that record later. The fix is not "add the switch back": it is a second palette, which is the thing the `#FF5500`-on-card-stock measurement (2.76:1) rules out | Nothing mechanical; a preference the app now ignores |
| ~~**The depth scale is prose, and nothing enforces it**~~ | **Closed by 10.4.** `src/app/depth-scale.test.ts` reads every `.ts`/`.tsx` under `src/` and fails on a radius that is not the one token, on any shadow/gradient/blur class, and on a card-block material spelled out anywhere but `board.tsx` — which is what reduces "is a block nested in a block?" to one file. It reads source rather than measuring values because **Tailwind emits an unknown utility as nothing at all**, so a stray `rounded-lg` renders a rounded button and a hand-rolled `card-block-2` renders an unstyled `<li>`. Proven by injecting a violation and watching three assertions fail, not by watching the suite go green. **Still open**, and narrower: the recursive nest is closed, but two *different* callers composing one block into another is left to code review | A residual review dependency for the cross-component nest |
| **The vibrant position hues have never been simulated under CVD** | 3.2's critique measured the *muted* guard and center washes as pixel-identical under severity-1.0 deuteranopia (ΔE76 = 0.00). 10.1 made the hues vibrant and colour into a scanning signal, which raises the stakes rather than lowering them, and the new values have not been re-simulated. The Letter-Always Rule is kept without exception and is now the actual carrier, so nothing is *unreadable* — but if cyan/emerald/amber separate no better than steel/olive/plum did, then the colour is decoration with a job title and the design's own claim about scannability is only true for some readers | Nothing; an untested claim, with the fallback still in place |
| **Nothing writes `lineup_template`** | 9.3 reads the lineup shape from league settings — 5 starters, 1 sixth, 4 bench, 3 inactive — and no surface sets it, exactly like `roster_template`, which has been read-from-settings and never written since 2.2. So every league runs the official shape, which is the shape every league wants. The check that matters is enforced where it bites: `recordLineup` refuses when the lineup template and the roster template disagree, rather than a schema refinement that would quietly reset *every* other setting to its default on one bad number | Nothing today; a league that wanted an 11-man roster would need the setting written before its lineups made sense |
| **A lineup is per round and typed by hand** | **Closed for a linked league by 5.5b**: lineups come from the official game. A league not linked to the Fantasy Challenge still types one round at a time, with carry-forward | Nothing for the linked league |
| **The lineup sync counts matchday ids** | The official game lists no matchdays, so a round's id is the current matchday's id minus the rounds between (1528, 1529, 1530 for rounds 1–3). If the game ever skips an id — a playoff phase is the likely place — every later round reads the wrong matchday. The guard is the report: a lineup naming players outside that round's roster is refused, and a wrong matchday's official totals sit visibly beside ours | A wrong-round lineup is refused when the rosters differ; when they do not, it is written and the report's totals disagree, which is the signal to look |
| **The official 6-players-from-one-club limit is not enforced** | The Draft Mode rulebook caps a roster at six players from any one EuroLeague club, and `isLegalPick` only knows the G/F/C roster template. So the app will happily let somebody draft seven Olympiacos players and the official site would refuse the same squad. Found while reading the rulebook for Phase 9 and deliberately not built into 9.1, which is about what a row *shows* rather than what a pick may be — it belongs with the engine's legality rules and wants `buildPickOrder`-grade tests across formats | Nothing mechanical; a league that mirrors the official site could build a squad the site rejects |
| **Trades are not confined to commissioner-opened windows** | The official rules only allow trades in windows between rounds; our `transactions` accept any `from_round`. 5.2's "record, do not broker" stance makes this less severe than it sounds — a commissioner is typing in what already happened — but nothing stops a deal being recorded into a round that was already played | Nothing; the commissioner is the window |
| **A third of the pool has no projection at all on draft night** | Measured on a full E2025 backfill (6,902 game lines, 0 corrections) against the live E2026 pool, and **re-measured unchanged after 9.1 imported last season from the official feed: 222 of 326 active players carry an average PIR, and 104 do not.** 22 of those have no `person_code` yet, so nothing can attach; the other 82 have a code and simply did not play a Euroleague game last season — arrivals from the NBA, from domestic leagues, and young players being promoted. Autodraft treats a missing projection as worse than −2, and the pool's 10+/15+/20+ filters drop them, so **a genuine signing ranks below a fringe player who logged garbage minutes in May**. This is not a bug in 4.4 — it is what ranking a new season on an old one means — but it is the strongest argument for writing a cheat sheet before draft night, because a sheet is read before any projection is | Nothing mechanical; it distorts the *first* draft and nothing after it |
| **No path from the pool *into* a sheet** | What is left of 3.4a's central critique finding after 3.4b closed two thirds of it. A sheet can now be reordered and a player removed from it, but the only way to *add* somebody is still to paste a list — there is no "put this player on my sheet" from the pool or from the room. It needs a picker over 323 players and a decision about where it lives, so it is its own piece of work rather than a rough edge | Nothing; a sheet can still be built, just not incrementally |
| **A sheet still cannot be edited from inside the room** | The third thing blueprint 3.4 asks for, and the only part of that line still unmet: "editable before *and during* the draft in a sidebar". It is a page, and the room links to it and pins the best three from it. On a phone that is arguably the right answer — this app is one column and a sixty-row list does not sit beside a board — but it is a divergence rather than a finished thought | Nothing; the sheet is reachable mid-draft, just not beside the board |
| **An unmatched cheat-sheet line cannot be fixed in place** | The confirm step offers a choice for an *ambiguous* line, because it has two or three real candidates to offer. A line the pool has never heard of gets a message telling you to fix the spelling and read the list again — which is now cheap, because the box holds your sheet as editable text. A `<select>` over all 323 players per unmatched line was the obvious alternative and was rejected on weight: twenty unmatched lines would ship 6,460 options to a phone | Nothing; a rough edge on the least common path |
| **A sheet outlives the season it was written for** | The consequence of keying `cheat_sheets` on the membership rather than on the draft, and the price of the argument in that migration. A league that drafts a second season on the same memberships inherits last season's ranking rather than starting blank. It is a stale sheet a member can see and replace, not a lost one; a per-season sheet is Phase 6's keeper work | Nothing yet; there is no season 2 |
| **Half the room gets no vibration** | `navigator.vibrate` does not exist on iOS Safari — not gated, not permission-prompted, simply absent — so on an iPhone the clock cue is the tone and the live region and nothing in the hand. `clockCue` returns the vibration pattern regardless and `clock-cue.tsx` feature-detects before calling, so there is no error and no console noise; there is also nothing telling an iPhone owner that half of what the toggle offers cannot happen for them. The toggle's own label says "Sound" rather than "Sound and vibration" for that reason, which is honest but not informative. A real fix means either detecting the absence and saying so, or dropping vibration from the copy entirely | Nothing; a silent asymmetry between the phones in one room |
| **A commissioner with no membership row hears no clock** | `ClockCue` renders only inside the `view.you` branch, because everything it says is about *your* turn and somebody with no turn has nothing to be told. That is right for the live region and for the cue, and it means a commissioner who runs a draft without playing in it has no audible surface at all — including no way to reach the toggle. Recorded because it looks like a bug from the outside: the toggle simply is not there. If a non-playing commissioner ever needs a cue it wants a different sentence ("Pick 7 is on the clock"), not this one moved | Nothing; a deliberate gating, documented so it is not "fixed" into noise |
| **Scoring weights are settings that nothing reads yet** | 4.5 answered the immediate question by summing stored `fantasy_pts` tenths, so the table is honest about the official weights. Custom per-league weights would still be a lie until a later rescore from components: box scores are app-global, weights would be per-league, and the importer still passes `OFFICIAL_WEIGHTS` unconditionally | Nothing yet; a settings screen would still be a lie |
| **An amended box score is never noticed** | 4.3's pass asks "what is played and **not stored**", and that is what makes it self-healing — but it means a game whose box score the Euroleague later corrects is invisible to the fetcher for ever, because the game is stored. The Euroleague does amend them. The remedy exists and is manual: paste the game into `/stats/import`, which names every field it would change before changing it. The fix would be a second, slower pass that re-fetches recent games and compares — cheap to write, and it wants a decision about how far back "recent" reaches, because re-fetching 380 games nightly to catch one correction is not a trade worth making | Nothing; a correction needs a person to notice it |
| **A game imported with some rows refused stays "done"** | `readStoredGameCodes` asks whether a game has *anything* stored, not whether it has all 24 lines. So a game where two players were refused — no person code, or a PIR that disagreed with its own components — counts as imported and the fetcher never returns to it. Deliberate: the refusals are named in the batch log, and re-fetching a game whose other 22 rows are already correct would rewrite them to fix nothing. It does mean the *only* record that a line is missing is a `stat_imports` log nobody reads unprompted | Nothing; two players' lines, and a log entry that has to be looked for |
| **A quarantine needs somebody to notice it** | **Closed by the mapping doorbell**, and recorded here so the reasoning is not re-derived. A manager's lobby now carries a `Correction` naming how many renames and unattached codes are standing and what they cost, and the pool's own mapping row is struck as a correction with the same number. Both read `countMappingQueue()`, which runs the *same* pure filters the mapping page renders (`src/lib/mapping/queue.ts`) — a doorbell that rang for work the page did not show would teach a commissioner to ignore it, which is the state this debt was. It rings **only** when something is standing, and only for somebody who could act on it. It counts **only the season being played**: a full E2025 backfill leaves 123 unmatched codes against an E2026 pool and not one of them is work, because they are players who left the league — measured, and the reason the first cut of this would have opened on "102 person codes belong to nobody". `/players/mapping` still lists every season, because it is the working surface where history is context. What is still true is that nothing reaches a commissioner who never opens the app: there is no chat announcement and no email, deliberately, because `chat_messages` has no per-member visibility and this is manager-only — the same argument 8.2 made for the stuck banner | Nothing |
| **A rename is only ever proposed against the *same club*** | `proposeRenames` never pairs across clubs, which is what stops it merging two unrelated players who share a surname. The cost is the case it cannot see: a player who was re-registered under a passport name **and** transferred between two syncs. That is a departure plus an add, as before 4.2, and the duplicate has to be spotted by eye. Rare, and the alternative — fuzzy matching across the whole 330-player pool — is how you merge the wrong Nunn | Nothing; a narrow blind spot, chosen over a wide one |
| **Backups protect against a delete, not a disk** | Closed on the box: `eurovafliai-backup.timer` is enabled (03:15 + jitter), the oneshot has written a real 33 MB archive, that archive passed `pb:restore-drill --adopt-superuser`, and logrotate is installed and scoped to the four `eurovafliai-*.log` files. What is *not* solved is where the archives live — PocketBase's backup API writes them to `pb/pb_data/backups/`, the **same disk as the database**. A bad delete is survivable; losing the volume is not. Off-box copies are a decision nobody has made yet | Nothing today; one disk is one disk |
| **Axe defers contrast to the token suite** | 8.4's `@axe-core/playwright` suite disables `color-contrast` on purpose. Axe reports `live` on `stock-deep` at 4.49:1 (needs 4.5:1) on the Google button and faint board numbers — the same near-miss `tokens.test.ts` already measures and the design system has accepted. Running both would mean two sources of truth fighting over a hundredth of a ratio. Landmarks, names and focus order stay in axe; every ink/stock pair stays in the token suite | Nothing; a deliberate split, recorded so nobody "fixes" the disable |

## Verification status

Last full local run, after the code-health pass: **all green.** The long-form
record — which bug each test found, what each number meant when it was
written — is in [`docs/log/verification.md`](log/verification.md).

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run lint:dead` | pass — knip reports no unused files, exports or dependencies |
| `npm run typecheck` | pass |
| `npm run test` | **1376 passed at 9.3b** (hundredths, the formatter, old-snapshot reads). **1363 passed at 9.3a** (a round summed in hundredths, the official round-1 lineup at 1646). **1349 passed at Phase 11** (`navFor` / `tabsFor` per status and role, `roundSchedule` for the panel's round). **1198 passed** before it. The engine, the sweep and the pipeline, ingestion, leagues and draft setup, components, cheat sheets, the pool, the design tokens, the on-the-clock cue, league chat, the stores and repairs — plus last-5 / season / PIR projection arithmetic and the previous-season import, standings tenths and phase filter, the membership materialize, the idempotent snapshot recompute, the mapping queue's filters and sentence, the pure lineup validator and the weights standings apply, and the news parser, plan, store and pass — the parser against saved markup rather than the live site. Since 10.2 there is **one ground**: the token suite is 74 assertions against it, the theme's resolve/override tests are gone with the theme, and the count fell accordingly. 10.4 adds nine **depth-scale** assertions that read source text rather than rendered values, because Tailwind emits an unknown utility as nothing and a stray `rounded-lg` therefore renders cleanly and wrong; 10.5 adds the captain-as-a-mark arithmetic and three cases for a fixture line that currently renders nothing; 10.6 adds the sparkline's points and its spoken sentence — including the two-game floor, the flat series that draws down the middle rather than along the floor, and the tenths formatter that stops a reader hearing "120" where the row says 12.0. **1225 at 10.8**: 10.7 adds the pure schedule reading (the measured home edge, the difficulty threshold, next-versus-round fixture) and the fixtures upsert driven through the strict fake, which enforces the real `(season, game_code)` index |
| `npm run build` | pass |
| `npm run test:e2e` | **482 passed, 9 skipped, 9 flaky at Phase 11**, run the way CI runs it (`CI=1`, `next start` over a fresh build) — nothing failed, and all nine flakes are the `pool.spec.ts` count debt, three rows where one was expected, each green on retry. The skips are the specs that ask one project a question only the other can answer (sidebar at 1280px, tab bar at 390px). New: `shell.spec.ts`, `panel.spec.ts`, the court's tap-to-place in `lineup.spec.ts`, and an axe sweep of a populated lineup beside the docked panel. Before it, **463 passed, 1 skipped, 10 flaky** on chromium and Pixel 7 after the draft-night reports — nothing failed, and all ten flakes are the `pool.spec.ts` count debt below, back to its usual shape. The three extra flakes the previous run carried (`radar`, two in `cheat-sheet`) did **not** recur, which points at load rather than at the ceremony's `rollOrder` round trip: this run had a **clean local database** (327 players, 20 clubs) where the previous one had 1,243 players and 219 leagues in every pool render. Worth knowing before chasing a flake: a full e2e run leaves `Z???`-club players behind, and a *killed* run leaves them for good because `afterEach` never fires, so the suite gets slower the more often you interrupt it. Before that, at the season dashboard, it was **455 passed, 1 skipped, 12 flaky** on chromium and Pixel 7 at the season dashboard — nothing failed. Nine flakes are the `pool.spec.ts` count debt below; the other three (`radar.spec.ts:160`, two in `cheat-sheet.spec.ts`) are **new to the list and worth watching rather than dismissing**: both specs gained a `rollOrder` round trip with the roll ceremony, which makes their setup slower under six workers, and all three passed on the first retry. If that count keeps climbing, the ceremony's navigation in test setup is the first thing to look at. **This run also earned its keep**: it found a door rendered inside its panel's "has data" branch, so a league whose configured season had nothing ingested lost its way to standings and recap entirely — on the first day of a season. Two runs before it reported `PLAYWRIGHT_EXIT=1` without executing a single test, both times because a `next dev` from an earlier non-`CI` run still held port 3007; kill it first, and never read a summary line for a verdict. Before that, at the roll ceremony, it was **447 passed, 1 skipped, 10 flaky** on chromium and Pixel 7 at the roll ceremony — nothing failed, and all ten flakes are the `pool.spec.ts` count flake in the debt row below, so the 9 → 10 move is that same debt rather than a new one. **Measured the hard way this time, and the method is the finding**: the first run of this slice was made *without* `CI=1`, which means `next dev` and `retries: 0`, and it reported **26 failures** — every one of which passed in isolation. The row below already said measure on a build; it is repeated here because the noise is convincing. Worse, that run was piped through `tail`, so the shell reported `tail`'s exit code and the suite looked like it had passed. **Write the exit code into the log** (`echo "EXIT=$?"`) rather than reading a summary line. The CI-faithful run then found a genuine defect the noisy one had buried — a start-over inside the ceremony's own window summoning a fresh tab to a dead draw — which is the argument for running it properly rather than for running it twice. Earlier, at 10.9, it was **426 passed, 1 skipped, 9 flaky** — the whole suite, run locally the way CI runs it (`CI=1`, against `next start` over a fresh build). Nothing failed; every flake passed on its first retry, eight of them the `pool.spec.ts` count flake in the debt row below and the ninth a `mapping-done` correction that did not arrive inside 5s under five workers. **10.8's clean run was the outlier, not this one** — that suite was 425 and this flake is not rare enough for 425 to prove anything, which is exactly what the row below said. `pool.spec.ts` alone, twice over, is clean. Run it **on the port `NEXT_PUBLIC_APP_URL` names**, which is the default 3007: `E2E_PORT=3011` fails the two `/auth/callback` specs outright, because that route redirects to the absolute configured origin and there is nothing listening on 3007 — see the debt row. The flakes it used to carry were all in `pool.spec.ts`; see the debt row below, which 10.6 narrowed by closing the pre-hydration variant. Worth knowing: the same suite against the **dev** server, with other projects' dev servers on the same laptop, failed 149 tests on route-compile timeouts alone. Measure the suite on a build, or the noise is the result |
| `npm run pb:verify` | **159 checks pass** — including unique `(season, game_code)` on fixtures, unique active `(league, player)` on roster memberships, unique `(league, season, round)` on standings snapshots, unique `(league, member, season, round)` on lineups, unique `(source, source_key)` on news items, and superuser-only writes |
| `npm run pb:verify:oauth2` | 7 checks pass |
| `npm run rosters:sync` | **323** draftable players across 20 clubs at the last run. The feed moves; do not treat the count as a constant |

---

## Keeping this file honest

Update it **in the same PR** as the work it describes; the PR template has a
checkbox for exactly this. A slice is not finished when its code merges — it is
finished when this file says so and the claim is true.

When a PR defers part of its scope, that deferral goes **here**, as a `partial`
row or a line in Open debt. A deferral recorded only in a PR description is
invisible to the next agent, which is how 1.3b went missing.

What goes where: a table row, the Next-up paragraph, an open-debt row and the
current phase's "Try it" note live here. The paragraph that explains *why*, the
post-deploy check, and a closed phase's "Try it" notes go to
[`docs/log/`](log/README.md) — append there in the same PR, under the slice's
number, so this file stays short enough to be read before every piece of work.
