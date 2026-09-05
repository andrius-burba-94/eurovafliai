# Status

**What is done, what is next.** This file is the single answer to "where is this
project?" — read it before proposing work, and update it in the same PR that
changes what it describes.

It is deliberately *not* the plan. The plan is
[EUROVAFLIAI_BLUEPRINT.md](EUROVAFLIAI_BLUEPRINT.md) and it does not move; this
file records how far through it we are. When the two disagree, the blueprint
defines the target and this file is wrong.

> **Slice 3.3, the player pool, is in production** at `cdb1e51` — and its
> deploy is the one that has actually failed. See "The deploy that broke, and
> what it was really about" below.
>
> **Slice 3.1, the draft board, is in production** at `920439e` — realtime
> re-checked through the proxy afterwards (`PB_CONNECT` in 0.2s) because that is
> the thing a deploy breaks silently.
>
> **Phase 1 — walking skeleton. Live at
> [eurovafliai.labrium.online](https://eurovafliai.labrium.online).**
> Auth, league creation, join-by-code, the design foundation, the live lobby and
> the deploy have all landed. Realtime is verified working *through the
> production proxy* — `PB_CONNECT` arrives in 0.1s, unbuffered.

**Next up: slice 3.4, cheat sheets** — the CSV upload, drag-to-reorder and tier
breaks that drive autodraft. It is also what 3.3 left owing: the pool's resting
state should be a short "best available" list rather than thirty of 341, and
"best available" means a sheet.

Still outstanding, and it needs people rather than code: the **Phase 2
rehearsal**, a full 13-round draft with one member on autodraft and a rollback
in the middle. A real two-account draft *has* now been run on production — it is
what found the two gaps Phase 3 opened with — but it was started and undone
rather than played out, so the phase's own DoD is not met yet.

A draft now runs itself. The worker (slice 2.5) enforces every deadline, picks
for whoever has run out of time or has handed their picks over, and repairs the
three states no request would ever notice. Verified locally by running one: a
full 13-round two-member draft, autodrafted end to end at one pick a second,
finishing `complete` with the league moved to `season`. **Live in production**
since `afb58b3` — the deployed worker authenticates to PocketBase and sweeps
(see the production table below).

**And the room is live.** A pick, a pause, an undo and an autodraft all reach
every screen in the league as they happen: the room subscribes to this draft
over SSE with the viewer's own token and asks the server to render again, so
every fact on screen is still decided in one place. Found the hard way — the
first real two-device draft spent its first minute watching a banner name
somebody who had already picked.

**And the board is on the wall.** Slice 3.1: rounds down, one column per member
across, all 156 slots of a full league drawn whether they are filled or not. A
column is one member's roster rather than a run of pick numbers, so a snake
draft reads down a column instead of zigzagging across one — and the layout is
derived from `buildPickOrder` itself rather than beside it, so the board cannot
disagree with the order the clock is driven by. It brought the app's **second and
last** animation with it: the live rule advancing, which fires for a viewer who
was watching the clock move and stays still on a page load.

The pool exists: **324 E2026 players across 20 clubs** are ingested from the
Euroleague API by `npm run rosters:sync`, which is idempotent and re-runnable.

**Testing a draft on your own.** A league will not roll an order, reshuffle it
or start a draft with fewer than **two members**. That is a product rule rather
than a technical limit — the engine's `rollOrder` is happy with one — and it
means a single developer cannot reach any of it. So:
`npm run seed:members -- <invite-code> 3` adds stand-in members to a league, and
`-- <invite-code> --undo` takes them away again. They are real users and real
memberships rather than a special case inside the app, so the roll, the board
and 2.5's autodraft see exactly what they will see on draft night — and you can
sign in as one in a private window to watch from another member's side. The
script refuses any PocketBase that is not local.

Two Phase 1 items are still open and both are listed under Open debt: the last
step of the two-device confirmation, and nightly `pb_data` backups.

---

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

**Code complete, pending the rehearsal.** DoD — *"a full 13-round mock draft on
phone + PC with one member on autodraft, a mid-draft rollback, and the engine
suite covering every format × edge case"*. Every mechanism it names now exists
and is tested: the engine suite (2.2), the pick pipeline, the room and rollback
(2.4), and the worker that enforces the clock and drafts for the absent (2.5). A
13-round draft has been run end to end locally, but by the worker rather than by
people — so what remains is literally the phase's own wording: **a mock draft
with humans on two devices**, with a rollback in the middle. Until somebody runs
it, this phase is complete-pending-rehearsal rather than complete, exactly as
Phase 1 is complete-pending-confirmation.

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
| **3.1 Draft board — the rounds × teams grid** | done | — | Rounds down, members across, in a region that scrolls sideways inside the app's one `max-w-3xl` column — no second container width and no new breakpoint, which settles DESIGN.md's open question 4 and accepts knowingly that a twelve-member league scrolls on a laptop too. **Columns are members, not pick slots**: a column has to be one member's roster or every column of a snake draft is a zigzag of two people's players. The layout is a new pure engine function, `buildBoardShape`, and it is computed **from `buildPickOrder`** rather than from its own parity arithmetic — round direction stays decided in exactly one place, so this board is already right for any format that function is right for, including ones not written yet. Round numbers are sticky, so the row stays labelled while the columns move. Grid layout with table roles, because a rounds × members wall genuinely is tabular data and a real `<table>` cannot both divide its container and overflow it. `BoardPlan` **stays** — the login page and the lobby have no draft to draw (open question 2, answered). A **paused** board keeps its marker on the slot the draft stands at — strictly nobody is on the clock while paused, but the room's own banner is struck in marker throughout a pause, and a board that alone showed nothing was the odd one out; a complete board has no marked slot, because there is no next one. The chronological run below the board is now a **ticker**, capped at the last 8: the board above it holds the history, and the run is better at the sentence — who took whom, and whether the worker did it |
| **3.2 Live Roster Radar** | done | — | Shipped in three pieces across three slices, which is worth knowing when reading the blueprint's one bullet: the **realtime half** belonged to 2.6, the **legality muting** landed with 3.3, and this slice is the **radar itself** — one row per member, one mark per roster slot, grouped the way the template is written. Rows are in draft order so the radar reads *down* the same order the board reads *across*; the two answer different questions, because the board is sorted by when a pick happened and the radar by what a roster is missing. It fits a phone with no scrolling at all, which the board cannot, for the plain reason that a mark is not a name. The layout is a pure engine function (`buildRadar`) because the template is a **rule** read from league settings — the blueprint leaves open whether a twelve-member league drops to eleven-man rosters, and a radar that had assumed 5/5/3 would be a second place to correct when that lands. A pick that does not fit the template is **drawn** as a correction rather than dropped: there should never be one, and a radar that discarded it would hide the only state that would mean the referee had failed. 3.1's board is the closest thing to it today: a column *is* a member's roster, and the position letter and wash are in every filled slot, so "who still needs a centre" is readable off the wall by eye rather than stated |
| **3.3 Player pool: filters + fuzzy search** | **partial** | — | Landed: fuse.js over the whole pool in the browser (no round trip per keystroke), position, club, hide-drafted and fit-to-play filters, legality muting brought forward from 3.2, and a keyboard path — type, arrow, **Enter to arm**, Enter again to pick, Escape to cancel. The blueprint says "enter to queue pick" and there is no queue until 3.4, so arming is what Enter does: a pick is undoable only by a commissioner rollback and Enter is the key people press to dismiss things. Diacritic folding is not reimplemented — the browser is sent ingestion's own `name_normalized`, so "valanciunas" finds Valančiūnas because 2.1a already folded it. The pool now arrives **whole**, drafted players included and marked with who took them, because "hide drafted" is a filter and a filter needs something to filter. **Deferred, both blocked rather than skipped:** the *projected points* filter needs 4.4's projections and the *cheat-sheet tier* filter needs 3.4's sheets. Both are listed in the blueprint's 3.3 and neither has data to filter on yet |
| 3.4 Cheat sheets | todo | — | Autodraft has nothing to rank on until this or 4.4 lands (see Open debt) |
| 3.5 League chat + draft trade offers | todo | — | Also where a rollback finally gets its system message (2.4's one deferred line) |
| **3.6a Start over** | done | — | Out of 3.6's slice, brought forward by draft-night feedback: pause is reversible and undo walks the board back, but nothing threw a draft away, so a practice run could only be cleared by editing the database. "Start over" deletes the draft and its picks (`picks.draft` cascades, so the board goes in one operation rather than a delete loop that can stop half way) and returns the league to the lobby, keeping the draft order — somebody who started too early should not have to re-roll. Behind a typed word, because it is the only control in the room that destroys work. Deletes the draft **first** so the only crash state is a league claiming to draft with no draft to open, which `reconcileLeagueStatus` now repairs; the reverse order would leave a `setup` league with a live draft that `startDraft` would silently resume, ignoring a fresh roll. A room whose draft is gone now redirects to the lobby rather than 404ing, which is also what every other member's room does the instant the delete event arrives |
| **3.6b Delete the league** | done | — | The way out. Commissioner only and **not delegable** — a deputy is trusted to help run the league, not to end it, the same line `setMemberPermission` draws. Confirmed by typing the league's **name** rather than a fixed word, because a commissioner with three leagues open should have to look at which one they are deleting; case and stray spaces are forgiven. Deletes the drafts first, then the league: deleting the league alone *does* work — PocketBase walks the cascade tree — but that leans on an order nothing here pins, while a **direct** delete of a member or player a pick points at is genuinely refused. Both halves measured against 0.39.11 and written into the `pocketbase-patterns` skill, because the difference between "refuses" and "happens to work" is exactly the kind of thing this repo should not have to rediscover. A lobby somebody else has open no longer sits there empty afterwards: every membership vanishing at once means the league is gone, so the list hands back to the server and the page says so — which also, for free, ejects a member who has just been kicked |
| 3.6 Commissioner console — the rest | todo | — | Rollback UI beyond the pick-number field, autodraft for another member, the timer mid-draft, offline pick entry. `setAutodraft` already permits a manager to set anybody's; there is no UI |
| 3.7 Draft-day polish | todo | — | Pick confirmation, sound/vibration on "you're on the clock", `/impeccable` passes |

## Phases 4–8

Not started. One line each; the detail lives in the blueprint.

| Phase | State |
|---|---|
| 4 — Player stats, projections, standings | todo |
| 5 — Season mode: rosters, trades, impact tracking | todo |
| 6 — Optional formats | todo |
| 7 — AI features (Gemini 2.5 Flash) | todo |
| 8 — Hardening & ops polish | todo |

---

## Open debt

Carried deliberately, each with an issue. Anything here that a slice is about to
touch should be fixed by that slice rather than deferred again.

| # | What | Blocks |
|---|---|---|
| [#16](https://github.com/andrius-burba-94/eurovafliai/issues/16) | `createLeague` and `joinLeague` put finished prose in the query string and render it into a `role="alert"` — attacker-controllable text. The 1.3b lobby actions do **not** do this: they return their errors through `useActionState`, so the fix is a change to two older actions, not a new pattern to invent | Nothing; correctness debt in the leagues slice |
| **Local PocketBase drifts from `main`** | A dev database only applies migrations on boot, so a checkout that has been running across a schema change silently tests the old shape. It cost a confusing run of lobby-spec failures. `npm run dev` after pulling is the whole fix; the symptom is `pb:verify` disagreeing with CI | Nothing; a time sink |
| **Two-device confirmation** | Most of the way there. Two Google accounts have now joined one production league, rolled an order and started a draft — and the realtime gap that opened Phase 3 could only have been *seen* by two sessions watching one board, so the live surface is confirmed by more than a protocol check. What is not recorded is whether that was two devices (a phone and a PC) rather than two browsers on one machine, which is the literal wording of Phase 1's DoD. One deliberate run closes this | Declaring Phase 1 finished |
| **No `manual_lock` button** | A locked player is untouchable by both sources and the pool page shows the badge, but setting the lock still means editing the database. The rest of 2.1b shipped without it | Nothing; a commissioner-comfort gap |
| **A partial CSV still empties the pool** | Mitigated, not removed. Any player missing from an applied sheet is marked `left`, and beyond a quarter of the pool the upload now demands a tick-box (`assessDepartures`) and the sync script demands `--allow-departures`. Below that threshold a partial sheet still departs people quietly. Departures are a status and never a deletion, and the next sync revives them — which is exactly how this was found | Nothing; a known edge |
| **"You are on the clock" is not perceivable without looking** | PRODUCT.md commits to it being "announced to assistive tech via a live region, with sound and vibration cues". None of the three exists: the on-the-clock banner is a plain `div` whose text swaps on an SSE re-render, so a screen reader is told nothing and a phone face-down on a couch says nothing. 3.1 closed the board's half of this — the marked slot now carries an `sr-only` "on the clock" — but the banner is the one that matters and it belongs to blueprint 3.7 | Nothing; a written product commitment, unmet since 2.6 |
| **`PositionPatch`'s own colours are still eyeballed** | 3.1 taught `tokens.test.ts` to composite an alpha wash and used it on the board, which is how three real failures surfaced. The same measurement has not been pointed at `PositionPatch` itself: its coloured letter on its own 10% wash measures 4.21–4.50:1, straddling the 4.5 floor. The board moved off that pairing; the patch has not. DESIGN.md open question 7 now says exactly this | Nothing; the machinery exists, somebody has to aim it |
| **The clock is not on screen while you pick** | `PickClock` is at the top of the room; the pool is below the needs, the autodraft switch and (for a manager) the whole pause/undo/reset stack. On a 390px phone the countdown and the search box cannot both be visible once you have scrolled into the list — so "under a minute to find a player and commit" is an instruction you cannot follow while watching the clock. The critique's fix is to make the on-the-clock block `sticky top-0`, which has in-repo precedent in the board's sticky round gutter. Not done here because it moves the room's layout rather than the pool's, and it belongs with 3.7's draft-day polish | Nothing; it makes the last ten seconds of a pick worse than they need to be |
| **A refusal explains itself where you are not looking** | The whole argument for muting an illegal row rather than hiding it is that the server's refusal explains itself in the league's own words. `Correction` renders above the search box, and the tap can be thirty rows below it — so on a phone the explanation is off-screen. Fixing it properly means widening `DraftResult` to carry the player id so the *row* can take `slot-correction` (2px ink, already defined and unused in the pool), which is a change to `makePick`'s contract rather than to the pool | Nothing; the justification for a shipped decision is weaker on a phone than it reads on paper |
| **`SubmitButton`'s resting border is 2.11:1** | Measured, not eyeballed: `border-ink/35` over stock is under the 3:1 boundary floor, and in the pool the border *is* the button — no fill, no radius, and now no coloured label either. Hover at 80% is 7.72:1 and is the only state that clears the floor, which a phone never reaches. `border-ink/50` measures 3.10:1 and stays inside DESIGN.md's own declared 35–80% range. Not changed here because it repaints every button in the app, which is a look decision rather than a pool one. `PositionPatch`'s 55% borders (2.16–2.23:1) are the same story | Nothing; every button in the app has a sub-floor resting boundary |
| **The pool is still 30 rows tall before you touch it** | 3.3 gave the pool filters and a search, which is what a drafter uses — but its *resting* state still lists 30 of 341 players, so the board below it is still a long scroll away on a phone for somebody who is only watching. Genuinely better than 3.1's 25-with-no-filters, and not fixed: the honest answer is probably that an untouched pool should be short (a handful of best-available rows) rather than a truncated list of everybody, and that is a 3.4 question because "best available" means a cheat sheet | Nothing; the board sits lower on a phone than it should |
| **A board wider than about six members scrolls on a desktop too** | Accepted with the layout decision (DESIGN.md, open question 4): one scrolling region everywhere rather than a second container width for one route. At the real league's size the columns share the width they have; at twelve members a laptop scrolls sideways like a phone. Recorded because the alternative — a wider container and a new breakpoint — is a real option somebody may want later, not an oversight | Nothing; a decision, logged so it can be revisited |
| **No system chat message on a rollback** | 2.4's blueprint text asks for one; there is no chat until 3.4. An undo is currently silent to anyone who was not looking at the room when it happened | Nothing; a 3.4 follow-up |
| **Autodraft has nothing to rank on** | `selectAutoPick` ranks a cheat sheet first and projections second, and neither exists yet: cheat sheets are 3.4, projections 4.4. So today every candidate ties, and the engine falls through to its own total tiebreak — the **lowest player id** among the legal ones. Arbitrary, and identical on every replay, which is the property that matters until there is something real to rank on; the pool is passed `projectedPoints` the moment the field exists. (Until 2.5 it looked alphabetical, because the NaN in the comparator meant `readPool`'s `sort: "name"` was deciding the pick by accident. It no longer decides anything) | Nothing; autodraft quality, not correctness |
| **No per-member autodraft switch for a manager** | A member arms their own autodraft from the draft room, and `setAutodraft` already permits a commissioner or deputy to set anybody's — but there is no UI for it, so a manager dealing with a phone that died has to wait the clock out and let the sweep pick, or enter the pick themselves with "Pick for them". Blueprint 3.6 owns the console | Nothing; a commissioner-comfort gap |
| [#34](https://github.com/andrius-burba-94/eurovafliai/issues/34) | **`deploy.sh` rewrites itself mid-run**, so a change to it never applies to its own deploy — 2.5's worker-liveness check did not run on the deploy that shipped it, and will from the next one. Worse in principle than in practice so far: bash reads a script by byte offset, so a pull that changes a not-yet-executed part of the file can make the shell resume mid-line | Nothing yet; a deploy-tooling trap |
| [#35](https://github.com/andrius-burba-94/eurovafliai/issues/35) | **The nginx vhost drift warning can never be silenced.** The committed vhost is the plain `:80` one *by design* (certbot needs a working vhost to answer the ACME challenge and then rewrites the file in place), so every deploy warns. The whole drift is certbot's own `# managed by Certbot` lines; `/pb/` is byte-identical. A warning that fires every time is one nobody reads, which is a problem because the thing it exists to catch — a hand-edit that loses `proxy_buffering off` — kills realtime silently | Nothing; the check protects nothing until it is quiet |
| **Backups** | No nightly `pb_data` backup yet. Must use PocketBase's backup API, never a naive `cp` of a live SQLite file, and needs one restore drill — an untested backup is not a backup. Belongs before draft night, not before the first deploy | Nothing yet; a draft-night risk |

Closed since the last update:

- **The draft room not updating on its own.** The room subscribes now, to two
  topics — the `picks` of this draft and the `drafts` record itself, because a
  pick is two writes and a pause is only the second kind. It holds no draft
  state: an event makes it ask the server to render the route again, so the
  engine still decides everything and there is one authority rather than two.
  2.5's countdown pull survives as the fallback for a room whose subscription is
  down.
- **Both live surfaces could lie about being live.** The PocketBase SDK does not
  reject `subscribe()` when the endpoint is unreachable — it retries quietly —
  so a room *or lobby* that had never once connected rendered no warning and
  looked perfectly current. Both now say so if `PB_CONNECT` has not arrived
  within five seconds. Found by writing a test that blocks the SSE endpoint,
  which is also how the two stale-tab specs now stage a stale tab: a room that
  corrects itself cannot be made stale by changing the world behind it, and
  those specs are about the server-side refusal, which still has to hold for a
  phone whose connection has died.
- **#15** (the lobby's "Unknown member"), fixed in 1.3b by
  `1788181100_users_read_co_members.js`.
- **The Google redirect URI.** `https://eurovafliai.labrium.online/auth/callback`
  is registered on the OAuth client, so production sign-in is open. The wiring
  is verified as far as it can be without a real Google account: the provider is
  configured on production PocketBase, and `redirectUriFor` produces exactly
  that URI from `NEXT_PUBLIC_APP_URL`.
- **The front-door error box** (#21). Opening the site no longer renders an
  alert; `unauthorized` is a note, and only genuine failures get the board's
  correction voice.

## Verification status

Last full local run, on slice 3.3: **all green.**

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | **463 passed** — 205 the engine (3.1 adds 24 for the board's layout, and 6 more purity checks arrive free with the new module), 55 the ingestion pipeline, 55 leagues and the draft setup, 52 the clock, the pipeline's small print and the sweep, 48 config, helpers, the board's name-writing and the ten new contrast floors, 23 the pool's filtering and fuzzy search |
| `npm run build` | pass |
| `npm run test:e2e` | **184 passed** (chromium + Pixel 7) — 3.1 adds ten specs, 3.3 adds ten and 3.2 adds four, run on both |
| `npm run pb:verify` | 74 checks pass |
| `npm run pb:verify:oauth2` | 7 checks pass |
| `npm run rosters:sync` | 324 players from 20 clubs, applied; re-running is a no-op |

**The board's arithmetic is tested twice over, and the second one is the point.**
`src/lib/engine/board.test.ts` covers every format, odd and even member counts,
2 through 12, the full 13 rounds and the round boundaries — §5 of the engine
invariants, which applies to the board because the board is order-derived. The
load-bearing case is `agrees with buildPickOrder`: every place on the wall must
be owned by the member the pick order says owns that number. Writing the
expected rows out by hand found the mistake it was going to find — the first
draft of the test asserted a *reversed* thirteenth round, when 13 is odd and
plain snake drafts it forward. The cross-check was green while the hand-written
literals were wrong, which is the right way round.

In the browser, `tests/e2e/draft-board.spec.ts` asserts the two things only a
browser can: that round 2 reads `4, 3` in DOM order for two members — a board
laid out by pick sequence would read `3, 4` and every column would be a zigzag —
and that the second motion event fires for a viewer who was watching the clock
move over SSE but **not** on a page load, which is the whole difference between
motion and decoration. It also pins the ticker's cap: nine picks made, eight in
the run, and the first one still in slot 1 of the board. Two specs go past the
attribute to what is actually painted — `rule-advances` running with motion
allowed, `none` under `reduce`, and a 2px marker rule across the slot either
way. That last assertion is the one worth having: every way this breaks is
invisible in a screenshot, and the failure mode that matters is a reduced-motion
guard that drops the *rule* instead of the travel and stops telling somebody who
is on the clock.

**The deploy that broke, and what it was really about.** 3.3 is the first slice
since 1.5 to change `package-lock.json`, so it is the first to make `deploy.sh`
run `npm ci` — which on this shared box takes **over four minutes**, during which
the SSH session the workflow holds open sends nothing at all. It died there:
`client_loop: send disconnect: Broken pipe`, exit 255.

The state that left is worth writing down, because it is not the one you would
guess. `npm ci` had *finished* — 332 packages, `fuse.js` present, the lockfile
marker written. What had not happened was the build and the reload. So production
kept serving the **previous release** from a checkout that had already moved to
the new commit: healthy, correct, and a release behind, with nothing anywhere
saying so except a red tick on a workflow. Re-running the deploy fixed it in
fourteen seconds, because the expensive half was already done.

The fix is two SSH options (`ServerAliveInterval`, `ServerAliveCountMax`) and it
is in the workflow rather than in `deploy.sh`, so [#34](https://github.com/andrius-burba-94/eurovafliai/issues/34)
does not apply to it — GitHub Actions reads the workflow file, it is not executed
out of the working tree that the deploy is busy rewriting.

Two smaller things the same failure surfaced. `deploy.sh`'s `changed()` treats "I
cannot tell" as "assume it changed", which is right for a first deploy and means
a **retry against an already-current checkout restarts PocketBase** — the pull is
a no-op, so every `changed()` answers true, which is why the successful re-run
logged a migration restart for a slice that ships no migration. Harmless, and
now documented. And the `vps-deploy` skill said "`deploy.sh` never restarts it",
which stopped being true when the migration step was written; the skill now says
what the script does.

**The radar is where a screen reader and a screen want different things.** 3.2's
marks are 14px wide and mean only *filled* or *waiting*, so thirteen of them are
a picture — and to a screen reader they were thirteen announcements of nothing.
The grid is therefore `aria-hidden` and every row carries one `sr-only` sentence
instead: "B Ballers, 3 of 13 filled, needs 3 guards, 4 forwards and 3 centres."
`DraftBoard` does the opposite and is right to: its cells hold player names, so
they are content and are announced. The rule that fell out of it — a cell with a
name in it is text, a cell whose whole meaning is "this one is filled" is a
picture of a number, and the number should be said once — is now in DESIGN.md,
because it is the kind of thing the next surface will have to decide too.

It is also the one component in the app that does **not** print G / F / C, which
is worth being explicit about rather than letting it look like a lapse: the marks
are ordered by the template, so the first group *is* the guards, and the sentence
names every position in words. Place and prose carry it; colour is third.

**What the pool's critique changed, and the one finding that matters most.**
`/impeccable critique` ran as two isolated assessments again and scored the pool
**24/40**. It found that **3.3 broke the same rule 3.1 had just been fixed for**:
the armed row is struck in marker — correctly, it is the one act — and 3.3 put
the button's own marker-red label on the blush that strike brings with it. That
is 4.15:1, DESIGN.md forbids it by name in two places, and `tokens.test.ts`
*asserted the pairing fails* while staying green, because nothing asserted what
the pool renders. Same shape of blind spot as the washes one slice earlier: not
a wrong number, an unasked question.

Underneath it was a worse one. The `wash()` helper 3.1 added to catch exactly
this class of bug **composites in linear light, and a browser composites in
gamma-encoded sRGB**. It reads about 0.2 too *high* on dark text over a light
wash — optimistic in the only direction that matters — so it scored the position
letter on its own wash at 4.50 and asserted ≥4.5 while the browser rendered
4.30. Fixed, and it immediately failed two pairings that had been passing:
`pos-g` and `pos-f`, on the element that **is** the colour-blind fallback for
position, of which the pool renders about thirty per screen. Both tokens were
darkened to L 0.49 (from 0.505/0.508), which is the whole of open question 7's
patch half, answered by measurement rather than by eye.

Four more were defects rather than taste:

- **A drafted row could be armed.** No `!row.drafted` guard, and a drafted row
  is in the list whenever "hide drafted" is off — which the blueprint wants.
  Arming one struck a player somebody already owns in marker, gave it the live
  blush, withheld the button that marker promises, dropped focus on the floor,
  and left the live region offering an action that could never happen.
- **"Esc to cancel" was false.** Arming moves focus to the row's button and the
  key handler lived on the search input, so Escape and the arrows died at
  exactly the moment the hint above the list promised otherwise — with a pick
  armed and a clock running. The spec that "proved" Escape worked passed only
  because `locator.press` focuses the input first; it now uses
  `page.keyboard.press`, which is the difference between testing the app and
  testing the test.
- **Every spectator saw somebody else's legality.** The pool muted against the
  *picker's* roster for all eleven people who were not picking, so a member
  holding four open centre slots watched the centres dim and read "No room".
- **The live region flooded.** It narrated the top row rebuilt from
  `shortlist[0]`, which changes on every character typed, every filter toggled
  *and every pick landing anywhere in the league*: typing one name queued eleven
  announcements about eleven players nobody had navigated to, and a full draft
  added 156 more. It now reports the one thing that changed — the match count —
  and leaves which row to `aria-current` on the row itself.

And the quieter craft items: the keyboard cursor was a **1.10:1** wash with no
rule at all (now a 2px ink outline); the single-letter position toggles were 44px
tall and **24px wide**, because the Do's rule said `min-h-11` and meant both
axes; the row name was a bespoke class at *display* tracking, which is the exact
mistake DESIGN.md records the board making and fixing; thirty buttons all
answered to the name "Pick" in a screen-reader rotor; `Slots` lost its list role
on iOS VoiceOver; `autoCorrect` was left on for the one input this slice exists
to serve, on the device draft night happens on; and pool rows ran 59–107px with
the pick button flipping between right- and left-aligned depending on the length
of the name above it — now a uniform 61px with every button at the same x.

Two findings were not defects. Marker red on the ticker's pick numbers *was*
decoration and is now ink — but that came from 3.1, not 3.3. And the detector
itself found nothing on any of these files: its browser engine, which owns every
contrast and type-size rule, needs puppeteer and never ran, and its static-HTML
engine ran degraded and said so. A clean detector run on this surface meant
"no purple gradients", which was never the risk.

**The pool is tested as a function, and the chain is tested in a browser.**
`src/lib/pool/search.test.ts` owns the 23 questions that are really about a
function — does a transposed letter still match, does an empty position filter
mean "every position" rather than "none", can a query resurrect a player a
filter removed. `tests/e2e/pool.spec.ts` owns the six only a browser can answer,
and the diacritic case is deliberately in **both**: the unit test proves fuse
matches a folded key, while the browser test proves that key actually travels
from ingestion through `getDraftView` into the page. Every link in that chain is
somewhere it could be dropped with the unit test still green.

One thing 3.3 taught about the suite itself: the pool now arrives whole, so a
local database that has had `rosters:sync` run against it puts 324 real players
in front of every pool assertion. `draft.spec.ts` had always sidestepped this by
typing `TEST_CLUB` into the search box before each pick; the new specs scope with
the club filter instead, which is the same move made with the control this slice
added.

**Two things the review pass caught, both worth knowing.** The first: the
scrollport was keyed on `current_pick`, and the marked slot can move while that
field stands still — §3's repairable state is exactly a pick created without the
draft advancing, which is the case `whoIsOnClock` exists to correct. Keyed on the
wrong field the effect never ran, so the mark it had set on the slot that just
filled stayed there: two marker rules on one board, one of them on a finished
pick. It is keyed on the marked slot now, which is also simpler — "the marker
moved" is the whole signal, and `current_pick` was a proxy for it. The second:
the paused board's marker was read off `draft.current_pick` directly, which is
the one thing `clock.ts`'s own module note says not to do, and in that same
repairable state it would have marked a slot that already had a pick in it — and
a filled slot wins, so the paused board would have shown no marker at all.
`getDraftView` now asks the engine, with the status the draft would have if it
were running, and hands the room a `markedOverallNo`. No clock arithmetic
survives in the page.

**What `/impeccable critique` changed, and why it was worth running.** The design
pass found four things a passing test suite cannot:

- **The board broke DESIGN.md's own Ink-on-Blush rule** — marker red on the live
  tint, 4.15:1, forbidden there by name — and it did it on the one slot that
  matters most, where the pick number is the slot's *only* text.
- **The position washes cost about a tenth of every ratio above them**, which put
  the slot numbers at 4.42:1, the G/F/C letter (the colour-blind fallback, so an
  accessibility floor twice over) at 4.21–4.50:1, and the column rules at 2.90:1
  against a 3:1 floor. All three now measure over 5:1 and over 4:1 respectively,
  because the wash carries the hue and every word in a slot is ink.
  `tokens.test.ts` was green through all of it: it could only compare one opaque
  token with another and had no way to express an alpha background. It can now,
  and ten new assertions hold these pairs.
- **The board could not write the names it exists to write.** At 6rem a slot had
  about 69px for a name once the position letter had taken its share of the same
  line — eight characters, where "Valančiūnas" needs 90px — and the only recovery
  was a `title` tooltip, which does not exist on a phone. The letter moved to the
  number line and columns went to 8rem. A phone shows three columns instead of
  four; three readable columns beat four truncated ones.
- **A paused board was struck exactly like a live one**, which is one material
  carrying two opposite instructions — act, and wait — with the banner that
  disambiguates them several screens up. `slot-standing` is the fourth state:
  the same marker at the same weight, dashed, no fill.

Two more were accessibility failures rather than design ones. The scrollport had
no focusable element, so past about five members most of the board was
unreachable by keyboard; it passed in Chromium only because 127+ makes such a
region focusable by itself, wearing a user-agent ring nobody chose. And the
marked slot announced itself to a screen reader as the bare word "13" — border
weight, a fill and a colour being three things a screen reader cannot see.

One finding was stale evidence rather than a defect: a screenshot showing a
paused board with no marker at all predated the `markedOverallNo` work. Worth
recording because it is the failure mode of reviewing a stateful surface by
screenshot. One was a false positive: `globals.css` says "bays" four times, and
CONTEXT.md explicitly permits the word in code comments while banning it in copy.

**The header alignment bug this shipped past a screenshot.** The round gutter's
own column header was an `sr-only` span, and `sr-only` is absolutely positioned
— so it occupied no grid track and slid every member's name one column left. The
board named the wrong person above every column, and it looked completely
plausible unless you already knew the draft order. Found by rendering a
six-member board with real picks in it and reading the names. The fix is a
`role="columnheader"` wrapper around an `sr-only` span, and DESIGN.md now says so
in a rule of its own.

**The worker, run for real** against the local database rather than only against
its tests: a planted two-member draft with both members armed was drafted to
completion by `npm run worker:dev` — 26 picks at one a second, every one
`is_auto`, the snake order correct, the draft closing itself `complete` and the
league following it to `season`. `tsx watch` restarting the process mid-draft
re-authenticated and carried on, which is the same path a PM2 reload takes.

The sweep is exercised twice over on purpose: `src/worker/sweep.test.ts` stages
the awkward states (a lost deadline, a hole in the board, a draft paused
mid-tick, a race lost to a human on zero) against a strict PocketBase fake —
which enforces the real unique indexes and throws on any filter, sort or option
it does not implement, so it cannot quietly make broken code pass — and
`tests/e2e/worker.spec.ts` runs the same `sweepOnce` against the real database,
scoped with `onlyDraft` so a suite run cannot autodraft into a league somebody
was testing by hand.

The seam the worker depends on is **enforced, not documented**:
`src/worker/framework-free.test.ts` walks the real import graph from
`index.ts` and fails on `next/*`, `server-only` or `react` anywhere in it —
including a bare `import "server-only";`, which the first draft of that test
missed and which is exactly how the two modules next door declare themselves.
Without it, importing `next/cache` into the pipeline would keep every check
green and fail for the first time when PM2 started the worker in production.

> Running E2E from a git worktree? Pass `E2E_PORT` — Playwright's
> `reuseExistingServer` will otherwise reuse a dev server from a *different*
> checkout and silently test that working copy's code.

A full `migrate down` of all **thirteen** migrations followed by a re-apply
reproduces a byte-identical schema dump — checked locally as well as in CI.

Verified by hand against a throwaway database during 2.1a, because these are the
claims the pipeline's safety rests on: two players with no `person_code` are both
accepted (a plain unique index would have admitted **one of the 43**), a
duplicate code and a duplicate `(name_normalized, club_code)` are both refused,
`app_settings` refuses a second row, a locked player's correction survives a
sync, a player the feed no longer lists is marked `left` rather than deleted, an
`injured` status is not healed by an incoming `active`, and an API run while
`csv` holds authority writes nothing while still storing its drift report.

**In production**, on the deployed box:

| Check | Result |
|---|---|
| `https://eurovafliai.labrium.online/login` | 200 over TLS |
| `http://` → `https://` | 301 |
| `/pb/api/health` through the proxy | healthy |
| `/pb/_/` (admin UI) | 403, as intended |
| **SSE through the proxy** | `PB_CONNECT` in **0.1s**, unbuffered |
| `npm run pb:verify` against the production database | **74 checks pass**, re-run on the box at `af1314a` — so the `drafts` and `picks` rules and indexes are known to hold in production, not only locally |
| `npm run pb:verify:oauth2` against production | passes — first-time Google sign-up still works with public sign-up closed |
| The production player pool | **324 players, 20 clubs**, ingested on the box. Re-running the sync there is a confirmed no-op, so it is safe to re-run before draft night |
| **The worker, in production** | Confirmed running the 2.5 loop at `afb58b3`, not merely "online": its log shows `SIGINT received, stopping` (PM2's reload, handled by the graceful path) followed by `starting · PocketBase http://127.0.0.1:8095 · tick 1000ms` and `authenticated as superuser`. That last line is the proof — the Phase 0 scaffold it replaced had no PocketBase client at all. It then sweeps silently, because production has no live draft |
| `/api/time` through the proxy | 307 to `/login?error=unauthorized` without a session, which is the optimistic proxy doing its job |
| **The pool, in production** | Live at `cdb1e51`, on the **second** attempt — see the deploy note above. Confirmed by more than a 200: the stylesheet served from the box carries `border-b-2` and `appearance-none` (3.3's filter toggle and its select) alongside 3.1's `slot-standing` and `rule-advances`, so this is genuinely the new build and not the previous one still being served under a new commit, which is exactly what the failed attempt left behind |
| **The board, in production** | Live at `920439e`. Confirmed by more than a 200: the deployed stylesheet contains `slot-standing`, `rule-advances` and `min-h-slot`, so the board's fourth state and the second motion event are genuinely on the box rather than merely merged. No migration shipped with 3.1, and `deploy.sh` said so itself — "No migration changes — leaving eurovafliai-pb alone" — so PocketBase was not restarted |
| **SSE after the deploy** | Re-checked, because the deploy warns about vhost drift (see #35): `PB_CONNECT` arrives immediately through `/pb/api/realtime` and the stream stays open. Realtime is unaffected |

`npm run pb:verify` was **not** re-run against the production database on this
deploy, and that is deliberate rather than forgotten: 2.5 ships no migration, so
the production schema is the same one verified on the box at `af1314a`, and CI's
`pocketbase` job asserted the same 74 checks against a from-scratch database on
this very commit. Writing throwaway records into the live database to learn
nothing new is not a trade worth making.

Ingestion stays **on demand** rather than part of `deploy.sh`: ingesting and
deploying have different natural cadences, and the feed rate-limits (a sync is 21
requests). Re-sync on the box with:

```bash
ssh hstgr 'cd /var/www/eurovafliai && export PATH=/root/.local/share/fnm/aliases/default/bin:$PATH && npm run rosters:sync'
```

The box's other tenants are unaffected: **10 PM2 apps online** — the eight that
were already there, plus this app and its worker — and all four PocketBase units
still up.

CI is green on `main`. The `main` ruleset enforces linear history, squash-only
merges, no force-push, no deletion, and no bypass actors. Both `verify` and
`pocketbase` are **required** status checks, so a migration that widens a read
rule can no longer reach `main`.

---

## Keeping this file honest

Update it **in the same PR** as the work it describes; the PR template has a
checkbox for exactly this. A slice is not finished when its code merges — it is
finished when this file says so and the claim is true.

When a PR defers part of its scope, that deferral goes **here**, as a `partial`
row or a line in Open debt. A deferral recorded only in a PR description is
invisible to the next agent, which is how 1.3b went missing.
