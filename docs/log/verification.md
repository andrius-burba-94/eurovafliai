# Verification record

The long-form record behind the verification table in `docs/STATUS.md`: which
bug each test found, what was measured in production and how. Moved out of
STATUS.md when it was cut back to its tables; the table there carries the
current numbers. See [README.md](README.md).


**What 3.4b's five real bugs were, and which test found each.** Worth recording
in this shape because every one of them was invisible in the place you would
look for it, and four of the five were found by a test rather than by reading.

- **A nudge computed as an absolute rank.** `↑` was `move to rank − 1`, resolved
  on the client from the rank it had last rendered — so two quick presses both
  named the same destination and the second moved nothing. Found by an E2E spec
  that pressed the button twice, which it did only because the first draft of
  that spec needed two presses to reach the position it wanted. The operation is
  relative now, and it composes against the optimistic state and the stored
  sheet alike.
- **A hand-rolled drag reading its drop target out of React state.**
  `pointerup` can arrive in the same task as the last `pointermove`, so the
  handler saw `overId: null` and the drag silently did nothing. It **survived
  the mouse** — Playwright's moves are far enough apart — and died under a
  finger. Only the touch spec could find it, which is the argument for having
  one.
- **The sticky bar covering the row it acts on.** Measured on a Pixel 7 at
  **218px** tall, sitting at 621–839 with the just-picked-up row at 625: the
  first touch of the drag landed on the bar and Chromium answered
  `pointercancel`. You could pick a row up and then not move it, on the device
  this app is designed around, and a desktop viewport is tall enough that the
  two never meet. Fixed by reserving space below the list, scrolling the held row
  to `block: "center"`, and cutting the bar down — it was carrying a hint
  sentence beside five wrapping buttons, a quarter of a phone screen, over the
  list it exists to edit. **This was an acceptance criterion of the slice that
  was written down and never asserted**; it now has a spec that measures the two
  rectangles against each other.
- **Two `border-top` utilities on one element.** A held row was drawn
  `slot-filled slot-transit`, which needs one shorthand to beat another at equal
  specificity. Tailwind v4 emits `@utility` blocks **alphabetically** rather than
  in source order and the dev server splits them across chunks, so the browser
  composited **1px dashed** — a width from one rule and a style from the other, a
  material that exists in neither, on the row whose whole job is to look
  different. `Slot` has a fifth state now. Note that the first fix attempt was a
  comment in `globals.css` asserting source order, and a unit test asserting the
  same thing: **both were confidently wrong about the mechanism**, and green.
- **Re-keying the paste box threw away its `useActionState`.** The box has to
  follow a sheet edited above it or *Read the list* → *Save this sheet* quietly
  undoes every move — a real defect, and the reason the named regression spec
  exists. `key={view.asText}` looked like the tidy fix and remounting discarded
  the action result, so saving stopped rendering its own "Saved" confirmation:
  **a defect 3.4a's critique had specifically fixed, un-fixed by 3.4b, caught by
  3.4a's own spec.** It adjusts state during render against the last seeded prop
  now, and only when the box is untouched, so unsaved typing survives a stray
  tap on a row.

And one measurement worth keeping because it will waste somebody's afternoon
otherwise: **a computed style read in the same frame as the class change is
stale.** Chromium reported `1px dashed` for an element already carrying
`slot-transit` *and* `data-state="transit"`, then `2px dashed` on every read from
60ms on. A single `evaluate` fails against a material that is perfectly correct.
`expect.poll`, always.

**3.7's critique, and the defect this project keeps shipping.** The pass scored
**24/40** — the best of the seven, against 23, 21, 24, 19, 17 and 21 — with a
verdict of *material 9/10, model 6/10, **copy 3/10***. Both P0s and all three
P1s are fixed here.

