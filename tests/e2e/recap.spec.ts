import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createFixture,
  createLeagueFor,
  createPlayer,
  createTestUser,
  signIn,
  superuser,
  TEST_CLUB,
  shown,
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
  // One fantasy season is not a choice, so the season control is not drawn
  // until a second exists (ADR-0011).
  await expect(page.getByRole("region", { name: "Season", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("recap-empty").locator("..")).toHaveAttribute(
    "data-framed",
    "true",
  );
  await expect(page.getByTestId("recap-empty")).toContainText(
    "draft is not complete",
  );
  await expect(page.getByTestId("recap-empty-lobby")).toBeVisible();
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

  await expect(page.getByTestId("season-select")).toHaveValue("E2099");
  await expect(page.getByTestId("recap-table")).toBeVisible();
  // Rounds are chips now, one per counted night, the current one pressed.
  await expect(page.getByTestId("recap-rounds")).toBeVisible();
  await expect(page.getByTestId("recap-round-2")).toHaveAttribute("aria-current", "page");
  // The headline is written from the night's own facts.
  await expect(page.getByTestId("recap-headline")).toContainText("Other FC win round 2");
  for (const label of ["The night", "Best night", "Biggest swing"]) {
    await expect(
      page.getByRole("region", { name: label, exact: true }),
    ).toHaveAttribute("data-framed", "true");
  }
  await expect(
    page.locator('[data-framed="true"] [data-framed="true"]'),
  ).toHaveCount(0);
  const rows = page.getByTestId("recap-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Other FC");
  await expect(rows.first().getByTestId("recap-tenths")).toHaveText("5.0");
  await expect(rows.nth(1)).toContainText("Chief FC");
  await expect(rows.nth(1).getByTestId("recap-tenths")).toHaveText("0.7");

  await expect(page.getByTestId("recap-best-night")).toContainText(shown(star.name));
  await expect(page.getByTestId("recap-best-night")).toContainText("Other FC");
  await expect(page.getByTestId("recap-best-night")).toContainText("5.0");

  await expect(page.getByTestId("recap-swing-delta")).toHaveText("+4.3");
  await expect(page.getByTestId("recap-swing-deal")).toContainText("Other FC");
  await expect(page.getByTestId("recap-swing-deal")).toContainText(
    "counting from round 2",
  );
  await rows.first().getByTestId("recap-team").click();
  await expect(page).toHaveURL(/season=E2099/);
  await page.goto(`/leagues/${league.id}/recap?season=E2099`);

  await page.getByTestId("recap-round-1").click();
  await expect(page).toHaveURL(/round=1/);
  await expect(rows.first()).toContainText("Chief FC");
  await expect(rows.first().getByTestId("recap-tenths")).toHaveText("14.2");
  await expect(page.getByTestId("recap-best-night")).toContainText(shown(star.name));
  await expect(page.getByTestId("recap-best-night")).toContainText("Chief FC");
  await expect(page.getByTestId("recap-swing-empty")).toBeVisible();
});

test("a round with a game left is marked, provisional and never crowned", async ({
  page,
  context,
}, testInfo) => {
  // A season of its own per project: planted fixtures are season-wide, and an
  // unplayed one would reopen a round another spec has finished.
  const season = testInfo.project.name === "mobile" ? "E2096" : "E2097";
  const commissioner = await createTestUser("recapopen");
  const league = await createLeagueFor(commissioner, "Open Round");
  const other = await createTestUser("recapopenmate");
  await addMemberTo(league.id, other, "Other FC");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{ id: string; user: string }>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });
  const chief = members.find((row) => row.user === commissioner.id);
  const mate = members.find((row) => row.user === other.id);
  if (!chief || !mate) throw new Error("memberships missing");
  await pb.collection("league_members").update(chief.id, { team_name: "Chief FC" }, { requestKey: null });
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });

  const snapshot = (round: number, chiefTenths: number, mateTenths: number, totals: [number, number]) =>
    pb.collection("standings_snapshots").create(
      {
        league: league.id,
        season,
        round,
        phase: "RS",
        table: [
          { memberId: chief.id, totalTenths: totals[0], roundTenths: chiefTenths },
          { memberId: mate.id, totalTenths: totals[1], roundTenths: mateTenths },
        ],
      },
      { requestKey: null },
    );
  await snapshot(1, 142, 80, [142, 80]);
  await snapshot(2, 7, 50, [149, 130]);
  const stamp = Date.now();
  await createFixture({ season, round: 1, played: true, game_code: `${stamp}1`, utc_date: "2026-09-03 18:00:00.000Z" });
  await createFixture({ season, round: 2, played: true, game_code: `${stamp}2`, utc_date: "2026-09-10 18:00:00.000Z" });
  await createFixture({ season, round: 2, played: false, game_code: `${stamp}3`, utc_date: "2026-09-10 20:00:00.000Z" });

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}/recap?season=${season}`);
  await expect(page.getByTestId("recap-round-1")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("recap-headline")).toContainText("Chief FC win round 1");
  await expect(page.getByTestId("recap-round-2")).toContainText("in progress");

  await page.getByTestId("recap-round-2").click();
  await expect(page).toHaveURL(/round=2/);
  await expect(page.getByTestId("recap-in-progress")).toContainText("1 of 2 games played");
  await expect(page.getByTestId("recap-headline")).toContainText("Other FC lead round 2");
  await expect(page.getByTestId("recap-headline")).toContainText("sitting last");
  await expect(page.getByTestId("recap-leader")).toContainText("Other FC");
  await expect(page.getByTestId("recap-last")).toContainText("Chief FC");
  await expect(page.getByTestId("recap-spoon")).toHaveCount(0);
});
