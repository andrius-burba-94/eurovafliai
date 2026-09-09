# Slice notes

The story of each slice as it landed, moved out of `docs/STATUS.md` when that
file was cut back to its tables. Newest first. See [README.md](README.md).

**8.5 has landed, and first-run is the empty slot, not a tour.** PRODUCT forbids
onboarding hand-holding beyond what the room needs. The aha moment is join or
create a league, then draft night. English-only, so harden skipped i18n/RTL and
spent the budget on overflow (Valančiūnas-length names, `min-w-0` / `break-words`
on `CardName`) and recovery: a board-shaped `not-found` (missing and forbidden
still look the same), `retry` at 44×44, and Archivo on `global-error` because
that file replaces the root layout. Empty Banks keep their test id on the
sentence so E2E parent selectors still hit the framed section; the next act is
a sibling `Door` in a `Slots` run. Home still leads with the board, then Start
and Join. The audit that closed the slice is
`.impeccable/critique/2026-09-10T00-00-00Z__8-5-audit.md`.

**The first full three-account production draft has been run, and it found one
defect.** Thirteen rounds, three real accounts, and three legal rosters at the
end — 5 G / 5 F / 3 C each. The engine, the pick pipeline and the autodraft were
all correct and nothing needed repairing. What was wrong was the room: it showed
two different rosters at once.

The room used to carry two legality counts, `yourNeeds` and `clockNeeds`, and
the pool chose between them with `canPick` — which is `(isYourTurn ||
canManage) && !isPaused && !!onClock`. `canManage` is true for a commissioner
for the whole draft, so `canPick` never went false for them, and the pool
therefore muted and filtered against **whoever was on the clock**, every turn,
all evening. The "You still need" line and the radar kept reading the viewer's
own roster. Two counts, two answers, one question.

Rounds one to twelve hid it: the three rosters still had overlapping open
positions and the two answers agreed often enough to look like one. Round
thirteen was the exact inversion — both other members needed a forward and were
full at center, the commissioner needed a center and was full at forward. So the
room said "you still need 1 C" over a pool where every center was dimmed "No
room" and only forwards were legal, and a forward was the one thing that could
not be taken. The commissioner's own pick landed correctly seven seconds after
their turn opened; the confusion was entirely in what the forty-six seconds
before it had been showing.

Diagnosed against the real data rather than by reading: a read-only copy of the
production database, the room's own query replayed against it through superuser
impersonation (`users` is OAuth2-only, so there is no password path), and every
pick's `expand.player.position` checked against the `players` table. All 39
matched. That ruled out the plausible-looking suspects — a dropped expand
falling back to `"G"`, a stale position after a roster sync — and left the one
branch that could produce two different answers from one payload.

`clockNeeds` is gone rather than fixed. On your own turn the member on the clock
*is* you, so `canPick ? clockNeeds : yourNeeds` collapses to `yourNeeds` with no
branch left; deleting the second count is what makes the two surfaces unable to
disagree again, and the type system now refuses the mistake instead of a comment
warning against it. The cost is real and was chosen: a commissioner entering a
pick for a dead phone no longer sees that member's buckets dimmed. The row's
"Pick for them" button is still there, the server is still the only authority on
legality, and the refusal arrives — in the league's own words, on the row that
was tapped — when the pick is attempted. That was always the argument for muting
a row rather than hiding it.

The E2E test that covered this had encoded the bug as the expectation, in as
many words: "muted — for them, not for the commissioner looking at the screen."
It was also silently order-dependent, since the roll decides who sits first, so
it would have passed or failed at random under the new rule. It is now a
deterministic pair built from the viewer's own place in the rolled order: one
asserts a bucket the viewer filled is muted for them, the other asserts somebody
else's full bucket is not — and that the server still refuses the pick anyway.
The second fails on the old code with "No room" on a center the commissioner had
room for, which is the production symptom reproduced.