The one to remember is the P0, because it is the **sixth occurrence of the same
defect**: after a refused pick, focus landed on `<body>`. 3.3, 3.4a, 3.4b twice
and 3.5 each shipped it once, and `armed-pick.tsx` says in a comment that it
closed the class of bug "at the source rather than per call site… before anybody
has to measure it". It had closed three paths of four — cancel, Escape and
confirm — and left open the one where somebody has just been told no, with a
clock running. Fixing it needed **two** goes, and the second is the interesting
one: adding `refused` to the effect's deps was not enough, because a refusal
caused by a *pause* correctly unmounts the button there is nothing left to focus.
Focus goes to the correction itself now, which is the same answer 3.4b reached
for its tombstone.

The other P0 was mine by preservation rather than by construction: the refusal
was **announced twice**, because I kept 3.3's row-strike as a `role="alert"`
while the band's `Correction` already announced it. 3.3's finding was that a
refusal must be *visible on the row that was tapped* — a visual claim — so the
row keeps the strike and loses the announcement.

Two of the three P1s were caused by reasoning that was trying to avoid a
regression:

- **Two marker-red primary actions on one surface**, which DESIGN.md forbids by
  name. I gave the chosen row's button `border-2 border-live` explicitly *to
  preserve the weight it had as a `SubmitButton`* — and in avoiding one
  regression created a worse one, giving "this slot is on the clock" a second
  meaning 400px from the first. The critique measured **12 marker edges over 6
  elements**. The row's own `slot-live` rule is the state, the band's `Draft` is
  the act, and the button between them is neither.
- **The band's marker act survived a paused draft**, where every `Choose` in the
  pool had correctly withdrawn. I moved `ConfirmPick` outside the band's
  paused/on-clock branch deliberately — the two stale-tab specs proved that a
  correction rendered *inside* it was destroyed by the refusal that produced it —
  and then did not gate the button. Paused, the band was **380px of a 390px
  phone** saying the same sentence three times.

The third P1 is the plainest: **two copies of one button had diverged.** The
pinned shortlist hardcoded `forTeamName: null` where the pool row computed it, so
a manager arming from it on somebody else's turn read "Drafting P01…" with no
team named — a mis-pick that spends another member's turn and is undoable only by
a rollback that deletes every pick after it. It also drew no armed material and
kept saying `Choose` while the same player's pool row said `Chosen`. There is one
`ChooseButton` now, so the divergence is unavailable rather than merely fixed.

**And the copy score was the lowest thing in the review.** Four words for one act
— `Choose`, `Chosen`, `Drafting X`, `Draft X` — and **CONTEXT.md defined none of
them**, in a file whose own header says "if a name in a UI label disagrees with
this list, change the name — not the list". The list changed: **choose** and
**draft** (verb) are defined there now, with the note that *arming* is the code's
word and deliberately not the interface's. The band also stopped printing the
player's name twice — 92 characters in one line and 89 in the button, both
flagged `all-caps-body` by the in-page detector — which took the band from 41% of
a phone to under a third, and stopped `Cancel` wrapping onto a line of its own.

**Two claims the pass got wrong**, recorded because the corrections are cheap and
both were plausible. A said the band "swallows the row you just chose"; B
measured the first pool row's y **unchanged** and visible rows **5 → 5**, because
Chromium's scroll anchoring absorbs the growth exactly. And A implied `Cancel`
sat beside `Draft`; B measured it wrapping below even at ordinary name lengths —
worse than described. The in-page detector's `gradient-text` on `<body>` and its
seven `text-overflow` hits were false positives, verified individually.

One measurement worth keeping: `Cancel`'s border is **3.03:1** on the live blush,
clearing the boundary floor by 0.03 — and `tokens.test.ts` asserted `ink/50` on
*stock* only, so the near-miss was unasserted. Exactly the shape of the
`border-live/60` = 2.60:1 miss 3.4a's critique caught: measuring the thing next
to the thing is not measuring the thing. Both the band's button borders are
asserted on the blush now.

