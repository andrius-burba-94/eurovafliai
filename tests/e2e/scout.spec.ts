import { expect, test } from "@playwright/test";

import { addMemberTo, cleanupTestData, createLeagueFor, createPlayer, createTestUser, shown, signIn, superuser } from "./helpers/session";

/**
 * The Scout page's waiver wire — slice 7.2 E.
 *
 * Outlooks are planted the way the worker writes them, at figures no real
 * player reaches, so the planted rows lead the wire whatever else the pool
 * holds. The figures are the worker's business (advisor tests); this is the page.
 */

const SEASON = process.env.EUROLEAGUE_SEASON ?? "E2026";

test.afterEach(async () => {
  await cleanupTestData();
});

async function plantOutlook(playerId: string, five: number, over: Record<string, unknown> = {}) {
  const pb = await superuser();
  await pb.collection("player_outlooks").create(
    {
      season: SEASON,
      ruleset: "euroleague",
      player: playerId,
      outlook_5: five,
      outlook_10: five - 100,
      outlook_15: five - 200,
      games_ahead: 15,
      role: "starter",
      games_in_role: 5,
      base_source: "current",
      run_5: "easy",
      run_10: "even",
      run_15: "even",
      computed_at: new Date().toISOString(),
      ...over,
    },
    { requestKey: null },
  );
}

async function seasonLeague(label: string, over: Record<string, unknown> = {}) {
  const owner = await createTestUser(label);
  const league = await createLeagueFor(owner, `${label} League`);
  const pb = await superuser();
  await pb.collection("leagues").update(league.id, { status: "season", ...over }, { requestKey: null });
  return { owner, league };
}

test("the waiver wire ranks free agents by outlook, filters by position, and lists a player with no games", async ({ page, context }) => {
  const { owner, league } = await seasonLeague("scout-wire");
  const guard = await createPlayer("WireGuard", { position: "G" });
  const center = await createPlayer("WireCenter", { position: "C", status: "injured" });
  const rookie = await createPlayer("WireRookie", { position: "F" });
  await plantOutlook(guard.id, 9800);
  await plantOutlook(center.id, 9900, { base_source: "last", games_in_role: 0, run_5: "hard" });
  await signIn(context, owner);

  await page.goto(`/l/${league.id}`);
  const sidebar = page.getByTestId("sidebar");
  const sidebarVisible = await sidebar.isVisible();
  if (sidebarVisible) {
    const keys = await sidebar.getByTestId("nav-group-league").locator("..").getByRole("link").evaluateAll((links) =>
      links.map((link) => link.getAttribute("data-testid")),
    );
    expect(keys.indexOf("nav-scout")).toBe(keys.indexOf("nav-trades") + 1);
    await sidebar.getByTestId("nav-scout").click();
  } else {
    await page.goto(`/l/${league.id}/scout`);
  }

  // On a phone the desk opens on Your moves; the wire is its other tab.
  if (await page.getByTestId("scout-tab-wire").isVisible()) await page.getByTestId("scout-tab-wire").click();
  await expect(page.getByTestId("waiver-wire")).toBeVisible();
  const rows = page.getByTestId("wire-row");
  const names = await rows.allInnerTexts();
  const at = (name: string) => names.findIndex((text) => text.toUpperCase().includes(shown(name).toUpperCase()));
  expect(at(center.name)).toBeGreaterThanOrEqual(0);
  expect(at(center.name)).toBeLessThan(at(guard.name));

  const centerRow = rows.filter({ hasText: shown(center.name).toUpperCase() });
  await expect(centerRow).toContainText("99.0");
  await expect(centerRow).toContainText("Out");
  await expect(centerRow).toContainText("Hard run");
  await expect(centerRow).toContainText("Low confidence");
  await expect(centerRow).toContainText("last season's line");
  await expect(rows.filter({ hasText: shown(guard.name).toUpperCase() })).toContainText("High confidence");

  await page.getByTestId("wire-filter-G").click();
  await expect(rows.filter({ hasText: shown(center.name).toUpperCase() })).toHaveCount(0);
  await expect(rows.filter({ hasText: shown(guard.name).toUpperCase() })).toHaveCount(1);

  await page.getByTestId("wire-filter-F").click();
  // Below every rated forward, so it may be past the first page.
  while (await page.getByTestId("wire-more").isVisible()) await page.getByTestId("wire-more").click();
  await expect(rows.filter({ hasText: shown(rookie.name).toUpperCase() })).toContainText("No games yet");
});