**8.0 has landed, and deploy.sh now runs the copy it just pulled.** bash
reads a script by byte offset, so a `git pull` that replaced `deploy.sh` used
to keep executing the previous file: a change never applied to its own deploy,
and a length change could resume mid-line. The fix is pull, then `exec` the
fresh copy exactly once. The SHAs travel through the environment. After exec,
HEAD is already the new commit; recomputing both would make `BEFORE == AFTER`
and `changed()` would restart PocketBase on every deploy — the trap the
vps-deploy skill already documents for a true no-op retry. A no-op pull does
not exec: the on-disk script *is* current.

The nginx warning is the same class of check that had trained everyone to
ignore it. The committed vhost stays `:80` so a fresh box can obtain a
certificate; certbot then rewrites the live file. The compare now drops
`# managed by Certbot` lines and the leftover HTTP stub (`return 301` /
`return 404`, no `location`) and diffs that against git. A hand-edit that
turns `proxy_buffering` back on still warns. Do not commit the post-certbot
file: nginx would refuse to start before the cert exists.

The deploy that ships this still runs the previous script. Proof is the
*next* log: `Deploy script after re-exec`, and no vhost warning.

**R1 has landed, and the ceremony is executable evidence now.** Eight isolated
browser contexts take the real route through team names, ready states, the
roll, the pool confirm, the shared pick pipeline, pause/resume, rollback and
chat until all 104 slots are full. Five use the Pixel 7 profile and three use
desktop; two members arm autodraft and one never taps, so the production sweep
has to enforce the 15-second deadline. Every turn checks that exactly one room
says "You are on the clock", and every pick waits for seven peers to draw the
new slot. The script refuses a non-local PocketBase URL and cleans up even on a
failure. It is deliberately not a Vitest or Playwright-suite spec: this is a
long local rehearsal with a measured report, not a per-commit test.

The first complete run also corrected the measurement itself. Seeing
`drafts.status = complete` happens before the final request has finished
materializing 104 membership windows, so an immediate count saw 89 and called
a healthy sequential write loop incomplete. The final assertion now waits for
the completion side effects, just as each board assertion waits for realtime,
rather than treating an intermediate state as the result. D12 is amended:
automation owns the mechanics; whether eight friends like the night in one
room is still a human claim.

**5.4 has landed, and a recap is a read, not a stored overlay.** Rank comes
from the standings snapshot for that Euroleague round, re-sorted by that
night's tenths. Best night is whoever scored it while covering the round, so
a traded-in player can win. Biggest swing is `impactForMember` for that round
only, shown from the side that gained, in the same sentence chat already uses.
No new collection and no ingest announce: people open **This round** from the
lobby. Round is a select of counted nights, default latest; `?season=` matches
standings. "Pick" stays draft-night vocabulary.

**5.3 has landed, and the delta is a subtract, not a stored overlay.** In minus
out, from the transaction's `from_round`, against real box scores. The calendar
`date` on the row is when somebody wrote it down. A wrapping round run is the
sparkline: this system already refused a chart for standings, and a new library
would be a second visual language. A drop's "what if we had kept them" is the
out sum, which is the same query. No new collection.

**5.2 has landed, and a trade is a recorded result, not a negotiation.** The
room still argues out loud (D10); the app writes the agreed swap against
`roster_memberships` and a `transactions` row. Scoring windows are Euroleague
rounds, not calendar dates: box scores have `season` + `round` and no game
date, so a September `from_date` would have zeroed the E2025 backfill. An open
draft window (`to_round` empty) still owns every round; the first close is
exclusive, so `from_round: 2` leaves round 1 with the old owner. N-for-N only,
add and drop separate, no pending offers, no impact overlay (that is 5.3).
Repair is the intent row first: retry finishes the closes and opens; unique
active `(league, player)` refuses a double open. Chat names both teams and
never says "you". The builder is one surface with Trade / Drop / Add filters,
confirm in the sticky band, whole-row 44px hits.