**3.5's critique, and the split that is the finding.** The pass scored the
surface **21/40** — level with the radar, above 3.4a's 19 and 3.4b's 17 — and its
verdict was **model 8/10, material 4/10**. That gap is the whole review.
`src/lib/chat/messages.ts` was called the best-written file in the slice; the
transcript was called the most category-generic thing this app has built, and it
was right: `<p>` rows in an unruled `overflow-y-auto` div, measured
`border-bottom: 0px`, nothing closing it — while every other list here is a
`Slots` run whose top border *is* its state. **The radar's critique fixed "the
list used to just stop" and 3.5 re-introduced it.** Swap the strings and the
panel dropped into any app unchanged. It is a `Slots` run now, one `Slot` per
line, closed, with a system line drawn `waiting` (dashed — nobody has to act on
it) and a member's `filled`, which makes the material a *second* non-colour
carrier beside the absent team name.

Two findings were P0 and both were mine:

- **The collapsed header truncated away the exact payload the slice exists
  for.** Measured at 390px: the rollback line got **212px of 350px — 43.7%
  visible**; a six-team roll showed **36 of 142 characters**; the
  draft-complete announcement 34 of 57. And it *widened when opened*, because
  the badge beside it hid — more room in the state where the line is redundant.
  STATUS's own try-it note claimed the header showed "the whole order, numbered,
  without you opening anything". It is a three-line clamp now, measured rather
  than guessed: 78 characters over a ~212px line is three lines, and two still
  hid 20px. A twelve-team roll still truncates and should — not urgent, and one
  tap away.
- **Nothing was announced to a screen reader.** Zero live regions on the
  surface, confirmed independently by both assessments; the arriving line had no
  live ancestor. So the slice's central promise — a rollback reaching everybody —
  was silent to assistive tech, which is the same unmet PRODUCT.md commitment as
  the on-the-clock banner. There is a polite region now, and the *limit* on it
  matters as much: **announcements only, never chatter**, which is 3.3's lesson
  about the pool's region narrating a rebuilt row on every keystroke.

Three P1s. **A delete had no confirm, no undo, and dropped focus to `<body>`**
while genuinely clearing the body in the database — the third slice running to
reach the same conclusion, so it now offers "Put it back" and moves focus to the
tombstone. Writing that spec found a real defect behind it: **the undo was
refused by the rate limit**, because a put-back happens inside the gap by
definition; a restore skips it. **The scrolling transcript was keyboard-
unreachable** for anyone who had not written in it (`tabindex: null, role: null,
focusableDescendants: 0` over a 2 304px transcript in a 338px box) — WCAG 2.1.1,
and the identical defect 3.1 fixed on the board's scrollport, in a second place.
And **a pasted URL hid 526px inside the panel** at 390px, because
`overflow-y-auto` makes `overflow-x` compute to `auto` and an unbroken token
just pushed the row wide; the 302-character message wrapped fine, so it was the
token, not the length.

The craft half: the transcript now carries **a clock**, because CONTEXT.md calls
it "the record of draft night" and it shipped without one; the refusal is a
`Correction` rather than a bare `<p>` with a measured `0px` top border; the input
uses `inputStyles` instead of a copy that had dropped
`placeholder:text-ink-faint`; the reconnect notice is a sentence rather than 42
characters of 11px caps (`all-caps-body`, flagged by two previous critiques and
shipped a third time); the length cap is said *before* Send rather than after;
the Bank aside keeps the total instead of being replaced by the unread count
exactly when there was unread; and the header lost its hover wash, which
measured the rail-blue line at **4.22:1** — under AA, in a desktop's normal
reading state.

**And the component's own five strings are functions now.** The critique's
sharpest question was the fairest: `messages.ts` exists *because* strings
assembled in JSX shipped four copy defects in #54, and then the component that
imports it assembled five of its own — three of them fragments sitting in a run
of full-stopped sentences. They are in `CHAT_UI` and read as prose by the same
suite.

Two things the pass got wrong, and they are recorded because the corrections are
cheap and the claims were plausible: every chat-attributable overlay finding was
a **false positive** (`text-occlusion` on transcript rows scrolled out of the
panel, each verified `insideChatListViewport: false`), and `em-dash-overuse` was
the assessment's **own seeding artefact** — the app's announcements contain no em
dashes. One assessment also deleted a fixture row belonging to the other and said
so, which is the right way to be wrong.

