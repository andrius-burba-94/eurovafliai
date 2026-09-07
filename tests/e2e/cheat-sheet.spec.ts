import { expect, test, type Page } from "@playwright/test";

import { normalizeName } from "../../src/lib/rosters/normalize";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  TEST_CLUB,
} from "./helpers/session";

/**
 * Cheat sheets — slice 3.4.
 *
 * `src/lib/sheets/parse.test.ts` and `match.test.ts` own the questions that are
 * really about functions: does an unquoted "Surname, Firstname" survive, does a
 * transposition still match, does an ambiguous name refuse to guess. What only
 * a browser can answer is the chain — that a paste reaches PocketBase, that the
 * sheet then reaches the *room*, and that the pool the room draws is in the
 * order the sheet asked for.
 *
 * The privacy claim is not tested here. It is a PocketBase read rule, and
 * `npm run pb:verify` drives it directly with two members of one league: a
 * browser test would only be able to show that this app does not *ask* for
 * somebody else's sheet, which is the weaker half.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

/** A player whose match key is folded by ingestion's own function. */
async function sheetPlayer(
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

async function sheetLeague(leagueName: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, leagueName);
  await addMemberTo(league.id, await createTestUser("other"), "Other FC");
  return { commissioner, league };
}

/** Paste a list, read it, save it. Returns once the save has been confirmed. */
async function saveSheet(page: Page, leagueId: string, text: string) {
  await page.goto(`/leagues/${leagueId}/sheet`);
  await page.getByTestId("sheet-input").fill(text);
  await page.getByTestId("sheet-preview").click();
  await expect(page.getByTestId("sheet-apply")).toBeVisible();
  await page.getByTestId("sheet-apply").click();
  await expect(page.getByTestId("sheet-saved")).toBeVisible();
}

async function enterDraft(page: Page, leagueId: string, club = TEST_CLUB) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("pick-pool")).toBeVisible();
  await page.getByTestId("filter-club").selectOption(club);
}

test("a pasted list becomes a saved, ranked sheet, diacritics folded", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Paste League");
  const one = await sheetPlayer("Alphaone", { position: "G" });
  const two = await sheetPlayer("Valančiūnas", { position: "C" });

  await signIn(context, commissioner);
  // The second line is typed the way a keyboard types it, without the
  // diacritics — which only matches if ingestion's `name_normalized` reaches
  // the matcher. That is the whole chain this test is here for; whether a
  // *transposition* also matches is a question about fuse, and `match.test.ts`
  // asks it against realistic names rather than against a pool of 324 real
  // players plus this spec's own.
  const folded = two.name.normalize("NFD").replace(/\p{M}+/gu, "");
  expect(folded).not.toBe(two.name);
  await saveSheet(page, league.id, `${one.name}\n${folded}`);

  await expect(page.getByTestId("sheet-saved")).toContainText("2 ranked");

  // And it is there on the next load, in the order it was written.
  await page.goto(`/leagues/${league.id}/sheet`);
  const rows = page.getByTestId("sheet-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Alphaone");
  await expect(rows.nth(1)).toContainText("Valančiūnas");
  // One rank format in the app: `#N`, right-aligned. It was `01` here, a
  // leading `#1` in the room's pinned block and a trailing `#1` on a pool row.
  await expect(rows.nth(0)).toContainText("#1");
});

test("tier breaks come out of the tier column", async ({ page, context }) => {
  const { commissioner, league } = await sheetLeague("Tier League");
  const one = await sheetPlayer("Alphaone", { position: "G" });
  const two = await sheetPlayer("Alphatwo", { position: "F" });
  const three = await sheetPlayer("Alphathree", { position: "C" });

  await signIn(context, commissioner);
  await saveSheet(
    page,
    league.id,
    `1,1,${one.name}\n2,1,${two.name}\n3,2,${three.name}`,
  );

  await expect(page.getByTestId("sheet-saved")).toContainText("1 tier break");

  await page.goto(`/leagues/${league.id}/sheet`);
  // Two runs, not one: a tier is a break, and a break between two runs is how
  // this board says a run has ended.
  await expect(
    page.getByTestId("sheet-tier-1").getByTestId("sheet-row"),
  ).toHaveCount(2);
  await expect(
    page.getByTestId("sheet-tier-2").getByTestId("sheet-row"),
  ).toHaveCount(1);
});

test("an ambiguous name is asked about rather than guessed at", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Ambiguous League");
  // Two players who really do share a name, at two clubs. Two clubs is not
  // decoration: `unique(name_normalized, club_code)` on `players` means one
  // club cannot hold two of them, which is the right rule and also the reason
  // this fixture has to look like the real case it is about.
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const shared = `Twinsen ${unique}, E2e`;
  const first = await createPlayer("Twinsen", {
    name: shared,
    name_normalized: normalizeName(shared),
    position: "G",
  });
  const second = await createPlayer("Twinsen", {
    name: shared,
    name_normalized: normalizeName(shared),
    club_code: `Y${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    club_name: "Away Club",
    position: "F",
  });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}/sheet`);
  await page.getByTestId("sheet-input").fill(shared);
  await page.getByTestId("sheet-preview").click();

  // Nothing resolved, and the line is asking.
  await expect(page.getByTestId("sheet-choice")).toHaveCount(1);
  const choice = page.getByTestId("sheet-choice-1");
  await expect(choice).toBeVisible();

  // Saving without answering leaves the line out rather than choosing for you.
  await page.getByTestId("sheet-apply").click();
  await expect(page.getByTestId("sheet-error")).toContainText(
    "no sheet to save",
  );

  // Answering it saves exactly the one that was chosen.
  await page.getByTestId("sheet-input").fill(shared);
  await page.getByTestId("sheet-preview").click();
  await page.getByTestId("sheet-choice-1").selectOption(second.id);
  await page.getByTestId("sheet-apply").click();
  await expect(page.getByTestId("sheet-saved")).toContainText("1 ranked");

  await page.goto(`/leagues/${league.id}/sheet`);
  const pb = await superuser();
  const saved = await pb
    .collection("cheat_sheets")
    .getFullList({ requestKey: null });
  const mine = saved.find(
    (record) => (record.ranking as string[])[0] === second.id,
  );
  expect(mine, "the chosen twin is the one that was stored").toBeTruthy();
  expect((mine!.ranking as string[]).includes(first.id)).toBe(false);
});

