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
 * The trades page as a round timeline: moves grouped under the round they
 * count from, one line per team, filtered by team and round through the URL,
 * and scored player against player — a released player keeps counting.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("moves group by round, filter by team and round, and score player against player", async ({ page, context }) => {
  const chief = await createTestUser("timelinechief");
  const league = await createLeagueFor(chief, "Timeline League");
  const other = await createTestUser("timelineother");
  await addMemberTo(league.id, other, "Other FC");
  const pb = await superuser();
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  const members = await pb.collection("league_members").getFullList<{ id: string; user: string }>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  const a = members.find((row) => row.user === chief.id)!.id;
  const b = members.find((row) => row.user === other.id)!.id;
  await pb.collection("league_members").update(a, { team_name: "Chief FC" }, { requestKey: null });

  const [star, role, gone, arrival] = await Promise.all(["Star", "Role", "Gone", "Arrival"].map((label) => createPlayer(`Timeline${label}`)));
  const note = "Agreed at the bar.";
  const trade = { type: "trade", from_round: 2, members: [a, b], players_in: { [a]: [role.id], [b]: [star.id] }, players_out: { [a]: [star.id], [b]: [role.id] }, note, date: "2026-10-01 12:00:00.000Z" };
  const swapDate = "2026-10-06 12:00:00.000Z";
  for (const row of [
    trade,
    { type: "drop", from_round: 3, members: [a], players_in: {}, players_out: { [a]: [gone.id] }, note, date: swapDate },
    { type: "add", from_round: 3, members: [a], players_in: { [a]: [arrival.id] }, players_out: {}, note, date: swapDate },
  ]) {
    await pb.collection("transactions").create({ league: league.id, ...row }, { requestKey: null });
  }
  const stamp = Date.now();
  const nights = [
    { player: star.id, round: 2, tenths: 50 },
    { player: star.id, round: 3, tenths: 120 },
    { player: role.id, round: 2, tenths: 7 },
    { player: role.id, round: 3, tenths: 30 },
    { player: gone.id, round: 3, tenths: 40 },
    { player: arrival.id, round: 3, tenths: 90 },
  ];
  for (const [index, night] of nights.entries()) {
    await pb.collection("player_game_stats").create(
      { player: night.player, season: "E2026", game_code: stamp + index, round: night.round, phase: "RS", club_code: TEST_CLUB, pir: 5, fantasy_pts: night.tenths },
      { requestKey: null },
    );
  }

  await signIn(context, chief);
  await page.goto(`/l/${league.id}/transactions`);

  const groups = page.getByTestId("deal-round");
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toHaveAttribute("data-round", "3");
  await expect(page.getByTestId("deal-list")).not.toContainText(note);
  // The released player keeps counting: 9.0 in against 4.0 out.
  await expect(groups.first().getByTestId("deal-delta")).toContainText("+5.0");
  // Raw on both sides from round 2: 0.7 + 3.0 in against 5.0 + 12.0 out.
  await expect(groups.nth(1).getByTestId("deal-delta").first()).toContainText(/[+-]13\.3/);

  // A trade faces off on one line; a free-agent move stands against the pool.
  const traded = groups.nth(1).getByTestId("deal");
  await expect(traded).toHaveAttribute("data-kind", "trade");
  await expect(traded.getByTestId("trade-line")).toContainText("Chief FC");
  await expect(traded.getByTestId("trade-line")).toContainText("Other FC");
  await expect(traded.getByTestId("deal-delta")).toHaveCount(2);
  await expect(traded.getByTestId("pool-crest")).toHaveCount(0);
  await expect(groups.first().getByTestId("pool-crest")).toHaveCount(1);

  const kinds = page.getByTestId("deal-kinds");
  await kinds.getByRole("link", { name: "Trades" }).click();
  await expect(page).toHaveURL(/kind=trade/);
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("data-round", "2");
  await kinds.getByRole("link", { name: "Free agents" }).click();
  await expect(page).toHaveURL(/kind=free/);
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("data-round", "3");
  await kinds.getByRole("link", { name: "All moves" }).click();
  await expect(groups).toHaveCount(2);

  const teams = page.getByTestId("deal-teams");
  expect(await teams.evaluate((nav) => nav.scrollWidth <= nav.clientWidth)).toBe(true);
  await teams.getByRole("link", { name: "Other FC" }).click();
  await expect(page).toHaveURL(new RegExp(`team=${b}`));
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("data-round", "2");

  await page.getByTestId("deal-round-3").click();
  await expect(page).toHaveURL(new RegExp(`team=${b}.*round=3`));
  await expect(page.getByTestId("deal-list")).toHaveCount(0);
  await expect(page.getByText("No moves for Other FC · round 3.")).toBeVisible();
});
