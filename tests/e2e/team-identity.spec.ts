import { expect, test } from "@playwright/test";

import { cleanupTestData, createLeagueFor, createTestUser, signIn } from "./helpers/session";

test.afterEach(cleanupTestData);

test("a member chooses a crest, and the league sees it beside their name", async ({ page, context }) => {
  const owner = await createTestUser("crest-owner");
  const league = await createLeagueFor(owner, "Crest League");
  await signIn(context, owner);
  await page.goto(`/leagues/${league.id}`);

  const picker = page.getByTestId("team-identity");
  await expect(picker).toBeVisible();
  // Nothing changed yet, so there is nothing to save.
  await expect(page.getByTestId("save-team-identity")).toBeDisabled();

  await picker.locator("label").filter({ has: page.getByTestId("team-color-violet") }).click();
  await picker.locator("label").filter({ has: page.getByTestId("team-crest-hex") }).click();
  await page.getByTestId("save-team-identity").click();

  // Stored, not just previewed: a reload draws the member's row in it.
  await expect(page.getByTestId("save-team-identity")).toBeDisabled();
  await page.reload();
  const crest = page.getByTestId("member").first().locator(".team-crest");
  await expect(crest).toHaveAttribute("data-color", "violet");
  await expect(crest).toHaveAttribute("data-shape", "hex");
  // Colour never carries identity alone: the monogram is printed on it.
  await expect(crest).toHaveText(/\S/);
});
