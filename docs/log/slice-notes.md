# Slice notes

The story of each slice as it landed, moved out of `docs/STATUS.md` when that
file was cut back to its tables. Newest first. See [README.md](README.md).

## 10.4 — A depth scale with no shadow in it, and a guard that reads source

10.1 struck out the Flatness-Is-Not-Negotiable Rule and promised "an explicit
depth scale" in its place. This slice had to decide what that actually is, and
the answer came out smaller than the phrase suggests: **a lighter fill, a rule,
and one corner radius.** No shadow.

That is a decision, not an omission, and it is worth writing down because
"depth" and "shadow" arrive in the same thought. A shadow works by *darkening
what is beneath it*. The ground is at L 0.18. There is almost nothing left to
darken, so every shadow that reads as elevation on this ground reads that way
because it has been inverted into a **light** halo around the object — which is
the glowing-accent failure ADR-0006 exists to refuse, wearing a different token
name. The scale therefore goes the other way: level 1 is *lighter* than the
ground, which is also why 10.2 renamed `stock-deep` to `stock-panel`. Depth here
moves toward the light, and a system that says "deep" while emitting a brighter
colour will eventually be read literally by somebody.

### Two levels, and the honest reason there are not three

`Bank` (framed) and `CardBlock` are the same level, distinguished by what they
hold rather than by how far they float: a framed Bank groups a **task**, a block
groups a **subject**. That is the rule that answers nesting without a table of
allowed combinations — a Bank may hold a run of blocks, because a task can
contain subjects; a block may not hold a block, because a subject is not made of
subjects. A third level was drafted and dropped: the only thing it would have
expressed is emphasis, and the Material-Carries-State Rule already says emphasis
is state, and state is carried in the border.

### The port went to the doors, because a door is a subject

The temptation was to port `Slot` itself and get the whole app in one move.
`Slot` is a **ledger row** — a pick in an order, a member in a standing — and a
ledger's meaning is in the alignment between rows, which is exactly what a gap
between separate objects destroys. So `Slots` and `CardBlocks` are separate
containers on purpose; composing one from the other produced a bottom rail
underneath a gap, which is what a wrong model looks like when it renders.

The four league doors are the right first port because a destination *is* a
subject, and a grid of them says "pick one" where a ruled run says "read down".
`Door` gained a `block` prop rather than a sibling component, and the two
renderings share one body — a door that looked different depending on which page
built it is precisely how the lobby and the season pages drifted apart before
`board.tsx` existed.

### The guard exists because Tailwind fails silently, not because rules are nice

`depth-scale.test.ts` reads every `.ts`/`.tsx` under `src/` as text and fails on
a radius that is not the one token, on any `shadow-` / gradient / `blur-` class,
and on a card-block material spelled anywhere but `board.tsx`. Reading source
rather than measuring rendered values looks like the weaker test, and here it is
the stronger one, for a specific reason: **Tailwind emits an unknown utility as
nothing at all.** A stray `rounded-lg` renders a perfectly pleasant rounded
button; a hand-rolled `card-block-2` renders an unstyled `<li>`. Neither throws,
neither logs, and the first one *passes* any test that asserts a computed style
is plausible. The failure mode is a screenshot that looks fine, which no runtime
assertion is positioned to catch.

It was verified the only way a guard can be: by injecting a violation into
`roster-radar.tsx` and watching three assertions fail by name, then reverting
with `git checkout` after a `cp` restore left the file dirty. A guard that has
only ever been observed passing has not been observed.

This closes the debt 10.1 opened the same week, with one piece deliberately left
open: the recursive nest is closed structurally, but two *different* callers
composing one block into another still depends on review.

### One more Tailwind fact, checked rather than assumed

`border-l-3` is not in Tailwind's classic border-width scale (0/2/4/8). It works
in v4 — verified by grepping `border-left-width:3px` out of the built CSS, not
by remembering — and so do the three `border-l-pos-*` classes, which matters
because they are assembled from a lookup record and a dynamically composed class
name is the other way Tailwind silently emits nothing. The position edge is a
full-strength hue rather than an alpha for the reason 3.4a paid for: an alpha
takes its colour from whatever surface it lands on. It is an *edge* rather than
a wash specifically so it changes no text's contrast, and the G/F/C letter is
still printed by the caller, because colour never carries position alone.

### A gate finding that was not about this slice

The E2E suite failed four specs on the first full run, all of them
`/auth/callback`, all `ERR_CONNECTION_REFUSED`. The cause is that the callback
redirects to the **absolute** `NEXT_PUBLIC_APP_URL`, which is
`http://localhost:3007`, while the run was on `E2E_PORT=3011` — the port the
verification table in STATUS.md recommends. Nothing was listening on 3007, so
the browser was sent nowhere.

The reason it is a debt row rather than a footnote is the *other* arrangement.
Those two specs assert a path regex, not an origin. With a dev server running on
3007 — which is the normal state of this laptop — the redirect lands there, the
regex matches, `login-error` renders, and both specs pass **against a different
build than the one under test**. The failure mode of the recommended command is
therefore a false pass on two security specs, and the only reason it surfaced at
all is that this run happened to have 3007 free.

## 10.3 — Two families, and the boundary between a column and a sentence

