import { expect, test } from "@playwright/test";

import { addMemberTo, cleanupTestData, createLeagueFor, createTestUser, signIn, superuser } from "./helpers/session";

const SEASON = "E2026";

test.afterEach(async () => {
  await cleanupTestData();
});

test("League Stats reads the season's records and team profiles from the counted rounds", async ({ page, context }) => {
  const chief = await createTestUser("statschief");
  const league = await createLeagueFor(chief, "Stats League");
  await addMemberTo(league.id, await createTestUser("statsmate"), "Mate FC");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, sort: "created" });
  await pb.collection("league_members").update(members[0]!.id, { team_name: "Chief FC" });
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  for (const [round, chiefRound, mateRound] of [[1, 9000, 4000], [2, 3000, 7000]] as const) {
    await pb.collection("standings_snapshots").create(
      {
        league: league.id,
        season: SEASON,
        round,
        phase: "RS",
        table: [
          { memberId: members[0]!.id, roundHundredths: chiefRound, totalHundredths: round === 1 ? 9000 : 12000 },
          { memberId: members[1]!.id, roundHundredths: mateRound, totalHundredths: round === 1 ? 4000 : 11000 },
        ],
      },
      { requestKey: null },
    );
  }

  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}/stats`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("League stats");
  // Records come straight from the snapshots: the biggest night, its margin, the lowest.
  await expect(page.getByTestId("record-highest")).toContainText("Chief FC");
  await expect(page.getByTestId("record-highest")).toContainText("90.0");
  await expect(page.getByTestId("record-margin")).toContainText("50.0");
  await expect(page.getByTestId("record-lowest")).toContainText("30.0");
  // One row per team, with rounds won.
  await expect(page.getByTestId("stats-teams").locator("tbody tr")).toHaveCount(2);
  // Nobody recorded a lineup, and the page says so rather than printing zeros.
  await expect(page.getByTestId("stats-lineups-empty")).toBeVisible();
});

test("League Stats admits it is empty before a round is counted", async ({ page, context }) => {
  const chief = await createTestUser("statsquiet");
  const league = await createLeagueFor(chief, "Quiet Stats League");
  const pb = await superuser();
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  await signIn(context, chief);
  await page.goto(`/leagues/${league.id}/stats`);
  await expect(page.getByTestId("stats-empty")).toBeVisible();
});
