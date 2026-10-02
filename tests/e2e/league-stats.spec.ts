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
  await page.goto(`/l/${league.id}/stats`);
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
  await expect(page.getByTestId("stats-hindsight-empty")).toBeVisible();
  await expect(page.getByTestId("stats-captains-empty")).toBeVisible();
  await expect(page.getByTestId("stats-draft-empty")).toBeVisible();

  // The waffle board: the table's order down, each round's finish across.
  const waffle = page.getByTestId("stats-waffle");
  await expect(waffle.getByTestId("waffle-row")).toHaveCount(2);
  await expect(waffle.getByTestId("waffle-row").first()).toContainText("Chief FC");
  await expect(waffle.getByTestId("waffle-row").first().getByTestId("waffle-cell")).toHaveText(["1", "2"]);

  // Each team won one round, and the viewer is on the left by default.
  await expect(page.getByTestId("h2h-score")).toHaveText("1–1");
  await expect(page.getByTestId("h2h-round")).toHaveCount(2);
  await page.getByTestId("h2h-a").selectOption({ label: "Mate FC" });
  await page.getByTestId("h2h-b").selectOption({ label: "Chief FC" });
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page).toHaveURL(/[?&]a=.*#h2h$/);
  await expect(page.getByTestId("h2h-a")).toHaveValue(members[1]!.id);

  // An honour says what it means when tapped, for a phone with no hover.
  const crowned = page.getByTestId("honour-chip-crowned").first();
  await crowned.click();
  await expect(page.getByRole("tooltip", { name: "Won a round." }).first()).toBeVisible();
  // Each team finished last once, and one last place is already a spoon.
  await expect(page.getByTestId("honour-chip-spoon-collector")).toHaveCount(2);

  // A section explains itself behind its "i", not in a paragraph under the heading.
  await page.getByRole("button", { name: "About Team profiles" }).click();
  await expect(page.getByRole("tooltip", { name: /typical score/ })).toBeVisible();

  // Team names lead to the team.
  await page.getByTestId("stats-teams").getByRole("link", { name: "Mate FC" }).click();
  await expect(page).toHaveURL(new RegExp(`/l/${league.id}/${members[1]!.id}`));
});

test("League Stats admits it is empty before a round is counted", async ({ page, context }) => {
  const chief = await createTestUser("statsquiet");
  const league = await createLeagueFor(chief, "Quiet Stats League");
  const pb = await superuser();
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  await signIn(context, chief);
  await page.goto(`/l/${league.id}/stats`);
  await expect(page.getByTestId("stats-empty")).toBeVisible();
});