The brief asked for geometric labels and a condensed mono for tabular stats,
which meant overturning the One Label Maker Rule ("one family, no exceptions…
no mono"). Space Grotesk carries every word; JetBrains Mono carries figures that
live in a column.

**`latin-ext` was checked before either face was chosen, not after.** This
league reads Valančiūnas and Šengelia, and a font without the extended range
falls back mid-word — a surname that changes shape at the fourth letter looks
like a rendering bug on the one screen the league stares at all night. Both
faces were confirmed against `next/font`'s own `font-data.json` rather than
against a memory of what Google Fonts ships.

### The interesting part was what the `stat` utility deliberately does *not* set

`stat` sets `font-family` and `font-variant-numeric`, and nothing else. Adding
weight and tracking there would have been the natural thing to do and would have
been a bug. `stat` composes with `slot-label` and `font-semibold`, Tailwind v4
emits `@utility` blocks **alphabetically**, and `slot-label` sorts before
`stat` — so a tracking declaration here would have silently overridden the caps
tracking of every label it joined. Not a hypothetical: `slot-transit` had
already paid for this exact ordering once. Keeping the utility to two properties
means the composition order stops mattering.

The boundary the rule draws is between a **column** and a **sentence**: the
clock, the PIR column, chat timestamps and standings figures are mono; the chat
unread badge and any number sitting inside prose stay sans. A figure inside a
sentence is prose. `design.spec.ts` asserts both halves in a real browser, so
"mono where it belongs, sans where it belongs" is measured rather than asserted
in a comment — and the long-standing computed-family check moved from Archivo to
Space Grotesk in the same place.

## 10.2 — One ground, and the rename that says which way depth goes

The palette from 10.1 landed in `globals.css`, and the second ground came out
entirely: the `--night-*` indirection, both remapping blocks,
`prefers-color-scheme`, `src/lib/theme.ts`, the `<head>` override script,
`ThemeControl`, the sun and moon icons, and `theme.spec.ts`. Roughly 1,100 lines
deleted against 500 added, which is the shape of a slice that removes a
dimension rather than adding a look.

**`stock-deep` became `stock-panel`,** and the rename is the load-bearing part.
On card stock a secondary surface is darker; on a near-black ground it is
lighter. The old name described the wrong direction, and the direction is what
makes the panel the *binding* surface when solving contrast rather than the
forgiving one — ink on the lighter panel is the harder constraint, so `rule` is
asserted harder on the panel than on the ground.

`tokens.test.ts` collapsed from two grounds to one and still came out at 74
assertions, every pair re-measured rather than carried over. Four are new: the
anchors pinned as sRGB bytes so the ground and the marker cannot drift; a
**ceiling** on chalk, which is the unusual one — it stops someone "improving"
contrast by walking ink toward pure white, where 18.8:1 on this ground is
halation rather than legibility; `rule` bound against the panel; and every token
declared exactly once, which restores the protection the `--night-*` prefix used
to give for free by making a duplicate declaration a name collision.

One find that CI could not have produced: **`global-error.tsx` carried its own
copy of the theme script.** It renders only when the root layout has already
failed, so no test exercises it, and it would have kept writing a `data-theme`
onto a document with no theme system left. It was found by grepping for the
symbol being deleted rather than by trusting the test suite to be complete —
which is the general lesson, since the file that renders when everything else
has broken is the file nothing covers.

## 10.1 — Reversing a thesis, and solving a palette instead of picking one

The instruction was to make the app a dark, data-dense interface on `#0B1120`
with `#FF5500` accents. The awkward part is that this app has refused exactly
that, in writing, in the emitted HTML of every page, since Phase 1.4: *"It
refuses the near-black surface with one glowing accent."* And eight days ago
9.5 shipped a dark ground while going out of its way to keep that refusal
intact — ADR-0005 says so in as many words.

So the first job was not CSS. It was deciding whether this is an amendment or a
reversal, and saying which. It is a reversal, and pretending otherwise would
have left three documents quietly contradicting a stylesheet.

**What the old refusal was actually protecting turned out to be separable from
its conclusion.** Read D17 and the direction contract together and the refusal
bundles two failure modes: a dark ground doing the work structure should do, and
a saturated accent glowing to make up for it. Both are still worth refusing, and
ADR-0006 refuses them. What is given up is only the *inference* that a light
ground is the sole defence. The structure was the load-bearing part — four rule
weights carrying state, a marker with two jobs, measured contrast on every pair,
no colour without a redundant non-colour signal — and all of it survives.

### One ground rather than three, and the reason is a measurement

The conservative option was a third ground beside day and night, which would
have kept `prefers-color-scheme` working. It does not survive contact with the
brief's own accent: **`#FF5500` measures 2.76:1 against the old card stock.**
That fails the 4.5:1 text floor and also the 3:1 boundary floor, so the orange
could not even be a primary action's border on a light ground. Keeping paper
therefore means a second, darker orange — and a design system whose one accent
is two different colours depending on the lamp has two accents. One ground.

### Three constraints moved values, and none of them was aesthetic

Every non-anchor token was solved with the same conversion and compositing code
`tokens.test.ts` uses, so the numbers below are the numbers CI will compute.

**A panel is lighter than the ground, which flips which surface binds.** On a
near-black board "deeper stock" is unavailable: depth on a dark ground *is*
lightness. So `stock-panel` sits above the ground, and a mid-grey rule now has
less contrast on the panel than on the ground — the reverse of the paper board.
`rule` is therefore solved for 3:1 against the **panel** (3.15:1) and clears
3.52:1 on the ground as a by-product. Solved the old way round it came out at
2.46:1 on the panel: a rule you cannot see, on the surface the board is drawn
inside, which is a state language with no states.

**The live bay is derived downward from faint ink.** A warm field lifted well
off a near-black ground looks better and pushes `ink-faint` under the floor —
and faint ink is what a muted pool row is written in, which is a row that can be
*the armed one*. So `live-sunk` is the lightest bay on which faint ink still
clears 4.5:1, which lands it at `oklch(0.254 0.075 38.8)`, 4.61:1, and only
1.16:1 against the ground. Subtle on purpose, and the 2px marker rule above it
is still what carries the state.

**Soft ink is solved against its worst pairing, not against the ground.** Taking
ADR-0005's 5.79:1 as the target failed twice over: 4.3:1 written on a position
wash that sits on a panel, and — by 0.03 — the Ink-on-Blush Rule, which requires
soft ink to stay *stronger* than the marker on the live field. Solved against
both it is 6.24:1, and the marker sits at 5.05:1 beneath it.

**Chalk deliberately stops short.** Pure white on this ground is 18.8:1. Ink
lands at 13.89:1, near the night board's 13.60:1, because 9.5's halation
argument is the part of it that outlived the decision: a ramp whose top shouts
gives the quiet inks nothing to be quiet against, and a phone at full white in a
dark room is harder to read, not easier.

### The marker needs four decimal places

`oklch(0.676 0.217 38.8)` round-trips to `#ff5502`. Invisible, and still not the
colour the brief named, so the token carries `oklch(0.6759 0.2175 38.8)` and
renders `#ff5500` exactly. Worth knowing before somebody tidies the decimals.

### What got dropped, and why it is not an oversight

**The purple head coach.** The brief asks for it across every view and the mock
draws an HC slot in the roster. Draft Mode "is the same as the Classic Mode,
except… there is no head coach" — D19, from last week, the slice that restored
captain and bench *and deliberately left the coach cut*. The roster ingest
filters coaches out by an inclusion rule on `type === "J"`. A fourth position
colour would badge an entity the game does not have, so purple leaves the
palette and amber takes the warm slot.

**The persistent countdown and the PIR columns**, because both already exist —
the clock has been sticky and server-offset since 3.7, and average PIR has been
the pool's leading column since 9.1. Re-announcing shipped work as new work is
how a status file starts lying.

### The cost, recorded where it will be read

`prefers-color-scheme` is no longer honoured at all, because there is nothing
left to honour it with: a reader who asks their phone for a light interface gets
the midnight board anyway. That is the single best argument for reversing
ADR-0006 later, and it is written into the record rather than left for somebody
to discover as a bug. Two more went into Open debt: the depth scale's two-level
and one-radius rules are prose that nothing enforces, and the vibrant position
hues have never been re-simulated under colour-vision deficiency — 3.2's
deuteranopia measurement was of the *muted* washes, and if the new ones separate
no better, the letter is doing all the work and the colour is decoration with a
job title.

## The league that could not be deleted

Reported from production: the commissioner pressed delete and got the route
error boundary. The log said it in one line —

```
ClientResponseError 400: Failed to delete record. Make sure that the record
is not part of a required relation reference.
url: .../api/collections/leagues/records/5njsumqmr6h0opi
```

— and the schema said the rest. **PocketBase refuses to delete a record while a
required, non-cascading relation still points at it, even when the pointing
record is itself slated for the same cascade.** Deleting a league cascades to
`league_members`; two fields in this schema hold exactly that kind of reference
to a member row. `picks.member` is one, and it is the reason `deleteLeague`
deletes drafts first — the existing E2E test even says so in a comment. The
other is `roster_memberships.member`, which **5.1 added and nobody carried back
into the delete path**. The league on the box had 39 roster windows (three
members, thirteen rounds — a completed draft, materialized), so it could not be
deleted at all.

The loop came before the theory, which is the only reason this took minutes
rather than an afternoon: a new spec builds the production shape — a board plus
one roster window — and drives the real delete through the real UI. Red with
the identical 400 and the identical error boundary, green after the fix. The
differential is what makes it evidence rather than a story: the *existing*
delete test uses the same helper and passes, so one `roster_memberships` row is
the whole difference.

The fix reuses `clearLeagueMemberships`, which the draft-rollback path already
calls for this exact reason, and the order is now windows → drafts → league.

**The part worth remembering is not the fix.** Each of the two failed attempts
deleted the drafts *before* hitting the 400 on the league, so the board and its
39 picks were destroyed by a delete that then reported failure — and the error
page told the commissioner "The board itself is unchanged" while it had just
stopped being true. Both are recorded as open debt rather than papered over:
PocketBase has no transactions and the cascade is the only thing that removes
members, chat and sheets, so the league record must go last and ordering cannot
be turned into atomicity. What *can* be done, and is, is to stop the class from
recurring: `pb:verify` now reads the live schema, enumerates every required
non-cascading reference to `league_members`, and fails CI unless the set is
exactly the two `deleteLeague` handles. The next collection to add one breaks a
build instead of a league.

## 9.5a — The ground switch becomes a mark, and the alignment was the whole slice

9.5 shipped the switch as a `FilterToggle` reading "Night", and said so in
writing: a sun/moon icon "would have been a new idiom and a new material in one
step." That was the cautious call and it was the right one to *record*; asked
for the icon, the honest thing is not to relitigate it but to pay the price it
named. So the new idiom is written down rather than smuggled in — DESIGN.md
gains a **Ground switch** entry stating the exception it earns (the one control
here whose state is the picture, not a rule, which is why it takes no
underline), and the Shapes section gains the recipe so the next icon is not
invented from scratch.

**The drawing was never the problem.** The first attempt looked wrong, and the
reason was the alignment context. `TopRail`'s right group is baseline-aligned,
and a button whose only child is an `<svg>` has no baseline to give it — but
the deciding case is the one surface whose action is not a single line. On `/`
the action is a stack: a name over its own nav row. Centred against that stack
the mark sits *between* its two lines, level with nothing and 20px clear of the
nearest control, which reads as a stray tick rather than as a switch. The rule
that came out of it is the one worth keeping: **the rail has one line of
controls, and everything that is a control sits in it.** `self-end` at `gap-1`
puts the mark in the nav's own 44px band as one more control in a row of them,
and on the `BackLink` surfaces — the same 44px box, one line — it is the same
result, so no page needed editing for either case.

Two smaller decisions, both made from the rendered pixels rather than from the
numbers. The pair is sized against **each other**, not to a shared box: the sun
is a small disc whose rays make it read wide, the moon is one thin arc, so the
crescent is drawn nearer the edge of its box than the rays are — matched
geometrically they look like two different sizes on the same rail. And they are
drawn on 16 units but rendered at **18px**, which puts the stroke a shade over
1px; at 16px the mark sat visibly lighter than the 500-weight caps beside it,
and a control that reads quieter than its neighbours reads as decoration.

The a11y shape is unchanged on purpose, and that is what kept the slice cheap:
the accessible name stays the fixed string "Night board" rather than swapping
with the picture, so a screen reader hears one control changing position instead
of two controls trading places, and `aria-pressed` still says which way it is.
`theme.spec.ts` asserts exactly that contract plus the test id, so 9.5's eight
specs — the no-flash first paint, the system preference deciding, the override
clearing itself — needed no edit and all still pass. The whole 419-test E2E
suite was run rather than just those eight, because the rail is on every page
and a `gap` change there is a change everywhere.

## 9.5 — The night board, and the test file that shaped it

D17 refused dark mode by name, so this slice could not start with CSS. DESIGN.md
open question 5 had already set the price: *"if it ever does, the inversion
argument has to be re-made, not quietly dropped."* Re-made, it holds — and it
gains a clause.

The day board is an inversion of the physical object: a real draft board is dark
card in a dim room, and this app made card stock the ground and the board's
ruling the ink. That was argued from **the room** — a lit lounge with a TV on,
and months of daylight phone checks either side of draft night. The room is not
a constant. Euroleague tips at 20:00 and 21:00 CET, and an L 0.94 ground in a
dark bedroom is not a design choice, it is a torch. So the ground inverts the
object *for the light it is read in*: by day the card, by night the board. Read
D17 and the direction contract together and what they refuse turns out to be
narrower than the phrase "dark mode" — it is **"the near-black surface with one
glowing accent"**, a look, and that refusal is untouched here and still
asserted in a browser. [ADR-0005](../adr/ADR-0005-night-board.md), blueprint
**D21**.

**The test file decided the implementation.** `tokens.test.ts` parses
`globals.css` with a regex for `--color-X: oklch(…)` and takes the **first**
match. A second theme written the obvious way — override `--color-stock` inside
a media query — would have left that regex reading the day board's value in both
passes, and dark mode would have shipped **unmeasured**, which is the one thing
this design system does not do. So the night palette is declared under its own
`--night-*` names, each mapping block only points `--color-*` at them, and the
suite is parameterized by ground. 122 assertions, every ratio among them asked
twice. The helpers that were free functions became a `ground(theme)` factory, so
each existing assertion body measures the second palette **unchanged** — the
tests did not get a dark-mode variant, they got a second ground.

That indirection pays for itself twice: the mapping happens in two places (the
system preference and an explicit choice), and a palette copied into both would
drift the first time one value moved. A token added to one block and forgotten
in the other would strand a single day colour on a dark ground — unreadable, and
invisible to every ratio, which reads declarations rather than mappings. So the
two blocks are asserted to assign the same thirteen tokens, each to its own.

**The values were solved, not picked.** The first pass was a clean-looking
palette that was wrong in a way a ratio table hides: its quiet inks measured
7–8:1. Contrast floors were all cleared and the *hierarchy* was gone, because
what separates a slot label from a surname here is ink strength. So each
lightness was solved numerically against the day board's own **margin** —
`ink-soft` 5.79:1 where day is 5.77, the marker 5.10 against 5.06, the rail 5.05
against 5.05, the two rules 3.35/4.40 against 3.36/4.40, and the position letter
on its own 10% wash at 5.11–5.13 (the tightest pairing in the app on either
ground). Neither end of the ramp is pure: a pure-black ground is the cliché the
day board was drawn against, and white-on-black at full strength halates on a
phone in the dark.

**No flash, and no JavaScript required for the common case.** The system
preference is applied by `@media (prefers-color-scheme: dark)` in CSS, so a
reader with scripts off lands where their phone asked, and an OS switching at
tip-off reaches a page that is already open. A ~200-byte script in `<head>`
applies an **explicit override only**, before the first paint — a theme applied
from an effect is a white page flashed at somebody in a dark room, which is the
whole feature failing on the device it exists for. `global-error.tsx` replaces
the root layout entirely, so it carries its own copy; without it the one page
that appears when everything else has failed is the one page that ignores the
choice. The CSP already allows `'unsafe-inline'` for scripts (Next's own
bootstrap needs it), so this adds no new exposure — checked rather than assumed.

**Choosing what the system already wants clears the override.** `overrideFor`
returns `null` in that case. Without it every press writes one more pin, and a
reader who turns their phone to night mode at kickoff still gets the day board
because of a tap they made in July. The control is the existing `FilterToggle`
in the rail — DESIGN.md's settled answer for a two-state control, a button with
`aria-pressed` carrying its state in its own rule — so it reached every surface
without touching a single page, and a sun/moon icon button would have introduced
a new idiom and a new material in one step.

Two implementation notes worth keeping. The control reads `localStorage` and
`matchMedia` through **`useSyncExternalStore`**, not an effect: they *are*
external stores, the React Compiler's `set-state-in-effect` rule rejects the
effect version outright, and this way the server has a defined snapshot instead
of a guess. And `board.tsx`'s position patch needed **no change at all** — it
mixes into `var(--color-stock)`, a token *reference*, so it follows whichever
ground is in force; a literal colour there is exactly what would have blocked a
second theme, which is why `tokens.test.ts` asserts the shape of that mix.

**The E2E spec exists for what arithmetic cannot see:** that the second palette
is in force at all, that it arrives before the paint rather than after, and that
the system decides until somebody says otherwise. Two things it taught us. The
computed value of `--color-stock` comes back as `lab(93.39% …)` — Chromium
normalizes wide-gamut colours on the way out — so the spec parses a lightness
rather than comparing a colour syntax we do not control. And the first click on
`/players` was swallowed: in dev that page ships ~1,000 players and the tap
landed before hydration, which is worth knowing beyond this spec, because the
control is the only thing in the rail that needs JavaScript.

## 9.4 — `injured` was a status nothing had ever written

`players.status` has carried `active | injured | doubtful | left` since 2.1, and
until this slice **nothing set the middle two**. `normalizeApiRow` says why in a
comment — the feed's `active` flag is a contract window, not a knee — and
`diffRosters` has carried a `LOCAL_STATUSES` guard the whole time specifically
so a nightly sync could not heal a flag a human had set. The guard has spent a
phase and a half protecting a field nobody filled in.

**The source question was settled by measurement, not preference.** Verified on
2026-09-14: `/injuries` and `/news` on the Euroleague feed both 404;
`euroleaguebasketball.net` answers **429** to an unauthenticated fetch; and
RotoWire's Euroleague RSS is a 200 with an **empty body** (`sport=NBA` returns a
full feed, so the endpoint works and the Euroleague one is simply not
published). That left HTML, which D5 forbids — and reading D5 again, it forbade
scraping **stats**, on the argument that the official API answers that question
completely so a parsed table would be a second and worse answer. That reasoning
does not transfer to a question the API does not answer at all. So D5 is
narrowed in writing rather than quietly stepped over: **D20** in the log,
[ADR-0004](../adr/ADR-0004-injury-news-source.md) for the whole argument.

