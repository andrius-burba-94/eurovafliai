import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createPlayer,
  createTestUser,
  signIn,
  TEST_CLUB,
} from "./helpers/session";

/**
 * The pool page (slice 2.1a).
 *
 * Each spec plants its own player, because the pool is app-global: asserting on
 * whatever the last `rosters:sync` ingested would make these pass or fail based
 * on whether somebody had run it.
 */

test.afterEach(async () => {
  await cleanupTestData();
});

test("the pool is not readable without signing in", async ({ page }) => {
  await page.goto("/players");
  await expect(page).toHaveURL(/\/login\?error=unauthorized/);
});

test("a member sees the pool, its clubs and a player's badges", async ({
  page,
  context,
}) => {
  const user = await createTestUser("pooler");
  const planted = await createPlayer("Locked", {
    position: "C",
    manual_lock: true,
    person_code: "",
  });
  await signIn(context, user);

  await page.goto("/players");
  await expect(page.getByTestId("players")).toBeVisible();

  // The club is a disclosure, closed by default: 324 players flat made an
  // 18,000px page.
  const club = page.locator("details", { hasText: TEST_CLUB });
  await expect(club).toBeVisible();
  await expect(page.getByText(planted.name)).toBeHidden();

  await club.locator("summary").click();
  const row = page.getByTestId("pool-player").filter({ hasText: planted.name });
  await expect(row).toBeVisible();
  // The badges slice 2.1 owes: which front door wrote the row, whether a
  // commissioner has claimed it, and whether it still lacks a person code.
  await expect(row).toContainText("api");
  await expect(row).toContainText("locked");
  await expect(row).toContainText("no code");
  await expect(row).toContainText("C");
});

test("the ingest summary says who holds the roster authority", async ({
  page,
  context,
}) => {
  const user = await createTestUser("pooler2");
  await createPlayer("Summary");
  await signIn(context, user);

  await page.goto("/players");
  // The question a commissioner actually has after a sync, and the answer to
  // "why did my correction get overwritten".
  await expect(page.getByText(/holds authority/)).toBeVisible();
  await expect(page.getByText("Without a person code")).toBeVisible();
});