One knock-on worth knowing: adding a second polite live region to the draft room
broke a **pool** spec that used a bare `getByRole("status")`. Two regions is
correct — one reports what the list did, the other what the draft did — but each
needs a name, so the pool's is `pool-said` now.

**What 3.5's four real bugs were, and the one that matters most.** Every one was
found by a test, and the worst of them was not in the code this slice wrote.

- **A second live surface on a page made the first one deaf.** This is the one to
  remember. Until 3.5 there was only ever one realtime component on a page, and
  each created its own PocketBase client in its own effect. Chat made two, and
  the *room* broke: `LiveDraft`'s `await pb.realtime.subscribe(...)` **never
  resolved and never threw**, so a pick or a pause made behind the room's back
  stopped reaching it at all — precisely the regression 2.6 exists to prevent,
  reintroduced by adding a listener beside it. Each client opens its own
  `EventSource`, and a browser allows only a handful per origin; in dev, where
  StrictMode mounts every effect twice, the budget is gone before the second
  surface asks for one. The fix is `src/lib/pb/browser.ts` — **one shared client
  per page**, which is what the SDK's subscription multiplexing is for — and it
  carries two rules a caller must respect: never `pb.realtime.unsubscribe()` in
  cleanup (it closes the shared connection and deafens everything else), and
  never assign `pb.realtime.onDisconnect` (one slot, last writer wins). Behind
  that sat a second trap: the default `LocalAuthStore` persists to one
  `localStorage` key and reconnects realtime when it changes, so two instances
  fought over that too. The shared client uses an in-memory store. **Diagnosed
  by elimination** — disabling chat's subscription made the room's specs pass —
  and then confirmed by instrumenting `LiveDraft` and seeing no `PB_CONNECT` and
  no throw, which is the signature of a hang rather than a failure.
- **A realtime subscription needs its own `expand`.** `getFullList({expand})`
  expands; the SSE payload does not unless the `subscribe` options ask. So every
  *server-loaded* message showed its author's team name and every message that
  *arrived* showed "A member" — including your own the moment you sent it. Two
  surfaces disagreeing about the same row, and only the two-device spec could
  see it.
- **A list seeded from a prop must follow the prop.** `useState(initial)`
  initialises once, and a subscription connects asynchronously — so anything
  announced between mount and `PB_CONNECT` is never delivered (realtime does not
  replay) and, with the list frozen, never recovered either. A pick made
  immediately after entering the room, and every pause and rollback after it,
  simply never appeared. Every write here calls `revalidatePath`, so merging the
  server's re-render back in closes the window with no special case for it —
  merged by id rather than replaced, so a local echo is corrected instead of
  lost. Same defect *class* as 3.4b's paste box, one slice later.
- **Removing a surface broke the specs that used it as a lens.** The ticker was
  how a dozen assertions across four spec files observed "a pick landed" and
  "the room updated over SSE"; deleting it failed **40 tests that were not about
  the ticker at all**. The board is the durable count
  (`[data-board-slot][data-state="filled"]`) and the transcript is the durable
  *sentence* — and the board's cell **truncates** a long player name where the
  announcement carries it whole, so a name assertion translates to chat, not to
  the board. Translating them also surfaced a real semantic difference worth
  knowing: **the board forgets an undone pick and the transcript does not**, and
  must not — it records that the pick happened *and* that it was rolled back.
  One fixture defect fell out of the same work: `commitPick`'s E2E fixtures
  passed placeholder names, so the one spec that checks a pick arriving from
  another device *by name* was asserting against "Fixture Player".

**One thing 3.5 did deliberately that reads like a mistake.** `commitPick` now
*requires* the two display names for its announcement rather than taking them
optionally or reading them itself. That is the anti-divergence discipline made
mechanical: the compiler forced all four call sites to supply them, so neither
the request path nor the sweep can quietly stop announcing — the same reason the
pick pipeline was extracted in 2.5. It also refuses to do two extra queries per
pick, because both callers already hold the facts.