**What is stored is the fact; the prose stays on their site.** Player, club as
published, position, body part, what the item asserts, the date, their headline
and their URL. `news-update__news` — the paragraph — is matched by no regex in
`rotowire.ts`, and `rotowire.test.ts` asserts that no stored field contains it,
so "we do not reprint a subscription publisher's copy" is a test rather than an
intention. Every surface links back.

**The page's own marking is the only classifier.** An item is an injury item
because its block carries `is-injured`. The tempting alternative — keywords over
the headline — was tried against the real page and fails in both directions on
the same screen: "Jumps to Partizan" is a *transfer* on the injuries view (for a
player who is hurt), and "Taking part in workouts" is a *recovery* note for a
player who still is. Neither headline can be read without the page's own flag.

**Two facts about the pages shaped everything else.** Each view returns exactly
**25 items** — the latest updates, not a census — and the injuries view is a
filter over the same feed rather than a separate one. So (a) both views are read
and deduplicated, because the transfer half only appears on the plain one and a
busy injury week pushes injuries off it; and (b) **a pass may raise a flag and
may never clear one**. Absence from a list of the 25 newest updates is not
evidence of recovery. Recovery is a person's statement, and it is a button.

**The cold-start trap, found by running it.** The first real pass read items
back to 8 June. Flagging a squad in September from a June item asserts something
the source never said — that item was true when written and says nothing about
this week. So only items published within **21 days** may move a status
(`INJURY_WINDOW_DAYS`). Older items are still stored, still shown, still dated;
they simply do not touch the pool.

