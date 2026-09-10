import { expect, test, type Page } from "@playwright/test";

import { normalizeName } from "../../src/lib/rosters/normalize";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  draftPlayer,
  signIn,
  TEST_CLUB,
} from "./helpers/session";

/**
 * The player pool — slice 3.3.
 *
 * `src/lib/pool/search.test.ts` owns the filtering and the fuzzy matching as
 * functions, which is where questions like "does a transposed letter still
 * match" belong. What only a browser can answer is the wiring and the
 * keystrokes: that a filter toggle narrows the list somebody is looking at,
 * that Enter *arms* rather than drafts, and that the second Enter lands a real
 * pick through the real pipeline.
 *
 * The diacritic case is tested here as well as in the unit test on purpose. It
 * is the one that depends on a field travelling all the way from ingestion
 * (`name_normalized`) through `getDraftView` and into the browser — and every
 * link in that chain is a place it could be dropped while the unit test stayed
 * green.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** A club code of its own, so a parallel project's players cannot leak in. */
const otherClub = () =>
  `Y${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/**
 * A player whose display name carries diacritics and whose match key is folded
 * exactly the way ingestion folds it — by calling ingestion's own function
 * rather than a hand-written imitation of it.
 */
async function createFoldedPlayer(
  display: string,
  over: Record<string, unknown> = {},
) {
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const name = `${display} ${unique}, E2e`;
  return createPlayer(display, {
    name,
    name_normalized: normalizeName(name),
    ...over,
  });
}

/**
 * Two players in this spec's own club, named so a search for "alpha" finds
 * both. The club filter only offers clubs that are *in* the pool, so a spec
 * with no players of its own cannot scope itself.
 */
async function alphaPlayers() {
  return [
    await createFoldedPlayer("Alphaone", { position: "G" }),
    await createFoldedPlayer("Alphatwo", { position: "F" }),
  ];
}

async function poolLeague(leagueName: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, leagueName);
  await addMemberTo(league.id, await createTestUser("other"), "Other FC");
  return { commissioner, league };
}

/**
 * Into the room, with the pool narrowed to this spec's own club.
 *
 * 3.3 changed what the room is sent: the pool now arrives whole, so a local
 * database that has had `rosters:sync` run against it puts 324 real players in
 * front of every one of these assertions. Scoping by club is how `draft.spec.ts`
 * has always handled that — it filled the search box with `TEST_CLUB` before
 * every pick — and the club filter is the same move, done with the control this
 * slice added.
 */
async function enterDraft(page: Page, leagueId: string, club = TEST_CLUB) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("pick-pool")).toBeVisible();
  await page.getByTestId("filter-club").selectOption(club);
}

const rows = (page: Page) => page.getByTestId("pool-row");

test("a name with diacritics is found by typing it without them", async ({
  page,
  context,
}) => {
  // PRODUCT.md's own example: "Valančiūnas findable as valanciunas". The whole
  // chain has to hold — ingestion folds the key, the view carries it, fuse
  // matches on it.
  const { commissioner, league } = await poolLeague("Folding League");
  const valanciunas = await createFoldedPlayer("Valančiūnas", {
    position: "C",
  });
  await createFoldedPlayer("Sloukas", { position: "G" });
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("pool-search").fill("valanciunas");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Valančiūnas");
  await expect(page.getByTestId(`pick-${valanciunas.id}`)).toBeVisible();

  // And a transposition still gets there, which is what "misspelling is fine"
  // in the placeholder is promising.
  await page.getByTestId("pool-search").fill("valancinuas");
  await expect(rows(page)).toContainText("Valančiūnas");
});

test("the position and club filters narrow the pool", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await poolLeague("Filter League");
  await createFoldedPlayer("Guardone", { position: "G" });
  await createFoldedPlayer("Forwardone", { position: "F" });
  const center = await createFoldedPlayer("Centreone", { position: "C" });
  const elsewhere = otherClub();
  await createFoldedPlayer("Awayguard", {
    position: "G",
    club_code: elsewhere,
    club_name: "Away Club",
  });

  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  // Three of the four are in this spec's own club; the fourth is the one the
  // club filter has to be able to reach.
  await expect(rows(page)).toHaveCount(3);

  // Position: one, then two, then off again.
  await page.getByTestId("filter-position-C").click();
  await expect(page.getByTestId("filter-position-C")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Centreone");

  await page.getByTestId("filter-position-G").click();
  await expect(rows(page)).toHaveCount(2);

  await page.getByTestId("filter-position-C").click();
  await page.getByTestId("filter-position-G").click();
  await expect(rows(page)).toHaveCount(3);

  // Club: the away guard is only reachable through it.
  await expect(page.getByTestId("pick-pool")).not.toContainText("Awayguard");
  await page.getByTestId("filter-club").selectOption(elsewhere);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Awayguard");
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await expect(rows(page)).toHaveCount(3);

  // The center is still pickable with the filters back off, so narrowing the
  // list did not quietly break the act the list exists for.
  await draftPlayer(page, center.id);
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );
});

test("the last-5 floor hides anyone below it, including the unprojected", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await poolLeague("Projection League");
  await createFoldedPlayer("Highproj", {
    position: "G",
    proj_last5_games: 5,
    proj_last5_fantasy: 200,
  });
  await createFoldedPlayer("Lowproj", {
    position: "G",
    proj_last5_games: 5,
    proj_last5_fantasy: 50,
  });
  await createFoldedPlayer("Noproj", { position: "G" });

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await expect(page.getByTestId("pick-pool")).toContainText("Highproj");
  await expect(page.getByTestId("pick-pool")).toContainText("Lowproj");
  await expect(page.getByTestId("pick-pool")).toContainText("Noproj");
  await expect(page.getByTestId("pool-proj").first()).toContainText("20.0");

  await page.getByTestId("filter-proj-150").click();
  await expect(page.getByTestId("filter-proj-150")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId("pick-pool")).toContainText("Highproj");
  await expect(page.getByTestId("pick-pool")).not.toContainText("Lowproj");
  await expect(page.getByTestId("pick-pool")).not.toContainText("Noproj");
});

test("drafted players are hidden by default, and say who took them when shown", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await poolLeague("Hide League");
  const taken = await createFoldedPlayer("Takenone", { position: "G" });
  await createFoldedPlayer("Freeone", { position: "F" });
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await draftPlayer(page, taken.id);
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );

  // Gone from the pool, because "hide drafted" starts on.
  await expect(page.getByTestId("filter-hide-drafted")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText("Freeone");
  await expect(page.getByTestId("pick-pool")).not.toContainText("Takenone");

  // Turned off, they come back — struck through, with the pick number and the
  // member who holds them, and with no button, because there is nothing to do.
  await page.getByTestId("filter-hide-drafted").click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("pool-taken")).toContainText("01");
  await expect(page.getByTestId(`pick-${taken.id}`)).toHaveCount(0);
});

/**
 * Snake with two members: who owns overall picks 1–8, as an index into the
 * rolled draft order. Written out because the order is *rolled*, so which of
 * these two users sits at index 0 changes run to run — every assertion below
 * has to be built from the viewer's own place in it rather than from a guess.
 */
const OWNER = [0, 1, 1, 0, 0, 1, 1, 0];

/** Where the signed-in member sits in the rolled order. */
async function viewerIndex(page: Page): Promise<number> {
  const rows = page.getByTestId("radar-row");
  await expect(rows).toHaveCount(2);
  const first = await rows.first().textContent();
  return first?.includes("· you") ? 0 : 1;
}

/**
 * Draft until `target` is on the clock holding three centers.
 *
 * Their own picks take centers; everybody else's take guards. Stops on the slot
 * *before* target's fourth pick, so the room under test is the one where a
 * bucket is full and its owner has to pick anyway.
 */
async function fillCentersThenStop(
  page: Page,
  target: number,
  centers: { id: string }[],
  guards: { id: string }[],
) {
  let center = 0;
  let guard = 0;
  for (const [index, owner] of OWNER.entries()) {
    if (owner === target && center === 3) return;
    const player = owner === target ? centers[center++]! : guards[guard++]!;
    await draftPlayer(page, player.id);
    await expect(page.getByTestId(`board-slot-${index + 1}`)).toHaveAttribute(
      "data-state",
      "filled",
    );
  }
  throw new Error("ran out of slots before the target was back on the clock");
}

async function mutedLeague(name: string) {
  const { commissioner, league } = await poolLeague(name);
  // Four centers, so filling a bucket with three leaves exactly one to assert
  // against, and four guards, which is the most either branch of `OWNER` needs.
  const centers = [];
  for (const label of ["Centrea", "Centreb", "Centrec", "Centred"]) {
    centers.push(await createFoldedPlayer(label, { position: "C" }));
  }
  const guards = [];
  for (const label of ["Guarda", "Guardb", "Guardc", "Guardd"]) {
    guards.push(await createFoldedPlayer(label, { position: "G" }));
  }
  return { commissioner, league, centers, guards };
}

test("a position the viewer has filled is muted, but still offered to the server", async ({
  page,
  context,
}) => {
  // 3.2's word is *muted*, not removed: which centers are left matters even
  // when you cannot take one. And the button stays, because the server is the
  // authority and a refusal in the league's own words beats a missing control.
  const { commissioner, league, centers, guards } =
    await mutedLeague("Muted League");

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await fillCentersThenStop(page, await viewerIndex(page), centers, guards);

  // The viewer holds three centers and is on the clock, so the fourth center is
  // muted for them.
  await page.getByTestId("filter-position-C").click();
  await expect(rows(page)).toHaveCount(1);
  const remaining = rows(page).first();
  await expect(remaining).toContainText("Centred");
  await expect(page.getByTestId("pool-no-room")).toBeVisible();

  // The button is still there, and the server still says no — in its words,
  // and **on the row that was tapped**. That placement is the whole argument
  // for muting a row rather than hiding it: `Correction` alone renders above
  // the search box, which on a phone can be thirty rows away from the tap.
  // Arms, then confirms — two taps since 3.7. The refusal now lands in the
  // band, where the confirming tap is, *and* on the row that started it,
  // through the shared context. Both, because 3.3's argument for muting rather
  // than hiding was that the explanation must be where the tap was, and moving
  // the confirm would otherwise have traded that fix away.
  await remaining.getByRole("button").click();
  await page.getByTestId("confirm-pick-go").click();
  await expect(page.getByTestId("confirm-pick-error")).toContainText(/all the Cs/i);
  await expect(page.getByTestId("pool-refused")).toContainText(/all the Cs/i);
  await expect(remaining).toHaveAttribute("data-state", "correction");

  // And "legal for me" is what removes them, opt in.
  await page.getByTestId("filter-legal-only").click();
  await expect(rows(page)).toHaveCount(0);
});

test("somebody else's full bucket does not mute the commissioner's own pool", async ({
  page,
  context,
}) => {
  // The production bug from the first full three-account run. `canPick` is
  // permanently true for a commissioner — they may enter anyone's pick — and
  // the pool used to read its legality off the member on the clock whenever it
  // was. So a commissioner spent the whole draft looking at somebody else's
  // roster: in round thirteen the room told them "you still need 1 C" over a
  // pool where every center was dimmed and only forwards were legal, and the
  // forwards were the one thing they were full at.
  //
  // The needs line, the radar and the pool now all read the viewer's roster.
  const { commissioner, league, centers, guards } =
    await mutedLeague("Other Bucket League");

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const you = await viewerIndex(page);
  await fillCentersThenStop(page, you === 0 ? 1 : 0, centers, guards);

  // The *other* member is on the clock holding three centers. The viewer holds
  // guards only, so the last center is theirs to take and must read that way.
  await page.getByTestId("filter-position-C").click();
  await expect(rows(page)).toHaveCount(1);
  const remaining = rows(page).first();
  await expect(remaining).toContainText("Centred");
  await expect(page.getByTestId("pool-no-room")).toHaveCount(0);
  await page.getByTestId("filter-legal-only").click();
  await expect(rows(page)).toHaveCount(1);

  // Which does not make it a legal pick *for the member on the clock* — the
  // server is still the only authority on that, and it still refuses in the
  // league's own words. That is the trade: the room stops guessing on somebody
  // else's behalf, and the refusal arrives when the pick is actually attempted.
  await remaining.getByRole("button").click();
  await page.getByTestId("confirm-pick-go").click();
  await expect(page.getByTestId("confirm-pick-error")).toContainText(/all the Cs/i);
});

test("the keyboard arms a pick and never lands one on its own", async ({
  page,
  context,
}) => {
  // A pick is undoable only by a commissioner rollback, and Enter is the key
  // people press to dismiss things. So Enter arms, and the second one commits.
  const { commissioner, league } = await poolLeague("Keys League");
  const first = await createFoldedPlayer("Alphaone", { position: "G" });
  await createFoldedPlayer("Alphatwo", { position: "F" });
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const search = page.getByTestId("pool-search");
  await search.fill("alpha");
  await expect(rows(page)).toHaveCount(2);

  // The first row carries the keyboard's highlight without being armed.
  await search.press("Enter");
  await expect(rows(page).first()).toHaveAttribute("data-state", "live");
  // Nothing has been drafted by that keystroke.
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "live",
  );

  // Escape puts it back.
  await search.press("Escape");
  await expect(rows(page).first()).toHaveAttribute("data-state", "waiting");

  // Arrow moves the highlight, and arming follows it rather than the first row.
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(rows(page).nth(1)).toHaveAttribute("data-state", "live");
  await expect(rows(page).first()).toHaveAttribute("data-state", "waiting");

  // Wait for focus, not for visibility, and note *where* it now goes: since
  // 3.7 the confirming control lives in the sticky band rather than on the
  // row, so arming focuses that. The claim is the same one as before — the
  // thing the second Enter will hit is what has focus, so two keystrokes still
  // draft and one never can — but the element is different because the
  // mechanism is. It is in the band precisely so a double-tap on the row
  // cannot reach it.
  await expect(page.getByTestId("confirm-pick-go")).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );
  // Alphatwo, the highlighted row — not Alphaone, the first one.
  await expect(page.getByTestId("board-slot-1")).toContainText("Alphatwo");
  // And the untouched player is still on offer.
  await expect(page.getByTestId(`pick-${first.id}`)).toBeVisible();
});

test("the pool tells a screen reader what the list did, not what it thinks", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await poolLeague("Spoken League");
  // Deliberately unlike each other: "Spokenone" and "Spokentwo" share six
  // letters, so the fuzzy search matched both and the count assertion below
  // was really testing the matcher rather than the live region.
  await createFoldedPlayer("Spokenone", { position: "G" });
  await createFoldedPlayer("Bravoguy", { position: "C" });
  // Both in this spec's own club, so the counts below are its own.
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // The region reports the *count*, because that is the thing that changed.
  // Narrating the top row instead meant every character typed, every filter
  // toggled and every pick landing anywhere in the league queued a sentence
  // about a player nobody had navigated to.
  // The pool's own region, by name. A bare `getByRole("status")` matched two
  // once 3.5 put league chat on this route — its announcements are about the
  // draft, this one's are about the list.
  const status = page.getByTestId("pool-said");
  await expect(status).toContainText("2 players match");

  await page.getByTestId("pool-search").fill("spokenone");
  await expect(status).toContainText("1 player match");

  await page.getByTestId("pool-search").fill("zzzzzz");
  await expect(status).toContainText("Nobody left matching that");

  // Which row the keyboard is on is the row's own business, and it says so in
  // a way a reader reports when asked rather than when the app decides.
  await page.getByTestId("pool-search").fill("");
  await page.getByTestId("pool-search").press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(rows(page).first()).not.toHaveAttribute("aria-current", "true");
});

test("Escape still cancels once a pick is armed", async ({ page, context }) => {
  // The trap this closes: arming moves focus to the row's button, and the key
  // handler used to live on the search input — so Escape did nothing at exactly
  // the moment the hint above the list promised "Esc to cancel", with a clock
  // running and no undo short of a commissioner rollback.
  //
  // `page.keyboard.press`, never `locator.press`: the latter focuses the
  // element first, which is why the original spec passed against the bug.
  const { commissioner, league } = await poolLeague("Escape League");
  await alphaPlayers();
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("pool-search").fill("alpha");
  await page.getByTestId("pool-search").press("Enter");
  const armed = rows(page).first();
  await expect(armed).toHaveAttribute("data-state", "live");

  // Focus really is on the confirming button — in the band since 3.7 — and
  // Escape reaches the provider from there anyway, which is the whole point of
  // hanging that handler above both the band and the pool.
  await expect(page.getByTestId("confirm-pick-go")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(armed).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("pool-search")).toBeFocused();

  // And the arrows work again from there — but note *from there*. Since 3.7,
  // arming moves focus to the band, and an arrow pressed while a pick is
  // waiting to be confirmed does nothing: the thing you are focused on is
  // "draft this player", and an arrow that silently re-aimed it would be worse
  // than a dead key. So the flow is Escape, then arrow, which is explicit — and
  // Escape reaches the provider from the band, which is the whole reason that
  // handler sits above both.
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(rows(page).first()).toHaveAttribute("data-state", "waiting");

  // Arming from the new position still works, and still lands in the band.
  await page.keyboard.press("Enter");
  await expect(rows(page).nth(1)).toHaveAttribute("data-state", "live");
  await expect(page.getByTestId("confirm-pick-go")).toBeFocused();
});

test("a drafted row cannot be armed", async ({ page, context }) => {
  // Arming one struck it in marker, gave it the live blush, withheld the button
  // that marker promises, dropped focus on the floor, and left the live region
  // offering an action that could never happen — on a player somebody owns.
  const { commissioner, league } = await poolLeague("Guard League");
  const players = await alphaPlayers();
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await draftPlayer(page, players[0]!.id);
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );

  // Show the drafted player. The pool sorts by name, so Alphaone — the one
  // just taken — is row 0 and is what Enter would reach for.
  await page.getByTestId("filter-hide-drafted").click();
  await expect(rows(page)).toHaveCount(2);
  const draftedRow = rows(page).filter({ hasText: "Alphaone" });
  // A drafted row is `filled` — the most settled row in the list, not a dashed
  // empty place.
  await expect(draftedRow).toHaveAttribute("data-state", "filled");

  await page.getByTestId("pool-search").press("Enter");
  // Still filled: not armed, not struck in marker, nowhere on the surface.
  await expect(draftedRow).toHaveAttribute("data-state", "filled");
  await expect(
    page.locator('[data-testid="pool-row"][data-state="live"]'),
  ).toHaveCount(0);
});

test("the armed row's action is labelled in ink, not in marker", async ({
  page,
  context,
}) => {
  // DESIGN.md forbids marker text on the live tint by name — 4.15:1 — and 3.3
  // shipped it on the armed row's button, which is the last thing read before
  // an action only a commissioner can undo. `tokens.test.ts` asserts the
  // ratios; this asserts the pool actually renders the right one.
  const { commissioner, league } = await poolLeague("Ink League");
  const players = await alphaPlayers();
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("pool-search").fill("alpha");
  await page.getByTestId("pool-search").press("Enter");

  // **Polled, not read once.** Chromium reports a stale border width on the
  // first style resolution after a class change — measured in 3.4b at `1px`
  // for an element already carrying a 2px rule, correct from ~60ms on. This
  // spec predates that lesson and read it in a single `evaluate`, which passed
  // in isolation and failed under full-suite load for a material that is
  // perfectly correct. AGENTS.md records the rule; this is it applied.
  const read = () =>
    page.getByTestId(`pick-${players[0]!.id}`).evaluate((node) => {
      const style = window.getComputedStyle(node);
      const row = node.closest("li")!;
      const rowStyle = window.getComputedStyle(row);
      return {
        // The button's own label and border.
        label: style.color,
        buttonBorder: style.borderTopColor,
        buttonWidth: style.borderTopWidth,
        // The row's strike, which is what `state="live"` draws.
        rowWidth: rowStyle.borderTopWidth,
        rowBorder: rowStyle.borderTopColor,
        field: rowStyle.backgroundColor,
      };
    });

  // **The row carries the marker; the button does not.** 3.7 first gave the
  // chosen button `border-2 border-live` to preserve the weight it had as a
  // `SubmitButton` — which put two marker-red primary actions on one surface,
  // a thing DESIGN.md forbids by name, and gave "this slot is on the clock" a
  // second meaning 400px from the first. The critique measured 12 marker edges
  // over 6 elements. The row's own `slot-live` rule is the state; the band's
  // `Draft` is the act; the button between them is neither.
  await expect
    .poll(async () => {
      const now = await read();
      return `${now.rowWidth} ${now.buttonWidth}`;
    })
    .toBe("2px 1px");

  const paint = await read();
  // The blush is there, so the row really is struck.
  expect(paint.field).not.toBe("rgba(0, 0, 0, 0)");
  // Neither the label nor the button's border is the marker. The comparison
  // used to be label-vs-button-border, which stopped meaning anything once 3.7's
  // critique made *both* ink — so it asserts against the marker itself, which
  // is what the rule is actually about: the row's rule is the marker, and
  // nothing inside the row borrows it.
  expect(paint.label).not.toBe(paint.rowBorder);
  expect(paint.buttonBorder).not.toBe(paint.rowBorder);
});