test("the room draws the pool in the sheet's order and pins the best of it", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Ordered League");
  // Alphabetically the pool is Aaa, Bbb, Zzz. The sheet says the reverse.
  const aaa = await sheetPlayer("Aaaplayer", { position: "G" });
  const bbb = await sheetPlayer("Bbbplayer", { position: "F" });
  const zzz = await sheetPlayer("Zzzplayer", { position: "C" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, `${zzz.name}\n${bbb.name}`);

  // Deliberately *not* `enterDraft`, which selects a club — the resting state
  // is what is under test here, and any filter at all is a narrowing.
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("pick-pool")).toBeVisible();

  // At rest the pool below already *is* the sheet's order, so the pinned block
  // is not drawn — it would be the same players in a second set of rows with a
  // second set of buttons, which is what 3.4a's critique measured at the id
  // level. The caption stays, because losing the way back to your sheet was
  // the other half of that finding.
  await expect(page.getByTestId("sheet-pinned")).toHaveCount(0);
  await expect(
    page.getByText("Your sheet is at the top of the pool"),
  ).toBeVisible();

  // The sheet's two players lead a pool of 300-odd, with their place on the
  // row. An unsheeted row keeps the column and leaves it empty, so the numbers
  // read down as a column rather than landing at three different x-positions.
  const rows = page.getByTestId("pool-row");
  await expect(rows.nth(0)).toContainText("Zzzplayer");
  await expect(rows.nth(1)).toContainText("Bbbplayer");
  await expect(rows.nth(0).getByTestId("pool-sheet-rank")).toHaveText("#1");
  await expect(rows.nth(2).getByTestId("pool-sheet-rank")).toHaveText("");

  // The moment the pool is narrowed away from them, the block appears — and
  // the pool beside it no longer lists them, so nobody is on screen twice.
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await page.getByTestId("filter-position-G").click();
  const pinned = page.getByTestId("sheet-pinned-row");
  await expect(pinned).toHaveCount(2);
  await expect(pinned.nth(0)).toContainText("Zzzplayer");
  await expect(pinned.nth(1)).toContainText("Bbbplayer");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Aaaplayer");

  // The room's way back to the sheet, for somebody who already has one — and a
  // 44px target, which is the rule this system has broken once before by
  // reading "min-h-11" as height only.
  const edit = page.getByTestId("edit-sheet");
  await expect(edit).toBeVisible();
  const box = await edit.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);

  expect(aaa.id).toBeTruthy();
});

test("picking from the pinned shortlist lands a real pick", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Pinned Pick League");
  await sheetPlayer("Aaaplayer", { position: "G" });
  const zzz = await sheetPlayer("Zzzplayer", { position: "C" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, zzz.name);
  await enterDraft(page, league.id);

  // Narrow the pool so the pinned block is drawn at all, then pick from it.
  await page.getByTestId("pool-search").fill("Aaaplayer");
  await page.getByTestId(`pin-${zzz.id}`).click();

  // On the board, under this member's name — the same pipeline any other pick
  // goes through.
  await expect(page.locator('[data-board-slot][data-state="filled"]').first()).toContainText(
    "Zzzplayer",
  );
  // And gone from the pinned list, because it is best *available*.
  await expect(page.getByTestId("sheet-pinned")).toHaveCount(0);
});

test("the sheet filter and the tier filter narrow the pool", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Sheet Filter League");
  await sheetPlayer("Aaaplayer", { position: "G" });
  const bbb = await sheetPlayer("Bbbplayer", { position: "F" });
  const zzz = await sheetPlayer("Zzzplayer", { position: "C" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, `1,1,${zzz.name}\n2,2,${bbb.name}`);
  await enterDraft(page, league.id);

  const rows = page.getByTestId("pool-row");
  await expect(rows).toHaveCount(3);

  await page.getByTestId("filter-sheet-only").click();
  await expect(rows).toHaveCount(2);

  await page.getByTestId("filter-tier").selectOption("2");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Bbbplayer");
});

test("a member with no sheet is told so, and the room still works", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("No Sheet League");
  await sheetPlayer("Aaaplayer", { position: "G" });

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await expect(page.getByTestId("sheet-pinned")).toHaveCount(0);
  await expect(page.getByTestId("write-a-sheet")).toBeVisible();
  // The tier filter is not offered when there are no tiers to filter by.
  await expect(page.getByTestId("filter-tier")).toHaveCount(0);
  await expect(page.getByTestId("filter-sheet-only")).toHaveCount(0);
  await expect(page.getByTestId("pool-row")).toHaveCount(1);
});

test("the pool rests short and opens on request", async ({ page, context }) => {
  // 3.3's debt: an untouched pool listed thirty of 324 rows and pushed the
  // board a very long way down a phone.
  const { commissioner, league } = await sheetLeague("Short Pool League");
  for (let i = 0; i < 11; i += 1) {
    await sheetPlayer(`Poolplayer${i}`, { position: "G" });
  }

  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await expect(page.getByTestId("pool-row")).toHaveCount(8);
  await expect(page.getByTestId("pool-count")).toContainText("8 of 11");

  // The control sits beside the count it is about, not in the filter row —
  // list length is not a *which*, and as a fifth "Show" toggle it wrapped that
  // row to three lines on a phone.
  await page.getByTestId("filter-more-rows").click();
  await expect(page.getByTestId("pool-row")).toHaveCount(11);
  await expect(page.getByTestId("pool-count")).toContainText("11 matches");
});