**3.4b's critique, and the three findings that were mine.** The pass scored the
surface **17/40** — lower than 3.4a's 19, and lower than the board, radar and
pool (23, 21, 24) — on a slice whose material it rated 9/10. That gap is the
point: it scored the *mechanics*, and three of its findings were functional
defects introduced by this slice. Both assessments drove the real signed-in app,
and every P0 was re-verified in the browser before being accepted — which
mattered, because **two of the review's headline claims did not survive that
check** and are recorded as corrections in the snapshot rather than acted on.

The three that were real, all fixed here:

- **The material did not travel with the row.** `slot-transit` was on the `<li>`
  and the transform on the button inside it, so mid-drag the 2px dashed rule
  stayed at the origin — measured **242px** from the content it was supposed to
  be marking — while the row in somebody's hand had no material at all and two
  names printed on top of each other. The state language went missing at exactly
  the moment it was the only thing explaining what was happening. The content
  carries the rule and a `bg-stock` ground now, and the place it left reads as
  `waiting`, which is what an empty place is called here.
- **A drag could not cross a tier boundary.** The hit test used *containment*,
  and a tier run is closed by a 34px gap plus a 16px caption — **36px measured
  on a Pixel 7** — so a drop released in there matched no row and the drag
  silently did nothing. On a tiered sheet that band is precisely where the
  intention lives. Nearest-midpoint has no dead space anywhere, by construction.
  A second defect hid behind it: `pointerup` is followed by a `click`, and while
  pointer capture kept both on the row, that click picked the row straight back
  up — so the next tap moved it somewhere nobody chose. Only reachable on a
  *failed* drop, which is why the original drag specs never saw it.
- **Nothing on the surface could report a failure.** Both call sites did
  `await editCheatSheet(...)` and dropped the result, so an expired session or a
  dropped connection moved the row optimistically, reverted it on the next
  render, and **said nothing anywhere**. Error Recovery scored 0/4 against
  PRODUCT.md's own "degrade, never corrupt". The action's result is read now, a
  `Correction` renders in the bar, and the row goes back into your hand so the
  gesture can be repeated.

Two more were judgement rather than mechanism, and both are better for it. A
**removal now has an undo** rather than a confirmation — the page was guarding
*deleting the whole sheet* behind two presses while a single player went in one
tap with no acknowledgement and no way back, and an undo taxes nobody. It needed
an `insert` operation, which turned up a genuine limit worth knowing: **`remove`
is lossy at a tier boundary.** A break *at* the removed rank and a break *just
above* it collapse to the same stored number, so no undo can tell them apart
afterwards. The ranking round-trips exactly, the tiers round-trip for every
player who was not sitting on a break, and the exception is pinned by a test
rather than discovered later. And the **shortfall sentence was hiding the
position you have none of**: `positionSentence` omits zeros — right for the
radar's "still needs", wrong here — so a member with no forwards read "You have
ranked 4 guards and 1 center, and a full roster needs 5 guards, 5 forwards and 3
centers". The position that strands autodraft was the one the sentence dropped.

The rest was craft, and measured: 426px of chrome above rank #1 at 390px (half
the viewport) from a permanent 140-character instruction that told a phone to
press Escape; a fixed `pb-48` reserve against a bar that is 174px on a phone and
102px on a desktop, leaving a 205px dead band bracketed by two identical dashed
rules; `Remove` sitting 52px directly under `↑ Up` in the same column, in
byte-identical material, because 407px of buttons wrap inside a 350px bar; a
49-character sentence set in `slot-label`'s 11px caps; focus dropping to `<body>`
after *every* edit that ended a hold; `↑ Up` sitting **12 Tab presses** from a
held row, because the bar follows every row in DOM order; and the position patch
landing at ten different x-positions down a desktop column, which is the defect
3.3's critique had already fixed for pool rows.

**And one lesson about the method, not the slice.** My own first fix for the
material bug was a comment in `globals.css` and a unit test, both asserting that
Tailwind emits `@utility` blocks in source order. It emits them
**alphabetically**. Both were confidently wrong, and both were green. The fix
that worked was to stop composing two `border-top` rules at all.

