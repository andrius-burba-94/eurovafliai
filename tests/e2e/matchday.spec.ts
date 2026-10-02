import { expect, test } from "@playwright/test";

import { addMemberTo, cleanupTestData, createFixture, createLeagueFor, createPlayer, createTestUser, signIn, superuser, shown } from "./helpers/session";

const snapshots: string[] = [];

test.afterEach(async () => {
  const pb = await superuser();
  for (const id of snapshots.splice(0)) {
    await pb.collection("live_game_snapshots").delete(id, { requestKey: null }).catch(() => {});
  }
  await cleanupTestData();
});

/** One rostered player in a live round-38 game, scoring 16.5 so far. */
async function plantLiveStar(leagueId: string, memberId: string, label: string, parallelIndex: number) {
  const pb = await superuser();
  // `person_code` is unique, so parallel workers must never derive the same one.
  const personCode = `8${String(parallelIndex).padStart(2, "0")}${String(Date.now() % 1000).padStart(3, "0")}`;
  const star = await createPlayer(label, { person_code: personCode });
  await pb.collection("roster_memberships").create(
    { league: leagueId, member: memberId, player: star.id, from_date: "2026-09-08 12:00:00.000Z", to_date: "", from_round: 1, to_round: 0, acquired_via: "draft" },
    { requestKey: null },
  );
  await pb.collection("leagues").update(leagueId, { status: "season" }, { requestKey: null });
  const fixture = await pb.collection("fixtures").getOne<{ game_code: number }>((await createFixture()).id, { requestKey: null });
  const snapshot = await pb.collection("live_game_snapshots").create(
    {
      season: "E2026",
      game_code: fixture.game_code,
      round: 38,
      live: true,
      local_score: 44,
      road_score: 40,
      players: [{ personCode, clubCode: star.club_code, points: 12, assists: 3, rebounds: 4, pir: 15, fantasyTenths: 165, minutes: "18:20", playing: true }],
      checked_at: new Date().toISOString(),
    },
    { requestKey: null },
  );
  snapshots.push(snapshot.id);
  return { star, snapshotId: snapshot.id };
}

test("a live snapshot scores the lineup and prints its box-score line, then full time", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("matchdaylive");
  const league = await createLeagueFor(owner, "Matchday Live League");
  const pb = await superuser();
  const [mine] = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  if (!mine) throw new Error("membership missing");
  const { star, snapshotId } = await plantLiveStar(league.id, mine.id, "Livestar", testInfo.parallelIndex);

  await signIn(context, owner);
  await page.goto(`/l/${league.id}/matchday?round=38`);
  const row = page.getByTestId("matchday-player").filter({ hasText: shown(star.name) });
  await expect(row.getByTestId("matchday-stat-line")).toHaveText("12 PTS · 4 REB · 3 AST · PIR 15 · 18:20");
  await expect(row).toContainText("16.5");
  await expect(row.getByText("Live", { exact: true })).toBeVisible();

  // Realtime does not replay: a write before the subscription is up is missed.
  await expect(page.getByTestId("matchday-feed-status")).toHaveAttribute("data-live", "true");
  await pb.collection("live_game_snapshots").update(snapshotId, { live: false, checked_at: new Date().toISOString() }, { requestKey: null });
  await expect(row.getByText("Full time", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matchday-feed-status")).toHaveText("Full time · waiting for the official box score");
});

test("the lineup shows a player's live round points, read from the same feed as Live", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("lineuplive");
  const league = await createLeagueFor(owner, "Lineup Live League");
  const pb = await superuser();
  const [mine] = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  if (!mine) throw new Error("membership missing");
  const { star } = await plantLiveStar(league.id, mine.id, "Courtstar", testInfo.parallelIndex);

  await signIn(context, owner);
  await page.goto(`/l/${league.id}/lineup?round=38`);
  const card = page.getByTestId("lineup-card").filter({ hasText: star.name.split(",")[0]! });
  // Nobody is placed, so the player counts at 100%, exactly as Live counts him.
  await expect(card.getByTestId("lineup-points")).toContainText("16.5");
  await expect(card.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.getByTestId("lineup-feed-status")).toHaveAttribute("data-live", "true");

  // His profile, opened from the card, shows the same game and line.
  await card.click();
  const thisRound = page.getByTestId("player-stats-modal").getByTestId("profile-this-round");
  await expect(thisRound).toContainText("round 38");
  await expect(thisRound.getByText("Live", { exact: true })).toBeVisible();
  await expect(thisRound.getByTestId("profile-stat-line")).toHaveText("12 PTS · 4 REB · 3 AST · PIR 15 · 18:20");
  await expect(thisRound.getByTestId("profile-round-points")).toHaveText("16.5");
  await page.keyboard.press("Escape");

  // The side panel's Schedule draws the same game as Live's Games: badge and score.
  const toggle = page.getByTestId("panel-toggle");
  if (await toggle.isVisible()) await toggle.click();
  await page.getByTestId("panel-tab-schedule").click();
  // Parallel workers plant their own live game in the same round, so any one will do.
  const tile = page.locator('[data-testid="panel-game"][data-state="live"]').first();
  await expect(tile.getByText("Live", { exact: true })).toBeVisible();
  await expect(tile).toContainText("44");
  await expect(tile).toContainText("40");
});