test("deleting the sheet leaves the room standing", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Cleared League");
  const zzz = await sheetPlayer("Zzzplayer", { position: "C" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, zzz.name);

  await page.goto(`/leagues/${league.id}/sheet`);
  await page.getByTestId("sheet-clear").click();
  await page.getByTestId("sheet-clear-confirm").click();
  await expect(page.getByTestId("sheet-row")).toHaveCount(0);

  await enterDraft(page, league.id);
  await expect(page.getByTestId("sheet-pinned")).toHaveCount(0);
  await expect(page.getByTestId("pool-row")).toHaveCount(1);
});

/**
 * What 3.4a's `/impeccable critique` found — one spec per finding, because
 * every one of these was invisible to a passing suite and to a screenshot.
 */

test("reading a second list after saving one shows the second list", async ({
  page,
  context,
}) => {
  // The P0. `applied.plan ? applied : preview` pinned the surface to the last
  // *applied* plan forever: after one save, reading a new list changed nothing
  // and React 19's post-action reset fed the user their own old text back.
  // The same line has been in /players/import since 2.1b.
  const { commissioner, league } = await sheetLeague("Second Read League");
  const one = await sheetPlayer("Aaaplayer", { position: "G" });
  const two = await sheetPlayer("Bbbplayer", { position: "F" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, one.name);

  await page.getByTestId("sheet-input").fill(two.name);
  await page.getByTestId("sheet-preview").click();

  // The box still holds what was typed, not what was saved a moment ago.
  await expect(page.getByTestId("sheet-input")).toHaveValue(two.name);
  const resolved = page.getByTestId("sheet-resolved").getByRole("listitem");
  await expect(resolved).toHaveCount(1);
  await expect(resolved.nth(0)).toContainText("Bbbplayer");
});

test("the sheet comes back as editable text, so a replace is not a cliff", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Round Trip League");
  const one = await sheetPlayer("Aaaplayer", { position: "G" });
  const two = await sheetPlayer("Bbbplayer", { position: "F" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, `1,1,${one.name}\n2,2,${two.name}`);

  // Reloading hands the saved ranking back as `rank,tier,name` — the whole
  // reason the paste box is an edit box.
  await page.goto(`/leagues/${league.id}/sheet`);
  const box = page.getByTestId("sheet-input");
  // The format the box itself documents — `rank, tier, name`, spaces and all.
  // It wrote `1,2,"Name"` at first, instructing one format and emitting another.
  await expect(box).toHaveValue(/^1, 1, "?Aaaplayer/);
  await expect(box).toHaveValue(/\n2, 2, "?Bbbplayer/);

  // And it round-trips: read it straight back and both players still resolve.
  await page.getByTestId("sheet-preview").click();
  await expect(
    page.getByTestId("sheet-resolved").getByRole("listitem"),
  ).toHaveCount(2);
});

test("a line the pool cannot match keeps its own name, and does not break the page", async ({
  page,
  context,
}) => {
  // Measured at 390px: the note was `shrink-0` in a `flex-nowrap` row, so a
  // 65-character sentence took 502px inside a 350px row — 161px of clipped,
  // unscrollable overflow, and the name crushed to 0px. The row telling you to
  // fix a line did not show you the line.
  const { commissioner, league } = await sheetLeague("Overflow League");
  await sheetPlayer("Aaaplayer", { position: "G" });

  await signIn(context, commissioner);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/leagues/${league.id}/sheet`);
  await page.getByTestId("sheet-input").fill("Zdenek Vopicka");
  await page.getByTestId("sheet-preview").click();

  const row = page
    .getByTestId("sheet-unresolved")
    .getByRole("listitem")
    .first();
  await expect(row).toContainText("Zdenek Vopicka");
  await expect(row).toContainText("fix the spelling");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "the page overflows horizontally at 390px").toBe(0);
});

test("saving says so where the button is, and a delete does not leave it saying so", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Confirmation League");
  const one = await sheetPlayer("Aaaplayer", { position: "G" });

  await signIn(context, commissioner);
  await page.setViewportSize({ width: 390, height: 844 });
  await saveSheet(page, league.id, one.name);

  // In the viewport, not a screen and a half above it — and announced, which
  // it was not: the surface had no live region at all.
  const saved = page.getByTestId("sheet-saved");
  await expect(saved).toBeInViewport();
  await expect(saved).toHaveAttribute("role", "status");

  // Deleting must not leave a marker-red claim that autodraft is using a sheet
  // that no longer exists.
  await page.getByTestId("sheet-clear").click();
  await page.getByTestId("sheet-clear-confirm").click();
  await expect(page.getByTestId("sheet-saved")).toHaveCount(0);
  await expect(page.getByTestId("sheet-cleared")).toBeVisible();
  await expect(page.getByTestId("sheet-row")).toHaveCount(0);
});

test("deleting a sheet takes two presses and can be called off", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Armed Delete League");
  const one = await sheetPlayer("Aaaplayer", { position: "G" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, one.name);
  await page.goto(`/leagues/${league.id}/sheet`);

  await page.getByTestId("sheet-clear").click();
  await page.getByTestId("sheet-clear-cancel").click();
  await expect(page.getByTestId("sheet-clear-confirm")).toHaveCount(0);
  await expect(page.getByTestId("sheet-row")).toHaveCount(1);
});

test("a sheet that cannot fill a roster says so", async ({ page, context }) => {
  // Rank fourteen forwards and autodraft runs out of legal players at the
  // fifth, then falls back to an arbitrary id for the rest of the draft. The
  // page counted "N of 323 ranked" and said nothing about which N.
  const { commissioner, league } = await sheetLeague("Lopsided League");
  const forwards = [
    await sheetPlayer("Fwdone", { position: "F" }),
    await sheetPlayer("Fwdtwo", { position: "F" }),
  ];

  await signIn(context, commissioner);
  await saveSheet(page, league.id, forwards.map((p) => p.name).join("\n"));
  await page.goto(`/leagues/${league.id}/sheet`);

  // Words, and one list-join: "5 G and 5 F and 3 C" was what a second,
  // hand-rolled join produced before `positionSentence` was shared.
  const short = page.getByTestId("sheet-short");
  // **The noughts are said.** This read "You have ranked 2 forwards, and a full
  // roster needs 5 guards, 5 forwards and 3 centers" — dropping guards and
  // centers from the first list precisely *because* the member had none, which
  // is the fact that strands autodraft. `positionSentence` omits zeros by
  // default, which is right for the radar's "still needs" and wrong here.
  // Found by 3.4b's critique.
  await expect(short).toContainText(
    "You have ranked 0 guards, 2 forwards and 0 centers",
  );
  await expect(short).toContainText(
    "a full roster needs 5 guards, 5 forwards and 3 centers",
  );
  await expect(short).not.toContainText("and 5 forwards and");
});

test("every tier run is named, so three lists are not 'list, 4 items' three times", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await sheetLeague("Named Tiers League");
  const one = await sheetPlayer("Aaaplayer", { position: "G" });
  const two = await sheetPlayer("Bbbplayer", { position: "F" });

  await signIn(context, commissioner);
  await saveSheet(page, league.id, `1,1,${one.name}\n2,2,${two.name}`);
  await page.goto(`/leagues/${league.id}/sheet`);

  await expect(page.getByRole("list", { name: "Tier 1" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Tier 2" })).toBeVisible();
});

/* ── slice 3.4b: editing a sheet by acting on it ─────────────────────────────
 *
 * `src/lib/sheets/reorder.test.ts` owns the arithmetic — 23 questions about
 * moving, removing and breaking that are really about a function, including the
 * one the model exists for: a break is a place, so a player moved past one
 * changes tier and the break stays put.
 *
 * What only a browser can answer is everything below. That the arm-then-move
 * machine works by keyboard, by mouse and by *touch* — the last of which is the
 * one that matters, because draft night is phones and a drag broken on a phone
 * is invisible from a desktop run. That the held row is drawn in a material
 * that exists (an interpolated or mis-ordered utility compiles to nothing and
 * still photographs fine). That the list stays scrollable while a row is held.
 * And the regression this slice was most at risk of shipping: the paste box
 * holding a stale order and quietly undoing every edit.
 */

/** The ranking as the page has it: player ids, best first. */
async function orderOf(page: Page): Promise<string[]> {
  return page
    .getByTestId("sheet-row-grab")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-player") ?? ""),
    );
}

const rowFor = (page: Page, playerId: string) =>
  page.locator(`[data-testid="sheet-row-grab"][data-player="${playerId}"]`);

/**
 * Wait for the edit to have actually landed.
 *
 * An optimistic row moves before the server has heard about it, so asserting
 * the list and then reloading races the POST — and a `page.goto` **aborts** the
 * request it never waited for, so the edit disappears with no failure anywhere
 * near the cause. Cost three of these specs on the first run. `data-pending`
 * exists for this, and it is the same trick `draft-board.spec.ts` plays with
 * `data-advanced`: wait for a fact, never for a duration.
 */
async function settled(page: Page) {
  await expect(page.getByTestId("sheet-pending")).toHaveAttribute(
    "data-pending",
    "false",
  );
}

/**
 * A real touch drag, through CDP.
 *
 * `page.touchscreen` can only tap, and synthetic `PointerEvent`s do not carry a
 * live pointer id — so `setPointerCapture` throws and the test would be
 * exercising the fallback rather than the path a phone takes.
 * `Input.dispatchTouchEvent` produces genuine pointer events with
 * `pointerType: "touch"`, which is the thing under test.
 */
async function touchDrag(page: Page, from: string, to: string) {
  const start = await rowFor(page, from).boundingBox();
  const end = await rowFor(page, to).boundingBox();
  if (!start || !end) throw new Error("a row under test was not on screen");
  const at = (box: NonNullable<typeof start>) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
  const cdp = await page.context().newCDPSession(page);
  const a = at(start);
  const b = at(end);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: a.x, y: a.y, id: 1 }],
  });
  // Two moves, not one: the first tells the handler a drag has begun, and a
  // single jump to the target would land before any hit-test had run.
  for (const step of [0.5, 1]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: a.x + (b.x - a.x) * step, y: a.y + (b.y - a.y) * step, id: 1 },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/** Three ranked players, saved, with the page open on the sheet. */
async function threeRanked(page: Page, context: Parameters<typeof signIn>[0]) {
  const { commissioner, league } = await sheetLeague("Reorder League");
  const a = await sheetPlayer("Reordera", { position: "G" });
  const b = await sheetPlayer("Reorderb", { position: "F" });
  const c = await sheetPlayer("Reorderc", { position: "C" });
  await signIn(context, commissioner);
  // The **full** unique names, not the display prefixes. Specs in this file run
  // in parallel and each of them creates its own "Reordera …", so pasting the
  // bare prefix hands the matcher three equally good candidates and it refuses
  // to guess — correctly, and 3.4a built it to. The fixture was at fault, not
  // the matcher.
  await saveSheet(page, league.id, `${a.name}\n${b.name}\n${c.name}`);
  await page.goto(`/leagues/${league.id}/sheet`);
  await expect(page.getByTestId("sheet-row-grab")).toHaveCount(3);
  expect(await orderOf(page)).toEqual([a.id, b.id, c.id]);
  return { league, a, b, c };
}

test("a row picked up moves one place, and the move survives a reload", async ({
  page,
  context,
}) => {
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, b.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  await page.getByTestId("sheet-up").click();

  // Optimistically first — the row must move without waiting for the server.
  await expect
    .poll(() => orderOf(page))
    .toEqual([b.id, a.id, c.id]);

  // And then really. A reload reads PocketBase, so this is the write.
  await settled(page);
  await page.goto(`/leagues/${league.id}/sheet`);
  expect(await orderOf(page)).toEqual([b.id, a.id, c.id]);
});

test("a nudge keeps the row in hand; dropping it on another row puts it down", async ({
  page,
  context,
}) => {
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, a.id).click();
  await page.getByTestId("sheet-down").click();
  // Still held: `↑`/`↓` are adjustments, and the bar has to stay for the next
  // one. This is the distinction the component documents between a nudge and a
  // placement, and it is the kind of thing that silently inverts.
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  await expect
    .poll(() => orderOf(page))
    .toEqual([b.id, a.id, c.id]);

  // A placement, on the other hand, ends the hold.
  await rowFor(page, c.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeHidden();
  await expect
    .poll(() => orderOf(page))
    .toEqual([b.id, c.id, a.id]);
});

test("Escape puts a held row down without moving it", async ({
  page,
  context,
}) => {
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, b.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  // `page.keyboard`, not `locator.press` — the latter focuses the element
  // first, which is the difference between testing the app and testing the
  // test. 3.3's critique found exactly that fake passing on the pool's Escape.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sheet-bar")).toBeHidden();
  expect(await orderOf(page)).toEqual([a.id, b.id, c.id]);
});

test("the whole row is a keyboard target, and reordering needs no pointer", async ({
  page,
  context,
}) => {
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  await page.getByTestId("sheet-up").click();
  await page.getByTestId("sheet-up").click();
  await expect
    .poll(() => orderOf(page))
    .toEqual([c.id, a.id, b.id]);

  await settled(page);
  await page.goto(`/leagues/${league.id}/sheet`);
  expect(await orderOf(page)).toEqual([c.id, a.id, b.id]);
});

test("the held row is struck in 2px dashed ink, and only it refuses touch", async ({
  page,
  context,
}) => {
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, b.id).click();

  // Past the class attribute to what is actually painted. A utility that is
  // mis-ordered in globals.css, or interpolated into a class name, compiles to
  // nothing at all — and a list with its held-row material missing still looks
  // perfectly plausible in a screenshot.
  const heldSlot = page
    .getByTestId("sheet-row")
    .filter({ has: page.locator('[data-held="true"]') });
  await expect(heldSlot).toHaveAttribute("data-state", "transit");

  // Polled, and the reason is worth writing down because it looks like
  // over-caution and is not. On the very first style resolution after the class
  // changes, Chromium reports `1px dashed` for an element already carrying
  // `slot-transit` and `data-state="transit"` — the right style with a stale
  // width, for one frame. Measured: 1px on the first read, 2px on every read
  // from 60ms on. A single `evaluate` therefore fails against a material that
  // is perfectly correct, and the property worth asserting is that the row *is
  // drawn* 2px dashed.
  await expect
    .poll(() =>
      heldSlot.evaluate((node) => {
        const style = getComputedStyle(node);
        return `${style.borderTopWidth} ${style.borderTopStyle}`;
      }),
    )
    .toBe("2px dashed");

  const drawn = await heldSlot.evaluate((node) => ({
    touch: getComputedStyle(node).touchAction,
  }));

  // Scoped to the one held row, which is the whole reason a row must be picked
  // up before it can be dragged: `touch-action: none` on every row would stop
  // the list scrolling on a phone, and a sixty-row sheet would be unusable.
  expect(drawn.touch).toBe("none");
  for (const other of [a.id, c.id]) {
    const slot = page
      .getByTestId("sheet-row")
      .filter({ has: page.locator(`[data-player="${other}"]`) });
    expect(
      await slot.evaluate((node) => getComputedStyle(node).touchAction),
    ).not.toBe("none");
  }
});

test("a held row can be dragged with a mouse", async ({ page, context }) => {
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, a.id).click();
  const from = await rowFor(page, a.id).boundingBox();
  const to = await rowFor(page, c.id).boundingBox();
  if (!from || !to) throw new Error("a row under test was not on screen");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Halfway, then all the way. One jump would arrive before a hit-test ran.
  await page.mouse.move(to.x + to.width / 2, from.y + (to.y - from.y) / 2);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2);
  await page.mouse.up();

  await expect
    .poll(() => orderOf(page))
    .toEqual([b.id, c.id, a.id]);
  // A drag is a placement, so it puts the row down.
  await expect(page.getByTestId("sheet-bar")).toBeHidden();
});

test("a held row can be dragged with a finger", async ({
  page,
  context,
  isMobile,
}) => {
  // The one that matters. Draft night is phones on a couch, and a drag that
  // works under a mouse and dies under a finger is invisible from a desktop
  // run — which is why this drives real touch events through CDP rather than
  // synthesising PointerEvents that no `setPointerCapture` would accept.
  //
  // Mobile only, and not as a convenience: desktop Chrome has no touch support
  // enabled, so `Input.dispatchTouchEvent` is accepted and then dropped, and
  // the spec would pass or fail for reasons that have nothing to do with a
  // phone. The `mobile` project is Pixel 7, which has it.
  test.skip(!isMobile, "needs a project with touch emulation");
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  await touchDrag(page, c.id, a.id);

  await expect
    .poll(() => orderOf(page))
    .toEqual([c.id, a.id, b.id]);
  await settled(page);
});

test("the bar never covers the row you are holding", async ({
  page,
  context,
}) => {
  // Found by the touch-drag spec, which is the only one that could find it: on
  // a Pixel 7 the bar measured **218px** and stuck to 621–839, while the row
  // just picked up sat at 625. So the first touch of the drag landed on the bar
  // and Chromium answered `pointercancel` — you could pick a row up and then
  // not be able to move it, on the device this app is designed around. A mouse
  // run never saw it, because a desktop viewport is tall enough that the bar
  // and the last row do not meet.
  const { c } = await threeRanked(page, context);

  // The last row, which is the one at risk.
  await rowFor(page, c.id).click();
  const bar = page.getByTestId("sheet-bar");
  await expect(bar).toBeVisible();

  const overlap = await page.evaluate(() => {
    const barBox = document
      .querySelector('[data-testid="sheet-bar"]')!
      .getBoundingClientRect();
    const rowBox = document
      .querySelector('[data-held="true"]')!
      .getBoundingClientRect();
    return {
      barHeight: Math.round(barBox.height),
      viewport: window.innerHeight,
      covered: rowBox.bottom > barBox.top && rowBox.top < barBox.bottom,
    };
  });
  expect(overlap.covered).toBe(false);
  // And the bar is not allowed to eat the screen either. It got to a quarter of
  // a phone viewport by carrying a hint sentence next to five wrapping buttons.
  expect(overlap.barHeight).toBeLessThan(overlap.viewport / 4);
});

test("a row can be removed, and the sheet closes the gap", async ({
  page,
  context,
}) => {
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-remove").click();

  await expect
    .poll(() => orderOf(page))
    .toEqual([a.id, c.id]);
  await settled(page);
  await page.goto(`/leagues/${league.id}/sheet`);
  expect(await orderOf(page)).toEqual([a.id, c.id]);
  // And the header recounts rather than claiming a player it can no longer see.
  await expect(page.getByTestId("cheat-sheet")).toContainText("2 of");
});

test("a tier break can be set and cleared by hand, and a moved row changes tier", async ({
  page,
  context,
}) => {
  const { league, a, b, c } = await threeRanked(page, context);

  // One run to begin with: no breaks, so no tier headings.
  await expect(page.getByTestId("sheet-tier-1")).toBeVisible();
  await expect(page.getByTestId("sheet-tier-2")).toBeHidden();

  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-break").click();
  await expect(page.getByTestId("sheet-tier-2")).toBeVisible();
  // The control is a toggle, which is what makes a break movable by hand:
  // clear it here, set it there.
  await expect(page.getByTestId("sheet-break")).toHaveText(/merge up/i);
  await settled(page);

  // Rank 1 can never start a tier — a break before the first player describes
  // nothing, and `asBreaks` rejects it coming back out of the database too.
  await page.getByTestId("sheet-putdown").click();
  await rowFor(page, a.id).click();
  await expect(page.getByTestId("sheet-break")).toBeDisabled();
  await page.getByTestId("sheet-putdown").click();

  // The model, in a browser: the break stays where it was put, so the player
  // who crosses it changes tier. `reorder.test.ts` proves the arithmetic; this
  // proves the page renders it.
  await rowFor(page, c.id).click();
  await page.getByTestId("sheet-up").click();
  await page.getByTestId("sheet-up").click();
  await expect
    .poll(() => orderOf(page))
    .toEqual([c.id, a.id, b.id]);
  await settled(page);
  await page.goto(`/leagues/${league.id}/sheet`);
  // Still two runs, still broken after one player: `c` is alone in tier 1 now.
  await expect(
    page.getByTestId("sheet-tier-1").getByTestId("sheet-row-grab"),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("sheet-tier-1").getByTestId("sheet-row-grab"),
  ).toHaveAttribute("data-player", c.id);
});

test("every move is announced in words", async ({ page, context }) => {
  // Rule weight, a wash and an outline are three things a screen reader cannot
  // see. This surface had no live region at all before 3.4b.
  const { b } = await threeRanked(page, context);

  await rowFor(page, b.id).click();
  await expect(page.getByTestId("sheet-say")).toContainText(/picked up/i);
  await page.getByTestId("sheet-up").click();
  await expect(page.getByTestId("sheet-say")).toContainText(/number 1 of 3/i);
  await expect(page.getByTestId("sheet-say")).toHaveAttribute(
    "aria-live",
    "polite",
  );
});

test("after a move, the paste box holds the moved order", async ({
  page,
  context,
}) => {
  // The named regression. `SheetForm` seeds a controlled textarea from
  // `initialText` with `useState`, which initialises once — so without the
  // remount in `page.tsx`, the box would still hold the pre-move order and
  // pressing *Read the list* then *Save this sheet* would silently undo every
  // edit made above it. Same class of defect 3.4a's critique found in
  // `useActionState`, one slice later and one layer down.
  const { a, b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  await page.getByTestId("sheet-up").click();
  await page.getByTestId("sheet-up").click();
  await expect
    .poll(() => orderOf(page))
    .toEqual([c.id, a.id, b.id]);
  // The box is seeded from the *server's* text, so the write has to have landed
  // before there is anything to assert about.
  await settled(page);
  await expect
    .poll(async () =>
      (await page.getByTestId("sheet-input").inputValue()).toLowerCase(),
    )
    .toContain("reorderc");

  // The box must now describe the sheet as it is, not as it was.
  const text = await page.getByTestId("sheet-input").inputValue();
  const names = text
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(",").slice(2).join(",").trim().toLowerCase());
  expect(names[0]).toContain("reorderc");

  // And reading it back must agree with the list, rather than proposing to
  // undo it.
  await page.getByTestId("sheet-preview").click();
  await expect(page.getByTestId("sheet-resolved")).toBeVisible();
  const firstResolved = page
    .getByTestId("sheet-resolved")
    .locator("li")
    .first();
  await expect(firstResolved).toContainText(/reorderc/i);
});

test("a reorder reaches the room's pool", async ({ page, context }) => {
  // The chain the whole slice is for. `orderBySheet` and the pinned shortlist
  // read the stored ranking through the engine's own `rankForMember`, so this
  // holds with no code of its own — which is exactly why it needs a test:
  // nothing else in this slice would fail if the room's revalidation were
  // dropped, and the sheet would look right while the room stayed stale.
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  await page.getByTestId("sheet-up").click();
  await page.getByTestId("sheet-up").click();
  await expect.poll(() => orderOf(page)).toEqual([c.id, a.id, b.id]);
  await settled(page);

  // At rest, so the pool below simply *is* the sheet's order — no filter, since
  // any filter at all is a narrowing.
  await page.goto(`/leagues/${league.id}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("pick-pool")).toBeVisible();

  const rows = page.getByTestId("pool-row");
  await expect(rows.nth(0)).toContainText(c.name);
  await expect(rows.nth(1)).toContainText(a.name);
  await expect(rows.nth(2)).toContainText(b.name);
  await expect(rows.nth(0).getByTestId("pool-sheet-rank")).toHaveText("#1");
});

/* ── what 3.4b's design critique found ───────────────────────────────────────
 *
 * The pass scored the surface 17/40 and three of its findings were functional.
 * Each spec below is named after the defect it would catch, and each one failed
 * before the fix it guards.
 */

test("a drag that ends between two tiers still lands", async ({
  page,
  context,
}) => {
  // The hit test used containment, so the 34px gap that closes a tier run plus
  // its 16px caption belonged to no row: a drop released in there matched
  // nothing and the drag silently did nothing — on a tiered sheet, at exactly
  // the boundary a tiered sheet is edited at. Measured at 36px on a Pixel 7,
  // one dead band per tier break. Nearest-midpoint has no dead space anywhere.
  const { a, b, c } = await threeRanked(page, context);

  // Break after the first player, which puts a real gutter between a and b.
  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-break").click();
  await expect(page.getByTestId("sheet-tier-2")).toBeVisible();
  await page.getByTestId("sheet-putdown").click();
  await settled(page);

  const gutter = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll('[data-testid="sheet-row-grab"]'),
    ];
    for (let i = 0; i < rows.length - 1; i += 1) {
      const top = rows[i]!.getBoundingClientRect();
      const next = rows[i + 1]!.getBoundingClientRect();
      if (next.top - top.bottom > 8) {
        return {
          x: top.left + top.width / 2,
          y: (top.bottom + next.top) / 2,
          size: Math.round(next.top - top.bottom),
        };
      }
    }
    return null;
  });
  expect(gutter, "no tier gutter to drag into").not.toBeNull();
  expect(gutter!.size).toBeGreaterThan(8);

  // Drag the last row up and release it *in the gutter*, not on a row.
  await rowFor(page, c.id).click();
  const from = await rowFor(page, c.id).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(gutter!.x, from!.y + (gutter!.y - from!.y) / 2);
  await page.mouse.move(gutter!.x, gutter!.y);
  // A target is shown even over dead space, because there is no dead space.
  await expect(page.locator('[data-current="true"]')).toHaveCount(1);
  await page.mouse.up();

  // It moved, rather than being silently put back down where it started.
  await expect.poll(() => orderOf(page)).not.toEqual([a.id, b.id, c.id]);
  await settled(page);
});