**`applied` is what makes a correction stick.** Without it, the hourly pass
would re-read the same three-week-old item and re-flag a player a commissioner
had just marked fit — every hour, for three weeks. `markPlayerFit` therefore
does two writes in the order whose half-finished state is harmless: spend the
items first, clear the status second. A crash between them leaves a fit player
still marked injured and the items unable to re-flag him; one more press
finishes it. The other order clears the flag and leaves the reason to undo it.

**Matching published names to the pool is the whole difficulty, and 4.2 had
already solved it.** The clubs register **passport** names and the publisher
writes common ones: the pool holds `Lessort, Mathias Michel`,
`Bacot Jr., Armando Linwood` and `Hayes, Kevarrius Keshawn` against published
`Mathias Lessort`, `Armando Bacot` and `Kevarrius Hayes`. Exact normalized
matching alone left **27 of 48 items unattached** on the live pages — a queue
that opens with 27 questions nobody needed to be asked is the queue people stop
reading. Reusing `looksLikeRename`'s token containment, and preferring players
who have not `left` before falling back to the whole pool, brings it to **11**,
and all eleven are real questions: nicknames the pool spells differently
(`Kostas Sloukas` against `Sloukas, Konstantinos`) and players who are not in
E2026 at all. Those eleven go into 4.2's mapping queue, answered **by slug**, so
one answer attaches every item about that person including next Tuesday's.
Attaching a name deliberately does not flag anybody: identity and availability
are separate claims, and the next pass decides the second one under its own
rules.

