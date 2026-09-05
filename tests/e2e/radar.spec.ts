import { expect, test, type Page } from "@playwright/test";

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
 * The roster radar — slice 3.2.
 *
 * `src/lib/engine/radar.test.ts` owns the arithmetic: templates that are not
 * 5/5/3, a full bucket beside empty ones, the surplus that should never exist.
 * What only a browser can answer is that the radar names the right member
 * against the right roster, fills in as picks land, and says out loud what its
 * marks only draw.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

async function radarLeague(name: string) {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, name);
  await addMemberTo(league.id, await createTestUser("other"), "Other FC");
  const players = [
    await createPlayer("Radarg", { position: "G" }),
    await createPlayer("Radarf", { position: "F" }),
    await createPlayer("Radarc", { position: "C" }),
  ];
  return { commissioner, league, players };
}

async function enterDraft(page: Page, leagueId: string) {
  await page.goto(`/leagues/${leagueId}`);
  await page.getByTestId("draft-roll").click();
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("roster-radar")).toBeVisible();
}

test("the radar draws every roster's every slot, all waiting", async ({
  page,
  context,
}) => {
  const { commissioner, league } = await radarLeague("Radar League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // Two members, thirteen slots each.
  await expect(page.getByTestId("radar-row")).toHaveCount(2);
  await expect(page.getByTestId("radar-slot")).toHaveCount(26);
  await expect(
    page.locator('[data-testid="radar-slot"][data-state="filled"]'),
  ).toHaveCount(0);

  // The template's own order, 5 G then 5 F then 3 C — not the order picks
  // happen to arrive in.
  const positions = await page
    .getByTestId("radar-row")
    .first()
    .getByTestId("radar-slot")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-position")),
    );
  expect(positions.join("")).toBe("GGGGGFFFFFCCC");

  // And the marks are a picture: the row says it properly for a reader.
  await expect(page.getByTestId("radar-row").first()).toContainText(
    /0 of 13 filled, needs 5 guards, 5 forwards and 3 centers\./,
  );

  // The axis is named once, above the runs. This is the one grid in the app
  // that does not print G / F / C per cell, so the table has to say it — the
  // position wash cannot: measured under deuteranopia, the guard and center
  // washes are pixel-identical.
  await expect(page.getByTestId("radar-head")).toHaveCount(3);
  await expect(page.getByTestId("radar-head").nth(0)).toHaveText("G");
  await expect(page.getByTestId("radar-head").nth(1)).toHaveText("F");
  await expect(page.getByTestId("radar-head").nth(2)).toHaveText("C");

  // And each run prints what is still needed, which is the whole question the
  // radar exists to answer.
  const needs = page.getByTestId("radar-row").first().getByTestId("radar-need");
  await expect(needs).toHaveCount(3);
  await expect(needs.nth(0)).toHaveText("5");
  await expect(needs.nth(1)).toHaveText("5");
  await expect(needs.nth(2)).toHaveText("3");
});

test("a full run stops asking, and prints nothing rather than a nought", async ({
  page,
  context,
}) => {
  // The block's ink should *decrease* as the evening goes on: a run with no
  // room left is blank, not "0", and the sentence drops that position from its
  // list rather than saying "0 centers".
  const { commissioner, league, players } = await radarLeague("Fullrun League");
  const extra = [
    await createPlayer("Radarc2", { position: "C" }),
    await createPlayer("Radarc3", { position: "C" }),
  ];
  await signIn(context, commissioner);
  await enterDraft(page, league.id);
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);

  // Three centers to whoever drafts first: picks 1, 4 and 5 in a two-member
  // snake, with the other member taking 2 and 3.
  const order = [players[2]!, players[0]!, players[1]!, extra[0]!, extra[1]!];
  for (const [index, player] of order.entries()) {
    await page.getByTestId(`pick-${player.id}`).click();
    await expect(page.getByTestId(`board-slot-${index + 1}`)).toHaveAttribute(
      "data-state",
      "filled",
    );
  }

  const first = page.getByTestId("radar-row").first();
  await expect(first.getByTestId("radar-need").nth(2)).toHaveText("");
  await expect(first).not.toContainText(/0 centers/);
});