**What 3.4a is tested by, and where the line falls.** The two questions that are
really about functions live in `src/lib/sheets/`: `parse.test.ts` asks whether a
paste survives the shape a paste actually has — an unquoted "Surname, Firstname"
is *two* CSV fields, which is the case that breaks a column-counting parser, and
the rule that fixes it is "leading numbers are rank and tier, everything left is
the name". `match.test.ts` asks whether a written name finds a player: folded
diacritics, reversed word order, a transposition, and the two cases that must
**not** resolve — two players who share a name, and the same player written
twice.

`tests/e2e/cheat-sheet.spec.ts` asks the four things only a browser can. That a
paste reaches PocketBase and comes back on the next load. That an ambiguous line
saves *nothing* until it is answered, and then saves the twin that was chosen —
asserted against the stored record, not against the screen. That the room's pool
comes out in the sheet's order rather than the server's alphabetical one, which
is the whole chain from a JSON column through `rankForMember` into a list. And
that a pick from the pinned shortlist lands on the board through the ordinary
pipeline.

One thing the E2E spec deliberately does **not** claim: that a *misspelling*
matches. It tried to, and failed — because `readMatchablePool` reads the whole
pool, and a local database with `rosters:sync` run against it puts 324 real
players next to the spec's own three, where a typo'd eight-character query
against a name padded with a uniqueness suffix stops being decisive. That is the
fixture being unrealistic rather than the matcher being wrong (the same query
resolves cleanly against a realistic pool), so the fuzzy claim stays in the unit
test and the browser test proves the *folding* chain instead, with a diacritic
name typed without its diacritics. Worth knowing before somebody "fixes" the
threshold to make a browser test pass.

The sweep's own suite gained six: that a member's sheet decides their pick and
not the pool's ordering, that it is the sheet of whoever is **on the clock**,
that the walk goes *down* the sheet when the top of it is illegal (rank first,
filter second — §6), that an exhausted sheet falls through cleanly, that a
sheet read which throws still lands the pick, and that a `ranking` column full
of nulls and numbers does not silently become "no sheet".

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

**3.4a's critique, and what it caught that nothing else could.** The pass scored
the cheat sheet **19/40** — the lowest of the four, on the surface that
photographs best, because three of its findings were functional rather than
stylistic. Both assessments drove the real signed-in app, which made this the
**first critique in this project to run the in-page detector on the real
routes**; the previous three could not authenticate and substituted screenshots.

Three findings are worth carrying forward as lessons rather than as fixes:

- **Two `useActionState`s on one form is a trap, and it was already shipped.**
  `applied.plan ? applied : preview` pins a surface to the last *applied*
  result forever — after one save, reading a new list changed nothing on screen
  and React 19's input reset handed the user their own stale text back. The
  reviewer reproduced it live. **`/players/import` has had the identical line
  since 2.1b**, so a design critique found a data-loss bug in a slice that had
  been "done" for months. The cheat sheet now uses one action with an `intent`;
  the importer got the small behaviour-preserving version, and fixing it
  immediately surfaced a second one — **a `<textarea>` submits CRLF**, so
  comparing the echoed value against React state is false for every multi-line
  paste. Both are in AGENTS.md now.
- **Measuring the thing next to the thing is not measuring the thing.** The
  pass that found `border-ink/35` at 2.10:1 and fixed it to `/50` never measured
  `border-live/60` sitting beside it in the same object: **2.60:1**, on the
  primary action of six surfaces including the login page's only button. Now
  `/80`, asserted on stock *and* on the live blush, because the blush is the
  harsher ground and `/70` passes one and fails the other. Similarly the
  position patch's 10% alpha field let the row behind it decide the letter's
  contrast — 4.10–4.18:1 on an armed pool row, on the one element that exists to
  be the colour-blind fallback for position. It carries an opaque
  `color-mix(…, stock)` field now, and `tokens.test.ts` reads `board.tsx` to
  catch the alpha coming back.
- **A clean detector run is now quantified rather than asserted.** 22 of 59
  rules can execute on `.tsx`; the other 37 need `htmlparser2`/`css-select`/
  `css-tree`/`domutils` or `puppeteer`, none installed. Verified with a positive
  control — a poisoned `.tsx` produced two findings — so "clean" is real and
  covers 37% of the registry, none of it accessibility. The in-page overlay,
  which *did* run, found three real rules the CLI cannot see, including
  `line-length` on two paragraphs that had no measure cap.

