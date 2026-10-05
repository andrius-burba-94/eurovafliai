# Product

<!-- impeccable:product-schema 1 -->

## Register

product

## Platform

web

## Users

People can sign in with Google and create a private league; an invite code is
needed only to join somebody else's league. A league usually has 8–12 friends,
with 12 members at most. Within each league there are two roles:

- **Commissioner** (one person, the maintainer). Configures the league, ingests
  player rosters, rolls or sets the draft order, runs the live draft, pauses and
  rolls back when the room goes sideways, approves trades. Works on a laptop on
  draft night, phone the rest of the season.
- **Members** (everyone else). Join by invite, build a private cheat sheet
  before the draft, pick when they are on the clock, then check standings and
  trade impact between game days. Mostly on phones, frequently on the same couch
  in the same room, occasionally remote and half-distracted.

Both roles play with a small group of friends. The welcome page explains the
game and the sign-in action; the league room needs no onboarding tour.

## Product Purpose

Run a real fantasy draft for the EuroLeague season and then keep score honestly
for the rest of it.

The draft is the event: everyone watches the same board update at the same
moment on their own device, with a clock running on whoever is picking. After
the draft the product becomes a scoreboard — nightly real player performance
(PIR and fantasy points), league standings, and the running point impact of
every trade and signing.

Success is that draft night runs end to end without anyone reaching for a
spreadsheet or asking "whose turn is it?", and that the season's standings need
no manual work to stay current.

## Positioning

Public fantasy platforms do not run EuroLeague draft leagues, and the official
EuroLeague Fantasy Challenge is a different game entirely (weekly salary-cap
squads, captains, bench multipliers — no draft, no exclusive ownership, no
trades). Generic draft tools have no EuroLeague player data.

This product is the intersection: a real snake/linear draft over EuroLeague
players, scored with the official player formula, for small groups of friends
who already argue about these players. Its distinguishing mechanism is
correctness under contention — a server-authoritative draft where a double pick
is physically impossible, deadlines are enforced by a process rather than by a
phone, and a mid-draft rollback is a supported operation rather than a disaster.

## Operating Context

- **Draft night.** One sitting, 13 rounds × up to 12 members. Mixed devices,
  mostly phones, in one room with the TV on and everyone talking. Some members
  are absent and drafted for automatically. Picks are sometimes made offline and
  entered by the commissioner. Trades get argued about out loud and in chat, but
  the app does not broker them mid-draft: a swap is a season transaction, agreed
  between people and recorded afterwards.
- **The season.** 38 EuroLeague rounds. Stats arrive overnight, unattended.
  Members look at standings and trade deltas in short phone sessions.
- **Roster ingestion.** Player data comes from the EuroLeague API all summer and
  from a hand-corrected CSV near draft night; one of the two is authoritative at
  any moment and the other reports what it would have changed.
- **Deployment.** A public welcome page on an existing VPS. First-time Google
  sign-in can create an account and a league; direct password signup is closed.
  Each league stays private, and joining one requires its invite code.

## Capabilities and Constraints

- **Roster template:** 13 players per team — 5 Guards, 5 Forwards, 3 Centers.
  Lives in league settings, never hardcoded.
- **Draft formats:** linear, snake, third-round reversal, later keeper and slow
  drafts. Auction is explicitly out of scope.
- **Order modes:** live animated roll, manual commissioner ordering, or reverse
  standings from a previous season.
- **Scoring:** the official EuroLeague Fantasy Challenge *player* formula. The
  base sum is exactly PIR; a team win adds 10%. Stored as integer tenths — no
  floating point money-style drift, ever. Weights live in league settings so the
  league can adjust them.
- **Language:** the interface is **English only**. Fantasy and basketball jargon
  stays in its native form (pick, on the clock, snake, autodraft, PIR). Player
  names keep their diacritics, and search must fold them (Valančiūnas findable
  as "valanciunas").
- **Terminology** is fixed and shared between code, UI and the league's chat —
  see `CONTEXT.md`. Notably: *pick*, *on the clock*, *the board*, *the pool*,
  *radar*, *cheat sheet*, *the roll*, *rollback*, *membership*, *snapshot*.
  "Round" always needs qualifying: a draft round is not a EuroLeague round.
- **Scale:** ~10 concurrent users. Correctness and clarity outrank throughput.
- **Determinism:** autodraft and pick legality are deterministic forever. AI
  features are commentary and analysis only, never in a fairness- or
  latency-critical path.