**5.1 has landed, and the squad of record is a window, not a pick.** A pick
stays the draft-night event; on complete, `advance` copies the board into
`roster_memberships` so a later trade can close one row without rewriting
history. The write sits after `drafts.status = complete` and
`leagues.status = season` and before the announcement, so a lost loop is a
season league with an empty roster — `recomputeStandings` rematerializes from
the newest complete draft when the set is incomplete, but only while every
window is still open. A complete set does not reread picks. The moment 5.2
sets a `to_date`, rebuilding from picks would undo the trade.
Start-over deletes memberships first for the same unique index: leave them and
the next draft cannot write. Date windows are not applied to scoring yet.
E2025 games are dated 2025–26; a September 2026 `from_date` would drop every
line from the table the Try-it path still uses. Until someone can actually
leave a roster, current owner = whole stored season, same numbers as 4.5.
The UI critique caught that the first roster links covered only the name text,
not the slot a thumb sees. Lobby, standings and player rows now use the whole
ruled row as their target, and a player opened from a roster returns there
instead of dropping the member into the global pool. The roster list comes
before its radar, draws any missing slots, prints the original pick number when
there is one, names the run for assistive tech, and uses room-facing empty copy.
Standings phase controls use names rather than unexplained feed codes and never
show all filters off while silently scoring the regular season.

**4.5 has landed, and the roster it scores is still the draft.** Until 5.1
there is no membership window, so a member's squad is their picks on the newest
complete draft, joined to stored `fantasy_pts`. Snapshots are a cache with the
same repair story as 4.4: stats land first, the table second, `npm run
standings:recompute` is the second pass. Phase is a filter on the page rather
than a second set of rows, which is why 4.1 kept playoff nights. The import
form can finally say E2025, which is the only season that has games to show
before 24 September.

**4.4 has landed, and the number it stores is a cache.** Box scores stay in
`player_game_stats`; last-5 and season averages on `players` are what autodraft
and the pool filter read so they do not average the season on every pick. The
thing to know is what "unprojected" means here: PocketBase stores unset numbers
as 0, so absence is the games count, not the average. A genuine 0.0 with three
games played ranks above someone who has not played, which is the same
comparator the engine already had. Draft night is before E2026 tip-off, so the
Try-it path is a last-season backfill — the first E2026 ingest overwrites it.

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

## U0 — Panel material

The system needed stronger task grouping before the same visual change was
copied onto six surfaces. The old no-card rule solved a real problem, but it
also left a setup lobby, a live room and a season page on one uninterrupted
sheet. D17 narrows the amendment to one material: a framed Bank uses deeper
stock behind one strong rule. It stays square, flat and one level deep.

The proposed `stock-deep` value exposed a constraint a mockup would have hidden.
At `oklch(0.905 0.005 240)`, the old marker, rail, faint ink and waiting rule
missed their existing contrast floors. Those tokens were darkened just enough
to clear the deeper field, then every text, boundary and position wash was
measured over it. U0 intentionally changes no page; U1 is the first place the
new material can be judged as layout rather than as an isolated swatch.

## U1 — Shell, home and login

The first panel rollout starts at the two doors into the product. Login puts its
single Google act inside one framed Bank and now explains the sequence: Google
verifies identity, then an invite code takes the slot. Home gains a real page
heading and groups the league board, Start and Join as three sibling tasks. The
rail names the signed-in member and keeps Leagues, Pool and Sign out at 44px on
both axes.

The critique caught a more important problem than panel spacing. The old home
used `slot-live` for every non-setup league, making "drafting" look identical to
"on the clock". U1 makes setup waiting and every established league filled.
Marker is absent on a populated home; Create receives it only when the board is
empty. Roster patches now state that they are `Your roster`, show current over
template totals and carry full accessible labels. Three waiting rows show the
board's shape without implying an eight-league desktop capacity.

The independent baseline scored 29/40. The first after pass scored 27/40 and
refused to call the slice finished because Create still outranked Open league
and the G/F/C figures had no owner or denominator. Both were fixed, along with
the smaller findings, and the final pass scored 31/40 with no P0/P1 findings.
The deterministic scan is clean; its live overlay remains unavailable because
this Impeccable build does not ship `detect.js` and the app's CSP would refuse
that cross-origin script.