**And what the critique did not catch, which a human reading the screen did.**
Worth recording because it is a gap in the method rather than in the slice. The
pass measured contrast, tap targets, overflow, rhythm, focus order and live
regions — and every string it quoted, it quoted correctly. What nobody looked at
was whether the *prose* read like prose:

- The helper paragraph was one sentence spliced from three conditional
  fragments — a string, a `null`, and a bare `". "` — so it rendered "and so
  does rank,tier,name" with no spaces after the commas. That construction reads
  fine in JSX and badly on screen, and no test can see it.
- **The paste box instructed one format and emitted another.** It said
  `rank, tier, name` and wrote `5,2,"Name"`. `sheetToText` is now tested as a
  *round trip* against the parser rather than against a fixed string, which is
  the stronger property and catches the case a hand-written expectation would
  have missed: `"Ayayi, Joel, Jean Michel"` is four CSV fields and is
  unrecoverable if the writer forgets to quote it.
- **The delete confirmation named the wrong number** — "Delete your ranking of
  these players?", branching on `poolSize`, which is 323 and has nothing to do
  with anybody's sheet. The branch could never fire and the phrase pointed at
  nothing on screen. It takes `rankedCount` now, because naming the number is
  the entire point of a sentence shown before something irreversible.
- And the shortfall line joined positions with `" and "`, so three of them read
  "5 G and 5 F and 3 C". `needsSentence` already existed in `roster-radar.tsx`
  and joined correctly; it is `src/lib/positions.ts` now, shared and tested.

The habit that would have caught all four: **extract every user-facing string
from a new surface, comments stripped, and read them as text** — then do it
again for the interpolated ones, which is where the first of these hid and which
a string grep cannot see.

The rest of the pass was ordinary and useful: the pinned shortlist was the
first three pool rows restated with a second set of buttons (confirmed at the
id level), drawn in the material that means *drafted*, under the faintest
heading in the room; the plan step overflowed the page by 161px at 390px while
crushing the failing line's own name to zero width; saving announced nothing,
rendered 133px above the viewport and left a false marker-red "Saved" standing
after a delete; and deleting was one tap with no way to get the sheet back out
as text. All fixed, each with a spec named after the finding.

**Everything the three earlier critiques found is now fixed.** The four items that had
been logged as debt rather than fixed were closed in the same pass as the
radar's:

- **Three measured rule violations.** `border-ink/35` on every button was
  **2.10:1**, `border-pos-*/55` on every patch **2.22–2.26:1**, and an input's
  or select's bottom rule at `ink/30` **1.87:1** — the lowest boundary in the
  app, and the one DESIGN.md itself calls the whole affordance ("the ruled line
  *is* the input"). All three under this project's own 3:1 boundary floor — and on a button the border *is* the
  control: no fill, no radius, no coloured label. Now `ink/50` (3.10:1) and
  `pos-*/80` (3.05–3.11:1 against the wash it encloses, which is the binding
  side), and inputs and selects `/50` as well. All inside the 35–80% range
  DESIGN.md already declared, so this closes its open question 7 rather than
  moving the system, and every pair is asserted. The input one had been reported
  and missed twice before this pass — it was in a measurement list rather than
  in a ranked finding, which is exactly how a real number gets skimmed past.
- **The clock is on screen while you pick.** The on-the-clock band is
  `sticky top-0`. It broke the banner's blush on the way — a plain `bg-stock`
  alongside `slot-live` paints over it, because both set `background-color` and
  the plain utility wins — which is now a spec on the computed background.
- **A refusal says so on the row that was tapped.** `DraftResult` carries the
  player id, and a refused row takes `slot-correction`: 2px ink, the material
  1.4 shipped for exactly this and which `Slot` could not express until now.
  That was the missing half of the argument for muting a row rather than hiding
  it — the explanation was rendering up to thirty rows above the tap.
- **The radar says whose turn it is**, struck in the marker, and the picks are
  grouped once rather than twice across the `queries.ts`/`radar.ts` seam.

What remains open is one thing, and it is not a defect: the design detector
cannot see this app's real risks (below), and a radar row still cannot navigate
to that member's column on the board.

**The radar's critique, and the process failure that nearly hid it.** The pass
scored the radar **21/40** and its central finding was editorial rather than
technical: the row printed `filled/total` — "11/13" — while `row.needs`, the
answer to the question the surface exists for, was computed and then given to
screen readers only. So the component whose whole subject is *who still needs a
center* showed sighted users how **full** a roster was, a number the board's own
heading already gives. And it could not be recovered by counting, which a browser
measurement settled: thirteen waiting marks render as three continuous dashed
rules, because Chromium's dash gap for a 1px dashed border is 2px and the gap
between slots was also 2px — so a slot boundary was pixel-identical to a dash
gap. The comment in the component claimed that gap had fixed exactly this. It had
not. Filled marks were countable; the empty ones, which are the ones worth
counting, were not.

The second measured finding is the one no amount of looking would have produced:
under a severity-1.0 deuteranopia simulation the guard wash and the center wash
are **pixel-identical** (ΔE76 = 0.00; protanopia 0.36). The radar is the one
surface that prints no G / F / C, on the argument that place carries position and
colour is a third signal. Colour is not a signal at all here — at 1.14:1 against
stock the wash is decoration — so place was the *only* carrier, and the table's
axis was unlabelled. The locked decision about a *mark* not printing its letter
stands; extending it to the table was the mistake. The runs are labelled now,
right-aligned so each letter sits above its own figure.

**And the evidence I supplied for the pass was broken.** Two of the five
screenshots were byte-identical and none showed more than one filled slot,
because the throwaway script driving the picks read `.player`/`.member` off
engine-shaped picks that carry `playerId`/`memberId` — so its "already taken" set
was full of `undefined`, autodraft kept re-picking the same player, and every
`commitPick` after the first returned `raced`. The reviewer caught it, said so,
and judged the code instead. Worth recording because the fix is a habit rather
than a patch: a screenshot meant as evidence needs one assertion about its own
content before it is handed to anybody. The density-dependent defect — a
two-digit count pulling every mark in its row 7.5px left, so the runs zig-zag
from about round ten — was invisible in all five images and was confirmed only by
measuring it afterwards.

Smaller things the pass fixed: the row divider was solid 1px `rule`, the *same
colour* as an empty mark's own rule 7px below it and a material `globals.css`
does not have (now `slot-filled`); the list never closed, which DESIGN.md's own
words forbid; the visible name and count were never `aria-hidden`, so every row
was announced two to four times and the slice's headline decision was not true;
the overflow sentence read "needs nothing — the roster is full, and 1 pick that
do not fit", which grafts a surplus onto *needs*, disagrees a singular noun with
a plural verb and leaves an em-dash aside open — and was the only branch of that
function with no test; the name column stayed 88px at 1280px while the marks took
570px; and `DESIGN.md` justified the "your row" rule by claiming the board did
the same thing, which it does not.

Two findings became fixes beyond the radar. `Bank` now associates every section
with its own `h2` — a section whose heading is an unassociated sibling is an
unnamed region on every surface in the app. And the 3.2/3.3 slices had adopted
British **centre** while PRODUCT.md, CLAUDE.md, the blueprint, `settings.ts`,
`legality.ts`, `queries.ts` and the Euroleague API all say **Center**; the
position word is now American everywhere it reaches a user, with
`normalize.ts`'s `centre` input alias deliberately left alone.

**The radar is where a screen reader and a screen want different things.** 3.2's
marks are 14px wide and mean only *filled* or *waiting*, so thirteen of them are
a picture — and to a screen reader they were thirteen announcements of nothing.
The grid is therefore `aria-hidden` and every row carries one `sr-only` sentence
instead: "B Ballers, 3 of 13 filled, needs 3 guards, 4 forwards and 3 centers."
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
  holding four open center slots watched the centers dim and read "No room".
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
