import { expect, test } from "@playwright/test";

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
 * Recording a trade — slice 5.2.
 *
 * Memberships, a tiny template and two box-score nights are planted so this
 * spec is the builder and the windows, not a thirteen-round draft.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("a 1-for-1 trade swaps rosters and splits the table at from_round", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("tradechief");
  const league = await createLeagueFor(commissioner, "Trade League");
  const other = await createTestUser("tradeother");
  await addMemberTo(league.id, other, "Other FC");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  const chief = members.find((row) => row.user === commissioner.id);
  const mate = members.find((row) => row.user === other.id);
  if (!chief || !mate) throw new Error("memberships missing");

  await pb
    .collection("league_members")
    .update(chief.id, { team_name: "Chief FC" }, { requestKey: null });
  await pb.collection("leagues").update(
    league.id,
    {
      settings: { roster_template: { G: 1, F: 0, C: 0 }, max_members: 12 },
      status: "season",
    },
    { requestKey: null },
  );

  const star = await createPlayer("TradeStar");
  const role = await createPlayer("TradeRole");
  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "linear",
      status: "complete",
      order: [chief.id, mate.id],
      rounds: 1,
      seed: "trade-e2e",
    },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 1,
      round: 1,
      slot: 1,
      member: chief.id,
      player: star.id,
      is_auto: false,
    },
    { requestKey: null },
  );
  await pb.collection("picks").create(
    {
      draft: draft.id,
      overall_no: 2,
      round: 1,
      slot: 2,
      member: mate.id,
      player: role.id,
      is_auto: false,
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: chief.id,
      player: star.id,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      from_round: 1,
      to_round: 0,
      acquired_via: "draft",
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: mate.id,
      player: role.id,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      from_round: 1,
      to_round: 0,
      acquired_via: "draft",
    },
    { requestKey: null },
  );

  const stamp = Date.now();
  const nights = [
    { player: star.id, round: 1, tenths: 142, code: stamp + 1 },
    { player: star.id, round: 2, tenths: 50, code: stamp + 2 },
    { player: role.id, round: 1, tenths: 80, code: stamp + 3 },
    { player: role.id, round: 2, tenths: 7, code: stamp + 4 },
  ];
  for (const night of nights) {
    await pb.collection("player_game_stats").create(
      {
        player: night.player,
        season: "E2099",
        game_code: night.code,
        round: night.round,
        phase: "RS",
        club_code: TEST_CLUB,
        pir: 10,
        fantasy_pts: night.tenths,
      },
      { requestKey: null },
    );
  }

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  const doors = page.getByRole("region", { name: "League doors" });
  await expect(doors).toHaveAttribute("data-framed", "true");
  await expect(doors.getByTestId("enter-standings")).toBeVisible();
  await expect(doors.getByTestId("enter-recap")).toBeVisible();
  await expect(page.getByTestId("record-transaction")).toBeVisible();
  await expect(page.getByTestId("record-transaction").locator("..")).toHaveAttribute(
    "data-state",
    "filled",
  );
  await page.getByTestId("record-transaction").click();
  await expect(page.getByTestId("transaction-builder")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Season", exact: true }),
  ).toHaveAttribute("data-framed", "true");
  for (const label of ["This side", "The other side"]) {
    await expect(
      page.getByRole("region", { name: label, exact: true }),
    ).toHaveAttribute("data-framed", "true");
  }
  await expect(
    page.locator('[data-framed="true"] [data-framed="true"]'),
  ).toHaveCount(0);
  await page.getByTestId("season-select").selectOption("E2025");
  await page.getByTestId("season-submit").click();
  await expect(page).toHaveURL(/season=E2025/);

  await page.getByTestId(`pick-a-${chief.id}`).click();
  await page.getByTestId(`pick-b-${mate.id}`).click();
  await page.getByTestId("from-round").fill("2");
  await page.getByTestId("trade-player-a").click();
  await page.getByTestId("trade-player-b").click();
  await expect(page.getByTestId("trade-player-a")).toHaveAttribute(
    "data-state",
    "transit",
  );
  await expect(page.getByTestId("trade-player-b")).toHaveAttribute(
    "data-state",
    "transit",
  );
  await expect(page.locator('[data-state="live"]')).toHaveCount(0);
  await expect(page.getByTestId("confirm-sentence")).toContainText(
    "counting from round 2",
  );
  await page.getByTestId("record-transaction-submit").click();

  await expect(page.getByTestId("lobby")).toBeVisible();

  await page.getByTestId("enter-roster").filter({ hasText: "Chief FC" }).click();
  await expect(page.getByTestId("roster-player")).toContainText(role.name);
  await expect(page.getByTestId("roster-player")).not.toContainText(star.name);
  await page.goto(`/leagues/${league.id}/teams/${chief.id}?season=E2099`);
  await expect(page.getByTestId("impact-delta")).toHaveText("-4.3");
  await expect(page.getByTestId("impact-deal")).toContainText(
    "This trade is -4.3 fantasy so far.",
  );
  await expect(page.getByTestId("impact-deal")).toContainText("R2 -4.3");

  await page.getByRole("link", { name: "The lobby" }).click();
  await page.getByTestId("enter-roster").filter({ hasText: "Other FC" }).click();
  await expect(page.getByTestId("roster-player")).toContainText(star.name);
  await expect(page.getByTestId("roster-player")).not.toContainText(role.name);

  await page.goto(`/leagues/${league.id}/standings?season=E2099`);
  await expect(page.getByTestId("standings-table")).toBeVisible();
  const chiefRow = page.getByTestId("standings-row").filter({
    hasText: "Chief FC",
  });
  const mateRow = page.getByTestId("standings-row").filter({
    hasText: "Other FC",
  });
  await expect(chiefRow).toContainText("R1 14.2");
  await expect(chiefRow).toContainText("R2 0.7");
  await expect(chiefRow.getByTestId("standings-total")).toHaveText("14.9");
  await expect(mateRow).toContainText("R1 8.0");
  await expect(mateRow).toContainText("R2 5.0");
  await expect(mateRow.getByTestId("standings-total")).toHaveText("13.0");
});

test("a member without the grant does not see the door", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("tradelock");
  const league = await createLeagueFor(commissioner, "Closed Trade");
  const other = await createTestUser("tradelocked");
  await addMemberTo(league.id, other, "Locked FC");
  const pb = await superuser();
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  await signIn(context, other);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("lobby")).toBeVisible();
  await expect(page.getByTestId("record-transaction")).toHaveCount(0);
  await page.goto(`/leagues/${league.id}/transactions/new`);
  await expect(page.getByTestId("transaction-builder")).toHaveCount(0);
});
