import { expect, test } from "@playwright/test";

import { addMemberTo, cleanupTestData, createFixture, createLeagueFor, createTestUser, signIn, superuser } from "./helpers/session";

test.afterEach(async () => { await cleanupTestData(); });

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