**Where it runs.** A third in-flight guard in the worker's sweep, hourly, two
requests a pass, sharing the Euroleague importers' `fetchWithRetry` rather than
growing a second retry policy — one set of statuses worth retrying, one way to
be a good citizen of somebody else's server. `NEWS_FETCH=off` stops the news
without stopping pick deadlines. The commissioner's "Read the pages now" is the
draft-night button: the hour before a draft is the one hour where waiting forty
minutes for a knee is not acceptable.

**What the E2E suite does and does not drive.** It plants items in exactly the
shape the pass writes and drives the browser over them: the board and its links,
the pool carrying the word, the correction that marks a player available again
(asserting the spend, which is the part that makes it stick), and the mapping
question an unmatched name raises. It never fetches RotoWire — a spec that did
would fail on their Tuesday rather than on our bug. The parser is tested against
saved markup in `src/lib/news/fixtures/`, which is also what a fix is written
against when the markup changes.

## 9.3 — The table was thirteen players at 100%, which the official table never is

D4 read the official rulebook's captain, bench and coach mechanics as belonging
to "their game mode, not a draft league", and cut all three. The Draft Mode page
settles it in one sentence: Draft Mode "is the same as the Classic Mode, except…
there is no head coach". So D4 was right about the coach and wrong about the
other two, and the cost of being wrong was not cosmetic — a league mirroring the
official site would have read two different totals for the same night and had no
way to tell which was theirs. Restored as **D19**, an amendment citing the page,
rather than a quiet edit to D4.

**The load-bearing decision is where the multiplier is applied.**
`player_game_stats.fantasy_pts` is app-global: one row for one player's night,
read by every league. Baking a captain into it would be wrong the moment two
leagues make different players captain, which is the same trap the existing
"scoring weights are settings nothing reads" debt describes. So it is applied in
`computeStandings`, which means recording a lineup is a **recompute** and never a
rescore: the box scores never move, the golden fixture of 168 real E2025 rows is
untouched, and a league that types a lineup in December fixes October without
re-fetching anything.

**Rounding is stated once and it is the bench that forces it.** Halving 33
tenths is 16.5, and the entire tenths scheme exists so that no float ever reaches
a sum. `scaleTenths` in `scoring.ts` is now the single convention — multiply,
round half away from zero — and `toTenths` is defined in terms of it, so the
×1.1 win bonus and the ×0.5 bench round the same way. It is applied **per
player-round**: aggregate a player's games in a round first, then weigh once,
because weighing each game and summing would round twice for anybody who played
a double round.

**The validator refuses transcription errors rather than storing a wrong total.**
Every id has to sit in that member's membership window *for that round* — so a
lineup typed in November for round 4 names the thirteen who actually played it,
not today's roster — no duplicates, and the starting five has to be one of the
five formations the rulebook prints (2-2-1, 1-2-2, 2-1-2, 1-3-1, 3-1-1 as
G-F-C). The formation check is the one that turns a mistyped five into a refusal
instead of a wrong number, and it is spelled out as a list rather than derived
from "at least one of each, never three centers": a derived rule that admitted a
sixth shape would be our invention.

**One place the plan was deliberately not followed.** It said counts must match
the template. They do not, for the sixth man, the bench and the inactive: those
are capped rather than exact. A 5.2 drop can legally leave a twelve-man roster,
and "counts must match" would mean such a league could record no lineup at all —
a rule that refuses every input is worse than a place left empty. The starting
five stays exact, because the formation rule has no meaning otherwise.

**Two failure modes are answered rather than hidden.** A round nobody typed
carries the last recorded lineup forward, which is what a league that arranges
once and leaves it expects. A round *before* any lineup exists cannot be carried,
so it scores everyone at 100% — and the standings page strikes it as a
`Correction` naming the rounds, rather than presenting an inherited number as
final. The same generosity covers a player a carried lineup never heard of: an
arrival predating the lineup scores at 100%, not at zero, because our bookkeeping
gap is not their bad night. That `Correction` only counts the teams the table
actually ranks; a member with no roster has no total a lineup could change, and
counting them would strike every round of every league forever.

**Consistency was the quiet half of the slice.** `bestNight` scanned every
covering window and `impactForMember` assumed everyone scored fully, so left
alone they would have named a best night that moved nobody's total and priced a
trade the table disagreed with. Both take the same weights now. PIR stays raw in
both: it is the basketball number, and halving it would describe a night nobody
played.

## 9.2 — Two of D13's "working paths" were only reachable by a crafted request

D13 cut the commissioner console in 3.6 with a four-part argument that each item
already had a working path. Read again a year of slices later, two of those
parts were claims about the **server**, not about anything a person can reach.

**Per-member autodraft.** `setAutodraft` has accepted a `memberId` since 2.5 and
has always permitted a manager to set it for anybody — the docstring says so and
names the case, a phone dying mid-round. But `getDraftView` never shipped
anybody else's flag, and its own comment said as much ("Everyone else's flag is
Phase 3.6's console"). So the working path was: know the member id, and POST.
That is not a path. The fix was two lines in the query and a row per member in
the panel, in draft order, each with its own `useActionState` so a refusal lands
on the row it belongs to rather than at the top of twelve identical ones.

