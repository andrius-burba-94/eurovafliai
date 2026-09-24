import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createPlayer,
  createTestUser,
  rollOrder,
  signIn,
  superuser,
  type TestUser,
} from "./helpers/session";

/**
 * The side panel — slice 11.2, ADR-0008.
 *
 * Desktop Chrome is 1280px wide, which is `xl`, so the panel is a docked
 * column there; the Pixel 7 is below it and gets the sheet. The draft room is
 * the exception both ways: its panel is a sheet at every width and has no
 * Players tab, because its pool is the room's own main column.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

async function seasonLeague(owner: TestUser, name: string) {
  const league = await createLeagueFor(owner, name);
  const pb = await superuser();
  const [mine] = await pb.collection("league_members").getFullList<{
    id: string;
  }>({ filter: `league = '${league.id}'`, requestKey: null });
  if (!mine) throw new Error("membership missing");
  const held = await createPlayer("Panelheld", { position: "C" });
  const free = await createPlayer("Panelfree", { position: "G" });
  await pb.collection("drafts").create(
    {
      league: league.id,
      format: "linear",
      status: "complete",
      order: [mine.id],
      rounds: 1,
      seed: "panel-e2e",
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: mine.id,
      player: held.id,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      from_round: 1,
      to_round: 0,
      acquired_via: "draft",
    },
    { requestKey: null },
  );
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });
  return { leagueId: league.id, memberId: mine.id, held, free };
}

test("the panel is a docked column at xl, with tabs a keyboard can drive", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the column is xl and up");
  const owner = await createTestUser("panel-desk");
  const { leagueId, memberId, held, free } = await seasonLeague(
    owner,
    "Panel League",
  );
  await signIn(context, owner);
  await page.goto(`/leagues/${leagueId}/teams/${memberId}`);

  const panel = page.getByTestId("context-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("panel-toggle")).toBeHidden();

  const players = page.getByTestId("panel-tab-players");
  await expect(players).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveCount(3);

  await page.getByTestId("panel-search").fill("Panelheld");
  const row = page
    .getByTestId("panel-player")
    .filter({ hasText: held.name.split(",")[0]! });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("panel-player-held")).not.toHaveText(
    "Free agent",
  );

  await page.getByTestId("panel-search").fill("Panelfree");
  await page.getByTestId("panel-filter-free").click();
  await expect(
    page
      .getByTestId("panel-player")
      .filter({ hasText: free.name.split(",")[0]! })
      .getByTestId("panel-player-held"),
  ).toHaveText("Free agent");

  await players.focus();
  await page.keyboard.press("ArrowRight");
  const schedule = page.getByTestId("panel-tab-schedule");
  await expect(schedule).toBeFocused();
  await expect(schedule).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("panel-players")).toBeHidden();

  await page.keyboard.press("End");
  await expect(page.getByTestId("panel-tab-news")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(players).toBeFocused();
  await expect(page.getByTestId("panel-players")).toBeVisible();
});

test("on a phone the panel is a sheet the header opens and Escape closes", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the sheet is below xl");
  const owner = await createTestUser("panel-phone");
  const { leagueId } = await seasonLeague(owner, "Panel Phone League");
  await signIn(context, owner);
  await page.goto(`/leagues/${leagueId}/lineup`);

  const panel = page.getByTestId("context-panel");
  const toggle = page.getByTestId("panel-toggle");
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box?.width).toBeCloseTo(viewport.width, 0);

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("the draft room's panel is a sheet at every width, without a second pool", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the width is the point");
  const owner = await createTestUser("panel-room");
  const league = await createLeagueFor(owner, "Panel Room League");
  await addMemberTo(league.id, await createTestUser("panel-mate"), "Mate FC");
  for (const position of ["G", "F", "C"] as const) {
    await createPlayer(`Room${position}`, { position });
  }
  await signIn(context, owner);
  await page.goto(`/leagues/${league.id}`);
  await rollOrder(page, league.id);
  await page.getByTestId("start-draft").click();
  await page.getByTestId("enter-draft").click();
  await expect(page.getByTestId("draft-board")).toBeVisible();

  const panel = page.getByTestId("context-panel");
  const toggle = page.getByTestId("panel-toggle");
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveText("Schedule");

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("tab")).toHaveCount(2);
  await expect(page.getByTestId("panel-tab-players")).toHaveCount(0);
  await expect(page.getByTestId("panel-tab-schedule")).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
