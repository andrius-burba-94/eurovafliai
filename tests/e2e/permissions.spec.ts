import { expect, test } from "@playwright/test";

import {
  addMemberTo,
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  grantManage,
  signIn,
} from "./helpers/session";

/**
 * The league's permission rule: the commissioner owns changes to the league,
 * and may grant that to specific members.
 *
 * The part worth protecting in a browser is the boundary — a deputy gets the
 * league's controls, and does not get the ability to appoint more deputies or
 * remove the person who appointed them.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("an ordinary member has no league controls", async ({ page, context }) => {
  const commissioner = await createTestUser("boss");
  const league = await createLeagueFor(commissioner, "Plain League");
  const member = await createTestUser("plain");
  await addMemberTo(league.id, member);

  await signIn(context, member);
  await page.goto(`/leagues/${league.id}`);

  await expect(page.getByTestId("member-list")).toBeVisible();
  await expect(page.getByTestId("draft-roll")).toBeHidden();
  await expect(page.getByTestId("kick-member")).toHaveCount(0);
});

test("the commissioner grants a member the league's controls", async ({
  page,
  context,
  browser,
}) => {
  const commissioner = await createTestUser("granter");
  const league = await createLeagueFor(commissioner, "Grant League");
  const deputy = await createTestUser("deputy");
  await addMemberTo(league.id, deputy, "Deputy FC");

  await signIn(context, commissioner);
  await page.goto(`/leagues/${league.id}`);

  // The grant lives inside the row's own controls, folded away.
  const row = page.getByTestId("member").filter({ hasText: "Deputy FC" });
  await row.getByTestId("manage-member").click();
  await row.getByTestId("member-permission").click();

  // Visible to the whole league, not just the commissioner: who can change the
  // league is something the league should be able to see.
  await expect(row).toContainText("helps run it");

  // And the deputy now has the controls, in their own browser.
  const deputyContext = await browser.newContext();
  await signIn(deputyContext, deputy);
  const deputyPage = await deputyContext.newPage();
  await deputyPage.goto(`/leagues/${league.id}`);

  await expect(deputyPage.getByTestId("draft-roll")).toBeVisible();
  await expect(deputyPage.getByTestId("draft-format")).toBeVisible();

  // But not the keys to the kingdom: a deputy who could appoint deputies could
  // hand the league to anyone.
  const commissionerRow = deputyPage
    .getByTestId("member")
    .filter({ hasText: "granter" });
  await expect(commissionerRow.getByTestId("member-permission")).toHaveCount(0);

  await deputyContext.close();
});

test("a deputy cannot remove the commissioner", async ({ page, context }) => {
  const commissioner = await createTestUser("chief");
  const league = await createLeagueFor(commissioner, "Loyalty League");
  const deputy = await createTestUser("second");
  await addMemberTo(league.id, deputy, "Second FC");

  // Grant directly, so this spec tests the boundary rather than the UI path.
  await grantManage(league.id, deputy);

  await signIn(context, deputy);
  await page.goto(`/leagues/${league.id}`);

  const chiefRow = page.getByTestId("member").filter({ hasText: "chief" });
  await chiefRow.getByTestId("manage-member").click();
  await chiefRow.getByTestId("kick-member").click();

  await expect(page.getByText(/commissioner cannot be removed/i)).toBeVisible();
  await expect(page.getByTestId("member")).toHaveCount(2);
});
