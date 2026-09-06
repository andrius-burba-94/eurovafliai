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
  await expect(page.getByTestId("board-pick").first()).toContainText(
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
  await expect(short).toContainText("You have ranked 2 forwards");
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
