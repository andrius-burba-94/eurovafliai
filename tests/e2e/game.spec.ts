import { expect, test } from "@playwright/test";

import { expectNotFound } from "./helpers/not-found";
import { cleanupTestData, createFixture, createLeagueFor, createPlayer, createTestUser, signIn, superuser } from "./helpers/session";

const snapshots: string[] = [];

test.afterEach(async () => {
  const pb = await superuser();
  for (const id of snapshots.splice(0)) {
    await pb.collection("live_game_snapshots").delete(id, { requestKey: null }).catch(() => {});
  }
  await cleanupTestData();
});

const line = (overrides: Record<string, unknown>) => ({
  assists: 0, rebounds: 0, playing: false, starter: false, dorsal: "",
  box: { fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, stl: 0, tov: 0, blk: 0, blka: 0, pf: 0, fd: 0, pm: 0 },
  ...overrides,
});

/** A live game in round 36 — a round of its own, so matchday.spec's round-38 feed never sees it: one rostered star at home, a bench player, and one on the road. */
async function plantLiveGame(leagueId: string, memberId: string, parallelIndex: number) {
  const pb = await superuser();
  // `person_code` is unique, so parallel workers must never derive the same one.
  const stamp = Date.now();
  const code = (n: number) => `7${String(parallelIndex).padStart(2, "0")}${String((stamp + n) % 1000).padStart(3, "0")}`;
  const star = await createPlayer("Boxstar", { person_code: code(1) });
  const bench = await createPlayer("Boxbench", { person_code: code(2) });
  await pb.collection("roster_memberships").create(
    { league: leagueId, member: memberId, player: star.id, from_date: "2026-09-08 12:00:00.000Z", to_date: "", from_round: 1, to_round: 0, acquired_via: "draft" },
    { requestKey: null },
  );
  await pb.collection("leagues").update(leagueId, { status: "season" }, { requestKey: null });
  const fixture = await pb.collection("fixtures").getOne<{ game_code: number; local_club: string }>((await createFixture({ round: 36 })).id, { requestKey: null });
  const snapshot = await pb.collection("live_game_snapshots").create(
    {
      season: "E2026",
      game_code: fixture.game_code,
      round: 36,
      live: true,
      local_score: 14,
      road_score: 11,
      players: [
        line({ personCode: code(1), clubCode: star.club_code, name: "BOXSTAR", points: 12, rebounds: 4, assists: 3, pir: 15, fantasyTenths: 165, minutes: "18:20", playing: true, starter: true, dorsal: "7", box: { fgm2: 3, fga2: 5, fgm3: 2, fga3: 3, ftm: 0, fta: 0, oreb: 1, dreb: 3, stl: 1, tov: 2, blk: 0, blka: 0, pf: 1, fd: 2, pm: 6 } }),
        line({ personCode: code(2), clubCode: bench.club_code, name: "BOXBENCH", points: 2, pir: 1, fantasyTenths: 10, minutes: "04:10", dorsal: "12", box: { fgm2: 1, fga2: 3, fgm3: 0, fga3: 1, ftm: 0, fta: 0, oreb: 0, dreb: 0, stl: 0, tov: 1, blk: 0, blka: 0, pf: 0, fd: 0, pm: -2 } }),
        line({ personCode: code(3), clubCode: "ZAL", name: "ROAD, RUNNER", points: 11, pir: 9, fantasyTenths: 90, minutes: "20:00", starter: true, dorsal: "3" }),
      ],
      detail: { quarters: { local: [14, 0, 0, 0], road: [11, 0, 0, 0] }, period: 2, clock: "04:12" },
      checked_at: new Date().toISOString(),
    },
    { requestKey: null },
  );
  snapshots.push(snapshot.id);
  return { starCode: code(1), benchCode: code(2), gameCode: fixture.game_code, snapshotId: snapshot.id };
}

test("a live game opens from Live into a sortable box score that follows the feed", async ({ page, context }, testInfo) => {
  const owner = await createTestUser("boxscore");
  const league = await createLeagueFor(owner, "Box Score League");
  const pb = await superuser();
  const [mine] = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, requestKey: null });
  if (!mine) throw new Error("membership missing");
  const { starCode, benchCode, gameCode, snapshotId } = await plantLiveGame(league.id, mine.id, testInfo.parallelIndex);

  await signIn(context, owner);
  await page.goto(`/l/${league.id}/matchday?round=36`);
  await page.locator(`[data-testid="matchday-game-link"][href$="/games/${gameCode}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/games/${gameCode}$`));

  await expect(page.getByTestId("game-state")).toHaveText("Live");
  await expect(page.getByTestId("game-clock")).toHaveText("Q2 · 4:12");
  await expect(page.getByTestId("game-score")).toContainText("14");

  const home = page.getByTestId("box-score-home-table");
  const rows = home.getByTestId("box-score-home-table-row");
  // The box score's own order: the starter, then the bench.
  await expect(rows.first()).toHaveAttribute("data-person", starCode);
  await expect(rows.first()).toContainText("16.5");

  // The star is on the viewer's team, and the mark says in which league.
  const yours = home.getByTestId("box-score-home-table-yours");
  await expect(yours).toHaveCount(1);
  await yours.click();
  await expect(page.getByRole("tooltip")).toContainText("Box Score League");
  await page.keyboard.press("Escape");

  // Sort by turnovers: the bench player's 1 and the star's 2, high to low, then low to high.
  await home.getByTestId("box-score-home-table-sort-tov").click();
  await expect(page.getByTestId("box-score")).toHaveAttribute("data-sort", "tov-desc");
  await expect(rows.first()).toHaveAttribute("data-person", starCode);
  await home.getByTestId("box-score-home-table-sort-tov").click();
  await expect(rows.first()).toHaveAttribute("data-person", benchCode);

  // One club alone.
  await page.getByTestId("box-score-away").click();
  await expect(page.getByTestId("box-score-home-table")).toHaveCount(0);
  await expect(page.getByTestId("box-score-away-table")).toContainText("Runner Road");
  await page.getByTestId("box-score-both").click();
  await expect(page.getByTestId("box-score-home-table")).toBeVisible();

  // A new snapshot reaches the open page; the chosen sort survives it.
  await expect(page.getByTestId("game-feed-status")).toHaveAttribute("data-live", "true");
  const current = await pb.collection("live_game_snapshots").getOne<{ players: Array<Record<string, unknown>> }>(snapshotId);
  const players = current.players.map((player, index) => (index === 0 ? { ...player, points: 15, pir: 18, fantasyTenths: 198 } : player));
  await pb.collection("live_game_snapshots").update(snapshotId, { players, local_score: 17, checked_at: new Date().toISOString() }, { requestKey: null });
  await expect(rows.filter({ hasText: "19.8" })).toHaveCount(1);
  await expect(page.getByTestId("box-score")).toHaveAttribute("data-sort", "tov-asc");
});

test("a scheduled game says when its box score will fill in", async ({ page, context }) => {
  const owner = await createTestUser("boxscheduled");
  await signIn(context, owner);
  const fixture = await (await superuser()).collection("fixtures").getOne<{ game_code: number }>((await createFixture()).id, { requestKey: null });
  await page.goto(`/games/${fixture.game_code}`);
  await expect(page.getByTestId("game-state")).toHaveText("Scheduled");
  await expect(page.getByTestId("game-box-empty")).toContainText("appears here once the game starts");
});

test("a game code that is not on the schedule is not found", async ({ page, context }) => {
  const owner = await createTestUser("boxmissing");
  await signIn(context, owner);
  await page.goto("/games/abc");
  await expectNotFound(page);
});
