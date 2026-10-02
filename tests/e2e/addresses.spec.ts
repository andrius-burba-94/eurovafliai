import { expect, test } from "@playwright/test";

import { cleanupTestData, createLeagueFor, createTestUser, signIn, superuser } from "./helpers/session";

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

test("a team cannot be reached in a league that is not yours", async ({ page, context }) => {
  const owner = await createTestUser("slugprivate");
  const { id } = await createLeagueFor(owner, "Private Address League");
  const stranger = await createTestUser("slugstranger");
  await signIn(context, stranger);
  const response = await page.goto(`/leagues/${id}/standings`);
  expect(response?.status()).toBe(404);
});
