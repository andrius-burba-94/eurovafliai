import { expect, test } from "@playwright/test";

import {
  cleanupTestData,
  createLeagueFor,
  createTestUser,
  signIn,
} from "./helpers/session";

/**
 * The app shell — slice 11.1, ADR-0008.
 *
 * The desktop project (1280px) is past `lg`, so it gets the sidebar; the
 * mobile project (Pixel 7) is below it, so it gets the tab bar. Each test
 * asks the question of the project that has the answer.
 */

test.afterAll(async () => {
  await cleanupTestData();
});

test("the sidebar names the league and marks where you are", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the sidebar is lg and up");
  const owner = await createTestUser("shell-owner");
  const { id } = await createLeagueFor(owner, "Shell League");
  await signIn(context, owner);

  await page.goto(`/leagues/${id}`);
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.getByTestId("bottom-tabs")).toBeHidden();

  const nav = sidebar.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("list", { name: "Shell League" })).toBeVisible();
  const home = nav.getByTestId("nav-league-home");
  await expect(home).toHaveAttribute("aria-current", "page");
  // Setup: the season's surfaces do not exist yet, so they are not offered.
  await expect(nav.getByTestId("nav-standings")).toHaveCount(0);
  await expect(nav.getByTestId("nav-sheet")).toBeVisible();

  await nav.getByTestId("nav-sheet").click();
  await page.waitForURL(new RegExp(`/leagues/${id}/sheet$`));
  await expect(
    page.getByTestId("sidebar").getByTestId("nav-sheet"),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("shell-here")).toContainText("Cheat sheet");

  // Every nav target is 44px tall; the rows are full-width, so wide enough.
  for (const link of await nav.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test("the account menu opens, closes on Escape, and signs out", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the sidebar is lg and up");
  const user = await createTestUser("shell-account");
  await signIn(context, user);
  await page.goto("/");

  const toggle = page.getByTestId("account-menu");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("logout")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const signOut = page.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  const box = await signOut.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByTestId("logout").click();
  await page.waitForURL(/\/login/);
});

test("the league switcher lists your leagues and moves between them", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "the sidebar is lg and up");
  const owner = await createTestUser("shell-switch");
  const first = await createLeagueFor(owner, "First Switch League");
  const second = await createLeagueFor(owner, "Second Switch League");
  await signIn(context, owner);

  await page.goto(`/leagues/${first.id}`);
  await page.getByTestId("league-switcher").click();
  const panel = page.getByTestId("league-switcher-panel");
  await expect(panel.getByRole("link", { name: "First Switch League" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await panel.getByRole("link", { name: "Second Switch League" }).click();
  await page.waitForURL(new RegExp(`/leagues/${second.id}$`));
  await expect(page.getByTestId("league-switcher-panel")).toHaveCount(0);
  await expect(page.getByTestId("league-switcher")).toContainText(
    "Second Switch League",
  );
});

test("the phone gets a tab bar, and More holds the rest", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the tab bar is below lg");
  const owner = await createTestUser("shell-phone");
  const { id } = await createLeagueFor(owner, "Phone League");
  await signIn(context, owner);

  await page.goto(`/leagues/${id}`);
  await expect(page.getByTestId("sidebar")).toBeHidden();
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByTestId("tab-league-home")).toHaveAttribute(
    "aria-current",
    "page",
  );
  for (const link of await tabs.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  const more = page.getByTestId("more-menu");
  await more.click();
  const sheet = page.getByTestId("more-menu-panel");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("more-league-home")).toBeVisible();
  await expect(sheet.getByTestId("more-pool")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(more).toBeFocused();

  // A tap outside closes it and does nothing else: the tab under the finger
  // is not followed.
  await more.click();
  await tabs.getByRole("link").nth(1).click();
  await expect(sheet).toHaveCount(0);
  // Proving an absence: long enough for a client navigation to have begun.
  await page.waitForTimeout(750);
  expect(new URL(page.url()).pathname).toBe(`/leagues/${id}`);

  // Following a link closes it.
  await more.click();
  await page.getByTestId("more-pool").click();
  await page.waitForURL(/\/players$/);
  await expect(page.getByTestId("more-menu-panel")).toHaveCount(0);
});

test("the last row of a page is never under the tab bar", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "the tab bar is below lg");
  const user = await createTestUser("shell-scroll");
  await signIn(context, user);
  await page.goto("/");
  const last = page.getByTestId("join-league");
  await expect(last).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const bar = await page.getByTestId("bottom-tabs").boundingBox();
  const box = await last.boundingBox();
  expect(bar).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
});
