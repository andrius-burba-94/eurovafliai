# Slice notes

The story of each slice as it landed, moved out of `docs/STATUS.md` when that
file was cut back to its tables. Newest first. See [README.md](README.md).

**4.2 has landed, and it is the clearest case yet for measuring before
building.** The blueprint called it "a light verification pass" and it was
right about the mechanism — `person_code` joins are exact — but the pool had
drifted in a way nobody predicted: the clubs re-registered their codeless
signings under passport names, so a sync was one command away from marking
fifteen real players as departed and adding fifteen duplicates. That was found
by running the diff against the live feed and *reading the plan*, not by
reasoning about it. The fix that followed is also a measured one: fuse.js was
the obvious matcher and the numbers said it could not separate a rename from a
namesake, so the confident rule is token containment and fuse only ranks what
is left for a person to answer.

**4.3 has landed, and the thing to know is what a pass asks.** Not "what
happened tonight" but "what is played and not stored" — a question about the
whole season, answered in one request. Everything good about the fetcher falls
out of that: nothing to schedule, nothing to remember, no backfill to write,
and a fortnight of downtime costs a few extra passes rather than a manual
recovery. What it does *not* do is notice a box score the Euroleague later
**amends**, and that is recorded as debt rather than hidden.

**4.1 has landed, and the thing to know about it is the evidence.** The 2026-27
season has not tipped off — E2026 game 1 is 24 September 2026 — so there was no
live box score to check the scoring engine against. Last season's are real
enough: the feed publishes the Euroleague's own PIR as `valuation`, so 168 real
player lines are committed as a fixture and the engine is asserted against
*their* arithmetic rather than against my reading of the rulebook. It also
turned up a field that lies (`winner`), which is now written down in three
places so nobody trusts it in 4.3.

**3.7 has landed, and with it the oldest unmet promise in this file.** A tap on
a pool row now *arms* it and the tap that drafts is in the sticky band — which
is not a layout preference: with the confirm on the row's own button a fast
double-tap armed and picked inside 200ms, so it would have guarded against a
stray tap and missed the exact fat-finger gesture blueprint 3.7 names. And
being on the clock is finally perceivable without looking: a live region that
speaks for your turn and nothing else, plus a tone and a buzz behind a
per-device toggle, off until asked for.

**3.5 has landed, and the oldest open debt in this file with it.** A rollback is
no longer silent: it announces itself in words, names how many picks it
discarded and which pick it rewound to, and is readable in the room **without
opening anything**. 2.4 asked for that system message and there was no chat to
put it in; it has been open ever since. Every pick, pause, resume, roll,
reshuffle, start-over and completed draft now says so too, and members can talk
to each other in the same thread from the lobby and the room.

**Draft trade offers are cut**, and the blueprint records it as decision **D10**
rather than leaving the slice half-described. They were the other half of 3.5:
one offer per member per draft, announced before the offerer's next pick, with
accepted swaps executed by the engine. The league will not use them — eight
friends in one room negotiate out loud — and they were not cheap: a collection,
an accept/decline flow racing a running clock, and a second write path into a
board whose whole design principle is that only the engine moves it. **Season
trades are untouched**; Phase 5.2/5.3 still build the transaction builder and
the impact tracking that PRODUCT.md leads with. What is gone is brokering a
trade *during* the draft. Nothing had been built, so reopening it would be a new
slice rather than a migration.

**3.4b has landed**: a cheat sheet is now edited by acting on it. Pick a row up,
move it with the controls, drop it on another row, or drag it — by mouse, by
finger or by keyboard — and take a player off the sheet in one tap. That closes
the 3.4a critique's central finding, which was not about any of its pixels:
*"There is no path from the pool into the sheet. No add, no remove, no move."*
Two of those three verbs exist now. Adding a player from the pool does not, and
is recorded below.

The blueprint's word for this was **dnd-kit**, and there is no dnd-kit in the
repo. That is a decision with an argument, not an omission — see the 3.4b row —
and the drag it asks for is there, hand-rolled in about 150 lines of Pointer
Events.

**Phase 2's rehearsal is waived** (blueprint D12), so Phase 2 is complete. The
human half of it did not vanish — it moved to **3.7**, whose DoD already asks for
a rehearsal draft night with friends on mixed devices. One rehearsal against the
finished draft-day experience is worth more than two against a half-built one,
and by then the room will have its pick confirmation, its sound and vibration
cues, and a transcript to read afterwards.

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

