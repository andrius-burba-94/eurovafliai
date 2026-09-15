# ADR-0007 — The roll ceremony: a fourth animation, and the app's one theatrical surface

**Status:** accepted. Raises DESIGN.md's Three Events Rule to four and adds one
type step. Does not touch ADR-0006's palette, materials or depth scale.

## Context

The draw was a form submission. The commissioner pressed "Roll the order" and
numbers appeared in a list — and after PR #120 that list was at least readable
by everyone, but it still simply *appeared*. Blueprint §2.3 had always asked for
something else: a roll "revealed live to all clients one slot at a time as an
animated event". Slice 2.3b built the staging (`useRollReveal`) and pointed it
at the lobby's member list, which during `setup` is in join order, so what a
member actually saw was numbers landing in scattered rows while they carried on
scrolling past the invite code.

The draw is the only moment in a season where a dozen people stop and look at
the same thing at the same second. It decides who picks first, it cannot be
undone without a deliberate reshuffle, and it is the one event in this product
that is *social* rather than operational. It had no surface of its own.

The maintainer asked for the obvious thing, precisely specified: on the first
roll take everyone to a page, count down from ten, then reveal the order one
slot at a time, last slot first, three seconds each, slowly — and make it
memorable in this app's own visual language.

## Decision

**A dedicated route, `/leagues/[id]/order`, computed from a stored instant.**

1. **The first roll writes `settings.rolled_at`** in the same write as the seed.
   Only the first: a re-apply must not restart a ceremony the room has already
   watched (the same reasoning that makes the seed reusable), a **reshuffle does
   not trigger one** either, and setting the order by hand clears the instant
   because an order agreed at the bar was never drawn.

2. **Every device derives its own phase** from that instant through the pure
   `rollCeremony` in `src/lib/roll/ceremony.ts`. Nothing is broadcast and no
   timer is started. This is the decision the whole design rests on, and the
   alternative is what makes it worth recording: a client-side timer chain
   started "when the roll arrived" would give every phone a private ceremony,
   and two friends on one sofa would watch different slots land. Deriving it
   instead means a phone that opens the page thirty seconds late **joins the
   draw in progress**, a reload restarts nothing, somebody arriving an hour
   later reads a finished order rather than a countdown, and the whole thing is
   testable by backdating one field instead of waiting forty-six seconds.

3. **The browser corrects its clock against `/api/time`**, exactly as the draft
   room's pick clock does, for invariant §4's reason: a phone two minutes fast
   must not run a two-minute-wrong ceremony. The first paint comes from the
   server so the page opens at the right second.

4. **The league is brought in once per device per roll**, and only while the
   draw is live. This is the only place in the app that moves somebody to a page
   they did not ask for, which is justified by the event being genuinely shared
   — and bounded, because the ceremony has a door back to the lobby and a
   member who walks through it must not be dragged out again.

### The two changes to DESIGN.md

**A fourth animation (`slot-drawn`), raising the Three Events Rule to four.**
The rule says a fourth is a change to DESIGN.md rather than a variant, so this
is that change. `card-lands` was the obvious candidate to reuse and is wrong
twice over: it is 260ms, which is a flinch rather than the slow appearance the
brief asks for, and it drops *downward*, whereas this board fills **upward**
because the draw walks from the last slot to the first. 900ms, rising, on this
system's single `cubic-bezier(0.22, 1, 0.36, 1)` curve — a slower event is a
longer duration on the one curve, never a second easing vocabulary.

The honest argument for a fourth at all: the other three annotate a board
somebody is working on and must stay out of the way. This one *is* the surface.
That is also why a fifth is still a change to this document.

**One type step (`--text-roll`, 5rem mono).** The countdown is the only figure
in this app read from across a room, and the display step (2.25rem) is a
heading size. It is the invite code's argument — a number the league counts down
out loud together has to be legible on a phone lying on a table — and it lands
in the mono face because DESIGN.md already puts every clock there.

### What the surface does *not* do

No new colour, no gradient, no glow, no shadow, no second radius, no icon, no
sound. The drama is composition, scale and pacing inside ADR-0006's existing
world: one focal figure in marker, the order filling upward as ruled slots, and
the page's own title deliberately demoted to small caps so the **name being
drawn** is the loudest thing on screen. The first version had it the other way
round — "THE ROLL" at display size over a 16px answer — which is the hierarchy
exactly inverted, and it was caught by looking at a render rather than by
reasoning about the markup.

## Consequences

- **`prefers-reduced-motion` drops the travel, not the ceremony.** The pacing is
  a clock, not an animation: someone who has asked their phone for no motion
  still watches the order being drawn one slot at a time, they are simply not
  moved through it. Guarded inside the utility, like the other three, so a new
  caller cannot forget it.
- **A skip exists**, per device, and it is ink rather than marker: leaving is a
  way out, not the act the page is for.
- **2.3b's lobby reveal narrowed rather than died.** The first draw belongs to
  the ceremony; the staged reveal in the member list is now what a *reshuffle*
  plays. `draft-setup.spec.ts` was re-pointed at that case rather than deleted.
- **Every spec that rolls now passes through the ceremony**, so rolling in a
  test goes through one `rollOrder` helper. That is a wide, mechanical diff
  across nine spec files, and it is the honest cost of making a button navigate.
- **The lobby subscribes to the `leagues` record**, not only to its members,
  because "the order has been drawn" is a fact the member list cannot carry. It
  asks the server to re-render rather than parsing settings in the browser, so
  the settings schema keeps one implementation.
- **A half-written roll has no ceremony**: `rollCeremony` returns `none` when no
  member has a position, which is exactly the repairable intermediate state
  2.3a's failure-recovery story describes.
- The route is dynamic (it reads a session and the request time), so it is never
  prerendered; `connection()` says so in the file rather than leaving it to be
  discovered.

## Alternatives rejected

- **A modal over the lobby.** Cheaper, and wrong: the lobby underneath is a
  working surface with an invite code and a member list, and the draw deserves
  not to be a layer on top of something else. A modal is also the one thing
  craft-floor names as a default to refuse for a task that needs neither
  interruption nor protected focus — and this needs the opposite, a place.
- **Broadcasting the phase over the realtime subscription.** More moving parts,
  a new message shape, and it would still be wrong for the member who opens the
  page late, because a broadcast is an event and they missed it. The stored
  instant is a *fact*, and facts survive being arrived at late.
- **Reusing `card-lands` at a longer duration.** Rejected above: wrong direction
  and it would have made one utility mean two things.
- **A wheel, a spinner, or envelopes.** Every one of them is a costume from
  another product's world. This app's world is a ruled board, and a slot rising
  into its place on that board is the same idea rendered in the material that
  was already here.
- **Running the ceremony on a reshuffle too.** Considered and declined by the
  maintainer: the first draw is the event, and a redraw is a correction. The
  lobby still shows a reshuffle landing.