test("in a linked league, a player the game does not list is not on the wire", async ({ page, context }) => {
  const { owner, league } = await seasonLeague("scout-linked", { fantasy_league_id: "e2e-scout" });
  const listed = await createPlayer("WireListed", { fantasy_listed: true });
  const unlisted = await createPlayer("WireUnlisted", { fantasy_listed: false });
  await plantOutlook(listed.id, 9700);
  await plantOutlook(unlisted.id, 9750);
  await signIn(context, owner);

  await page.goto(`/l/${league.id}/scout`);
  if (await page.getByTestId("scout-tab-wire").isVisible()) await page.getByTestId("scout-tab-wire").click();
  const rows = page.getByTestId("wire-row");
  await expect(rows.filter({ hasText: shown(listed.name).toUpperCase() })).toHaveCount(1);
  await expect(rows.filter({ hasText: shown(unlisted.name).toUpperCase() })).toHaveCount(0);
});

async function hold(leagueId: string, memberId: string, playerId: string) {
  const pb = await superuser();
  await pb.collection("roster_memberships").create(
    {
      league: leagueId,
      member: memberId,
      player: playerId,
      from_date: "2026-09-08 12:00:00.000Z",
      to_date: "",
      from_round: 1,
      to_round: 0,
      acquired_via: "draft",
    },
    { requestKey: null },
  );
}