test("a drag does not pick the row straight back up", async ({
  page,
  context,
}) => {
  // `pointerup` is followed by a `click`, and while pointer capture keeps both
  // on the row the click re-ran `onRowActivate` — so a drag released over dead
  // space put the row down and immediately picked it back up, and the next tap
  // moved it somewhere nobody chose. Reachable only on a failed drop, which is
  // why the original drag specs never saw it.
  const { a, c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  const from = await rowFor(page, c.id).boundingBox();
  const onto = await rowFor(page, a.id).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto!.x + onto!.width / 2, from!.y + (onto!.y - from!.y) / 2);
  await page.mouse.move(onto!.x + onto!.width / 2, onto!.y + onto!.height / 2);
  await page.mouse.up();

  // Put down, and stays down.
  await expect(page.getByTestId("sheet-bar")).toBeHidden();
  await expect(page.getByTestId("sheet-say")).not.toContainText(/picked up/i);
  await settled(page);

  // And the flag that suppresses that click must not eat the next honest tap.
  await rowFor(page, a.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
});

test("the row in your hand keeps its material while it travels", async ({
  page,
  context,
}) => {
  // The `<li>` carried `slot-transit` and the transform sat on the button
  // inside it, so mid-drag the 2px dashed rule stayed at the origin — measured
  // 242px away from the content it was supposed to be marking — and the row in
  // your hand had no material at all while two names printed on top of each
  // other. The state language has to travel with the thing it describes.
  const { b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  const from = await rowFor(page, c.id).boundingBox();
  const onto = await rowFor(page, b.id).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(onto!.x + onto!.width / 2, onto!.y + onto!.height / 2);

  const drawn = await page.evaluate(() => {
    const button = document.querySelector(
      '[data-held="true"]',
    ) as HTMLElement | null;
    const li = button?.closest(
      '[data-testid="sheet-row"]',
    ) as HTMLElement | null;
    const style = button ? getComputedStyle(button) : null;
    return {
      // The content carries the rule, and a ground so nothing shows through it.
      contentWidth: style?.borderTopWidth ?? "",
      contentStyle: style?.borderTopStyle ?? "",
      opaque: (style?.backgroundColor ?? "").includes("rgba(0, 0, 0, 0)")
        ? "transparent"
        : "opaque",
      // And the place it left behind reads as an empty place, which it is.
      origin: li?.getAttribute("data-state") ?? "",
    };
  });
  expect(drawn.contentWidth).toBe("2px");
  expect(drawn.contentStyle).toBe("dashed");
  expect(drawn.opaque).toBe("opaque");
  expect(drawn.origin).toBe("waiting");

  await page.mouse.up();
  await settled(page);
});

test("a removal can be undone, and puts the player back where they were", async ({
  page,
  context,
}) => {
  // Remove was one tap with no confirmation, no visible acknowledgement and no
  // way back, on a page that guards deleting the *whole* sheet behind two
  // presses. An undo is the answer rather than a confirm: it taxes nobody and
  // closes visibility, control and recovery at once.
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-remove").click();
  await expect.poll(() => orderOf(page)).toEqual([a.id, c.id]);

  // Visible, not just announced.
  await expect(page.getByTestId("sheet-undo")).toBeVisible();
  await settled(page);

  await page.getByTestId("sheet-undo").click();
  await expect.poll(() => orderOf(page)).toEqual([a.id, b.id, c.id]);
  await settled(page);

  // And it really went back, at the rank it held.
  await page.goto(`/leagues/${league.id}/sheet`);
  expect(await orderOf(page)).toEqual([a.id, b.id, c.id]);
});

test("an edit that cannot save says so, and keeps the row in your hand", async ({
  page,
  context,
}) => {
  // There was no error surface here at all: both call sites awaited the action
  // and dropped its result, so an expired session or a dropped connection moved
  // the row, reverted it on the next render, and said nothing anywhere.
  // PRODUCT.md asks this app to degrade, never corrupt — this degraded
  // invisibly.
  const { league, b } = await threeRanked(page, context);

  // Take the sheet away underneath the tab, which is the reachable version of
  // this: another tab deleted it, or the membership went.
  //
  // Scoped to *this* league's members. The first version read every
  // `cheat_sheets` record in the database and deleted the lot, which is
  // app-global — specs in this file run in parallel, so it silently pulled the
  // sheet out from under whichever sibling happened to be mid-test. Same shape
  // as the `sweepOnce` trap in AGENTS.md.
  const pb = await superuser();
  const mine = await pb.collection("league_members").getFullList<{ id: string }>(
    { filter: `league = '${league.id}'` },
  );
  for (const member of mine) {
    const sheets = await pb
      .collection("cheat_sheets")
      .getFullList<{ id: string }>({ filter: `member = '${member.id}'` });
    for (const sheet of sheets) {
      await pb.collection("cheat_sheets").delete(sheet.id);
    }
  }

  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-up").click();

  await expect(page.getByTestId("sheet-edit-error")).toBeVisible();
  await expect(page.getByTestId("sheet-edit-error")).toContainText(
    /not there any more/i,
  );
  // Still in hand, so the gesture can simply be repeated.
  await expect(page.getByTestId("sheet-bar-held")).toBeVisible();
  // And said out loud, not only drawn.
  await expect(page.getByTestId("sheet-say")).toContainText(
    /not there any more/i,
  );
});

test("a held row can be moved and removed from the keyboard alone", async ({
  page,
  context,
}) => {
  // From a held row, `↑ Up` measured **12 Tab presses** away, because the bar
  // follows every row in DOM order — so the fastest keyboard path to "move this
  // up one" was to leave the row, walk the rest of the list and come back. The
  // bar is an affordance; the keys are the path.
  const { league, a, b, c } = await threeRanked(page, context);

  await rowFor(page, c.id).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sheet-bar")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => orderOf(page)).toEqual([c.id, a.id, b.id]);
  await settled(page);

  // Focus never left the row, so the next key still lands on it.
  await page.keyboard.press("Delete");
  await expect.poll(() => orderOf(page)).toEqual([a.id, b.id]);
  await settled(page);

  await page.goto(`/leagues/${league.id}/sheet`);
  expect(await orderOf(page)).toEqual([a.id, b.id]);
});

test("focus lands on a row after every edit, never on the document", async ({
  page,
  context,
}) => {
  // Measured before this: after a drop, a put-down *and* a removal,
  // `document.activeElement` was `<body>`, so a keyboard or switch user had to
  // Tab from the top of the document to carry on editing.
  const { a, b, c } = await threeRanked(page, context);
  const active = () =>
    page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? "",
      player: document.activeElement?.getAttribute("data-player") ?? "",
    }));

  // Put down.
  await rowFor(page, b.id).click();
  await page.getByTestId("sheet-putdown").click();
  await expect.poll(active).toEqual({ tag: "BUTTON", player: b.id });

  // A drop onto another row.
  await rowFor(page, a.id).click();
  await rowFor(page, c.id).click();
  await expect.poll(async () => (await active()).tag).toBe("BUTTON");
  await settled(page);

  // A removal focuses whoever took the removed row's place.
  const before = await orderOf(page);
  await rowFor(page, before[0]!).click();
  await page.getByTestId("sheet-remove").click();
  await expect.poll(async () => (await active()).tag).toBe("BUTTON");
  await settled(page);
});

