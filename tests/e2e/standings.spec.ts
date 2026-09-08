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
 * Standings and a player's game log — slice 4.5.
 *
 * Snapshots are planted rather than produced through a full ingest, because
 * this spec is the page: empty vs one counted round. The recompute itself is
 * unit-tested against the fake that enforces the unique index.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("a member sees an empty table before the draft is complete", async ({
  page,
  context,
}) => {
  const user = await createTestUser("stander");
  const league = await createLeagueFor(user, "Empty Table");
  await signIn(context, user);

  await page.goto(`/leagues/${league.id}/standings`);
  await expect(page.getByTestId("standings")).toBeVisible();
  await expect(page.getByTestId("standings-empty")).toContainText(
    "draft is not complete",
  );
});

test("a counted round ranks the members who scored it", async ({
  page,
  context,
}) => {
  const commissioner = await createTestUser("tablechief");
  const league = await createLeagueFor(commissioner, "Scored Table");
  const other = await createTestUser("tableother");
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

  const star = await createPlayer("Star");
  const role = await createPlayer("Role");
  const draft = await pb.collection("drafts").create(
    {
      league: league.id,
      format: "linear",
      status: "complete",
      order: [chief.id, mate.id],
      rounds: 1,
      seed: "standings-e2e",
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
      acquired_via: "draft",
    },
    { requestKey: null },
  );
  await pb
    .collection("leagues")
    .update(league.id, { status: "season" }, { requestKey: null });
  await pb.collection("standings_snapshots").create(
    {
      league: league.id,
      season: "E2099",
      round: 1,
      phase: "RS",
      table: [
        {
          memberId: chief.id,
          totalTenths: 142,
          roundTenths: 142,
        },
        {
          memberId: mate.id,
          totalTenths: 80,
          roundTenths: 80,
        },
      ],
    },
    { requestKey: null },
  );

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}/standings?season=E2099`);

  await expect(page.getByTestId("standings-table")).toBeVisible();
  const rows = page.getByTestId("standings-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("14.2");
  await expect(rows.nth(1)).toContainText("8.0");

  const regularSeason = page.getByTestId("filter-phase-RS");
  await expect(regularSeason).toHaveAttribute("aria-pressed", "true");
  await regularSeason.click();
  await expect(regularSeason).toHaveAttribute("aria-pressed", "true");

  await rows.first().getByTestId("standings-team").click();
  await expect(page.getByTestId("roster-player")).toContainText(star.name);
});

test("a signed-in member reads a player's stored game log", async ({
  page,
  context,
}) => {
  const user = await createTestUser("logger");
  const planted = await createPlayer("Logged");
  const pb = await superuser();
  await pb.collection("player_game_stats").create(
    {
      player: planted.id,
      season: "E2099",
      game_code: 77,
      round: 4,
      phase: "RS",
      club_code: TEST_CLUB,
      pir: 12,
      fantasy_pts: 33,
    },
    { requestKey: null },
  );
  await signIn(context, user);

  await page.goto("/players");
  const club = page.locator("details", { hasText: TEST_CLUB });
  await club.locator("summary").click();
  await page.getByRole("link", { name: planted.name }).click();

  await expect(page.getByTestId("player-log")).toBeVisible();
  const row = page.getByTestId("player-game");
  await expect(row).toContainText("E2099");
  await expect(row).toContainText("R4");
  await expect(row).toContainText("PIR 12");
  await expect(row).toContainText("3.3");
});
