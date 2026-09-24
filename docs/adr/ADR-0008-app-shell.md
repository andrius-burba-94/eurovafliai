# ADR-0008 — The app shell: a sidebar, a side panel and a bottom tab bar

**Status:** accepted. Reverses DESIGN.md's "There is no sidebar, no full-bleed
region, and no third measure" and the One Measure Rule. Does not touch
ADR-0006's palette, materials, depth scale or type, nor ADR-0007's motion
budget.

## Context

By the end of Phase 10 the app had sixteen signed-in surfaces and no shared
navigation. Every page drew its own `TopRail` with one `BackLink`, and every
league destination — the draft room, the order, the lineup, standings, recap,
a member's team, the trade builder, the cheat sheet, the export — was reached
through a `Door` somewhere in the lobby's body. The pool, the news board and
the three manager pages hung off the home rail or off the pool page.

So the app could only be walked as a tree. To go from standings to your lineup
you went *back* to the lobby and found the right door; to reach the injury
news from a league you went home, then to the pool, then to the news. Nothing
on any page said where else you could go, and the lobby doubled as a site map,
which is a job its body kept losing to its own content (the season dashboard,
D26, replaced four doors with panels and so removed four ways out).

The maintainer asked for a redesign "for a better accessibility and clarity",
with every menu, link and page living in a sidebar, a header or a dropdown, and
pointed at the official EuroLeague Fantasy Challenge as the reference: a
persistent left sidebar, a centre workspace with a court for the lineup, and a
floating right panel with Players / Schedule / News tabs over a searchable,
filterable player list.

The same brief asked about the reference's look — the orange gradient field,
colour-blocked halves. That was asked as a separate question and answered
**layout and IA only**: the midnight board stays exactly as ADR-0006 drew it.

## Decision

**One shell, rendered by every signed-in page, with three regions.**

1. **A left sidebar from `lg` (64rem).** Wordmark and season, a league
   switcher, the league's own destinations, the global destinations, a manage
   group for roster managers, and the account at its foot. It is sticky and
   scrolls on its own.

2. **A header on every width.** On a phone it carries the wordmark, the league
   switcher and a *More* menu; from `lg` it names where you are and, on pages
   that have one, opens the side panel.

3. **A contextual right panel, as a third column only from `xl` (80rem).**
   Players / Schedule / News tabs over the pool with search and G/F/C filters.
   Below `xl` the same panel opens from the header as a full-height sheet —
   solid panel stock and a heavy rule, no shadow, no scrim, no blur. The panel
   is rendered once and positioned by breakpoint rather than drawn twice.

4. **A bottom tab bar below `lg`.** Four destinations and *More*. In a league
   the four are Home, the draft room (while drafting) or the lineup (in
   season), standings and your team; outside one they are leagues, pool, news.

5. **One pure function decides what the nav contains**: `navFor` in
   `src/lib/nav/items.ts`. The sidebar, the tab bar and the More menu all
   render its output, so a destination cannot appear in one and not another,
   and "which destinations does a member see while drafting" is a unit test.
   It offers only what the viewer can open: the trade builder is a manager's,
   in season; the order exists once it was drawn; standings, recap, lineup and
   team exist once there is a season.

6. **The shell is rendered by the page, not by a route layout.** A layout
   cannot see the current path or the query on the server, and it is *kept*
   across navigation inside its segment — so a league flipping from drafting to
   season would keep a nav that still offered the draft room as live. Every
   page already reads the league it needs; it passes that and its own key.

7. **Current is ink, never marker.** The current destination is
   `aria-current="page"` with a 2px ink rule — left in the sidebar, top in the
   tab bar. The marker keeps its two jobs; a nav item is neither the slot on
   the clock nor the act a surface exists for. The draft room carries the word
   *Live* while drafting, which is status in words rather than in colour.

8. **Dropdowns are one primitive.** `Menu` in `src/components/menu.tsx`: a
   button with `aria-expanded` / `aria-controls`, Escape and outside click
   close it and return focus, 44px targets on both axes. No library.

9. **Icons are drawn.** Single-stroke inline SVG on a 16-unit box, `aria-hidden`,
   always beside their word — the recipe DESIGN.md's Shapes section already
   records. There is still no icon package.

**The court.** The lineup's five starters sit on a half-court drawn as inline
SVG line art in the heavy rule colour — no fill, no gradient, no imagery —
guards at the top of the key, the center at the post, one row per position
letter so all five legal formations stand on something. The court is a
*picture* of the five with a tap target per place; every player's controls
stay on their card in the tiers below it (Starting five, Sixth man, Bench,
Inactive, and Not placed while anyone is), each player exactly once. A card
with a select and a captain mark is too wide to stand three across on a
390px court. Placement is tap-to-place: Move on a card or a court token, then
a tier's *Move here* or an open court place. All are buttons, so it works by
keyboard; each card's select and captain radio are what the form posts, so the
page still works without JavaScript. No drag and no new animation.

## Consequences

- **A second breakpoint joins `sm` app-wide, and a third appears.** `lg` was
  the draft room's alone (D24, D26); it is now the shell's. `xl` exists only for
  the side panel's column. Still no `md` and no custom breakpoint.
- **The measures change meaning.** `column` and `wide` now size the content
  region *beside* the sidebar rather than the viewport. The room's two-column
  split still starts at `lg`, inside a region 15rem narrower than before.
- **`TopRail` and `BackLink` are deleted.** The wordmark lives in the sidebar
  and the header; "back" is the nav.
- **Doors that were only navigation are removed from the lobby** (the cheat
  sheet door, the roster-empty door). Doors that are content stay: "Enter the
  room" while a draft is live is the league's one act, and the export door
  explains what an export contains.
- **The draft room's panel has no Players tab and never docks.** Its pool *is*
  the resource pool and it is wired to the arm-and-confirm state the sticky
  band shares; moving it into a panel outside that subtree would split the one
  piece of shared state the pick path has, and a second, read-only pool beside
  it would be the same list twice with only one of them able to pick. So the
  room's panel is Schedule and News, opened from the header as a sheet at every
  width: at 1280px a docked 22rem column beside the sidebar would leave the
  room's pool and board about 340px each. The room keeps its own two columns.
- **The shell reads with the viewer's token, not the superuser's.** It renders
  on every page and the draft room re-renders for every viewer on every pick,
  so a password sign-in per render (what `canManageRosters` does) measurably
  slowed the whole suite. Whether to draw the Manage group is answered from the
  viewer's own leagues and memberships; the Manage actions still gate on
  `canManageRosters`.
- **Menus and the phone sheet are panel stock with a heavy rule.** Not a framed
  Bank: a Bank groups a task on the page, a menu floats over one, and
  `depth-scale.test.ts` keeps `bank-framed` to `board.tsx`.
- **The phone loses ~56px to the tab bar.** Pages reserve bottom padding for
  it so the last row is never under it, and the room's sticky band stays at
  the top because the header is not sticky.
- **`/login`, `not-found`, `error` and `global-error` stay outside the shell.**
  They have either no session or no guarantee that one can be read.

## Alternatives rejected

- **A hamburger drawer on phones.** Asked and declined: a drawer hides every
  destination behind one tap, and the phone is the primary device.
- **Route-group layouts for the shell.** See decision 6.
- **The reference's colour-blocked look.** Asked and declined for now; it would
  reverse ADR-0006's No-Atmosphere Rule and needs its own ADR.