- **Undecided, deliberately:** position bucketing for players the official
  listings call "Guard-Forward" (rule-based with a commissioner override);
  whether a 12-member league drops to 11-man rosters; how the official game
  handles a negative PIR on a win (a settings value either way).
- **Not a product fact:** dates and deadlines. The maintainer's instruction is
  that scheduling is out of scope for how this work is planned or discussed;
  phase ordering is relative, never dated.

## Brand Commitments

- **Name:** Eurovafliai. Lithuanian-flavored, affectionate, slightly silly —
  the product is for friends, not for clients. It does not pretend to be a
  sports-industry SaaS.
- **Recorded design direction** (ADR-0011, *matchnight broadcast*): the app
  reads like the scoreboard graphic of a game night — one big number per page,
  team colours and crests, Tip-off orange for the one act, dark and light
  grounds following the device. Moments celebrate changes a friend would point
  at (a crown, an overtake, a spoon, a deal verdict, a pick landing) and hold
  still under reduced motion. No card-in-card, no ad hoc gradients.
- Draft night is **phones on a couch**: mobile-first is a product commitment,
  not a nice-to-have.

## Brand Personality

**Broadcast, confident, playful.**

- **Broadcast:** it reads like the scoreboard graphic on the TV in the same
  room. Dense, legible at a glance, calm until something happens.
- **Confident:** the server is the referee, and the interface speaks like one.
  State is stated, not hedged: whose pick it is, what the clock says, what a
  trade actually cost. No "oops", no apologetic copy around rules.
- **Playful:** the name is a joke among friends and the product can wink back.
  Humor lives in small moments (the roll, a pick landing, chat announcements),
  never in the numbers and never at the expense of clarity.

Emotional goal for draft night: shared tension and fun around one board.
Emotional goal for the season: trust that the standings are right without
anyone checking.

## Anti-references

- **Generic SaaS dashboard.** Cream backgrounds, hero-metric tiles, identical
  card grids, onboarding tours. This is a league among friends, not a B2B
  product.
- **Sportsbooks and betting apps.** Neon odds, flashing urgency, casino energy,
  "act now" pressure. Nothing here is money, and the clock should feel tense,
  not predatory.
- **Cluttered big-network fantasy apps.** Ads, tab bars inside tab bars, promo
  banners, news feeds crowding out the board. The draft room shows the board,
  the clock and the pool; everything else earns its place or leaves.

## Evidence on Hand

- The full build plan and locked decision log: `docs/EUROVAFLIAI_BLUEPRINT.md`.
- Domain vocabulary: `CONTEXT.md`. Architecture rationale: `docs/adr/`.
- **No real content yet.** No player data, no leagues, no members, no stats, no
  screenshots. Provisional EuroLeague 2026–27 rosters exist upstream (20 clubs,
  38 rounds) and will be ingested from the public API; a hand-corrected CSV will
  follow. Nothing about real players, real standings or real league members may
  be invented in copy, mockups or fixtures — use obviously fake placeholder
  names until the ingest exists.
- Sibling products by the same maintainer establish the operational patterns
  (Inkliuzas, Centfolio): same stack, same VPS, same deployment discipline.

## Product Principles

1. **The server is the referee.** Anything a client could get wrong about turn
   order, legality or time, the server decides. This is a fairness product
   before it is a UI product.
2. **Correct beats clever, always.** A double pick or a lost pick is
   unrecoverable socially. Constraints that make bad states impossible are
   preferred over code that promises to be careful.
3. **Draft night is one shared moment.** Every device shows the same state at
   the same time; anything that could desynchronize the room is a defect.
4. **Degrade, never corrupt.** If the timer process dies, drafting continues by
   hand. Every feature keeps a manual path for the commissioner.
5. **Between game days it should need nobody.** Stats, projections and standings
   update unattended; manual import exists as a fallback, not as the workflow.

## Accessibility & Inclusion

- Mobile-first at real phone sizes; the draft room must work one-handed.
- `prefers-reduced-motion` is respected everywhere, including the roll reveal
  and pick animations.
- "You're on the clock" must be perceivable without looking at the screen —
  announced to assistive tech via a live region, with sound and vibration cues.
- Keyboard-first player search and pick confirmation on desktop; correct focus
  order inside the draft room.
- Position and status must never be encoded by color alone.