**"Pick for them".** It was real since 2.4 and it was the pool's Bank *heading*
— which on a phone sits six hundred pixels below the band. A manager whose
teammate had gone quiet had to scroll, notice a heading had changed wording, and
infer that the pool in front of them was now somebody else's. It is a control in
the panel now, and it is deliberately a **walk rather than an act**: it names
whose turn it is spending and leaves the cursor in the pool's search box. The
implementation is the radar's own reveal idiom — an `href` that works with no
JavaScript, a handler that focuses and then measures the sticky band's clearance
rather than guessing at it. It is hidden on your own turn, because the pool
below already says "Make your pick" and a second control for one act is how two
surfaces start disagreeing.

**The clock was the only one of the four carrying a real correctness question,
and D13 said so.** The question is what happens to a deadline that is already
running, and the answer is now stated once, in `setPickClock`: the new deadline
is **now plus the new clock**. The rejected alternative — the pick's original
start plus the new clock — fails in the exact direction people use this. A room
that set 120 seconds in the lobby and then spends an hour on round three cuts
the clock to 30, and computed from the pick's start that puts the deadline
ninety seconds in the past: the sweep autodrafts the member on the clock on its
next tick, and it looks like the commissioner punished somebody for asking them
to hurry up. The E2E test is written to separate the two implementations rather
than to confirm the one that shipped — it plants a deadline ten seconds in the
past, which is what a long pick looks like to this action, and asserts the new
one is in the **future** by roughly the new clock.

Two smaller decisions came with it. The league's `pick_seconds` setting follows
the draft's, second, so a start-over does not quietly return to a minute — and
a crash between the two writes leaves the live draft correct and only the
lobby's default stale, which is visible and repaired by pressing the button
again. And the change **announces itself in chat**, because the countdown
everybody in the room is watching jumps when it lands; "the clock was changed
and restarted" is the honest reading of that jump, and without the line the only
reading available is "the clock glitched".

**Skip a turn was refused, and the refusal is mechanical rather than a matter of
taste.** `buildPickOrder` produces a contiguous run of slots and
`isDraftComplete` counts them, so a permanently empty slot is a draft that can
never finish; the sweep's own board-hole repair would start reporting a draft it
cannot move. Autodraft and "Pick for them" cover both cases a skip gets reached
for. It is in STATUS's debt table as an argument, not a to-do.

**One test-infrastructure finding, worth more than the slice.** The full E2E
suite failed **149 of 395** against the local dev server, in a way that read
like a broken draft room: pauses that never landed, rooms that never rendered,
`page.goto: net::ERR_ABORTED`. Every one of them was route-compile latency —
two other projects' `next dev` servers were running on the same laptop — and the
same suite against `next start` over a fresh build passed **405 of 405 in four
minutes**. The lesson is in STATUS's verification table now: measure this suite
on a build (`CI=1 E2E_PORT=…`), the way CI does, or the noise is the result. The
helpers that wait on a server action round trip were given the same generous
fuse `draftPlayer` already argues for, because a fuse shorter than the work it
waits on reports a slow thing as a broken one.

## 9.1 — The pool was showing the wrong number, in the wrong ink, unlabelled

The slice started from a defect rather than a feature request. The draft pool's
row carried a figure in soft ink with no heading, and that figure was
`proj_last5_fantasy` — fantasy points, which are PIR × 1.1 on a win. So the
strongest numeric signal in the room was a bonus-inflated number that everyone
would reasonably read as the PIR they talk in. Worse, **PIR was averaged
nowhere**: it was stored per game in `player_game_stats.pir` and `projectPlayer`
returned only the two fantasy averages. The number the league drafts on did not
exist in the database.

Three decisions followed, and the third is the one worth keeping.

**One number, everywhere.** Average PIR is now the row headline, the
`10+/15+/20+` floors, and autodraft's ranking. Two of those used to read fantasy
points while the eye read something else; making them the same figure means the
pool's top row and the pick the worker would make for you are now the same
answer to the same question. `EnginePlayer.projectedPoints` became `rankPir` in
the same change: a field named for one quantity and carrying another is exactly
what CONTEXT.md says to rename rather than document.

**Which season the average comes from is stated once**, in `averagePirOf`:
current-season last-5 if the player has any games, last season otherwise. On
draft night that is uniformly last season, because E2026 has none — but STATUS
notes the league may one day draft into a season already under way, and then
the fresher number is the right one. `averageFantasyOf` follows whichever season
PIR chose, so one row never prints this season's PIR beside last season's
fantasy points.

**Prominence came from position and ink, because marker red was unavailable.**
DESIGN.md's Two Jobs Rule gives marker exactly two jobs, "and no third", so the
usual way to make something shout was closed. What was left is what the sheet
rank already argued for at `pick-form.tsx`: a leading, fixed-width,
right-aligned column can be *read down*, whereas the same figure trailing the
position patch landed at eight different x-positions. PIR is that column, at
the name's size in full ink, under a `slot-label` column head.

That has a measured cost and it is worth writing down rather than glossing. A
Pixel 7 pool row is 338px, and every part of it except the name is fixed-width,
so the name absorbs the entire deficit. The first cut — `w-16` with the games
count beside it — truncated names to three characters. Narrowing the column and
holding the games count and the `FP` figure back to `sm` brought the name to
**87px against the 101px it had before**, measured in a real browser rather than
estimated. Fourteen pixels of name is the price of the row leading with the
right number; the full name stays in `title` and in the row's spoken label at
every width.

### The endpoint that looked like a free win and was a data-corrupting trap

The plan called for replacing the roster sync's 21 club-by-club requests with
one call to `/{season}/people?limit=1000`, which returns all 837 season people
with full bios. It parses cleanly, the `type === "J"` filter still works, and
332 players come back. It shipped, the sync ran, and it marked **66 players as
having left** and moved others to clubs they had already departed.

`/{season}/people` is a **registration history, not a roster**. It lists every
spell a person has held this season, expired ones included, so those 332 rows
cover only 309 people: 23 appear twice, once at the club they left (`active:
false`, `endDate` in the past) and once at the club they joined. `diffRosters`
deduplicates by person code and keeps whichever it saw first, which is feed
order — so Jantunen was stored at Fener rather than Madrid, and a player at the
wrong club is diffed as a departure and vanishes from the draft pool.

Measured properly afterwards, against the club walk on the same day: the bulk
endpoint lists **79 `(person, club)` pairs the walk does not and omits 60 that
it does**. Filtering to `active === true` reconciles neither — still 21 extra
and 63 missing. It is not a shape trap to work around; it is a different
question being answered.

So the walk stays the roster authority and the bulk endpoint contributes **bios
only**, joined by person code, with the club's own row winning every field it
has. The repair was the doctrine the repo already has: re-running the corrected
sync restored the pool exactly — 326 draftable, 222 with a previous season and
104 without, 22 with no person code, which are the same figures 4.4's backfill
measured. Nothing was deleted at any point, because a player who disappears
from a source is marked, never removed.