**And autodraft now knows what you wanted.** Slice 3.4a: paste a ranked list of
players, and the app matches it to the pool — folding diacritics, forgiving
spelling, and **refusing to guess** when two players are equally plausible. The
sheet is private in the strong sense (a PocketBase read rule the verify script
drives with two members of one league, not a convention), it is keyed on the
membership so it survives a "start over" and exists before the draft record
does, and it does three things at once: the sweep picks from it when a clock
runs out, the room's pool comes out in its order rather than alphabetically, and
the top three still-available-and-legal names are pinned above the pick path.
That last one is computed through the engine's own `rankForMember` — the
function `selectAutoPick` walks — so what the room *shows* you as best available
and what the worker would *do* if your phone died are the same answer, which was
the whole reason that function was exported two slices ago.

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

Two Phase 1 items remain under Open debt: the last step of the two-device
confirmation, and enabling plus restore-testing the PocketBase backup timer.

---

## A settled decision: no dnd-kit

One decision recorded here rather than as debt, because it is settled:

- **There is no dnd-kit in this repo, and 3.4b's drag is hand-rolled.** The
  blueprint names the library; it was researched and rejected on facts. The
  classic line (`@dnd-kit/core` 6.3.1, `sortable` 10.0.0) is **EOL** — nothing
  published in 21 months, `packages/core`/`sortable`/`utilities` deleted from
  `main`, `docs.dndkit.com` redirecting and the v6 API moved under
  `dndkit.com/legacy/`, and the React 19 issues bulk-closed as "opened against a
  previous version". Its published `.d.ts` also emits bare `JSX.Element` in five
  places, which is `TS2503` against `@types/react@19` and is masked only by this
  repo's `skipLibCheck`; the fix PR was closed unmerged and the source is gone.
  The current line (`@dnd-kit/react` 0.5.0) is broken under **React 19
  StrictMode** — its `DragDropProvider` creates the manager during render and
  destroys it from a `useInsertionEffect` cleanup, so React's dev effect-replay
  leaves the mounted provider holding a destroyed manager
  ([#2116](https://github.com/clauderic/dnd-kit/issues/2116), open, and verified
  unfixed in the 2026-09-05 beta). App Router enables StrictMode by default, so
  adopting it means `reactStrictMode: false` for the whole app. Neither line
  ships a `"use client"` directive
  ([#1654](https://github.com/clauderic/dnd-kit/issues/1654)). On top of that it
  would have wanted `Slot` widened to accept `ref`/`style`/`on*` — the design
  system's signature component, changed for one route — and a third animation
  the motion budget forbids. Against all that: ~150 lines of Pointer Events,
  tractable *because* of the interaction design, since tap-to-drop owns long
  distances and the drag therefore needs no auto-scroll. Revisit at 1.0 or when
  #2116 closes; nothing here is load-bearing against it.

---

## Debt closed along the way

Closed since the last update:

- **"You are on the clock" is now perceivable without looking** — the oldest
  unmet product commitment in this file, open since 2.6. PRODUCT.md promised it
  "announced to assistive tech via a live region, with sound and vibration
  cues" and **none of the three existed**; three slices had chipped at the edges
  (the board's marked slot, the pool's match count, the radar naming the member
  on the clock) while the banner itself said nothing out loud. All three exist
  now. The limit on the live region is as much of the design as the region: it
  speaks when *your* turn arrives and stays silent for the ~156 other picks a
  draft causes, which is 3.3's lesson about the pool's region narrating a
  rebuilt row on every keystroke. The noise is off by default and per device,
  because whether a phone should make a sound depends on the phone and the room
  rather than on the account — and `clockCue` deliberately lets the toggle
  govern the noise but **never** the announcement, so a preference cannot switch
  off an accessibility commitment.

- **A rollback is no longer silent.** The oldest open item in this file: 2.4's
  blueprint text asked for a system chat message and there was no chat, so an
  undo was invisible to anybody not staring at the room when it happened — and
  the picks are simply *not there any more*, which is the least explicable state
  this app can be in. 3.5's announcement names the count and the pick, and the
  collapsed panel shows it without a tap.

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
