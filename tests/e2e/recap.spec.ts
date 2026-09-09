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
 * Weekly recap — slice 5.4.
 *
 * Windows, a recorded trade, box scores and snapshots are planted so this
 * spec is the page: rank for that night, best night after the swap, swing.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member sees an empty recap before the draft is complete", async ({
  page,
  context,
}) => {
  const user = await createTestUser("recapempty");
  const league = await createLeagueFor(user, "Empty Recap");
  await signIn(context, user);

  await page.goto(`/leagues/${league.id}/recap`);
  await expect(page.getByTestId("recap")).toBeVisible();
  await expect(page.getByTestId("recap-empty")).toContainText(
    "draft is not complete",
  );
});

test("a counted round ranks the night, names the best, and names the swing", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("recapchief");
  const league = await createLeagueFor(commissioner, "Recap League");
  const other = await createTestUser("recapother");
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
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });

  const star = await createPlayer("RecapStar");
  const role = await createPlayer("RecapRole");
  const closed = "2026-09-08 18:00:00.000Z";

  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: chief.id,
      player: star.id,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: closed,
      from_round: 1,
      to_round: 2,
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
      to_date: closed,
      from_round: 1,
      to_round: 2,
      acquired_via: "draft",
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: chief.id,
      player: role.id,
      from_date: closed,
      to_date: "",
      from_round: 2,
      to_round: 0,
      acquired_via: "trade",
    },
    { requestKey: null },
  );
  await pb.collection("roster_memberships").create(
    {
      league: league.id,
      member: mate.id,
      player: star.id,
      from_date: closed,
      to_date: "",
      from_round: 2,
      to_round: 0,
      acquired_via: "trade",
    },
    { requestKey: null },
  );

  await pb.collection("transactions").create(
    {
      league: league.id,
      type: "trade",
      date: closed,
      from_round: 2,
      members: [chief.id, mate.id],
      players_in: { [chief.id]: [role.id], [mate.id]: [star.id] },
      players_out: { [chief.id]: [star.id], [mate.id]: [role.id] },
      note: "",
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

  await pb.collection("standings_snapshots").create(
    {
      league: league.id,
      season: "E2099",
      round: 1,
      phase: "RS",
      table: [
        { memberId: chief.id, totalTenths: 142, roundTenths: 142 },
        { memberId: mate.id, totalTenths: 80, roundTenths: 80 },
      ],
    },
    { requestKey: null },
  );
  await pb.collection("standings_snapshots").create(
    {
      league: league.id,
      season: "E2099",
      round: 2,
      phase: "RS",
      table: [
        { memberId: chief.id, totalTenths: 149, roundTenths: 7 },
        { memberId: mate.id, totalTenths: 130, roundTenths: 50 },
      ],
    },
    { requestKey: null },
  );

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);
  await expect(page.getByTestId("enter-recap")).toBeVisible();
  await page.goto(`/leagues/${league.id}/recap?season=E2099`);

  await expect(page.getByTestId("recap-table")).toBeVisible();
  const rows = page.getByTestId("recap-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Other FC");
  await expect(rows.first().getByTestId("recap-tenths")).toHaveText("5.0");
  await expect(rows.nth(1)).toContainText("Chief FC");
  await expect(rows.nth(1).getByTestId("recap-tenths")).toHaveText("0.7");

  await expect(page.getByTestId("recap-best-night")).toContainText(star.name);
  await expect(page.getByTestId("recap-best-night")).toContainText("Other FC");
  await expect(page.getByTestId("recap-best-night")).toContainText("5.0");

  await expect(page.getByTestId("recap-swing-delta")).toHaveText("+4.3");
  await expect(page.getByTestId("recap-swing-deal")).toContainText("Other FC");
  await expect(page.getByTestId("recap-swing-deal")).toContainText(
    "counting from round 2",
  );

  await page.getByTestId("recap-round").selectOption("1");
  await page.getByTestId("recap-show-round").click();
  await expect(page).toHaveURL(/round=1/);
  await expect(rows.first()).toContainText("Chief FC");
  await expect(rows.first().getByTestId("recap-tenths")).toHaveText("14.2");
  await expect(page.getByTestId("recap-best-night")).toContainText(star.name);
  await expect(page.getByTestId("recap-best-night")).toContainText("Chief FC");
  await expect(page.getByTestId("recap-swing-empty")).toBeVisible();
});