The lesson is narrower than "verify the feed" — the feed *was* verified, and
every claim about its shape was true. What was not checked was whether it
answered the same **question** as the endpoint it replaced. A test now asserts
that a club's roster beats the season-wide list on club membership, and the
research doc carries the measurement.

### Where last season's numbers come from, and the four ways that endpoint lies

Previous-season averages are imported from the v3 statistics table behind the
official expanded-stats page (`npm run stats:prev`), because that is the number
the league will compare against — a draft-night figure that disagrees with the
official site by a tenth is a figure nobody trusts. Four parameter traps, all
measured on 2026-09-14 and all in `docs/research/euroleague-api.md`:

- Omitting `seasonMode=Single` makes it ignore `seasonCode` and return
  **all-time career leaders** — 3,075 rows, `gamesPlayed` up to 78, retired
  players included, and no error of any kind.
- `statisticMode=perGame` applies a minimum-games qualification: 208 rows with
  a 24-game floor, silently dropping **127 of 335 players**, which is precisely
  the fringe, injured and mid-season arrivals a draft has to price. We take
  `accumulated` totals and divide ourselves.
- `team.code` can be `;`-joined for a mid-season move (9 rows in E2025), so it
  is never matched against a club.
- The current season answers `total: 0` until tip-off, which is not an error.

It is also the **only v3 resource on this API**, which corrects a claim the
research file carried since 2.1 — "v3 is rejected outright, do not reach for
it" was a statement about every path anyone had tried, written as a statement
about the API.

The cross-check was nearly free and is the part that makes the import
trustworthy: `applyPreviousSeason` computes each player's E2025 season PIR
average from our own 6,902-line backfill and compares it to the feed's.
**220 of 222 matched players agreed exactly**; the other two have no local box
scores to compare. A disagreement is reported and never reconciled — the same
rule 4.1 applies to a pasted PIR that does not match its own components, for
the same reason, which is that we cannot tell which of the two numbers is
wrong.

One asymmetry worth knowing: `prev_season_fantasy` comes from our backfill and
not from the feed, and it has to. Fantasy points are PIR plus a win bonus, and
a season *total* carries no per-game result to apply that to. So a player we
never backfilled gets a PIR average and no fantasy average, and the player page
prints nothing rather than a zero.

**8.4 has landed: the draft room is a first-class page for assistive tech.**
Three defects, one missing measurement. The room was the only surface without
an `h1` — all three band states titled as a plain `<p>`, while every other page
had exactly one. Arming a row threw focus into the sticky confirm, and cancel
or Escape put it on `pool-search`, so Tab walked every filter and every earlier
row again; focus now returns to the armed row's Choose button (the cheat
sheet's `focusWanted` idiom), falling back to search only when the row is gone
because the pick landed. Arrow keys then move focus with the highlight, so
Enter arms the row you moved to rather than the one Escape left you on. A skip
link sits first in the root layout, visible on focus, targeting `#main` on
`Sheet`; `LoadingSheet` stopped rendering a second `<main>` so streaming no
longer doubles the landmark. Position patches with a spoken label take
`role="img"` — a bare `span[aria-label]` is prohibited. `@axe-core/playwright`
asserts no serious or critical violations on login, home, lobby, draft and
standings — the measurement STATUS already said was missing. The one finding
axe raised was contrast (`live` on `stock-deep` at 4.49:1): that rule is
disabled in the suite on purpose and recorded as open debt, because
`tokens.test.ts` is already the source of truth for every ink/stock pair.

**8.3 has landed, and the human half is now closed on the box.** PM2
writes `eurovafliai-{web,worker}-{out,error}.log` with no size bound. Two doors
were rejected on purpose: `pm2 install pm2-logrotate` is a daemon-global
module and would change logging for the eight sibling apps on this box, and
`out_file` / `error_file` in `ecosystem.config.js` need a `pm2 delete` +
`start` to take effect (`reload` does not re-open paths) — an outage to move a
file. So the slice ships `deploy/logrotate/eurovafliai` for
`/etc/logrotate.d/eurovafliai`, globbing only `/root/.pm2/logs/eurovafliai-*.log`,
with `copytruncate` as the load-bearing line (without it PM2 keeps writing the
rotated inode and the live log silently stops growing). `deploy.sh` warns when
the file is missing or drifted; the runbook §9 has the install and dry-run
steps; a unit test keeps `copytruncate` and the scoped glob honest. The file is
installed at `/etc/logrotate.d/eurovafliai` and byte-identical to git, and it
is rotating rather than merely present: the live `eurovafliai-*.log` files sit
at 0 bytes beside a populated `.1` and a `.2.gz`, which is exactly the
`copytruncate` + `delaycompress` signature. Truncated-live-plus-populated-`.1`
is the pair worth checking if this is ever revisited — a rotation that had lost
`copytruncate` would show a growing `.1` and a live log frozen at its old
size.

**8.2 has landed: a draft-breaking failure reaches the commissioner, not
chat.** The sweep already refused a hole in the board and a pool with no legal
player, and logged once via an in-memory set that a restart cleared. Nothing on
the draft said so. This slice adds optional `stuck_reason` / `stuck_since` on
`drafts`, a pure sentence builder, and writes at those choke points (plus three
consecutive thrown ticks on the same draft). Cleared when the sweep can move
the draft again. Write only on change, so a stuck draft is one write and not
one a second. The room renders a `Correction` above the controls for managers
only — `chat_messages` has no per-member visibility, so chat was the wrong
door. Stats failures stay in the worker log: they are app-global and none of
them stop a draft. Failure-recovery: a single write after the refusal; if it
fails the draft is still stuck, the log still says so, and the next tick tries
again. Two existing sweep assertions that expected `writes === []` on a refusal
now expect the stuck update, which is honest — the refusal stops being a pure
no-op.

