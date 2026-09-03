import { expect, test, type Page } from "@playwright/test";

import { normalizeName } from "../../src/lib/rosters/normalize";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
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
  const centre = await createFoldedPlayer("Centreone", { position: "C" });
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

  // The centre is still pickable with the filters back off, so narrowing the
  // list did not quietly break the act the list exists for.
  await page.getByTestId(`pick-${centre.id}`).click();
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );
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

  await page.getByTestId(`pick-${taken.id}`).click();
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

test("a position the picker has filled is muted, but still offered to the server", async ({
  page,
  context,
}) => {
  // 3.2's word is *muted*, not removed: which centres are left matters even
  // when you cannot take one. And the button stays, because the server is the
  // authority and a refusal in the league's own words beats a missing control.
  const { commissioner, league } = await poolLeague("Muted League");
  const centres = [];
  for (const label of ["Centrea", "Centreb", "Centrec", "Centred", "Centree"]) {
    centres.push(await createFoldedPlayer(label, { position: "C" }));
  }
  const guards = [
    await createFoldedPlayer("Guarda", { position: "G" }),
    await createFoldedPlayer("Guardb", { position: "G" }),
  ];

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // Two members and a snake, so the picks go A B B A A B: the *second* member
  // owns 2, 3 and 6. Three centres into those three slots fills their C bucket
  // and leaves them on the clock for pick 7. (Written out because the first
  // version of this test gave picks 1 and 4 to one member — both of which
  // belong to the member who drafts *first* — and filled nobody's bucket.)
  const order = [
    centres[0]!, // 1 · first member
    centres[1]!, // 2 · second
    centres[2]!, // 3 · second
    guards[0]!, // 4 · first
    guards[1]!, // 5 · first
    centres[3]!, // 6 · second — their third centre
  ];
  for (const [index, player] of order.entries()) {
    await page.getByTestId(`pick-${player.id}`).click();
    await expect(page.getByTestId(`board-slot-${index + 1}`)).toHaveAttribute(
      "data-state",
      "filled",
    );
  }

  // Pick 7 belongs to the member now holding three centres, so the fifth
  // centre is muted — for them, not for the commissioner looking at the screen.
  await page.getByTestId("filter-position-C").click();
  await expect(rows(page)).toHaveCount(1);
  const remaining = rows(page).first();
  await expect(remaining).toContainText("Centree");
  await expect(page.getByTestId("pool-no-room")).toBeVisible();

  // The button is still there, and the server still says no — in its words.
  await remaining.getByRole("button").click();
  await expect(page.getByTestId("pick-error")).toContainText(/all the Cs/i);

  // And "legal for me" is what removes them, opt in.
  await page.getByTestId("filter-legal-only").click();
  await expect(rows(page)).toHaveCount(0);
});

test("the keyboard arms a pick and never lands one on its own", async ({
  page,
  context,
}) => {
  // A pick is undoable only by a commissioner rollback, and Enter is the key
  // people press to dismiss things. So Enter arms, and the second one commits.
  const { commissioner, league } = await poolLeague("Keys League");
  const first = await createFoldedPlayer("Alphaone", { position: "G" });
  const second = await createFoldedPlayer("Alphatwo", { position: "F" });
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

  // Wait for focus, not for visibility: arming focuses the button a frame
  // later, and pressing Enter before that lands sends the keystroke back to
  // the search box, which arms again instead of committing. The assertion is
  // also the interesting claim — the *armed* button is what has focus, so the
  // second Enter goes to it and not anywhere else.
  await expect(page.getByTestId(`pick-${second.id}`)).toBeFocused();
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
  const status = page.getByRole("status");
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
  const players = await alphaPlayers();
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("pool-search").fill("alpha");
  await page.getByTestId("pool-search").press("Enter");
  const armed = rows(page).first();
  await expect(armed).toHaveAttribute("data-state", "live");

  // Focus really is on the armed button, and Escape reaches the pool anyway.
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(armed).toHaveAttribute("data-state", "waiting");
  await expect(page.getByTestId("pool-search")).toBeFocused();

  // And the arrows keep working from there too.
  await page.getByTestId("pool-search").press("Enter");
  await expect(page.getByTestId(`pick-${players[0]!.id}`)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(rows(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(rows(page).first()).toHaveAttribute("data-state", "waiting");
});

test("a drafted row cannot be armed", async ({ page, context }) => {
  // Arming one struck it in marker, gave it the live blush, withheld the button
  // that marker promises, dropped focus on the floor, and left the live region
  // offering an action that could never happen — on a player somebody owns.
  const { commissioner, league } = await poolLeague("Guard League");
  const players = await alphaPlayers();
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId(`pick-${players[0]!.id}`).click();
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

  const paint = await page
    .getByTestId(`pick-${players[0]!.id}`)
    .evaluate((node) => {
      const style = window.getComputedStyle(node);
      const row = node.closest("li")!;
      return {
        label: style.color,
        border: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        field: window.getComputedStyle(row).backgroundColor,
      };
    });

  // The blush is there, so the row is struck; the label is not the marker.
  expect(paint.field).not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.borderWidth).toBe("2px");
  expect(paint.label).not.toBe(paint.border);
});
