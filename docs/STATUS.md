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
> [eurovafliai.labrium.online](https://eurovafliai.labrium.online).

**Next up: 5.4 weekly recap.** Phase 4 is closed in code: **4.1–4.5 have
landed**, and **5.1–5.3 have landed**: a finished draft writes
`roster_memberships`, a commissioner records trades, standings join by
Euroleague round, and the team page shows live deltas. Phase 3 is closed apart
from the **human rehearsal** its DoD asks for — a draft night with 3+ friends on
mixed devices, inherited from Phase 2 (blueprint D12). That is the only claim in
this file no test can make.

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
npm run test             # 913 unit tests; memberships, standings join, and the snapshot recompute are covered now
CI=1 npm run test:e2e    # what CI runs: Playwright against `next start` over a fresh build
```

Then `npm run dev`, open `http://localhost:3007`, and paste a wrong invite
code into **Join a league**: the refusal renders under the form from
`useActionState`, and the URL stays clean — no `?error=` in the address bar,
which is what closed [#16](https://github.com/andrius-burba-94/eurovafliai/issues/16).
In a draft room with picks on the board, open **Undo a pick** and change the
number: the line under it now says how many picks *that* number would discard,
before the button.

`npm run test` is **944** unit tests after 5.3.

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

**Deployed.** DoD — *"phone + PC, two Google accounts, live lobby on the
production subdomain"* — is met in every mechanical sense: the site serves over
TLS, and realtime is confirmed working through the production nginx proxy. What
has *not* happened is the human half: two people, two devices, one lobby. Until
somebody does that, Phase 1 is complete-pending-confirmation rather than
complete.

**Production:** `https://eurovafliai.labrium.online`, on the shared Hostinger
box `srv837724` — app on `127.0.0.1:3007`, PocketBase on `127.0.0.1:8095`.
Eight other apps live there; see `docs/runbooks/vps-setup.md` before touching
anything.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 1.1 Schema — `leagues`, `league_members`, Google OAuth2 on `users` | done | #2 | Rules and indexes asserted by `npm run pb:verify` |
| 1.2 Auth — Google sign-in, httpOnly session, route protection | done | #6, #11, #12, #13 | Public sign-up closed; first-time OAuth2 sign-up proven against a local OIDC issuer |
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

**Phase 1's two-device confirmation is a separate row and is still open**, listed
under Open debt. It is a smaller thing — two accounts, two devices, one lobby —
and most of it has already happened incidentally.

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

## Phase 4 — Player stats, projections, standings

**Started.** 4.1–4.5 are in; Phase 5 is next.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **4.1 Stats schema + scoring engine + CSV import** | done | — | **PIR is not ours to get right by reasoning, so it is checked against theirs.** The box-score feed publishes `valuation`, which *is* PIR — so `scoring.golden.test.ts` replays **168 real player rows from seven E2025 games** and asserts our sum equals the number the Euroleague printed that night, plus all fourteen team totals: **zero mismatches**. Regenerate with `npm run stats:golden`; `-- --check` asks the feed whether it still agrees with the committed fixture. The endpoint the research file left open is pinned (`/games/{code}/stats`), and it came with **one finding that would have been a silent, season-long bug**: the feed's `winner` field is the *season's champion* on every game of the season — `OLY` on all seven samples, five of which it did not play in — and the win is what the ×1.1 bonus hangs on. Derive it from the scoreline; two of the seven agreed by coincidence, so a small sample would have looked fine. **Fantasy points are integer tenths everywhere**, because `3 * 1.1` is `3.3000000000000003` and a season of those in a standings sum is a wrong number nobody can explain. **Blueprint open question 3 is settled** (D15): the ×1.1 applies uniformly, negatives included — cheap to correct later because every component is persisted, and the fixture carries 8 real negative-PIR-on-a-win rows either way. The CSV door has **no `won` column** on purpose (a stated winner is a place to disagree with the scoreline) and **self-checks**: a sheet that brings the official PIR has every line compared against what its own numbers add up to, and a disagreement is refused rather than resolved by guesswork — so the golden check runs on every real import, not only in CI. Idempotent by index, so **re-running an import is the repair**; nothing here deletes, so a partial sheet cannot erase a round |
| **4.2 Player mapping** | done | — | **Not the light verification pass the blueprint expected — it caught a defect that would have split fifteen real players in two.** 2.1's research said 13% of E2026 players had no `person_code` and that the count would fall "as clubs register". It fell, and the clubs registered those players **under their passport names**: `Burnell, Jason` became `Burnell, Jason Scott` *with* a code. So the name+club fallback missed and a sync planned an **add and a departure for the same human** — measured against the live feed as 18 adds and 22 departures, at least 15 of them one person. Box scores attach by `person_code`, so the points would have landed on the new row while a pick or a cheat sheet still pointed at the old one, and 4.3 fetches unattended. `diffRosters` now **quarantines** a likely pair: neither half is written, so the worst case is a stale display name rather than a split identity. On the live pool that turned 18/22 into 6/10. **The rule is token containment, not a fuse threshold** — and that is a measurement, not a preference: over 15 real pairs and 5 hard negatives, fuse's scores *overlap* (true 0.008–0.568, false 0.485–0.777), so any cut-off catching `Duarte, Chris → Theoret Duarte, Christopher` (0.531) also merges `Nunn, Kendrick` with `Nunn, Kevarrius` (0.509) — two real players, one silent identity error. Fuse still ranks the leftovers, which is where a nickname (`Juzang, Johnny → Juzang, Jonathan`) gets offered as a question rather than answered. `/players/mapping` resolves both directions: a rename, and an **unattached person code** from a box score — attaching one also re-imports the games it appeared in, without which the mapping would be cosmetic. A **merge keeps the stored player's id**, so picks, sheets, memberships and stats stay attached |
| **4.3 Automated fetcher (worker cron)** | done | — | **The worker imports box scores by itself, every 15 minutes.** Not nightly, which is what the blueprint says: a Tuesday game that ends at 22:00 is argued about at 22:05, and a nightly job would have nothing to say until morning. One pass = one schedule request → the games that are **played and not already stored** → up to 12 of them, oldest first. That shape is what makes it **self-healing by construction**: a game missed because the box was down, because a parse failed, or because nobody ran the worker for a fortnight is simply still outstanding next time, so there is no backfill path because there is nothing for one to do. It runs `ingestFinishedGames`, which is also all `npm run stats:sync` does — the automatic path and the by-hand path are the same function, the way `commitPick` is shared by a tap and an autodraft. **The SDK the blueprint names was evaluated and declined** (D16): it is alive and it fits, but its schemas validate the whole payload, so a change to a field we never read could refuse a whole round and stop the automation. A tolerant schema over the ten fields we read keeps going, and the roster sync's retry/backoff moved to `src/lib/euroleague/http.ts` so there is one HTTP idiom rather than two. **Every row still self-checks against the feed's own PIR** on the way in, so 4.1's golden assertion now runs against live data four times an hour — a rulebook change would show up as a refused row with both numbers in the log. It has its **own in-flight guard**, never the sweep's: a slow feed response must not delay a pick deadline. Proved against the live feed and the real database, not only against fixtures — 107 real E2025 lines imported by hand, then the second pass moved on to the next games instead of redoing them |
| 4.4 Projections | done | — | **Last-5 and season fantasy averages, materialized onto `players` after each ingest.** Integer tenths, same as `fantasy_pts`. Absence is `proj_last5_games === 0`, not a 0 average — PocketBase stores unset numbers as 0, and autodraft already treats a missing projection as worse than −2. Last-5 of 1–4 played games is last-N; DNPs (`time_played = 0`) do not occupy a slot; order is `(round, game_code)`. Both doors call the same `recomputeProjections` after a write, so a human paste and the fifteen-minute pass cannot diverge. **Draft night is before E2026 tip-off:** backfill E2025 then `npm run stats:project`; the first E2026 ingest overwrites the fields. The pool filter is 10+ / 15+ / 20+ last-5 floors, exclusive `FilterToggle`s, and the number sits on the row. A crash between stats landing and the player rows updating leaves stale averages; running the script again is the repair |
| **4.5 Standings** | done | — | **The first surface that displays a scored night.** Snapshots are a cache, unique `(league, season, round)`, written after ingest the way 4.4 writes projections. The roster join is **active `roster_memberships`** as of 5.1; until then it was the newest complete draft's picks. Totals are stored `fantasy_pts` tenths (`formatTenths` only), so custom per-league weights remain a later rescore. Phase is a filter on the page, default RS; every phase stays in `player_game_stats`. Round-over-round is a wrapping table, not a chart. `/players/[id]` is the game log. `/stats/import` finally has a season field. Repair: `npm run standings:recompute` |

---

## Phase 5 — Season mode: rosters, trades, impact tracking

**Started.** 5.1–5.3 are in; 5.4 is next.

| Slice | State | Landed | Notes |
|---|---|---|---|
| **5.1 Membership backbone** | done | — | On the last pick, `advance` writes `roster_memberships` (`from_date` = that instant, `from_round: 1`, `acquired_via: draft`) after the draft is complete and the league is `season`. Unique active `(league, player)` is the backstop; a second pass skips anyone who already has an open window. `recomputeStandings` repairs an incomplete set from the newest complete draft **only while no window has been closed**. A complete set does not reread picks. Start-over deletes memberships *before* drafts. Squad of record is the open windows; `/leagues/[id]/teams/[memberId]` is the roster plus that member's radar |
| **5.2 Transactions** | done | — | **Record, do not broker.** Commissioner or deputy writes a trade or an add/drop; there is no offer queue. N-for-N only; drop may leave a hole; add needs a vacancy and an unsigned player. Intent row first (`transactions`), then close windows (`to_date` + exclusive `to_round`), then open, then `announce()` which never throws. Standings join `from_round`/`to_round` so a trade at round 2 leaves round 1 with the old owner. Open draft windows still own every round, so an E2025 backfill matches 4.5 until the first close. `/leagues/[id]/transactions/new` is the builder |
| **5.3 Impact tracking** | done | — | Live in − out from box scores, from `from_round` onward, all phases. Fantasy tenths are the headline; PIR sits under them. No new collection and no chart library: a wrapping `R2 -4.3` run. Team page lists that member's deals; a drop's counterfactual is the out sum. `?season=` matches standings |

## Phases 5–8

| Phase | State |
|---|---|
| 5 — Season mode: rosters, trades, impact tracking | **started** — 5.3 is the overlay; 5.4 is the weekly recap |
| 6 — Optional formats | todo |
| 7 — AI features (Gemini 2.5 Flash) | todo |
| 8 — Hardening & ops polish | todo |

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
PocketBase's backup API, retaining 14 archives. It still has to be installed
and enabled on the VPS, then proved with the restore drill below.

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
merge gate. The framework-free stores (`sheets`, `chat`, `stats`, `rosters`)
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
| **Local PocketBase drifts from `main`** | A dev database only applies migrations on boot, so a checkout that has been running across a schema change silently tests the old shape. It cost a confusing run of lobby-spec failures. `npm run dev` after pulling is the whole fix; the symptom is `pb:verify` disagreeing with CI | Nothing; a time sink |
| **Two-device confirmation** | Most of the way there. Two Google accounts have now joined one production league, rolled an order and started a draft — and the realtime gap that opened Phase 3 could only have been *seen* by two sessions watching one board, so the live surface is confirmed by more than a protocol check. What is not recorded is whether that was two devices (a phone and a PC) rather than two browsers on one machine, which is the literal wording of Phase 1's DoD. One deliberate run closes this | Declaring Phase 1 finished |
| **No `manual_lock` button** | A locked player is untouchable by both sources and the pool page shows the badge, but setting the lock still means editing the database. The rest of 2.1b shipped without it | Nothing; a commissioner-comfort gap |
| **A partial CSV still empties the pool** | Mitigated, not removed. Any player missing from an applied sheet is marked `left`, and beyond a quarter of the pool the upload now demands a tick-box (`assessDepartures`) and the sync script demands `--allow-departures`. Below that threshold a partial sheet still departs people quietly. Departures are a status and never a deletion, and the next sync revives them — which is exactly how this was found | Nothing; a known edge |
| **Every alpha boundary is measured now — one is not** | Closed, and recorded here because the thread ran across four slices and the next person should not re-open it: 3.3 darkened the position letter (`pos-g`/`pos-f` to L 0.49) after `tokens.test.ts` learned to composite; 3.2's critique corrected that compositing to gamma-encoded sRGB, which is how a browser actually blends and is ~0.2 *stricter*; and #48/#49 fixed the last three sub-floor boundaries — the button border (2.10:1), the patch border (2.22–2.26:1) and an input's ruled line (1.87:1, the lowest in the app, and the one DESIGN.md itself calls the whole affordance). All now clear 3:1 and all are asserted. **What is left:** nothing measured. If a new colour or modifier is added, `tokens.test.ts` is where it has to be proved, and `wash()`/`contrastOn2()` are the helpers for it | Nothing |
| **The design detector cannot see this app's real risks** | Four runs now have reported zero findings on the surfaces under review, and 3.4b's pass re-traced the regex engine's own module graph to put a firmer number on it: **18 of the registry's 59 rules can fire on a `.tsx` file, so 41 cannot.** This number has now been derived twice and the second method is the one to trust: 3.5's pass cross-referenced the rule ids the regex engine actually references against `ANTIPATTERNS` and **enumerated all 18** (`side-tab, border-accent-on-rounded, overused-font, flat-type-hierarchy, gradient-text, ai-color-palette, monotonous-spacing, bounce-easing, dark-glow, radial-halo, marquee, em-dash-overuse, marketing-buzzword, aphoristic-cadence, broken-image, gray-on-color, layout-transition, codex-grid-background`). Earlier passes guessed "37 of 59 never execute" and then "~15 can fire"; an enumeration beats both. On `.tsx` input only the regex engine runs — including `low-contrast`, `tiny-text`, `undersized-ui-text`, `all-caps-body`, `wide-tracking` and `text-overflow`, which are precisely this system's failure modes. The static-HTML engine needs `htmlparser2`/`css-select`/`css-tree`/`domutils` and the browser engine needs `puppeteer`; none is installed, and `.tsx` would not route to them anyway. `design-system-radius` also cannot read Tailwind `rounded-*` in source. A clean `design-detect` in CI means "no purple gradients and no bounce easing", which was never the risk here — every real finding in three critiques came from measurement or from reading. Worth knowing before anybody trusts that green tick | Nothing; but the CI check is far weaker evidence than it looks |
| **A radar row cannot reach that member's column** | The last open finding from 3.2's critique, and the only one not fixed. The radar answers "who needs a center" and the board answers "what did they take" — and getting from a name on one to a column on the other means scrolling the board sideways by hand. An enhancement rather than a defect, and it wants a decision first: whether a radar row is a link at all, given the board is a horizontally scrolling region and this system has no idiom for "scroll that thing to here" | Nothing; two surfaces that answer adjacent questions do not connect |
| **A board wider than about six members scrolls on a desktop too** | Accepted with the layout decision (DESIGN.md, open question 4): one scrolling region everywhere rather than a second container width for one route. At the real league's size the columns share the width they have; at twelve members a laptop scrolls sideways like a phone. Recorded because the alternative — a wider container and a new breakpoint — is a real option somebody may want later, not an oversight | Nothing; a decision, logged so it can be revisited |
| **Autodraft ranks unsheeted members by last-5** | Closed in 4.4. A member with a sheet is still picked from the sheet first. A member with no played games in the projected season still ties on player id | Nothing |
| **Last-5 of a full E2025 backfill includes the Final Four** | 4.4 averages every stored phase of the season it is pointed at. Standings now filter by phase; last-5 on the pool still does not. A September ranking built from last season therefore uses late-playoff form for anyone who was still playing in May | Nothing; a known skew on the preseason ranking |
| **No path from the pool *into* a sheet** | What is left of 3.4a's central critique finding after 3.4b closed two thirds of it. A sheet can now be reordered and a player removed from it, but the only way to *add* somebody is still to paste a list — there is no "put this player on my sheet" from the pool or from the room. It needs a picker over 323 players and a decision about where it lives, so it is its own piece of work rather than a rough edge | Nothing; a sheet can still be built, just not incrementally |
| **A sheet still cannot be edited from inside the room** | The third thing blueprint 3.4 asks for, and the only part of that line still unmet: "editable before *and during* the draft in a sidebar". It is a page, and the room links to it and pins the best three from it. On a phone that is arguably the right answer — this app is one column and a sixty-row list does not sit beside a board — but it is a divergence rather than a finished thought | Nothing; the sheet is reachable mid-draft, just not beside the board |
| **An unmatched cheat-sheet line cannot be fixed in place** | The confirm step offers a choice for an *ambiguous* line, because it has two or three real candidates to offer. A line the pool has never heard of gets a message telling you to fix the spelling and read the list again — which is now cheap, because the box holds your sheet as editable text. A `<select>` over all 323 players per unmatched line was the obvious alternative and was rejected on weight: twenty unmatched lines would ship 6,460 options to a phone | Nothing; a rough edge on the least common path |
| **A sheet outlives the season it was written for** | The consequence of keying `cheat_sheets` on the membership rather than on the draft, and the price of the argument in that migration. A league that drafts a second season on the same memberships inherits last season's ranking rather than starting blank. It is a stale sheet a member can see and replace, not a lost one; a per-season sheet is Phase 6's keeper work | Nothing yet; there is no season 2 |
| [#34](https://github.com/andrius-burba-94/eurovafliai/issues/34) | **`deploy.sh` rewrites itself mid-run**, so a change to it never applies to its own deploy — 2.5's worker-liveness check did not run on the deploy that shipped it, and will from the next one. Worse in principle than in practice so far: bash reads a script by byte offset, so a pull that changes a not-yet-executed part of the file can make the shell resume mid-line | Nothing yet; a deploy-tooling trap |
| [#35](https://github.com/andrius-burba-94/eurovafliai/issues/35) | **The nginx vhost drift warning can never be silenced.** The committed vhost is the plain `:80` one *by design* (certbot needs a working vhost to answer the ACME challenge and then rewrites the file in place), so every deploy warns. The whole drift is certbot's own `# managed by Certbot` lines; `/pb/` is byte-identical. A warning that fires every time is one nobody reads, which is a problem because the thing it exists to catch — a hand-edit that loses `proxy_buffering off` — kills realtime silently | Nothing; the check protects nothing until it is quiet |
| **Half the room gets no vibration** | `navigator.vibrate` does not exist on iOS Safari — not gated, not permission-prompted, simply absent — so on an iPhone the clock cue is the tone and the live region and nothing in the hand. `clockCue` returns the vibration pattern regardless and `clock-cue.tsx` feature-detects before calling, so there is no error and no console noise; there is also nothing telling an iPhone owner that half of what the toggle offers cannot happen for them. The toggle's own label says "Sound" rather than "Sound and vibration" for that reason, which is honest but not informative. A real fix means either detecting the absence and saying so, or dropping vibration from the copy entirely | Nothing; a silent asymmetry between the phones in one room |
| **A commissioner with no membership row hears no clock** | `ClockCue` renders only inside the `view.you` branch, because everything it says is about *your* turn and somebody with no turn has nothing to be told. That is right for the live region and for the cue, and it means a commissioner who runs a draft without playing in it has no audible surface at all — including no way to reach the toggle. Recorded because it looks like a bug from the outside: the toggle simply is not there. If a non-playing commissioner ever needs a cue it wants a different sentence ("Pick 7 is on the clock"), not this one moved | Nothing; a deliberate gating, documented so it is not "fixed" into noise |
| **Scoring weights are settings that nothing reads yet** | 4.5 answered the immediate question by summing stored `fantasy_pts` tenths, so the table is honest about the official weights. Custom per-league weights would still be a lie until a later rescore from components: box scores are app-global, weights would be per-league, and the importer still passes `OFFICIAL_WEIGHTS` unconditionally | Nothing yet; a settings screen would still be a lie |
| **An amended box score is never noticed** | 4.3's pass asks "what is played and **not stored**", and that is what makes it self-healing — but it means a game whose box score the Euroleague later corrects is invisible to the fetcher for ever, because the game is stored. The Euroleague does amend them. The remedy exists and is manual: paste the game into `/stats/import`, which names every field it would change before changing it. The fix would be a second, slower pass that re-fetches recent games and compares — cheap to write, and it wants a decision about how far back "recent" reaches, because re-fetching 380 games nightly to catch one correction is not a trade worth making | Nothing; a correction needs a person to notice it |
| **A game imported with some rows refused stays "done"** | `readStoredGameCodes` asks whether a game has *anything* stored, not whether it has all 24 lines. So a game where two players were refused — no person code, or a PIR that disagreed with its own components — counts as imported and the fetcher never returns to it. Deliberate: the refusals are named in the batch log, and re-fetching a game whose other 22 rows are already correct would rewrite them to fix nothing. It does mean the *only* record that a line is missing is a `stat_imports` log nobody reads unprompted | Nothing; two players' lines, and a log entry that has to be looked for |
| **A quarantine needs somebody to notice it** | 4.2 stops a sync splitting a player in two, and the price is that the pair stays unresolved until a person opens `/players/mapping`. Nothing chases them: the sync script prints the held-back pairs and the page lists them, but no chat announcement, no email, nothing on the lobby. Fifteen unanswered renames means fifteen players whose display name is stale and whose box scores cannot attach — which matters from 24 September, not before. The cheapest fix is a count somewhere a commissioner already looks | Nothing yet; a queue with no doorbell |
| **A rename is only ever proposed against the *same club*** | `proposeRenames` never pairs across clubs, which is what stops it merging two unrelated players who share a surname. The cost is the case it cannot see: a player who was re-registered under a passport name **and** transferred between two syncs. That is a departure plus an add, as before 4.2, and the duplicate has to be spotted by eye. Rare, and the alternative — fuzzy matching across the whole 330-player pool — is how you merge the wrong Nunn | Nothing; a narrow blind spot, chosen over a wide one |
| **Enable backups + restore drill** | The API backup script and `eurovafliai-backup.timer` are committed and retain 14 archives, but the timer is not live until the units are installed and enabled on the VPS. Then restore one archive into disposable local `pb_data`, boot the pinned binary, and run `pb:verify` | Automation exists in git; no live backup or restore has been proved |

## Verification status

Last full local run, after the code-health pass: **all green.** The long-form
record — which bug each test found, what each number meant when it was
written — is in [`docs/log/verification.md`](log/verification.md).

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run lint:dead` | pass — knip reports no unused files, exports or dependencies |
| `npm run typecheck` | pass |
| `npm run test` | **913 passed.** The engine, the sweep and the pipeline, ingestion, leagues and draft setup, components, cheat sheets, the pool, the design tokens, the on-the-clock cue, league chat, the stores and repairs — plus last-5 / season projection arithmetic, standings tenths and phase filter, the membership materialize, and the idempotent snapshot recompute |
| `npm run build` | pass |
| `npm run test:e2e` | Roster page + access boundary, standings one-round, and start-over membership cleanup pass on chromium and Pixel 7. Full suite in CI |
| `npm run pb:verify` | **126 checks pass** — including unique active `(league, player)` on roster memberships, unique `(league, season, round)` on standings snapshots, and superuser-only writes |
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
