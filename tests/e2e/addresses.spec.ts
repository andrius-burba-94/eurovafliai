import { expect, test } from "@playwright/test";

import { cleanupTestData, createLeagueFor, createPlayer, createTestUser, signIn, superuser } from "./helpers/session";

/**
 * S28: a league reads /l/<league>, a team /l/<league>/<team>, and the old
 * /leagues/<id>/… addresses already pasted into chat still land.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("old addresses move to readable ones, and the nav speaks slugs", async ({ page, context }) => {
  const owner = await createTestUser("slugowner");
  const { id } = await createLeagueFor(owner, "Address League");
  const pb = await superuser();
  const stamp = Date.now().toString(36);
  const leagueSlug = `address-league-${stamp}`;
  await pb.collection("leagues").update(id, { slug: leagueSlug, status: "season" }, { requestKey: null });
  const [member] = await pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${id}'`, requestKey: null });
  await pb.collection("league_members").update(member!.id, { team_name: "Monikutės Naktys", slug: "monikutes-naktys" }, { requestKey: null });

  await signIn(context, owner);

  await page.goto(`/leagues/${id}/teams/${member!.id}?season=E2026`);
  await expect(page).toHaveURL(new RegExp(`/l/${leagueSlug}/monikutes-naktys\\?season=E2026$`));

  await page.goto(`/leagues/${id}/standings`);
  await expect(page).toHaveURL(new RegExp(`/l/${leagueSlug}/standings$`));

  // An id where the slug goes is still the same league, and Home settles on the slug.
  await page.goto(`/l/${id}`);
  await expect(page).toHaveURL(new RegExp(`/l/${leagueSlug}$`));

  const sidebar = page.getByTestId("sidebar");
  if (await sidebar.isVisible()) {
    await expect(sidebar.getByTestId("nav-team")).toHaveAttribute("href", `/l/${leagueSlug}/monikutes-naktys`);
    await expect(sidebar.getByTestId("nav-standings")).toHaveAttribute("href", `/l/${leagueSlug}/standings`);
  }
});

test("the pool and a player's page stay inside the league", async ({ page, context }) => {
  const owner = await createTestUser("poolowner");
  const { id } = await createLeagueFor(owner, "Pool Address League");
  const pb = await superuser();
  await pb.collection("leagues").update(id, { status: "season" }, { requestKey: null });
  const player = await createPlayer("Inside Leaguer");
  const slug = `inside-leaguer-${Date.now().toString(36)}`;
  await pb.collection("players").update(player.id, { slug }, { requestKey: null });
  await signIn(context, owner);

  await page.goto(`/l/${id}/players`);
  await expect(page.getByTestId("players")).toBeVisible();
  const sidebar = page.getByTestId("sidebar");
  if (await sidebar.isVisible()) {
    await expect(sidebar.getByTestId("nav-pool")).toHaveAttribute("href", `/l/${id}/players`);
    await expect(sidebar.getByTestId("nav-pool")).toHaveAttribute("aria-current", "page");
    // The pool sits in the EuroLeague group (7.2), which is the one open here;
    // the league's own group is still on the sidebar, a tap from League Home.
    await expect(sidebar.getByTestId("nav-group-league")).toBeVisible();
    await sidebar.getByTestId("nav-group-league").click();
    await expect(sidebar.getByTestId("nav-league-home")).toBeVisible();
  }

  // A player's page by id settles on the readable address, still in the league.
  await page.goto(`/l/${id}/players/${player.id}`);
  await expect(page).toHaveURL(new RegExp(`/l/${id}/players/${slug}$`));
  await expect(page.getByTestId("player-log")).toBeVisible();

  // The old way in, `/players/<id>?league=`, moves under the league too.
  await page.goto(`/players/${player.id}?league=${id}`);
  await expect(page).toHaveURL(new RegExp(`/l/${id}/players/${slug}$`));
});

test("a team cannot be reached in a league that is not yours", async ({ page, context }) => {
  const owner = await createTestUser("slugprivate");
  const { id } = await createLeagueFor(owner, "Private Address League");
  const stranger = await createTestUser("slugstranger");
  await signIn(context, stranger);
  const response = await page.goto(`/leagues/${id}/standings`);
  expect(response?.status()).toBe(404);
});