test("any member can watch another team's round on Live, from the picker or the table", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("matchdaywatched");
  const mate = await createTestUser("matchdaywatcher");
  const league = await createLeagueFor(owner, "Matchday Watch League");
  await addMemberTo(league.id, mate, "Other Five");
  const pb = await superuser();
  const members = await pb.collection("league_members").getFullList<{ id: string; user: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  const theirs = members.find((row) => row.user === owner.id);
  if (!theirs) throw new Error("membership missing");
  const { star } = await plantLiveStar(league.id, theirs.id, "Watchstar", testInfo.parallelIndex);

  await signIn(context, mate);
  await page.goto(`/l/${league.id}/matchday?round=38`);
  await expect(page.getByTestId("matchday-team")).toHaveText("Other Five");
  await expect(page.getByTestId("matchday-player")).toHaveCount(0);

  await page.getByTestId("matchday-member").selectOption(theirs.id);
  await page.getByTestId("matchday-show").click();
  await expect(page).toHaveURL(new RegExp(`member=${theirs.id}`));
  await expect(page.getByTestId("matchday-team")).not.toHaveText("Other Five");
  await expect(page.getByTestId("matchday-player").filter({ hasText: shown(star.name) })).toContainText("16.5");

  await page.getByTestId("matchday-table-team").filter({ hasText: "Other Five" }).click();
  await expect(page.getByTestId("matchday-team")).toHaveText("Other Five");
  await expect(page).not.toHaveURL(/member=/);
});

test("matchday shows scheduled games and keeps league access scoped to members", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("matchdayowner");
  const mate = await createTestUser("matchdaymate");
  const stranger = await createTestUser("matchdaystranger");
  const league = await createLeagueFor(owner, "Matchday League");
  await addMemberTo(league.id, mate, "Other Five");
  const pb = await superuser();
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
  await createFixture();

  await signIn(context, owner);
  await page.goto(`/l/${league.id}/matchday?round=38`);
  await expect(page.getByTestId("matchday")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Live", exact: true })).toBeVisible();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("The schedule for this round is not available yet.")).toHaveCount(0);
  if (testInfo.project.name === "mobile") {
    await expect(page.getByTestId("tab-standings")).toContainText("Table");
    await expect(page.getByTestId("tab-matchday")).toHaveAttribute("aria-current", "page");
  }

  await context.clearCookies();
  await signIn(context, stranger);
  await page.goto(`/l/${league.id}/matchday?round=38`);
  await expect(page.getByTestId("matchday")).toHaveCount(0);
});