test("a pick fills the right roster's right slot", async ({
  page,
  context,
}) => {
  const { commissioner, league, players } = await radarLeague("Filling League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  // Pick 1 belongs to whoever drafts first, which is the radar's first row.
  await page.getByTestId(`pick-${players[2]!.id}`).click();
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );

  const first = page.getByTestId("radar-row").first();
  const second = page.getByTestId("radar-row").nth(1);

  // Exactly one slot filled in the whole league, and it is a center.
  await expect(
    page.locator('[data-testid="radar-slot"][data-state="filled"]'),
  ).toHaveCount(1);
  await expect(
    first.locator('[data-testid="radar-slot"][data-state="filled"]'),
  ).toHaveCount(1);
  await expect(
    first.locator(
      '[data-testid="radar-slot"][data-state="filled"][data-position="C"]',
    ),
  ).toHaveCount(1);

  // The printed need dropped, and only for that member. That figure is the
  // point of the surface: counting the dashes was never possible, because
  // Chromium's dash gap for a 1px dashed border is the same 2px as the gap
  // between two slots.
  await expect(first.getByTestId("radar-need").nth(2)).toHaveText("2");
  await expect(second.getByTestId("radar-need").nth(2)).toHaveText("3");
  await expect(first).toContainText(
    /needs 5 guards, 5 forwards and 2 centers\./,
  );
  await expect(second).toContainText(
    /needs 5 guards, 5 forwards and 3 centers\./,
  );
});

test("the radar marks your own roster", async ({ page, context }) => {
  const { commissioner, league } = await radarLeague("Yours League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  // Exactly one row is the viewer's, and it says so in words as well as in a
  // heavier rule — the same treatment the board gives your column.
  const yours = page.getByTestId("radar-row").filter({ hasText: "· you" });
  await expect(yours).toHaveCount(1);
  // ", on the clock" may sit between the two when it is your turn.
  await expect(yours).toContainText(/, you.*: 0 of 13 filled/);
});

test("the radar says whose turn it is", async ({ page, context }) => {
  // CONTEXT.md calls the radar "filling live", and it was the one live surface
  // in the room with no marker on the live member — so "whose turn is it, and
  // what do they need" took two surfaces to answer.
  const { commissioner, league, players } = await radarLeague("Clock League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  const onClock = page.locator(
    '[data-testid="radar-row"][data-on-clock="true"]',
  );
  await expect(onClock).toHaveCount(1);
  await expect(onClock).toHaveAttribute("data-state", "live");
  await expect(onClock).toContainText("on the clock");

  // It follows the clock, rather than sitting on whoever drafted first.
  const first = await onClock.getAttribute("data-member");
  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(page.getByTestId("board-slot-1")).toHaveAttribute(
    "data-state",
    "filled",
  );
  await expect(onClock).toHaveCount(1);
  expect(await onClock.getAttribute("data-member")).not.toBe(first);
});

test("the radar follows a rollback back down", async ({ page, context }) => {
  // The radar is derived from the picks, so undoing has to empty it again —
  // and `filled` must come off the count, not just the marks.
  const { commissioner, league, players } = await radarLeague("Undo League");
  await signIn(context, commissioner);
  await enterDraft(page, league.id);

  await page.getByTestId("filter-club").selectOption(TEST_CLUB);
  await page.getByTestId(`pick-${players[0]!.id}`).click();
  await expect(
    page.getByTestId("radar-row").first().getByTestId("radar-need").nth(0),
  ).toHaveText("4");

  await page.getByTestId("draft-undo-toggle").click();
  await page.getByTestId("draft-undo-target").fill("1");
  await page.getByTestId("draft-undo").click();

  await expect(
    page.getByTestId("radar-row").first().getByTestId("radar-need").nth(0),
  ).toHaveText("5");
  await expect(
    page.locator('[data-testid="radar-slot"][data-state="filled"]'),
  ).toHaveCount(0);
});
