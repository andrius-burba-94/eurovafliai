import { expect, test } from "@playwright/test";

import { addMemberTo, cleanupTestData, createFixture, createLeagueFor, createPlayer, createTestUser, signIn, superuser } from "./helpers/session";

const snapshots: string[] = [];

test.afterEach(async () => {
  const pb = await superuser();
  for (const id of snapshots.splice(0)) {
    await pb.collection("live_game_snapshots").delete(id, { requestKey: null }).catch(() => {});
  }
  await cleanupTestData();
});

test("a live snapshot scores the lineup and prints its box-score line, then full time", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("matchdaylive");
  const league = await createLeagueFor(owner, "Matchday Live League");
  const pb = await superuser();
  const [mine] = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  if (!mine) throw new Error("membership missing");
  // `person_code` is unique, so parallel workers must never derive the same one.
  const personCode = `8${String(testInfo.parallelIndex).padStart(2, "0")}${String(Date.now() % 1000).padStart(3, "0")}`;
  const star = await createPlayer("Livestar", { person_code: personCode });
  await pb.collection("roster_memberships").create(
    { league: league.id, member: mine.id, player: star.id, from_date: "2026-09-08 12:00:00.000Z", to_date: "", from_round: 1, to_round: 0, acquired_via: "draft" },
    { requestKey: null },
  );
  await pb.collection("leagues").update(league.id, { status: "season" }, { requestKey: null });
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

  await signIn(context, owner);
  await page.goto(`/leagues/${league.id}/matchday?round=38`);
  const row = page.getByTestId("matchday-player").filter({ hasText: star.name });
  await expect(row.getByTestId("matchday-stat-line")).toHaveText("12 PTS · 4 REB · 3 AST · PIR 15 · 18:20");
  await expect(row).toContainText("16.5");
  await expect(row.getByText("Live", { exact: true })).toBeVisible();

  // Realtime does not replay: a write before the subscription is up is missed.
  await expect(page.getByTestId("matchday-feed-status")).toHaveAttribute("data-live", "true");
  await pb.collection("live_game_snapshots").update(snapshot.id, { live: false, checked_at: new Date().toISOString() }, { requestKey: null });
  await expect(row.getByText("Full time", { exact: true })).toBeVisible();
  await expect(page.getByTestId("matchday-feed-status")).toHaveText("Full time · waiting for the official box score");
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
  await page.goto(`/leagues/${league.id}/matchday?round=38`);
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
  await page.goto(`/leagues/${league.id}/matchday?round=38`);
  await expect(page.getByTestId("matchday")).toHaveCount(0);
});