**8.1 has landed, and the human half is now closed on the box.** The
timer and oneshot were already committed. What was missing was anything that
noticed they were not installed, and a restore path that did not need the box.
`scripts/restore-drill.sh` extracts an archive into a disposable directory,
boots the pinned binary on a spare port, runs `pb:verify` against it, and tears
everything down — so the mechanism is proved on a laptop before a production
archive is ever downloaded. `deploy.sh` now warns when
`eurovafliai-backup.timer` is not enabled, and again when the newest
`eurovafliai-*.zip` is older than 48 hours (a timer that is enabled but failing
would otherwise be silent: the oneshot has no `OnFailure=`). The runbook §8 is
the install steps. Two limits stay as debt rather than scope: archives live on
the same disk as the database, and `backup-pocketbase.mts` goes through
`parseServerEnv`, which also wants the Google OAuth secrets. The stamp format
had to change in this slice: PocketBase rejects uppercase letters in backup
names, so an ISO-shaped `…T…Z.zip` never created an archive at all. The units
are installed and `eurovafliai-backup.timer` is `enabled` and `active`: it has
fired on four consecutive nights, each run leaving a 33 MB
`eurovafliai-<stamp>.zip`, and the last oneshot exited 0. One of those
production archives has been through `pb:restore-drill --adopt-superuser`
(#109), so what is proved is the whole loop — timer to archive to a booted
restore — and not just that a unit is enabled.

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
## The mapping doorbell — closing 4.2's "queue with no doorbell"

4.2 stops a roster sync splitting one player into a departure plus a duplicate
by *quarantining* a suspected rename: neither half is written until a person
answers. The price was recorded at the time and carried as open debt — nothing
chased the queue. The sync script printed the held-back pairs, `/players/mapping`
listed them, and that was the whole of it. Fifteen unanswered renames is fifteen
stale display names before 24 September and fifteen players whose box scores
cannot attach after it, which is points going missing rather than a spelling.

The fix is a count on two surfaces a manager already opens, and the only
interesting decision was making the count **unable to lie**.

**One filter, called twice.** The rules that decide whether a stored proposal is
still a *question* — the player is gone, the player already has a code, the code
has since been taken — lived inside `readLatestCheck`, and the dedupe that folds
one unmatched code across twenty passes lived inside `readUnmatchedCodes`. A
count written beside them would have been a third implementation agreeing by
inspection. They are now pure functions in `src/lib/mapping/queue.ts`
(`pendingRenames`, `pendingCodes`, `newestCheckBatch`), and the page and the
doorbell both call them. A doorbell that rings for work the page then does not
show is worse than no doorbell: it teaches a commissioner that the notice is
noise, which is the state this debt already was.

**No network.** The 21-request feed check stays behind `checkTheFeed`. Both
halves of the queue are already stored — a sync writes its `diff` whether or not
anybody presses anything, and 4.3 writes every code it could not attach — so
`countMappingQueue` is three PocketBase reads. It fetches the pool **once** where
the two page reads fetch it twice, and it never ranks candidates: a count does
not need to know who the player might be, and `suggest` builds a fuse index per
code.

**Where it rings.** Below the league's own act and above the member list. A live
draft outranks a stale spelling, so the notice does not sit above "The draft is
live"; further down is where the queue was already being missed. It is a
`Correction` — ink, not marker — which is both the design rule for a notice and
8.2's precedent for a commissioner-only banner that names what to do. The lobby
gate is the league's existing manager test rather than a fresh
`canManageRosters()` call: anybody who manages this league already satisfies the
app-global one, so the door cannot 404, and nobody else pays for the read.

**It says the cost, not the count.** "15 players may have been re-registered" is
a number; "until somebody answers them, those players' box scores cannot attach"
is a reason. `queueSentence` returns `null` on an empty queue and the surfaces
render nothing — a doorbell that rings to say the door is empty is the one people
stop hearing.

**The parallelism trap, again.** The queue is app-global, which this repo has now
learned from `sweepOnce`, the cheat-sheet fixture, the chat fixture and 4.2's own
specs. `countMappingQueue` picks **one** winning rename batch (the newest
carrying proposals) but **unions** the code batches, so with `fullyParallel: true`
a sibling spec planting its own check can displace a planted rename and leave a
doorbell spec asserting against an empty queue. The presence spec therefore
plants an unmatched *code*, which can be joined but not displaced, and never
asserts an exact number. The absence spec — a plain member sees nothing — is
robust whatever else is in the queue, and it is the one guarding the boundary.

Verified on localhost with a planted rename and code: the lobby read "One player
in the pool may have been re-registered under a new name. 2 person codes from box
scores belong to nobody in the pool." and `/players` read "3 waiting" on the same
load. The two agreeing is the invariant, not a coincidence.

What is deliberately still missing: nothing reaches a commissioner who does not
open the app. No chat announcement, because `chat_messages` has no per-member
visibility and this is manager-only — the same argument 8.2 made for the stuck
banner — and no email, because this repo has kept configuration on the box out of
itself.

### The doorbell's first contact with real data

The slice above shipped, and then the pre-season pass ran a full E2025 backfill
against the live E2026 pool — 34 passes, 6,902 game lines, 0 corrections — and
the doorbell was immediately wrong in the exact way it was designed not to be.

`readUnmatchedCodes` reports every person code an import could not attach, and a
backfill of *last* season against *this* season's roster leaves **123** of them.
None is work. They are players who left the league; there is nobody in the pool
for their code to belong to, and there never will be. The notice would have
opened on "102 person codes belong to nobody in the pool" on the first lobby a
commissioner visited after backfilling, which is a hundred things nobody can act
on and precisely the training that makes the fifteen real renames invisible.

So `countMappingQueue` now counts only the season being **played**
(`codesWorthChasing`). A code from the current season is a live player whose
points are landing nowhere, which from 24 September is worth interrupting
somebody for; a code from a backfill season is history. `/players/mapping` still
lists every season, because that is the working surface — history is context
there and noise only in a notice. Verified against the real backfilled database:
102 unmatched codes in the window, all E2025, and `queueSentence` returns `null`.

Worth writing down because the first version was not sloppy — it was correct
against every test and every fixture, and it was measured wrong within an hour
of meeting a real season. The spec that guards it now plants a code under
`E2019` and asserts the banner does not name it while the mapping page does.

One limitation found and *not* fixed: `readUnmatchedCodes` reads the newest 20
`stat_imports` batches, and the backfill wrote 34, so 22 codes are outside the
window and invisible to both the page and the count. In normal operation this
does not bite — an empty fetcher pass deliberately writes no batch, so 20 batches
is many game nights rather than five hours — and every code it hides is a
departed player. It would matter if somebody bulk-imported the current season.

### What the backfill said about draft night

Also measured, and more important than the doorbell: **222 of 326 active E2026
players carry a last-5 projection and 104 do not.** Twenty-two have no person
code yet. The other 82 have one and simply did not play a Euroleague game last
season — NBA arrivals, domestic-league signings, promoted juniors. Autodraft
ranks a missing projection below −2 and the pool's 10+/15+/20+ filters drop them,
so a genuine signing sorts beneath a fringe player who logged garbage minutes in
May. Nothing is broken; this is what ranking a new season on an old one means.
It is the strongest argument this project has for writing a cheat sheet before
draft night, because the sheet is read before any projection is.
