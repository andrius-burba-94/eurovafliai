import { expect, test } from "@playwright/test";

import { cleanupTestData, createLeagueFor, createPlayer, createTestUser, shown, signIn, superuser } from "./helpers/session";

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
  const rows = page.getByTestId("wire-row");
  await expect(rows.filter({ hasText: shown(listed.name).toUpperCase() })).toHaveCount(1);
  await expect(rows.filter({ hasText: shown(unlisted.name).toUpperCase() })).toHaveCount(0);
});