## U2 — Lobby and chat

The lobby had accumulated every phase in one order. A live draft door sat above
the title, a season still counted readiness and drew free setup slots, and the
commissioner was told to Manage and roll after those controls had disappeared.
U2 makes phase boundaries visible: title and meta come first; setup gets one
framed invite, drafting one filled room Door, and season one framed run of
Doors. Setup alone shows free slots, readiness, its board plan and its helper
copy.

`Door` is now the one title, sentence, verb and full-row target used by the
room, standings, recap, transaction and sheet routes. A live room Door stays a
filled slot and puts only its trailing act in marker; `slot-live` remains the
clock. Members are framed. In setup, the row is waiting and says `not ready`,
or filled and says `ready`; after setup the header counts teams instead.

Lobby chat is no longer a drawer. It opens with the ruled transcript inside one
framed Bank and the composer attached to its lower edge. The draft room keeps
the old collapsed default because it already carries a clock, board, radar and
pool. System lines stay dashed and rail blue; member lines keep the same
alignment and print a team name, falling back to the member's account name
before a team has been named.

The independent baseline scored 24/40 with five cognitive-load failures. The
first post-change pass scored 27/40 and remained no-ship: Ready and Roll both
carried marker, an empty order still offered `Keep this order`, and empty
captures could not prove the chat treatment. Roll is now ink until everybody
is ready, the manual-order act requires an order, and the capture fixture shows
both a system line and the viewer's named line. The deterministic detector is
clean. A final pass removed marker from every order number, sorted the drafting
lobby by slot and moved Hide into the chat heading. It scored 30/40 with no
remaining P0/P1/P2 finding.

## U3 — Draft-room panel material

The draft room kept the working pick ceremony and changed only how its three
large questions are grouped and connected. Pool, radar and board are now
sibling framed Banks. The sticky blush still names the pick and owns
confirmation, but it also carries `You still need`, the one roster fact that
has to survive a long pool scroll.

The baseline Impeccable critique scored 27/40 and found the three U3 gaps
directly: no grouping around the three regions, an orphan needs line, and no
way from a radar row to the matching board column. The implementation treats a
radar row as a 44px destination link. Its client handler focuses the labelled
column header, scrolls the board's own horizontal viewport, then measures and
corrects the page against the sticky band's current height. This avoids a
fixed hash offset, which would be wrong while the confirm controls make the
band taller. The linked header uses an explicit focus outline, so pointer
navigation has a visible destination too.

The board's sticky gutters now use deep stock so the framed surface does not
show through while columns move. The desktop keyboard sentence was also moved
out of small-cap slot-label styling. No draft-state or pick-pipeline behavior
changed: clients still choose and request, while the server decides and writes.
The final independent pass scored 31/40 with no P0/P1 findings. Its two cheap
interaction-language findings were fixed before ship: radar links now wash on
hover and press, and keyboard help says Choose then Draft.

## U4 — Season-surface panel material

The last rollout makes season an interface choice instead of STATUS knowledge.
Standings, This round, team rosters and the transaction builder now render the
same framed GET control. It offers the configured Euroleague code, the previous
backfill code and any valid historical selection already in the URL. Standings
and recap team links carry that code forward; the recap round form keeps it,
while changing season deliberately drops page-local round and phase choices.

Every content group on the four routes now uses the same one-level framed Bank.
Empty tables and empty rosters keep their heading and shape rather than falling
back to an orphan sentence. The transaction builder exposed an older marker
mistake during critique: selected players used `slot-live` while Record this
also carried marker. Selection now uses ink transit, leaving marker to the one
write act. The page also states the boundary the data model already enforces:
season is scoring context, while a roster change applies now.

The baseline critique scored 24/40 and found the hidden query string, unframed
tasks and competing marker acts as P1. The final pass scored 32/40 with no
P0/P1 findings and a clean detector. A late shared-component review found that
team-page radar rows had inherited draft-room hash links without owning a
board. Linking is now an explicit draft-room capability; a roster radar remains
a readable row.