test("the bar reserves its own height, and its caption is not a shouted sentence", async ({
  page,
  context,
}) => {
  // Two measured findings. The reserve was a fixed `pb-48` (192px) against a
  // bar that is 166px on a phone and 98px on a desktop, leaving a 205px dead
  // gap below the last held row at both sizes — bracketed by two identical
  // dashed rules, so it read as a rendering fault. And the caption was a
  // 49-character sentence in `slot-label`: 11px uppercase at wide tracking,
  // which the in-page detector flagged as `all-caps-body`.
  const { c } = await threeRanked(page, context);

  await rowFor(page, c.id).click();
  await expect(page.getByTestId("sheet-bar")).toBeVisible();

  // Polled, not read once: the bar renders first and the effect that measures
  // it commits on the *next* render, so a single read catches a reserve of 0
  // against a bar that is already 102px tall. Same one-frame lesson as the
  // held row's border.
  const geometry = () =>
    page.evaluate(() => {
      const bar = document.querySelector(
        '[data-testid="sheet-bar"]',
      ) as HTMLElement;
      const list = document.querySelector(
        '[data-testid="sheet-list"]',
      ) as HTMLElement;
      return {
        barHeight: Math.round(bar.getBoundingClientRect().height),
        reserved: Math.round(
          parseFloat(getComputedStyle(list).paddingBottom || "0"),
        ),
      };
    });

  // The reserve tracks the bar rather than a fixed guess. It was `pb-48`
  // (192px) against a bar that is ~100px on a desktop and ~174px on a phone,
  // which left a 205px dead band below the last held row at both sizes.
  await expect
    .poll(async () => {
      const { barHeight, reserved } = await geometry();
      return Math.abs(reserved - barHeight) <= 24;
    })
    .toBe(true);

  // The caption is a sentence, set as one. The player's name stays in the
  // board's caps because that is how this system writes a name.
  const caption = page.getByTestId("sheet-bar-held");
  const transform = await caption.evaluate(
    (node) => getComputedStyle(node).textTransform,
  );
  expect(transform).toBe("none");
});