// Both plant "the best free agent in the pool", which the pool is app-wide
// for: run in one worker, one after the other, so neither sees the other's.
test.describe.serial("advice planted in the shared pool", () => {
  test("your moves are yours: the swap, its gain, the League Home line, and nobody else's advice", async ({ page, context }, testInfo) => {
    // Outlooks and the pool are app-wide: the mobile project running this at the
    // same moment would plant a second best free agent into chromium's league.
    test.skip(testInfo.project.name !== "chromium", "one project, so one planted best add");
    // A one-forward template keeps the roster small (legality is the advisor's
    // tests), and forwards because no other spec here plants a rated forward in
    // the shared pool, which would outrank this one as the best add.
    const { owner, league } = await seasonLeague("scout-moves", { settings: { roster_template: { G: 0, F: 1, C: 0 }, max_members: 12 } });
    const rival = await createTestUser("scout-rival");
    const rivalMember = await addMemberTo(league.id, rival, "Rival FC");
    const pb = await superuser();
    const mine = await pb.collection("league_members").getFirstListItem<{ id: string }>(`league = '${league.id}' && user = '${owner.id}'`, { requestKey: null });

    const myGuard = await createPlayer("MyForward", { position: "F" });
    const rivalGuard = await createPlayer("RivalForward", { position: "F" });
    const freeAgent = await createPlayer("TopFreeAgent", { position: "F" });
    await hold(league.id, mine.id, myGuard.id);
    await hold(league.id, rivalMember, rivalGuard.id);
    await plantOutlook(myGuard.id, 500);
    await plantOutlook(rivalGuard.id, 400);
    // Above every real player, so it is everyone's best add.
    await plantOutlook(freeAgent.id, 9600, { games_in_role: 3 });
    await signIn(context, owner);

    await page.goto(`/l/${league.id}/scout`);
    const moves = page.getByTestId("scout-move");
    await expect(moves).toHaveCount(1);
    await expect(moves).toContainText(shown(myGuard.name));
    await expect(moves).toContainText(shown(freeAgent.name));
    await expect(page.getByTestId("scout-move-gain")).toHaveText("+91.0");
    await expect(page.getByTestId("scout-move-confidence")).toContainText("Medium");
    // The rival's roster and its advice never reach this page.
    await expect(page.getByTestId("your-moves")).not.toContainText(shown(rivalGuard.name));

    await page.goto(`/l/${league.id}`);
    await expect(page.getByTestId("enter-scout")).toContainText("Scout: 1 move worth making");

    // The rival signs the free agent: on the next read no move adds him.
    await hold(league.id, rivalMember, freeAgent.id);
    await page.goto(`/l/${league.id}/scout`);
    await expect(page.getByTestId("your-moves")).toBeVisible();
    await expect(page.getByTestId("your-moves")).not.toContainText(shown(freeAgent.name));

    // Nobody beats a forward rated above every real player: the empty state, and no League Home line.
    const stored = await pb.collection("player_outlooks").getFirstListItem<{ id: string }>(`player = '${myGuard.id}'`, { requestKey: null });
    await pb.collection("player_outlooks").update(stored.id, { outlook_5: 9990 }, { requestKey: null });
    await page.goto(`/l/${league.id}/scout`);
    await expect(page.getByTestId("your-moves-empty")).toContainText("No move worth making this round.");
    await page.goto(`/l/${league.id}`);
    await expect(page.getByTestId("enter-recap")).toBeVisible();
    await expect(page.getByTestId("enter-scout")).toHaveCount(0);

    // Released and not replaced: a hole, not a misfiled position.
    const seat = await pb.collection("roster_memberships").getFirstListItem<{ id: string }>(`member = '${mine.id}'`, { requestKey: null });
    await pb.collection("roster_memberships").update(seat.id, { to_date: "2026-10-01 12:00:00.000Z", to_round: 3 }, { requestKey: null });
    await page.goto(`/l/${league.id}/scout`);
    await expect(page.getByTestId("your-moves-short")).toContainText("Your roster has 0 of 1 players.");
  });

  test("a move shows its reason, names put back, until write-ups are switched off", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one project, so one planted best add");
    const { owner, league } = await seasonLeague("scout-reasons", { settings: { roster_template: { G: 0, F: 1, C: 0 }, max_members: 12 } });
    const pb = await superuser();
    const mine = await pb.collection("league_members").getFirstListItem<{ id: string }>(`league = '${league.id}' && user = '${owner.id}'`, { requestKey: null });
    const held = await createPlayer("HeldForward", { position: "F" });
    const target = await createPlayer("ReasonedAdd", { position: "F" });
    await hold(league.id, mine.id, held.id);
    await plantOutlook(held.id, 500);
    // Above every other planted free agent, so the move adds this one.
    await plantOutlook(target.id, 9980);
    await pb.collection("ai_writeups").create(
      {
        league: league.id,
        season: SEASON,
        round: 1,
        kind: "scout_moves",
        member: mine.id,
        status: "ready",
        voice: "analyst",
        model: "e2e",
        prompt_version: "scout-moves-1",
        input_hash: "e".repeat(64),
        output: { reasons: { [`${held.id}|${target.id}`]: "#P1 has started his last 5 and rates 99.8 a game. The run ahead is easy for #P1." } },
        refs: { "#P1": { kind: "player", id: target.id } },
        generated_at: new Date().toISOString(),
      },
      { requestKey: null },
    );
    await signIn(context, owner);

    await page.goto(`/l/${league.id}/scout`);
    await expect(page.getByTestId("scout-move-reason")).toContainText(`${shown(target.name)} has started his last 5`);
    await expect(page.getByTestId("scout-move-reason")).not.toContainText("#P1");

    await pb.collection("leagues").update(league.id, { settings: { roster_template: { G: 0, F: 1, C: 0 }, max_members: 12, ai: { enabled: false, voice: "analyst" } } }, { requestKey: null });
    await page.goto(`/l/${league.id}/scout`);
    await expect(page.getByTestId("scout-move")).toHaveCount(1);
    await expect(page.getByTestId("scout-move-reason")).toHaveCount(0);
    await expect(page.getByTestId("scout-move-numbers-only")).toHaveCount(0);
  });
});

test("a roster that does not count its template in the game's positions waits for its question", async ({ page, context }) => {
  // One guard where the template wants a forward: a misfiled position, not a hole.
  const { owner, league } = await seasonLeague("scout-misfiled", { settings: { roster_template: { G: 0, F: 1, C: 0 }, max_members: 12 } });
  const pb = await superuser();
  const mine = await pb.collection("league_members").getFirstListItem<{ id: string }>(`league = '${league.id}' && user = '${owner.id}'`, { requestKey: null });
  const misfiled = await createPlayer("MisfiledGuard", { position: "G" });
  await hold(league.id, mine.id, misfiled.id);
  await signIn(context, owner);
  await page.goto(`/l/${league.id}/scout`);
  await expect(page.getByTestId("your-moves-template")).toContainText("position question");
});
